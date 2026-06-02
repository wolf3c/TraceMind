import {
  SetupAttempts,
  normalizeAttribution,
  normalizeToken,
} from '/imports/api/tracemind';

export const SETUP_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SETUP_ATTEMPT_STAGE_RANK = {
  copied: 0,
  mcp_connected: 1,
  guidance_loaded: 2,
  capture_setup_called: 3,
  first_capture_received: 4,
  first_manual_event_received: 5,
};

const OPEN_SETUP_ATTEMPT_STATUSES = [
  'copied',
  'mcp_connected',
  'guidance_loaded',
  'capture_setup_called',
  'first_capture_received',
];

const STAGE_TIME_FIELD = {
  mcp_connected: 'mcpConnectedAt',
  guidance_loaded: 'guidanceLoadedAt',
  capture_setup_called: 'captureSetupCalledAt',
  first_capture_received: 'firstCaptureReceivedAt',
  first_manual_event_received: 'firstManualEventReceivedAt',
};

const GUIDANCE_TOOL_NAMES = new Set([
  'tracemind.agent_guidance',
  'tracemind.check_agent_setup',
]);

function safeLocale(locale) {
  const value = String(locale || '').trim().toLowerCase();
  return value === 'zh' ? 'zh' : 'en';
}

function safeToolName(name) {
  const value = String(name || '').trim();
  return /^tracemind\.[a-z_]{1,80}$/.test(value) ? value : '';
}

function safePlatform(platform) {
  const value = String(platform || '').trim().toLowerCase().replace('-', '_');
  return /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : '';
}

function nextStatus(currentStatus, stage) {
  const currentRank = SETUP_ATTEMPT_STAGE_RANK[currentStatus] ?? 0;
  const nextRank = SETUP_ATTEMPT_STAGE_RANK[stage] ?? currentRank;
  return nextRank > currentRank ? stage : currentStatus || 'copied';
}

export function mcpTokenIdForProject(project = {}, mcpToken = '') {
  const normalizedToken = normalizeToken(mcpToken);
  if (!normalizedToken) return '';
  const token = (project.mcpTokens || []).find((candidate) => (
    normalizeToken(candidate?.token) === normalizedToken
  ));
  return token?.id || '';
}

export async function createSetupAttempt({
  developerId,
  projectId,
  mcpTokenId,
  locale,
  attribution,
  now = new Date(),
}) {
  const normalizedMcpTokenId = String(mcpTokenId || '').trim();
  if (!developerId || !projectId || !normalizedMcpTokenId) return null;

  const attemptId = await SetupAttempts.insertAsync({
    developerId,
    projectId,
    mcpTokenId: normalizedMcpTokenId,
    copiedAt: now,
    locale: safeLocale(locale),
    attribution: normalizeAttribution(attribution),
    status: 'copied',
    platforms: [],
    createdAt: now,
    updatedAt: now,
  });

  return SetupAttempts.findOneAsync(attemptId);
}

async function latestOpenSetupAttempt({ projectId, mcpTokenId, now = new Date() }) {
  if (!projectId) return null;

  const selector = {
    projectId,
    status: { $in: OPEN_SETUP_ATTEMPT_STATUSES },
    copiedAt: { $gte: new Date(now.getTime() - SETUP_ATTEMPT_WINDOW_MS) },
  };
  if (mcpTokenId) selector.mcpTokenId = mcpTokenId;

  return SetupAttempts.findOneAsync(selector, { sort: { copiedAt: -1 } });
}

async function advanceSetupAttempt(attempt, stage, { toolName, platform, now = new Date() } = {}) {
  if (!attempt || !Object.prototype.hasOwnProperty.call(SETUP_ATTEMPT_STAGE_RANK, stage)) return null;

  const setFields = {
    status: nextStatus(attempt.status, stage),
    updatedAt: now,
  };
  const timeField = STAGE_TIME_FIELD[stage];
  if (timeField && !attempt[timeField]) setFields[timeField] = now;

  const normalizedToolName = safeToolName(toolName);
  if (normalizedToolName) setFields.lastMcpToolName = normalizedToolName;

  const modifier = { $set: setFields };
  const normalizedPlatform = safePlatform(platform);
  if (normalizedPlatform) modifier.$addToSet = { platforms: normalizedPlatform };

  await SetupAttempts.updateAsync(attempt._id, modifier);
  return SetupAttempts.findOneAsync(attempt._id);
}

export async function advanceLatestSetupAttempt({
  projectId,
  mcpTokenId,
  stage,
  toolName,
  platform,
  now = new Date(),
}) {
  const attempt = await latestOpenSetupAttempt({ projectId, mcpTokenId, now });
  return advanceSetupAttempt(attempt, stage, { toolName, platform, now });
}

export async function recordSetupAttemptMcpConnection(project, mcpToken, now = new Date()) {
  const mcpTokenId = mcpTokenIdForProject(project, mcpToken);
  if (!project?._id || !mcpTokenId) return null;
  return advanceLatestSetupAttempt({
    projectId: project._id,
    mcpTokenId,
    stage: 'mcp_connected',
    now,
  });
}

export async function recordSetupAttemptMcpTool(project, toolName, args = {}, options = {}, now = new Date()) {
  const mcpTokenId = mcpTokenIdForProject(project, options.mcpToken);
  if (!project?._id || !mcpTokenId) return null;

  const connectedAttempt = await advanceLatestSetupAttempt({
    projectId: project._id,
    mcpTokenId,
    stage: 'mcp_connected',
    toolName,
    now,
  });

  if (GUIDANCE_TOOL_NAMES.has(toolName)) {
    return advanceLatestSetupAttempt({
      projectId: project._id,
      mcpTokenId,
      stage: 'guidance_loaded',
      toolName,
      now,
    });
  }

  if (toolName === 'tracemind.capture_setup') {
    return advanceLatestSetupAttempt({
      projectId: project._id,
      mcpTokenId,
      stage: 'capture_setup_called',
      toolName,
      platform: args?.platform || 'web',
      now,
    });
  }

  return connectedAttempt;
}

export async function recordSetupAttemptFirstCapture(projectId, { eventType, now = new Date() } = {}) {
  if (!projectId) return null;

  await advanceLatestSetupAttempt({
    projectId,
    stage: 'first_capture_received',
    now,
  });

  if (eventType === 'custom') {
    return advanceLatestSetupAttempt({
      projectId,
      stage: 'first_manual_event_received',
      now,
    });
  }

  return null;
}
