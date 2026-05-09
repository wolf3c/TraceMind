import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Accounts } from 'meteor/accounts-base';
import {
  Developers,
  Projects,
  RawBehaviors,
  SemanticEvents,
  isSourceBlocked,
  normalizeEmail,
  normalizeBlockedSource,
  normalizeToken,
  publicProject,
  publicSemanticEvent,
  summarizeBehaviorSources,
} from '/imports/api/tracemind';
import { summarizeSemanticEvents } from '/imports/api/semantic';

const LOGIN_EMAIL_FROM = 'TraceMind <postmaster@email.super-tree.com>';
const PROJECT_SUMMARY_SEMANTIC_EVENT_LIMIT = 200;
const PROJECT_SUMMARY_RAW_BEHAVIOR_LIMIT = 500;

function newToken(prefix) {
  return `${prefix}_${Random.secret(32)}`;
}

function newMcpToken(nameInput = 'Default MCP Token') {
  return {
    id: `mcp_${Random.id(17)}`,
    name: normalizeMcpTokenName(nameInput),
    token: newToken('tm_mcp'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function normalizeMcpTokenName(nameInput) {
  return String(nameInput || 'MCP Token').trim().slice(0, 80) || 'MCP Token';
}

function normalizeProjectName(nameInput) {
  return String(nameInput || 'Untitled Web App').trim().slice(0, 80) || 'Untitled Web App';
}

function ensureMailUrlFromSettings() {
  const settingsMailUrl = Meteor.settings?.private?.MAIL_URL || Meteor.settings?.MAIL_URL;
  if (!process.env.MAIL_URL && settingsMailUrl) {
    process.env.MAIL_URL = settingsMailUrl;
  }
}

function configurePasswordlessEmail() {
  ensureMailUrlFromSettings();

  Accounts.emailTemplates.siteName = 'TraceMind';
  Accounts.emailTemplates.from = LOGIN_EMAIL_FROM;
  Accounts.emailTemplates.sendLoginToken = {
    subject: () => 'TraceMind 登录验证码',
    text: (user, url, { sequence }) => (
      `你的 TraceMind 登录验证码是：${sequence}\n\n` +
      `也可以点击以下链接直接登录：\n${url}\n\n` +
      '验证码 1 小时内有效。如果这不是你本人操作，可以忽略这封邮件。'
    ),
    html: (user, url, { sequence }) => (
      '<p>你的 TraceMind 登录验证码是：</p>' +
      `<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${sequence}</p>` +
      `<p>也可以点击 <a href="${url}">这个链接</a> 直接登录。</p>` +
      '<p>验证码 1 小时内有效。如果这不是你本人操作，可以忽略这封邮件。</p>'
    ),
  };
}

configurePasswordlessEmail();

async function findDeveloperByToken(token) {
  const authToken = normalizeToken(token);
  if (!authToken) return null;
  return Developers.findOneAsync({ authToken });
}

async function findProjectForDeveloper(projectId, developerId) {
  return Projects.findOneAsync({ _id: projectId, developerId });
}

async function ensureProjectMcpTokens(project) {
  if (!project) return null;
  if (Array.isArray(project.mcpTokens) && project.mcpTokens.length) return project;

  const mcpTokens = [newMcpToken()];
  await Projects.updateAsync(project._id, { $set: { mcpTokens } });
  return { ...project, mcpTokens };
}

function normalizeBlockReason(reasonInput) {
  return String(reasonInput || '').trim().slice(0, 160);
}

async function findOwnedProjectWithMcpTokens(projectId, userId) {
  const developer = await getOrCreateDeveloperForUser(userId);
  const project = await findProjectForDeveloper(projectId, developer._id);
  if (!project) {
    throw new Meteor.Error('not-found', 'Project not found.');
  }
  return ensureProjectMcpTokens(project);
}

async function buildProjectSummary(project) {
  const rawCount = await RawBehaviors.find({ projectId: project._id }).countAsync();
  const semanticCount = await SemanticEvents.find({ projectId: project._id }).countAsync();
  const events = await SemanticEvents.find(
    { projectId: project._id },
    { sort: { occurredAt: -1 }, limit: PROJECT_SUMMARY_SEMANTIC_EVENT_LIMIT },
  ).fetchAsync();
  const rawBehaviors = await RawBehaviors.find(
    { projectId: project._id },
    { sort: { occurredAt: -1 }, limit: PROJECT_SUMMARY_RAW_BEHAVIOR_LIMIT },
  ).fetchAsync();

  return {
    project: publicProject(await ensureProjectMcpTokens(project)),
    rawCount,
    semanticCount,
    summaryWindow: {
      semanticEventLimit: PROJECT_SUMMARY_SEMANTIC_EVENT_LIMIT,
      rawBehaviorLimit: PROJECT_SUMMARY_RAW_BEHAVIOR_LIMIT,
      semanticEventSampleSize: events.length,
      rawBehaviorSampleSize: rawBehaviors.length,
    },
    summary: summarizeSemanticEvents(events),
    sources: summarizeBehaviorSources(rawBehaviors, project.blockedSources || []),
    recentEvents: events.slice(0, 30).map(publicSemanticEvent),
  };
}

async function userEmail(userId) {
  const user = await Meteor.users.findOneAsync(userId, {
    fields: { emails: 1 },
  });
  const email = normalizeEmail(user?.emails?.[0]?.address);
  if (!email) {
    throw new Meteor.Error('email-not-found', 'Account email is required.');
  }
  return email;
}

async function getOrCreateDeveloperForUser(userId) {
  if (!userId) {
    throw new Meteor.Error('not-authorized', 'Login is required.');
  }

  const email = await userEmail(userId);
  let developer = await Developers.findOneAsync({ userId });
  if (developer) return developer;

  developer = await Developers.findOneAsync({ email });
  if (developer) {
    await Developers.updateAsync(developer._id, { $set: { userId } });
    return Developers.findOneAsync(developer._id);
  }

  const developerId = await Developers.insertAsync({
    userId,
    email,
    authToken: newToken('tm_dev'),
    createdAt: new Date(),
  });
  return Developers.findOneAsync(developerId);
}

async function getOrCreateDefaultProject(developer) {
  const existing = await Projects.findOneAsync({ developerId: developer._id }, { sort: { createdAt: 1 } });
  if (existing) return existing;

  const projectId = await Projects.insertAsync({
    developerId: developer._id,
    name: 'My Web App',
    projectKey: newToken('tm_proj'),
    mcpTokens: [newMcpToken()],
    createdAt: new Date(),
  });

  return Projects.findOneAsync(projectId);
}

export async function resolveProjectByKey(projectKey) {
  const key = normalizeToken(projectKey);
  if (!key) return null;
  return Projects.findOneAsync({ projectKey: key });
}

export async function resolveProjectByMcpToken(mcpToken) {
  const token = normalizeToken(mcpToken);
  if (!token) return null;
  return (await Projects.findOneAsync({ 'mcpTokens.token': token })) || null;
}

Meteor.startup(() => {
  configurePasswordlessEmail();
});

Meteor.methods({
  async 'tracemind.dashboard'() {
    const developer = await getOrCreateDeveloperForUser(this.userId);
    await getOrCreateDefaultProject(developer);

    const projects = await Projects.find({ developerId: developer._id }, { sort: { createdAt: 1 } }).fetchAsync();
    const projectsWithMcpTokens = await Promise.all(projects.map(ensureProjectMcpTokens));
    const projectIds = projects.map((project) => project._id);
    const rawCount = await RawBehaviors.find({ projectId: { $in: projectIds } }).countAsync();
    const semanticCount = await SemanticEvents.find({ projectId: { $in: projectIds } }).countAsync();

    const semanticEvents = await SemanticEvents.find(
      { projectId: { $in: projectIds } },
      { sort: { occurredAt: -1 }, limit: 200 },
    ).fetchAsync();
    const rawBehaviors = await RawBehaviors.find(
      { projectId: { $in: projectIds } },
      { sort: { occurredAt: -1 }, limit: 500 },
    ).fetchAsync();
    const sourceSummaries = {};
    projectsWithMcpTokens.forEach((project) => {
      sourceSummaries[project._id] = summarizeBehaviorSources(
        rawBehaviors.filter((behavior) => behavior.projectId === project._id),
        project.blockedSources || [],
      );
    });

    return {
      developer: { email: developer.email, authToken: developer.authToken },
      projects: projectsWithMcpTokens.map(publicProject),
      rawCount,
      semanticCount,
      summary: summarizeSemanticEvents(semanticEvents),
      sourceSummaries,
      recentEvents: semanticEvents.slice(0, 20).map(publicSemanticEvent),
    };
  },

  async 'tracemind.project.create'(nameInput) {
    const developer = await getOrCreateDeveloperForUser(this.userId);
    const name = normalizeProjectName(nameInput);
    const projectId = await Projects.insertAsync({
      developerId: developer._id,
      name,
      projectKey: newToken('tm_proj'),
      mcpTokens: [newMcpToken()],
      createdAt: new Date(),
    });

    return publicProject(await Projects.findOneAsync(projectId));
  },

  async 'tracemind.project.rename'(projectId, nameInput) {
    const developer = await getOrCreateDeveloperForUser(this.userId);
    const project = await findProjectForDeveloper(projectId, developer._id);
    if (!project) {
      throw new Meteor.Error('not-found', 'Project not found.');
    }

    await Projects.updateAsync(project._id, {
      $set: {
        name: normalizeProjectName(nameInput),
        updatedAt: new Date(),
      },
    });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.remove'(projectId) {
    const developer = await getOrCreateDeveloperForUser(this.userId);
    const project = await findProjectForDeveloper(projectId, developer._id);
    if (!project) {
      throw new Meteor.Error('not-found', 'Project not found.');
    }

    await RawBehaviors.removeAsync({ projectId: project._id });
    await SemanticEvents.removeAsync({ projectId: project._id });
    await Projects.removeAsync(project._id);
    return { removed: true, projectId: project._id };
  },

  async 'tracemind.project.mcpToken.create'(projectId, nameInput) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const mcpTokens = [...project.mcpTokens, newMcpToken(nameInput)];
    await Projects.updateAsync(project._id, { $set: { mcpTokens } });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.mcpToken.rename'(projectId, tokenId, nameInput) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const normalizedTokenId = String(tokenId || '');
    const mcpTokens = project.mcpTokens.map((token) => (
      token.id === normalizedTokenId
        ? { ...token, name: normalizeMcpTokenName(nameInput), updatedAt: new Date() }
        : token
    ));

    if (!mcpTokens.some((token) => token.id === normalizedTokenId)) {
      throw new Meteor.Error('not-found', 'MCP token not found.');
    }

    await Projects.updateAsync(project._id, { $set: { mcpTokens } });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.mcpToken.refresh'(projectId, tokenId) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const normalizedTokenId = String(tokenId || '');
    const mcpTokens = project.mcpTokens.map((token) => (
      token.id === normalizedTokenId
        ? { ...token, token: newToken('tm_mcp'), updatedAt: new Date() }
        : token
    ));

    if (!mcpTokens.some((token) => token.id === normalizedTokenId)) {
      throw new Meteor.Error('not-found', 'MCP token not found.');
    }

    await Projects.updateAsync(project._id, { $set: { mcpTokens } });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.mcpToken.remove'(projectId, tokenId) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const normalizedTokenId = String(tokenId || '');
    const mcpTokens = project.mcpTokens.filter((token) => token.id !== normalizedTokenId);

    if (mcpTokens.length === project.mcpTokens.length) {
      throw new Meteor.Error('not-found', 'MCP token not found.');
    }

    await Projects.updateAsync(project._id, { $set: { mcpTokens } });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.source.block'(projectId, sourceInput) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const source = normalizeBlockedSource(sourceInput);
    if (!source.sourceKey || source.sourceKey === 'unknown') {
      throw new Meteor.Error('invalid-source', 'Source key is required.');
    }

    const blockedSources = project.blockedSources || [];
    if (isSourceBlocked(project, source)) {
      return publicProject(project);
    }

    await Projects.updateAsync(project._id, {
      $set: {
        blockedSources: [
          ...blockedSources,
          {
            ...source,
            reason: normalizeBlockReason(sourceInput?.reason),
            blockedAt: new Date(),
          },
        ],
      },
    });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.source.unblock'(projectId, sourceInput) {
    const project = await findOwnedProjectWithMcpTokens(projectId, this.userId);
    const source = normalizeBlockedSource(sourceInput);
    const blockedSources = (project.blockedSources || []).filter((blockedSource) => !isSourceBlocked(
      { blockedSources: [blockedSource] },
      source,
    ));

    await Projects.updateAsync(project._id, { $set: { blockedSources } });
    return publicProject(await Projects.findOneAsync(project._id));
  },

  async 'tracemind.project.summary'(projectId) {
    const developer = await getOrCreateDeveloperForUser(this.userId);
    const project = await findProjectForDeveloper(projectId, developer._id);
    if (!project) {
      throw new Meteor.Error('not-found', 'Project not found.');
    }
    return buildProjectSummary(project);
  },

  async 'tracemind.project.summaryByToken'(authToken, projectId) {
    const developer = await findDeveloperByToken(authToken);
    if (!developer) {
      throw new Meteor.Error('not-authorized', 'Login is required.');
    }

    const project = await findProjectForDeveloper(projectId, developer._id);
    if (!project) {
      throw new Meteor.Error('not-found', 'Project not found.');
    }
    return buildProjectSummary(project);
  },
});
