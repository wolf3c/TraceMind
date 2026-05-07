import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { buildSemanticEvent, summarizeSemanticEvents } from '../imports/api/semantic';
import {
  Developers,
  Projects,
  RawBehaviors,
  SemanticEvents,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  normalizeCaptureSource,
  normalizeEmail,
  summarizeBehaviorSources,
} from '../imports/api/tracemind';
import { buildAgentInstallPrompt } from '../imports/ui/agent_setup';
import { resolveConsoleState } from '../imports/ui/console_state';
import enMessages from '../imports/ui/i18n/locales/en';
import zhMessages from '../imports/ui/i18n/locales/zh';
import { normalizeLocaleValue, translateMessage } from '../imports/ui/i18n/i18n';

describe('TraceMind', function () {
  describe('Coding agent guidance', function () {
    it('builds Chinese install prompts with the current project MCP URL and public guidance links', function () {
      const prompt = buildAgentInstallPrompt({
        locale: 'zh',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
        skillUrl: 'https://local.example/agents/tracemind/SKILL.md',
        snippetUrl: 'https://local.example/agents/tracemind/AGENTS_SNIPPET.md',
        manifestUrl: 'https://local.example/agents/tracemind/manifest.json',
      });

      assert.ok(prompt.includes('https://local.example/mcp?mcpToken=tm_mcp_current'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/SKILL.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/AGENTS_SNIPPET.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/manifest.json'));
      assert.ok(prompt.includes('不要覆盖已有配置，只能合并或追加'));
      assert.ok(prompt.includes('请不要创建自定义 skill 目录'));
      assert.ok(prompt.includes('不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md'));
      assert.ok(prompt.includes('pending-global-confirmation'));
      assert.ok(prompt.includes('fallback-installed'));
    });

    it('builds English install prompts for English and unknown locales', function () {
      const prompt = buildAgentInstallPrompt({
        locale: 'en',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
        skillUrl: 'https://local.example/agents/tracemind/SKILL.md',
        snippetUrl: 'https://local.example/agents/tracemind/AGENTS_SNIPPET.md',
        manifestUrl: 'https://local.example/agents/tracemind/manifest.json',
      });
      const fallbackPrompt = buildAgentInstallPrompt({
        locale: 'fr',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
      });

      assert.ok(prompt.includes('Install TraceMind coding agent support in the current project.'));
      assert.ok(prompt.includes('Do not create a custom skill directory'));
      assert.ok(prompt.includes('Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md'));
      assert.ok(prompt.includes('pending-global-confirmation'));
      assert.ok(prompt.includes('fallback-installed'));
      assert.ok(prompt.includes('https://local.example/mcp?mcpToken=tm_mcp_current'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/SKILL.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/AGENTS_SNIPPET.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/manifest.json'));
      assert.strictEqual(fallbackPrompt.includes('Install TraceMind coding agent support in the current project.'), true);
      assert.strictEqual(fallbackPrompt.includes('请帮我在当前项目中安装 TraceMind 的 coding agent 支持。'), false);
    });

    it('ships static public guidance without project tokens or hard-coded deployment URLs', async function () {
      const [skill, snippet, manifestResponse] = await Promise.all([
        fetch(Meteor.absoluteUrl('/agents/tracemind/SKILL.md')).then((response) => response.text()),
        fetch(Meteor.absoluteUrl('/agents/tracemind/AGENTS_SNIPPET.md')).then((response) => response.text()),
        fetch(Meteor.absoluteUrl('/agents/tracemind/manifest.json')).then((response) => response.json()),
      ]);
      const manifest = manifestResponse;

      assert.ok(skill.includes('version: 2026.05.07'));
      assert.ok(snippet.includes('TraceMind Instrumentation Rules'));
      assert.strictEqual(manifest.guidanceVersion, '2026.05.07');
      assert.strictEqual(manifest.resources.skill, '/agents/tracemind/SKILL.md');
      [skill, snippet, JSON.stringify(manifest)].forEach((content) => {
        assert.ok(!content.includes('tm_mcp_'));
        assert.ok(!content.includes('tracemind.super-tree.com'));
      });
    });

    it('exposes MCP guidance and privacy validation tools', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const projectId = `project-agent-guidance-${Date.now()}`;
      const project = { _id: projectId, name: 'Agent Guidance Project' };
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_started',
        properties: { plan: 'pro' },
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });

      const toolNames = mcpTools().map((tool) => tool.name);
      assert.ok(toolNames.includes('tracemind.agent_guidance'));
      assert.ok(toolNames.includes('tracemind.validate_event_payload'));
      assert.ok(toolNames.includes('tracemind.validate_instrumentation_diff'));

      const guidance = await callMcpTool(project, 'tracemind.agent_guidance', {});
      assert.strictEqual(guidance.structuredContent.ok, true);
      assert.strictEqual(guidance.structuredContent.guidanceVersion, '2026.05.07');

      const search = await callMcpTool(project, 'tracemind.search_event_names', { query: 'checkout' });
      assert.ok(search.structuredContent.events.some((event) => event.eventName === 'checkout_started'));

      const validation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        eventName: 'user_signup_completed',
        properties: {
          email: 'person@example.com',
          plan: 'pro',
        },
      });
      assert.strictEqual(validation.structuredContent.ok, false);
      assert.ok(validation.structuredContent.findings.some((finding) => finding.code === 'forbidden_property'));

      const missingEventNameValidation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        properties: {
          plan: 'pro',
        },
      });
      assert.strictEqual(missingEventNameValidation.structuredContent.ok, false);
      assert.ok(missingEventNameValidation.structuredContent.findings.some((finding) => finding.code === 'missing_custom_event_name'));

      const diffValidation = await callMcpTool(project, 'tracemind.validate_instrumentation_diff', {
        diff: "+ capture({ eventType: 'custom', eventName: 'new_checkout_event', properties: { prompt: userPrompt, userEmail: user.email, access_token: token } })",
      });
      assert.strictEqual(diffValidation.structuredContent.ok, false);
      assert.ok(diffValidation.structuredContent.findings.some((finding) => finding.code === 'new_event_requires_review'));
      assert.ok(diffValidation.structuredContent.findings.filter((finding) => finding.code === 'forbidden_property').length >= 3);
    });
  });

  describe('UI i18n', function () {
    const requiredKeys = [
      'Language',
      'AI-native behavior intelligence',
      'See how users actually use your product with one line of code.',
      'Email',
      'Send code',
      'Checking your session...',
      'Loading your console...',
      'Could not load your console.',
      'Retry',
      'Create project',
      'Project created.',
    ];

    it('normalizes supported UI locales and falls back to English', function () {
      assert.strictEqual(normalizeLocaleValue('zh-CN'), 'zh');
      assert.strictEqual(normalizeLocaleValue('en-US'), 'en');
      assert.strictEqual(normalizeLocaleValue('fr-FR'), 'en');
    });

    it('keeps English messages compact by relying on source-text fallback', function () {
      assert.deepStrictEqual(enMessages, {});
      assert.strictEqual(translateMessage(enMessages, 'Create project'), 'Create project');
    });

    it('ships required Chinese UI message overrides', function () {
      requiredKeys.forEach((key) => {
        assert.ok(zhMessages[key], `missing Chinese message: ${key}`);
      });
    });

    it('translates messages with fallback and interpolation', function () {
      const messages = {
        greeting: 'Hello {{name}}',
      };

      assert.strictEqual(translateMessage(messages, 'greeting', { name: 'TraceMind' }), 'Hello TraceMind');
      assert.strictEqual(translateMessage(messages, 'missing.key'), 'missing.key');
    });
  });

  describe('Console state', function () {
    it('shows the dashboard when dashboard data exists', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: { developer: { email: 'founder@example.com' } },
          userId: null,
          loggingIn: true,
          dashboardLoadError: 'network failed',
        }),
        'ready',
      );
    });

    it('keeps the login form hidden while Meteor restores the session', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: null,
          loggingIn: true,
          dashboardLoadError: '',
        }),
        'restoring-session',
      );
    });

    it('shows the login form only after the signed-out state is confirmed', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: null,
          loggingIn: false,
          dashboardLoadError: '',
        }),
        'signed-out',
      );
    });

    it('keeps the login form hidden while an authenticated dashboard loads', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: 'user-1',
          loggingIn: false,
          dashboardLoadError: '',
        }),
        'loading-dashboard',
      );
    });

    it('shows an authenticated dashboard error instead of the login form', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: 'user-1',
          loggingIn: false,
          dashboardLoadError: 'network failed',
        }),
        'dashboard-error',
      );
    });
  });

  it('normalizes developer emails', function () {
    assert.strictEqual(normalizeEmail('  Founder@Example.COM  '), 'founder@example.com');
  });

  it('turns click behavior into a semantic event', function () {
    const event = buildSemanticEvent({
      _id: 'raw-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      type: 'click',
      path: '/pricing',
      targetText: 'Start trial',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.title, '点击了 "Start trial"');
    assert.strictEqual(event.meaning, '用户在 /pricing 点击了 "Start trial"。');
    assert.strictEqual(event.rawBehaviorId, 'raw-1');
  });

  it('keeps identity, device, geo, and custom fields on semantic events', function () {
    const event = buildSemanticEvent({
      _id: 'raw-identity',
      projectId: 'project-1',
      sessionId: 'session-1',
      anonymousId: 'anon-1',
      userId: 'user-1',
      deviceId: 'device-1',
      deviceFingerprint: 'fp-1',
      platform: 'web',
      deviceInfo: { browser: 'Chrome', os: 'macOS' },
      ip: '203.0.113.10',
      geo: { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' },
      type: 'custom',
      eventName: 'plan_selected',
      path: '/pricing',
      target: {
        tag: 'BUTTON',
        text: 'More',
        path: 'main:nth-of-type(1)>section:nth-of-type(2)>button:nth-of-type(1)',
      },
      targetHash: 'tm_target_abc123',
      properties: { plan: 'pro', amount: 29 },
      context: { source: 'manual' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.userId, 'user-1');
    assert.strictEqual(event.anonymousId, 'anon-1');
    assert.strictEqual(event.deviceId, 'device-1');
    assert.strictEqual(event.deviceFingerprint, 'fp-1');
    assert.strictEqual(event.platform, 'web');
    assert.deepStrictEqual(event.deviceInfo, { browser: 'Chrome', os: 'macOS' });
    assert.deepStrictEqual(event.geo, { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' });
    assert.strictEqual(event.eventName, 'plan_selected');
    assert.deepStrictEqual(event.target, {
      tag: 'BUTTON',
      text: 'More',
      path: 'main:nth-of-type(1)>section:nth-of-type(2)>button:nth-of-type(1)',
    });
    assert.strictEqual(event.targetHash, 'tm_target_abc123');
    assert.deepStrictEqual(event.properties, { plan: 'pro', amount: 29 });
    assert.deepStrictEqual(event.context, { source: 'manual' });
  });

  it('builds target-specific queries for repeated labels on the same page', function () {
    assert.deepStrictEqual(
      buildEventQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
      }),
      {
        projectId: 'project-1',
        eventType: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
      },
    );

    assert.deepStrictEqual(
      buildRawBehaviorQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
      }),
      {
        projectId: 'project-1',
        type: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
      },
    );
  });

  it('summarizes semantic event counts and paths', function () {
    const summary = summarizeSemanticEvents([
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { eventType: 'page_view', path: '/', anonymousId: 'anon-1', deviceFingerprint: 'fp-1', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ]);

    assert.deepStrictEqual(summary.topEvents[0], { eventType: 'click', count: 2 });
    assert.deepStrictEqual(summary.topPaths[0], { path: '/pricing', count: 2 });
    assert.strictEqual(summary.uniqueUsers, 2);
    assert.strictEqual(summary.uniqueDevices, 2);
    assert.deepStrictEqual(summary.dailyActiveUsers[0], { date: '2026-05-06', count: 2 });
  });

  it('normalizes capture sources with cross-platform source fields', function () {
    assert.deepStrictEqual(
      normalizeCaptureSource({
        source: {
          type: 'web',
          url: 'https://app.example.com/pricing?plan=pro',
          referrer: 'https://google.com/search?q=app',
        },
      }),
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        sourceDetails: {
          origin: 'https://app.example.com',
          path: '/pricing?plan=pro',
          referrer: 'https://google.com/search?q=app',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource(
        {
          platform: 'web',
          source: { url: 'https://spoofed.example/pricing?plan=pro' },
        },
        { origin: 'https://fallback.example.org', referer: 'https://fallback.example.org/docs' },
      ),
      {
        sourceType: 'web',
        sourceKey: 'fallback.example.org',
        sourceLabel: 'fallback.example.org',
        sourceDetails: {
          origin: 'https://fallback.example.org',
          path: '/',
          referrer: 'https://fallback.example.org/docs',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource(
        {
          platform: 'web',
          source: { url: 'https://spoofed.example/pricing?plan=pro' },
        },
        { referer: 'https://referrer.example.org/docs' },
      ),
      {
        sourceType: 'web',
        sourceKey: 'referrer.example.org',
        sourceLabel: 'referrer.example.org',
        sourceDetails: {
          origin: 'https://referrer.example.org',
          path: '/docs',
          referrer: 'https://referrer.example.org/docs',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({ platform: 'ios', source: { key: 'com.example.app', label: 'Example iOS' } }),
      {
        sourceType: 'ios',
        sourceKey: 'com.example.app',
        sourceLabel: 'Example iOS',
        sourceDetails: {},
      },
    );
  });

  it('summarizes raw behavior sources and marks blocked sources', function () {
    const blockedSources = [
      {
        sourceType: 'web',
        sourceKey: 'evil.example',
        sourceLabel: 'evil.example',
        reason: 'Not our app',
        blockedAt: new Date('2026-05-06T04:00:00.000Z'),
      },
      {
        sourceType: 'web',
        sourceKey: 'old.example',
        sourceLabel: 'old.example',
        reason: 'Old abuse',
        blockedAt: new Date('2026-05-06T05:00:00.000Z'),
      },
    ];
    const sources = summarizeBehaviorSources([
      { sourceType: 'web', sourceKey: 'app.example.com', sourceLabel: 'app.example.com', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { sourceType: 'web', sourceKey: 'app.example.com', sourceLabel: 'app.example.com', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { sourceType: 'web', sourceKey: 'evil.example', sourceLabel: 'evil.example', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ], blockedSources);

    assert.deepStrictEqual(sources, [
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        count: 2,
        lastSeenAt: new Date('2026-05-06T02:00:00.000Z'),
        blocked: false,
      },
      {
        sourceType: 'web',
        sourceKey: 'evil.example',
        sourceLabel: 'evil.example',
        count: 1,
        lastSeenAt: new Date('2026-05-06T03:00:00.000Z'),
        blocked: true,
        reason: 'Not our app',
        blockedAt: new Date('2026-05-06T04:00:00.000Z'),
      },
      {
        sourceType: 'web',
        sourceKey: 'old.example',
        sourceLabel: 'old.example',
        count: 0,
        lastSeenAt: null,
        blocked: true,
        reason: 'Old abuse',
        blockedAt: new Date('2026-05-06T05:00:00.000Z'),
      },
    ]);

    assert.strictEqual(isSourceBlocked({ blockedSources }, { sourceType: 'web', sourceKey: 'evil.example' }), true);
    assert.strictEqual(isSourceBlocked({ blockedSources }, { sourceType: 'web', sourceKey: 'app.example.com' }), false);
  });

  if (Meteor.isServer) {
    let ingestCapturePayload;
    let resolveProjectByMcpToken;

    before(async function () {
      const captureRoutes = await import('../server/capture_routes');
      const methods = await import('../server/tracemind_methods');
      ingestCapturePayload = captureRoutes.ingestCapturePayload;
      resolveProjectByMcpToken = methods.resolveProjectByMcpToken;
    });

    it('creates TraceMind developer data from a Meteor Accounts user', async function () {
      const email = `founder-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      const result = await dashboardMethod.apply({ userId }, []);

      const developer = await Developers.findOneAsync({ userId });
      const project = await Projects.findOneAsync({ developerId: developer._id });

      assert.strictEqual(result.developer.email, email);
      assert.ok(result.developer.authToken.startsWith('tm_dev_'));
      assert.strictEqual(result.projects.length, 1);
      assert.strictEqual(result.summary.totalEvents, 0);
      assert.ok(result.projects[0].projectKey.startsWith('tm_proj_'));
      assert.strictEqual(result.projects[0].mcpTokens.length, 1);
      assert.strictEqual(result.projects[0].mcpTokens[0].name, 'Default MCP Token');
      assert.ok(result.projects[0].mcpTokens[0].token.startsWith('tm_mcp_'));
      assert.strictEqual(project._id, result.projects[0]._id);
    });

    it('summarizes only the selected project for project detail views', async function () {
      const email = `project-summary-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const createProjectMethod = Meteor.server.method_handlers['tracemind.project.create'];
      const projectSummaryMethod = Meteor.server.method_handlers['tracemind.project.summary'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const selectedProject = dashboard.projects[0];
      const otherProject = await createProjectMethod.apply({ userId }, ['Other Web App']);

      await RawBehaviors.insertAsync({
        projectId: selectedProject._id,
        type: 'page_view',
        sourceType: 'web',
        sourceKey: 'selected.example',
        sourceLabel: 'selected.example',
        occurredAt: new Date('2026-05-07T01:00:00.000Z'),
        createdAt: new Date('2026-05-07T01:00:00.000Z'),
      });
      await RawBehaviors.insertAsync({
        projectId: otherProject._id,
        type: 'page_view',
        sourceType: 'web',
        sourceKey: 'other.example',
        sourceLabel: 'other.example',
        occurredAt: new Date('2026-05-07T02:00:00.000Z'),
        createdAt: new Date('2026-05-07T02:00:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId: selectedProject._id,
        eventType: 'custom',
        eventName: 'selected_event',
        title: 'Selected event',
        meaning: 'Selected project event.',
        userId: 'selected-user',
        deviceId: 'selected-device',
        occurredAt: new Date('2026-05-07T01:05:00.000Z'),
        createdAt: new Date('2026-05-07T01:05:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId: otherProject._id,
        eventType: 'custom',
        eventName: 'other_event',
        title: 'Other event',
        meaning: 'Other project event.',
        userId: 'other-user',
        deviceId: 'other-device',
        occurredAt: new Date('2026-05-07T02:05:00.000Z'),
        createdAt: new Date('2026-05-07T02:05:00.000Z'),
      });

      const result = await projectSummaryMethod.apply({ userId }, [selectedProject._id]);

      assert.strictEqual(result.project._id, selectedProject._id);
      assert.strictEqual(result.rawCount, 1);
      assert.strictEqual(result.semanticCount, 1);
      assert.strictEqual(result.summary.totalEvents, 1);
      assert.strictEqual(result.summary.uniqueUsers, 1);
      assert.strictEqual(result.summary.uniqueDevices, 1);
      assert.deepStrictEqual(result.sources.map((source) => source.sourceKey), ['selected.example']);
      assert.deepStrictEqual(result.recentEvents.map((event) => event.eventName), ['selected_event']);
    });

    it('resolves MCP access only through independent MCP tokens', async function () {
      const projectId = `project-mcp-auth-${Date.now()}`;
      const mcpToken = `tm_mcp_test_${Date.now()}`;
      const projectKey = `tm_proj_test_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-mcp-auth',
        name: 'MCP Auth Project',
        projectKey,
        mcpTokens: [{
          id: 'mcp-token-1',
          name: 'Agent Seat',
          token: mcpToken,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        createdAt: new Date(),
      });

      const projectByToken = await resolveProjectByMcpToken(mcpToken);
      const projectByProjectKey = await resolveProjectByMcpToken(projectKey);

      assert.strictEqual(projectByToken._id, projectId);
      assert.strictEqual(projectByProjectKey, null);
    });

    it('lets project owners create, rename, refresh, and remove MCP tokens', async function () {
      const email = `mcp-owner-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const createMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.create'];
      const renameMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.rename'];
      const refreshMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.refresh'];
      const removeMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.remove'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const projectId = dashboard.projects[0]._id;

      const createdProject = await createMethod.apply({ userId }, [projectId, 'Claude']);
      const createdToken = createdProject.mcpTokens.find((token) => token.name === 'Claude');
      assert.ok(createdToken.token.startsWith('tm_mcp_'));

      const renamedProject = await renameMethod.apply({ userId }, [projectId, createdToken.id, 'Cursor']);
      assert.strictEqual(
        renamedProject.mcpTokens.find((token) => token.id === createdToken.id).name,
        'Cursor',
      );

      const refreshedProject = await refreshMethod.apply({ userId }, [projectId, createdToken.id]);
      const refreshedToken = refreshedProject.mcpTokens.find((token) => token.id === createdToken.id);
      assert.ok(refreshedToken.token.startsWith('tm_mcp_'));
      assert.notStrictEqual(refreshedToken.token, createdToken.token);
      assert.strictEqual(await resolveProjectByMcpToken(createdToken.token), null);
      assert.strictEqual((await resolveProjectByMcpToken(refreshedToken.token))._id, projectId);

      const removedProject = await removeMethod.apply({ userId }, [projectId, createdToken.id]);
      assert.strictEqual(
        removedProject.mcpTokens.some((token) => token.id === createdToken.id),
        false,
      );
      assert.strictEqual(await resolveProjectByMcpToken(refreshedToken.token), null);
    });

    it('lets project owners block and unblock capture sources', async function () {
      const email = `source-owner-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const blockMethod = Meteor.server.method_handlers['tracemind.project.source.block'];
      const unblockMethod = Meteor.server.method_handlers['tracemind.project.source.unblock'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const projectId = dashboard.projects[0]._id;

      const blockedProject = await blockMethod.apply(
        { userId },
        [projectId, { sourceType: 'web', sourceKey: 'evil.example', reason: 'Not our app' }],
      );
      assert.deepStrictEqual(blockedProject.blockedSources.map((source) => ({
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        reason: source.reason,
      })), [{ sourceType: 'web', sourceKey: 'evil.example', reason: 'Not our app' }]);

      const unblockedProject = await unblockMethod.apply(
        { userId },
        [projectId, { sourceType: 'web', sourceKey: 'evil.example' }],
      );
      assert.deepStrictEqual(unblockedProject.blockedSources, []);
    });

    it('accepts blocked capture requests without inserting raw behavior', async function () {
      const projectId = `project-blocked-capture-${Date.now()}`;
      const projectKey = `tm_proj_blocked_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-blocked-capture',
        name: 'Blocked Capture Project',
        projectKey,
        blockedSources: [{ sourceType: 'web', sourceKey: 'evil.example', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload(
        {
          projectKey,
          type: 'page_view',
          source: { type: 'web', url: 'https://evil.example/pricing' },
        },
        { headers: {}, socket: {} },
      );
      const count = await RawBehaviors.find({ projectId }).countAsync();

      assert.deepStrictEqual(result, { ok: true, ignored: true });
      assert.strictEqual(count, 0);
    });

    it('stores source fields for accepted capture requests', async function () {
      const projectId = `project-source-capture-${Date.now()}`;
      const projectKey = `tm_proj_source_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-source-capture',
        name: 'Source Capture Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload(
        {
          projectKey,
          type: 'page_view',
          source: { type: 'web', url: 'https://app.example.com/docs' },
        },
        { headers: {}, socket: {} },
      );
      const behavior = await RawBehaviors.findOneAsync({ projectId });

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.strictEqual(behavior.sourceType, 'web');
      assert.strictEqual(behavior.sourceKey, 'app.example.com');
      assert.strictEqual(behavior.sourceLabel, 'app.example.com');
      assert.deepStrictEqual(behavior.sourceDetails, {
        origin: 'https://app.example.com',
        path: '/docs',
        referrer: '',
      });
    });

    it('requires a Meteor Accounts session for the dashboard', async function () {
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      await assert.rejects(
        () => dashboardMethod.apply({}, []),
        /Login is required/,
      );
    });

    it('queries semantic events by time, event name, and user id', async function () {
      const projectId = `project-query-${Date.now()}`;
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_started',
        userId: 'user-a',
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_finished',
        userId: 'user-b',
        occurredAt: new Date('2026-05-02T10:00:00.000Z'),
        createdAt: new Date(),
      });

      const events = await SemanticEvents.find(
        buildEventQuery(projectId, {
          eventName: 'checkout_started',
          userId: 'user-a',
          startAt: '2026-05-01T00:00:00.000Z',
          endAt: '2026-05-01T23:59:59.999Z',
        }),
      ).fetchAsync();

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].eventName, 'checkout_started');
      assert.strictEqual(events[0].userId, 'user-a');
    });
  }
});
