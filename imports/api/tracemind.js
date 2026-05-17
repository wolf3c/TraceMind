import { Mongo } from 'meteor/mongo';

export const Developers = new Mongo.Collection('tracemind_developers');
export const Projects = new Mongo.Collection('tracemind_projects');
export const RawBehaviors = new Mongo.Collection('tracemind_raw_behaviors');
export const SemanticEvents = new Mongo.Collection('tracemind_semantic_events');
export const PresenceSessions = new Mongo.Collection('tracemind_presence_sessions');
export const CaptureDeliveryReports = new Mongo.Collection('tracemind_capture_delivery_reports');
export const FeedbackReports = new Mongo.Collection('tracemind_feedback_reports');
export const UserFeedbackReports = new Mongo.Collection('tracemind_user_feedback_reports');
export const ProjectDailyReports = new Mongo.Collection('tracemind_project_daily_reports');

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 5 * 1000;
export const PRESENCE_ONLINE_WINDOW_MS = 15 * 1000;
export const ACTIVE_IDLE_TIMEOUT_MS = 60 * 1000;
export const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECENT_ONLINE_WINDOW_MS = 30 * 60 * 1000;
export const RECENT_ONLINE_BUCKET_MS = 5 * 60 * 1000;
export const HEALTH_RETENTION_DAYS = [2, 3, 7, 30];
export const DAILY_REPORT_TIMEZONE = 'Asia/Shanghai';
export const DAILY_REPORT_DRAFT_MIN_REFRESH_MS = 60 * 1000;

const PASSIVE_BOUNCE_EVENT_NAMES = new Set(['page_view', 'route_change']);
const EXPLICIT_BOUNCE_INTERACTION_EVENT_TYPES = new Set(['click', 'input', 'submit', 'change', 'custom']);
const ATTRIBUTION_REFERRER_TYPES = new Set(['direct', 'internal', 'external', 'search', 'social']);
const ATTRIBUTION_VALUE_PATTERN = /^[a-z0-9][a-z0-9._~:-]{0,119}$/i;

export const EVENT_TYPES = {
  page_view: '浏览页面',
  click: '点击元素',
  input: '修改输入',
  submit: '提交表单',
  route_change: '页面跳转',
  api_call: '调用接口',
  tool_call: '调用 MCP 工具',
  resource_read: '读取 MCP 资源',
  prompt_request: '请求 MCP Prompt',
  skill_lifecycle: 'Agent Skill 生命周期',
  custom: '自定义行为',
};

export const EVENT_DEFINITIONS = [
  {
    eventType: 'page_view',
    name: '页面浏览',
    meaning: '用户打开或刷新了一个页面，用于分析访问量、落地页、路径入口、流量归因和页面级留存。',
    typicalProperties: ['title', 'path', 'referrer', 'attribution'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension', 'server'],
  },
  {
    eventType: 'click',
    name: '元素点击',
    meaning: '用户点击了页面或客户端界面上的元素，用于分析功能入口、按钮转化和交互兴趣。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension'],
  },
  {
    eventType: 'input',
    name: '输入变化',
    meaning: '用户修改了输入控件，用于分析表单填写、设置修改和关键流程参与度。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension'],
  },
  {
    eventType: 'submit',
    name: '表单提交',
    meaning: '用户提交了表单或确认动作，用于分析注册、支付、创建、搜索等转化节点。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension'],
  },
  {
    eventType: 'route_change',
    name: '页面跳转',
    meaning: '用户在应用内发生路由变化，用于分析路径流转、漏斗顺序和页面间跳转。',
    typicalProperties: ['path', 'referrer', 'attribution'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension'],
  },
  {
    eventType: 'api_call',
    name: '接口调用',
    meaning: '客户端或服务端记录了一次接口调用，用于分析接口失败、关键后端流程和服务端埋点。',
    typicalProperties: ['method', 'status', 'path'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension', 'server'],
  },
  {
    eventType: 'tool_call',
    name: 'MCP 工具调用',
    meaning: 'MCP server 记录了一次工具调用完成情况，用于分析工具使用量、失败率和耗时。',
    typicalProperties: ['toolName', 'status', 'durationMs', 'errorType', 'resultSizeBucket'],
    platforms: ['server'],
  },
  {
    eventType: 'resource_read',
    name: 'MCP 资源读取',
    meaning: 'MCP server 记录了一次资源读取完成情况，用于分析资源访问、失败率和耗时。',
    typicalProperties: ['resourceName', 'uriScheme', 'uriTemplateHash', 'status', 'durationMs'],
    platforms: ['server'],
  },
  {
    eventType: 'prompt_request',
    name: 'MCP Prompt 请求',
    meaning: 'MCP server 记录了一次 prompt 请求完成情况，用于分析 prompt 使用、失败率和耗时。',
    typicalProperties: ['promptName', 'status', 'durationMs'],
    platforms: ['server'],
  },
  {
    eventType: 'skill_lifecycle',
    name: 'Agent Skill 生命周期',
    meaning: '宿主 agent runtime 记录了 Skill started/completed/failed 等生命周期信号。',
    typicalProperties: ['skillName', 'version', 'phase', 'success', 'durationMs'],
    platforms: ['server'],
  },
  {
    eventType: 'custom',
    name: '自定义事件',
    meaning: '开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。',
    typicalProperties: ['eventName', 'properties', 'context'],
    platforms: ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension', 'server'],
  },
];

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function normalizeToken(token) {
  return String(token || '').trim();
}

export function mcpServerNameForProject(project = {}) {
  const rawId = typeof project === 'string' ? project : project?._id;
  const code = String(rawId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() || 'project';
  return `tracemind-${code}`;
}

function cleanString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
}

function cleanFramework(value) {
  const framework = cleanString(value, 40).toLowerCase();
  return /^[a-z][a-z0-9_-]{0,39}$/.test(framework) ? framework : '';
}

function cleanMiniProgramProvider(value) {
  const provider = cleanString(value, 40).toLowerCase();
  return ['wechat', 'alipay', 'douyin', 'dingtalk'].includes(provider) ? provider : '';
}

function cleanBrowserExtensionBrowser(value) {
  const browser = cleanString(value, 40).toLowerCase();
  return ['chrome', 'edge', 'firefox', 'unknown'].includes(browser) ? browser : '';
}

function cleanBrowserExtensionRuntimeContext(value) {
  const runtimeContext = cleanString(value, 40).toLowerCase().replace(/-/g, '_');
  return ['popup', 'options', 'sidebar', 'devtools', 'background', 'service_worker', 'content_script', 'unknown'].includes(runtimeContext) ? runtimeContext : '';
}

function cleanBrowserExtensionVersion(value) {
  const version = cleanString(value, 40);
  return /^[A-Za-z0-9._+-]{1,40}$/.test(version) ? version : '';
}

function browserExtensionSourceDetails(sourceDetails = {}) {
  const input = safeObject(sourceDetails);
  const browser = cleanBrowserExtensionBrowser(input.browser);
  const manifestVersion = cleanBrowserExtensionVersion(input.manifestVersion);
  const runtimeContext = cleanBrowserExtensionRuntimeContext(input.runtimeContext);
  const sdkVersion = cleanBrowserExtensionVersion(input.sdkVersion);
  return {
    ...(browser ? { browser } : {}),
    ...(manifestVersion ? { manifestVersion } : {}),
    ...(runtimeContext ? { runtimeContext } : {}),
    ...(sdkVersion ? { sdkVersion } : {}),
  };
}

function safeObject(value, maxBytes = 4096) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const json = JSON.stringify(value);
    if (!json) return {};
    if (json.length > maxBytes) {
      return { truncated: true, preview: json.slice(0, maxBytes) };
    }
    return JSON.parse(json);
  } catch (error) {
    return {};
  }
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value));
  } catch (error) {
    return null;
  }
}

function cleanAttributionValue(value, max = 120) {
  const text = String(value || '').trim().replace(/\s+/g, '-').slice(0, max);
  if (!text || text.includes('@') || /https?:|[?&=]|%40/i.test(text)) return '';
  return ATTRIBUTION_VALUE_PATTERN.test(text) ? text : '';
}

function cleanAttributionDomain(value) {
  const parsed = parseUrl(value);
  const domain = String(parsed?.hostname || value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '').slice(0, 200);
  if (!domain || domain.includes('@') || /[/?#&=]/.test(domain)) return '';
  return /^[a-z0-9.-]+$/.test(domain) ? domain : '';
}

function cleanAttributionPath(value) {
  const raw = String(value || '').trim().slice(0, 500);
  if (!raw || raw.includes('@') || /^https?:/i.test(raw)) return '';
  const [pathWithoutQuery] = raw.split('?');
  if (!pathWithoutQuery.startsWith('/')) return '';
  return pathWithoutQuery || '/';
}

export function normalizeAttribution(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const attribution = {};
  const source = cleanAttributionValue(input.source || input.utmSource);
  const medium = cleanAttributionValue(input.medium || input.utmMedium);
  const campaign = cleanAttributionValue(input.campaign || input.utmCampaign);
  const content = cleanAttributionValue(input.content || input.utmContent);
  const referrerDomain = cleanAttributionDomain(input.referrerDomain);
  const referrerType = ATTRIBUTION_REFERRER_TYPES.has(String(input.referrerType || '').toLowerCase())
    ? String(input.referrerType).toLowerCase()
    : '';
  const landingPath = cleanAttributionPath(input.landingPath);

  attribution.source = source || referrerDomain || (referrerType === 'direct' ? 'direct' : '');
  attribution.medium = medium || referrerType || '';
  if (campaign) attribution.campaign = campaign;
  if (content) attribution.content = content;
  if (referrerDomain) attribution.referrerDomain = referrerDomain;
  if (referrerType) attribution.referrerType = referrerType;
  if (landingPath) attribution.landingPath = landingPath;
  if (input.gclidPresent === true) attribution.gclidPresent = true;
  if (input.fbclidPresent === true) attribution.fbclidPresent = true;
  if (input.msclkidPresent === true) attribution.msclkidPresent = true;

  Object.keys(attribution).forEach((key) => {
    if (attribution[key] === '') delete attribution[key];
  });
  return attribution;
}

function normalizeSourceType(value) {
  const sourceType = cleanString(value, 40).toLowerCase();
  return ['web', 'ios', 'android', 'macos', 'mini_program', 'browser_extension', 'server', 'mcp_server', 'agent_skill', 'server_app'].includes(sourceType) ? sourceType : 'unknown';
}

export function normalizeCaptureSource(payload = {}, headers = {}) {
  const source = safeObject(payload.source);
  const sourceType = normalizeSourceType(source.type || payload.sourceType || payload.platform || 'web');

  if (sourceType === 'web') {
    const referrer = cleanString(headers.referer || headers.referrer || source.referrer || payload.referrer, 500);
    const originUrl = parseUrl(headers.origin);
    const referrerUrl = parseUrl(headers.referer || headers.referrer);
    const payloadUrl = parseUrl(source.url || payload.url || payload.href);
    const pageUrl = originUrl || referrerUrl || payloadUrl;

    if (pageUrl) {
      const sourceKey = cleanString(pageUrl.hostname.toLowerCase(), 200, 'unknown');
      const payloadUrlMatchesSource = payloadUrl && payloadUrl.hostname.toLowerCase() === sourceKey;
      const detailUrl = payloadUrlMatchesSource ? payloadUrl : (!originUrl && referrerUrl ? referrerUrl : null);
      const framework = cleanFramework(safeObject(source.details).framework)
        || cleanFramework(safeObject(payload.sourceDetails).framework);
      const sourceDetails = {
        origin: pageUrl.origin,
        path: detailUrl ? `${detailUrl.pathname || '/'}${detailUrl.search || ''}` : '/',
        referrer,
      };
      if (framework) sourceDetails.framework = framework;

      return {
        sourceType,
        sourceKey,
        sourceLabel: sourceKey,
        sourceDetails,
      };
    }
  }

  if (sourceType === 'mini_program') {
    const sourceKey = cleanString(
      source.appId || source.key || payload.sourceKey,
      200,
      'unknown',
    );
    const provider = cleanMiniProgramProvider(safeObject(source.details).provider)
      || cleanMiniProgramProvider(safeObject(payload.sourceDetails).provider);
    return {
      sourceType,
      sourceKey,
      sourceLabel: cleanString(source.label || payload.sourceLabel || sourceKey, 200, sourceKey),
      sourceDetails: provider ? { provider } : {},
    };
  }

  if (sourceType === 'browser_extension') {
    const sourceKey = cleanString(
      source.extensionId || source.key || payload.sourceKey,
      200,
      'unknown',
    );
    return {
      sourceType,
      sourceKey,
      sourceLabel: cleanString(source.label || payload.sourceLabel || sourceKey, 200, sourceKey),
      sourceDetails: browserExtensionSourceDetails({
        ...safeObject(payload.sourceDetails),
        ...safeObject(source.details),
      }),
    };
  }

  const sourceKey = cleanString(
    source.key || payload.sourceKey || source.bundleId || source.packageName || source.appId,
    200,
    'unknown',
  );
  return {
    sourceType,
    sourceKey,
    sourceLabel: cleanString(source.label || payload.sourceLabel || sourceKey, 200, sourceKey),
    sourceDetails: safeObject(source.details || payload.sourceDetails),
  };
}

export function normalizeBlockedSource(input = {}) {
  const source = normalizeCaptureSource({
    platform: input.sourceType || input.type || 'unknown',
    sourceKey: input.sourceKey || input.key,
    sourceLabel: input.sourceLabel || input.label,
    sourceDetails: input.sourceDetails || input.details,
  });

  return {
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceLabel: cleanString(input.sourceLabel || input.label || source.sourceLabel, 200, source.sourceKey),
  };
}

export function isSourceBlocked(project = {}, source = {}) {
  const sourceType = cleanString(source.sourceType, 40).toLowerCase();
  const sourceKey = cleanString(source.sourceKey, 200).toLowerCase();
  if (!sourceType || !sourceKey) return false;

  return (project.blockedSources || []).some((blockedSource) => (
    cleanString(blockedSource.sourceType, 40).toLowerCase() === sourceType
    && cleanString(blockedSource.sourceKey, 200).toLowerCase() === sourceKey
  ));
}

export function publicBlockedSource(source) {
  if (!source) return null;

  return {
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceLabel: source.sourceLabel || source.sourceKey,
    reason: source.reason || '',
    blockedAt: source.blockedAt,
  };
}

export function summarizeBehaviorSources(behaviors = [], blockedSources = []) {
  const blockedProject = { blockedSources };
  const sourceMap = new Map();

  blockedSources.forEach((source) => {
    const sourceType = source.sourceType || 'unknown';
    const sourceKey = source.sourceKey || 'unknown';
    const key = `${sourceType}:${sourceKey}`;
    sourceMap.set(key, {
      sourceType,
      sourceKey,
      sourceLabel: source.sourceLabel || sourceKey,
      count: 0,
      lastSeenAt: null,
      blocked: true,
      reason: source.reason || '',
      blockedAt: source.blockedAt,
    });
  });

  behaviors.forEach((behavior) => {
    const sourceType = behavior.sourceType || 'unknown';
    const sourceKey = behavior.sourceKey || 'unknown';
    const key = `${sourceType}:${sourceKey}`;
    const occurredAt = behavior.occurredAt || behavior.createdAt || null;
    const existing = sourceMap.get(key) || {
      sourceType,
      sourceKey,
      sourceLabel: behavior.sourceLabel || sourceKey,
      count: 0,
      lastSeenAt: null,
      blocked: isSourceBlocked(blockedProject, { sourceType, sourceKey }),
    };

    if (existing.blocked) {
      existing.reason = existing.reason || '';
    }
    existing.count += 1;
    if (occurredAt && (!existing.lastSeenAt || new Date(occurredAt) > new Date(existing.lastSeenAt))) {
      existing.lastSeenAt = occurredAt;
    }
    sourceMap.set(key, existing);
  });

  return [...sourceMap.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return new Date(right.lastSeenAt || 0) - new Date(left.lastSeenAt || 0);
  });
}

export function summarizeCaptureDelivery(reports = []) {
  const summary = {
    reportCount: reports.length,
    sent: 0,
    accepted: 0,
    ignored: 0,
    droppedOldest: 0,
    droppedStorage: 0,
    retryCount: 0,
    coalescedPresence: 0,
    maxQueueDepth: 0,
    failedFlushes: 0,
    lastSuccessfulFlushAt: null,
    lastFailedFlushAt: null,
  };

  reports.forEach((report) => {
    summary.sent += Number(report.sent) || 0;
    summary.accepted += Number(report.accepted) || 0;
    summary.ignored += Number(report.ignored) || 0;
    summary.droppedOldest += Number(report.droppedOldest) || 0;
    summary.droppedStorage += Number(report.droppedStorage) || 0;
    summary.retryCount += Number(report.retryCount) || 0;
    summary.coalescedPresence += Number(report.coalescedPresence) || 0;
    summary.maxQueueDepth = Math.max(summary.maxQueueDepth, Number(report.maxQueueDepth) || 0);

    const createdAt = report.createdAt || null;
    if (report.lastError) {
      summary.failedFlushes += 1;
      if (createdAt && (!summary.lastFailedFlushAt || new Date(createdAt) > new Date(summary.lastFailedFlushAt))) {
        summary.lastFailedFlushAt = createdAt;
      }
    } else if (createdAt && (!summary.lastSuccessfulFlushAt || new Date(createdAt) > new Date(summary.lastSuccessfulFlushAt))) {
      summary.lastSuccessfulFlushAt = createdAt;
    }
  });

  return summary;
}

export function publicMcpToken(token) {
  if (!token) return null;

  return {
    id: token.id,
    name: token.name,
    token: token.token,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actorIdForEvent(event = {}) {
  return event.userId || event.anonymousId || event.deviceId || event.deviceFingerprint;
}

function applyAttributionFilters(query, filters = {}) {
  const attributionSource = cleanAttributionValue(filters.attributionSource);
  const attributionMedium = cleanAttributionValue(filters.attributionMedium);
  const attributionCampaign = cleanAttributionValue(filters.attributionCampaign);
  const attributionContent = cleanAttributionValue(filters.attributionContent);
  const attributionReferrerType = ATTRIBUTION_REFERRER_TYPES.has(String(filters.attributionReferrerType || filters.referrerType || '').toLowerCase())
    ? String(filters.attributionReferrerType || filters.referrerType).toLowerCase()
    : '';
  const landingPath = cleanAttributionPath(filters.landingPath || filters.attributionLandingPath);

  if (attributionSource) query['attribution.source'] = attributionSource;
  if (attributionMedium) query['attribution.medium'] = attributionMedium;
  if (attributionCampaign) query['attribution.campaign'] = attributionCampaign;
  if (attributionContent) query['attribution.content'] = attributionContent;
  if (attributionReferrerType) query['attribution.referrerType'] = attributionReferrerType;
  if (landingPath) query['attribution.landingPath'] = landingPath;
}

export function buildEventQuery(projectId, filters = {}) {
  const query = { projectId };
  const startAt = validDate(filters.startAt);
  const endAt = validDate(filters.endAt);

  if (filters.eventType) query.eventType = String(filters.eventType);
  if (filters.eventName) query.eventName = String(filters.eventName);
  if (filters.userId) query.userId = String(filters.userId);
  if (filters.anonymousId) query.anonymousId = String(filters.anonymousId);
  if (filters.sessionId) query.sessionId = String(filters.sessionId);
  if (filters.deviceId) query.deviceId = String(filters.deviceId);
  if (filters.targetHash) query.targetHash = String(filters.targetHash);
  if (filters.actionKey) query.actionKey = String(filters.actionKey);
  if (filters.path) query.path = String(filters.path);
  applyAttributionFilters(query, filters);
  if (startAt || endAt) {
    query.occurredAt = {};
    if (startAt) query.occurredAt.$gte = startAt;
    if (endAt) query.occurredAt.$lte = endAt;
  }

  return query;
}

export function buildRawBehaviorQuery(projectId, filters = {}) {
  const query = { projectId };
  const startAt = validDate(filters.startAt);
  const endAt = validDate(filters.endAt);

  if (filters.type) query.type = String(filters.type);
  if (filters.eventType) query.type = String(filters.eventType);
  if (filters.eventName) query.eventName = String(filters.eventName);
  if (filters.userId) query.userId = String(filters.userId);
  if (filters.anonymousId) query.anonymousId = String(filters.anonymousId);
  if (filters.sessionId) query.sessionId = String(filters.sessionId);
  if (filters.deviceId) query.deviceId = String(filters.deviceId);
  if (filters.targetHash) query.targetHash = String(filters.targetHash);
  if (filters.actionKey) query.actionKey = String(filters.actionKey);
  if (filters.path) query.path = String(filters.path);
  applyAttributionFilters(query, filters);
  if (startAt || endAt) {
    query.occurredAt = {};
    if (startAt) query.occurredAt.$gte = startAt;
    if (endAt) query.occurredAt.$lte = endAt;
  }

  return query;
}

export function publicProject(project) {
  if (!project) return null;

  return {
    _id: project._id,
    name: project.name,
    projectKey: project.projectKey,
    mcpTokens: (project.mcpTokens || []).map(publicMcpToken).filter(Boolean),
    blockedSources: (project.blockedSources || []).map(publicBlockedSource).filter(Boolean),
    createdAt: project.createdAt,
  };
}

export function publicSemanticEvent(event) {
  return {
    _id: event._id,
    projectId: event.projectId,
    sessionId: event.sessionId,
    anonymousId: event.anonymousId,
    userId: event.userId,
    deviceId: event.deviceId,
    deviceFingerprint: event.deviceFingerprint,
    platform: event.platform,
    deviceInfo: event.deviceInfo,
    ip: event.ip,
    geo: event.geo,
    sourceType: event.sourceType,
    sourceKey: event.sourceKey,
    sourceLabel: event.sourceLabel,
    sourceDetails: event.sourceDetails,
    eventType: event.eventType,
    eventName: event.eventName,
    title: event.title,
    meaning: event.meaning,
    path: event.path,
    targetText: event.targetText,
    targetTag: event.targetTag,
    target: event.target,
    targetHash: event.targetHash,
    targetIdentity: event.targetIdentity,
    identitySource: event.identitySource,
    identityConfidence: event.identityConfidence,
    actionKey: event.actionKey,
    relatedActionKey: event.relatedActionKey,
    relatedTargetHash: event.relatedTargetHash,
    correlationId: event.correlationId,
    attribution: normalizeAttribution(event.attribution),
    properties: event.properties,
    context: event.context,
    occurredAt: event.occurredAt,
    rawBehaviorId: event.rawBehaviorId,
  };
}

export function publicRawBehavior(behavior) {
  return {
    _id: behavior._id,
    projectId: behavior.projectId,
    sessionId: behavior.sessionId,
    anonymousId: behavior.anonymousId,
    userId: behavior.userId,
    deviceId: behavior.deviceId,
    deviceFingerprint: behavior.deviceFingerprint,
    platform: behavior.platform,
    deviceInfo: behavior.deviceInfo,
    ip: behavior.ip,
    geo: behavior.geo,
    sourceType: behavior.sourceType,
    sourceKey: behavior.sourceKey,
    sourceLabel: behavior.sourceLabel,
    sourceDetails: behavior.sourceDetails,
    type: behavior.type,
    eventName: behavior.eventName,
    path: behavior.path,
    title: behavior.title,
    targetText: behavior.targetText,
    targetTag: behavior.targetTag,
    target: behavior.target,
    targetHash: behavior.targetHash,
    targetIdentity: behavior.targetIdentity,
    identitySource: behavior.identitySource,
    identityConfidence: behavior.identityConfidence,
    actionKey: behavior.actionKey,
    relatedActionKey: behavior.relatedActionKey,
    relatedTargetHash: behavior.relatedTargetHash,
    correlationId: behavior.correlationId,
    attribution: normalizeAttribution(behavior.attribution),
    method: behavior.method,
    status: behavior.status,
    properties: behavior.properties,
    context: behavior.context,
    occurredAt: behavior.occurredAt,
    semanticStatus: behavior.semanticStatus,
    semanticEventId: behavior.semanticEventId,
  };
}

function actorIdForPresence(session = {}) {
  return session.userId || session.anonymousId || session.sessionId || session.presenceId;
}

function actorIdForHealthPresence(session = {}) {
  return session.userId || session.anonymousId || session.deviceId || session.deviceFingerprint;
}

function durationForPresence(session = {}, now = new Date()) {
  const startedAt = validDate(session.startedAt) || validDate(session.createdAt);
  const lastSeenAt = validDate(session.endedAt) || validDate(session.lastSeenAt) || now;
  if (!startedAt || !lastSeenAt) return 0;
  return Math.max(0, lastSeenAt.getTime() - startedAt.getTime());
}

export function summarizePresenceSessions(sessions = [], now = new Date()) {
  const onlineCutoff = new Date(now.getTime() - PRESENCE_ONLINE_WINDOW_MS);
  const onlineUsers = new Set();
  const onlineSessions = new Set();
  const pathDurations = new Map();
  const sourceDurations = new Map();
  let totalDurationMs = 0;
  let lastSeenAt = null;

  sessions.forEach((session) => {
    const durationMs = Number.isFinite(session.durationMs)
      ? Math.max(0, session.durationMs)
      : durationForPresence(session, now);
    const seenAt = validDate(session.lastSeenAt);
    const isOnline = session.state !== 'end'
      && session.state !== 'ended'
      && session.state !== 'background'
      && seenAt
      && seenAt >= onlineCutoff;
    const actorId = actorIdForPresence(session);
    const path = session.path || session.screen || '/';
    const sourceKey = session.sourceKey || session.platform || 'unknown';

    totalDurationMs += durationMs;
    if (seenAt && (!lastSeenAt || seenAt > lastSeenAt)) lastSeenAt = seenAt;
    if (isOnline) {
      if (actorId) onlineUsers.add(actorId);
      if (session.presenceId) onlineSessions.add(session.presenceId);
    }

    const pathItem = pathDurations.get(path) || { path, durationMs: 0, sessions: 0 };
    pathItem.durationMs += durationMs;
    pathItem.sessions += 1;
    pathDurations.set(path, pathItem);

    const sourceItem = sourceDurations.get(sourceKey) || {
      sourceType: session.sourceType || 'unknown',
      sourceKey,
      sourceLabel: session.sourceLabel || sourceKey,
      durationMs: 0,
      sessions: 0,
    };
    sourceItem.durationMs += durationMs;
    sourceItem.sessions += 1;
    sourceDurations.set(sourceKey, sourceItem);
  });

  return {
    onlineUsers: onlineUsers.size,
    onlineSessions: onlineSessions.size,
    totalDurationMs,
    averageSessionDurationMs: sessions.length ? Math.round(totalDurationMs / sessions.length) : 0,
    lastSeenAt,
    heartbeatIntervalMs: PRESENCE_HEARTBEAT_INTERVAL_MS,
    onlineWindowMs: PRESENCE_ONLINE_WINDOW_MS,
    topPaths: [...pathDurations.values()].sort((left, right) => right.durationMs - left.durationMs),
    topSources: [...sourceDurations.values()].sort((left, right) => right.durationMs - left.durationMs),
  };
}

function valueInObject(object = {}, keys = []) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null && object?.[key] !== '') return object[key];
  }
  return undefined;
}

function eventTime(event = {}) {
  return validDate(event.occurredAt) || validDate(event.createdAt);
}

function sessionStart(session = {}) {
  return validDate(session.startedAt) || validDate(session.createdAt);
}

function sessionEnd(session = {}, now = new Date()) {
  return validDate(session.endedAt) || validDate(session.lastSeenAt) || now;
}

function overlapsWindow(start, end, windowStart, windowEnd) {
  return start && end && start < windowEnd && end >= windowStart;
}

function clippedDurationMs(session = {}, windowStart, windowEnd, now = new Date()) {
  const startedAt = sessionStart(session);
  const endedAt = sessionEnd(session, now);
  if (!overlapsWindow(startedAt, endedAt, windowStart, windowEnd)) return 0;
  const clippedStart = Math.max(startedAt.getTime(), windowStart.getTime());
  const clippedEnd = Math.min(endedAt.getTime(), windowEnd.getTime());
  return Math.max(0, clippedEnd - clippedStart);
}

function activeDurationMsForPresence(session = {}) {
  const durationMs = Number(session.activeDurationMs);
  return Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0;
}

function increment(map, key, amount = 1) {
  const label = String(key || 'Unknown');
  map.set(label, (map.get(label) || 0) + amount);
}

function topCounts(map, limit = 3) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function topAttributionCounts(map, limit = 3) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function topPathCounts(map, limit = 3) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

function attributionRecordKey(record = {}) {
  return record.sessionId || record.presenceId || record.rawBehaviorId || record._id || '';
}

export function summarizeTrafficAttribution(records = [], { dedupe = false, limit = 3 } = {}) {
  const sources = new Map();
  const mediums = new Map();
  const campaigns = new Map();
  const landingPaths = new Map();
  const seen = new Set();

  records.forEach((record) => {
    const attribution = normalizeAttribution(record.attribution);
    if (!attribution.source && !attribution.medium && !attribution.campaign && !attribution.landingPath) return;
    if (dedupe) {
      const key = attributionRecordKey(record);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
    }
    if (attribution.source) increment(sources, attribution.source);
    if (attribution.medium) increment(mediums, attribution.medium);
    if (attribution.campaign) increment(campaigns, attribution.campaign);
    if (attribution.landingPath) increment(landingPaths, attribution.landingPath);
  });

  return {
    trafficSources: topAttributionCounts(sources, limit),
    trafficMediums: topAttributionCounts(mediums, limit),
    trafficCampaigns: topAttributionCounts(campaigns, limit),
    trafficLandingPaths: topPathCounts(landingPaths, limit),
  };
}

function topDurations(map, limit = 3) {
  return [...map.values()]
    .sort((left, right) => (
      right.durationMs - left.durationMs
      || String(left.label || left.path).localeCompare(String(right.label || right.path))
    ))
    .slice(0, limit);
}

function presenceEnd(session = {}, now = new Date()) {
  return validDate(session.endedAt) || validDate(session.lastSeenAt) || validDate(session.startedAt) || now;
}

export function summarizeRecentOnlineActivity({
  events = [],
  presenceSessions = [],
  now = new Date(),
  windowMs = RECENT_ONLINE_WINDOW_MS,
  bucketMs = RECENT_ONLINE_BUCKET_MS,
} = {}) {
  const windowEnd = validDate(now) || new Date();
  const resolvedBucketMs = Math.max(60 * 1000, Number(bucketMs) || RECENT_ONLINE_BUCKET_MS);
  const resolvedWindowMs = Math.max(resolvedBucketMs, Number(windowMs) || RECENT_ONLINE_WINDOW_MS);
  const windowStart = new Date(windowEnd.getTime() - resolvedWindowMs);
  const bucketCount = Math.ceil(resolvedWindowMs / resolvedBucketMs);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startAt = new Date(windowStart.getTime() + index * resolvedBucketMs);
    const endAt = new Date(Math.min(startAt.getTime() + resolvedBucketMs, windowEnd.getTime()));
    return { startAt, endAt, users: new Set() };
  });
  const onlineUsers = new Set();
  const actorRegions = new Map();
  const eventCounts = new Map();
  const durationPaths = new Map();

  presenceSessions.forEach((session) => {
    const startedAt = sessionStart(session);
    const endedAt = presenceEnd(session, windowEnd);
    if (!overlapsWindow(startedAt, endedAt, windowStart, windowEnd)) return;

    const actorId = actorIdForHealthPresence(session);
    const region = regionLabel(session);
    const path = session.path || session.screen || '/';
    const durationMs = Math.min(
      activeDurationMsForPresence(session),
      clippedDurationMs(session, windowStart, windowEnd, windowEnd),
    );

    if (actorId) {
      onlineUsers.add(actorId);
      if (region && !actorRegions.has(actorId)) actorRegions.set(actorId, region);
      buckets.forEach((bucket) => {
        if (overlapsWindow(startedAt, endedAt, bucket.startAt, bucket.endAt)) {
          bucket.users.add(actorId);
        }
      });
    }

    const pathItem = durationPaths.get(path) || { path, durationMs: 0, sessions: 0 };
    pathItem.durationMs += durationMs;
    pathItem.sessions += 1;
    durationPaths.set(path, pathItem);
  });

  events.forEach((event) => {
    const occurredAt = eventTime(event);
    if (!occurredAt || occurredAt < windowStart || occurredAt >= windowEnd) return;

    increment(eventCounts, eventLabel(event));
    const actorId = actorIdForEvent(event);
    const region = regionLabel(event);
    if (actorId && onlineUsers.has(actorId) && region && !actorRegions.has(actorId)) {
      actorRegions.set(actorId, region);
    }
  });

  const regionCounts = new Map();
  actorRegions.forEach((region) => increment(regionCounts, region));

  return {
    window: {
      startAt: windowStart,
      endAt: windowEnd,
      windowMs: resolvedWindowMs,
      bucketMs: resolvedBucketMs,
    },
    totalOnlineUsers: onlineUsers.size,
    buckets: buckets.map((bucket) => ({
      startAt: bucket.startAt,
      endAt: bucket.endAt,
      onlineUsers: bucket.users.size,
    })),
    topRegions: topCounts(regionCounts, 3),
    topDurationPaths: topDurations(durationPaths, 3),
    topEvents: topCounts(eventCounts, 3),
  };
}

function topBouncePagesForSessions(sessionsByKey, limit = 3) {
  const pagesByPath = new Map();

  sessionsByKey.forEach((session) => {
    if (!session.paths.size) return;

    session.paths.forEach((path) => {
      const page = pagesByPath.get(path) || {
        path,
        sessions: 0,
        bounces: 0,
        totalBounceDurationMs: 0,
      };

      page.sessions += 1;
      pagesByPath.set(path, page);
    });

    if (session.paths.size !== 1 || session.hasRouteChange || session.hasInteraction) return;

    const [path] = session.paths;
    const page = pagesByPath.get(path);
    page.bounces += 1;
    page.totalBounceDurationMs += session.durationMs;
  });

  return [...pagesByPath.values()]
    .filter((page) => page.bounces > 0)
    .map((page) => ({
      path: page.path,
      sessions: page.sessions,
      bounces: page.bounces,
      bounceRate: page.sessions ? page.bounces / page.sessions : 0,
      averageBounceDurationMs: Math.round(page.totalBounceDurationMs / page.bounces),
    }))
    .sort((left, right) => (
      right.bounceRate - left.bounceRate
      || right.bounces - left.bounces
      || right.sessions - left.sessions
      || left.path.localeCompare(right.path)
    ))
    .slice(0, limit);
}

function eventLabel(event = {}) {
  return event.eventName || event.eventType || 'unknown_event';
}

function eventSessionKey(event = {}) {
  return event.sessionId || event.presenceId || null;
}

function presenceSessionKey(session = {}) {
  return session.sessionId || session.presenceId || null;
}

function isRouteChangeEvent(event = {}) {
  return event.eventType === 'route_change' || event.eventName === 'route_change';
}

function isBounceInteractionEvent(event = {}) {
  const eventType = String(event.eventType || '').toLowerCase();
  const eventName = String(event.eventName || '').toLowerCase();

  if (EXPLICIT_BOUNCE_INTERACTION_EVENT_TYPES.has(eventType) || EXPLICIT_BOUNCE_INTERACTION_EVENT_TYPES.has(eventName)) {
    return true;
  }

  if (eventType) {
    return !PASSIVE_BOUNCE_EVENT_NAMES.has(eventType);
  }

  return Boolean(eventName && !PASSIVE_BOUNCE_EVENT_NAMES.has(eventName));
}

function regionLabel(event = {}) {
  return event.geo?.country || event.geo?.region || event.geo?.city || '';
}

function deviceLabel(event = {}) {
  return event.deviceInfo?.platform
    || event.deviceInfo?.os
    || event.deviceInfo?.browser
    || event.platform
    || '';
}

function isFailureEvent(event = {}) {
  const status = String(valueInObject(event.properties, ['status', 'state', 'result']) || event.status || '').toLowerCase();
  const phase = String(valueInObject(event.properties, ['phase']) || '').toLowerCase();
  const success = event.properties?.success;
  return ['failed', 'failure', 'error'].includes(status)
    || ['failed', 'error'].includes(phase)
    || success === false;
}

function percentChange(current, previous) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function formatPercentForMessage(value) {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

function summarizeWindow({ events, sessions, windowStart, windowEnd, now }) {
  const activeUsers = new Set();
  const eventCounts = new Map();
  const regionCounts = new Map();
  const deviceCounts = new Map();
  const sourceCounts = new Map();
  const sessionPathCounts = new Map();
  const durationUsers = new Map();
  const durationPaths = new Map();
  const bounceSessions = new Map();
  const trafficRecords = [];
  let failureEventCount = 0;
  let lastEventAt = null;
  let eventCount = 0;

  events.forEach((event) => {
    const occurredAt = eventTime(event);
    if (!occurredAt || occurredAt < windowStart || occurredAt >= windowEnd) return;
    const actorId = actorIdForEvent(event);
    if (actorId) activeUsers.add(actorId);
    increment(eventCounts, eventLabel(event));
    const region = regionLabel(event);
    const device = deviceLabel(event);
    if (region) increment(regionCounts, region);
    if (device) increment(deviceCounts, device);
    trafficRecords.push(event);
    if (isFailureEvent(event)) failureEventCount += 1;
    if (!lastEventAt || occurredAt > lastEventAt) lastEventAt = occurredAt;
    const bounceKey = eventSessionKey(event);
    if (bounceKey) {
      const bounceSession = bounceSessions.get(bounceKey) || {
        paths: new Set(),
        durationMs: 0,
        hasRouteChange: false,
        hasInteraction: false,
      };
      if (isRouteChangeEvent(event)) bounceSession.hasRouteChange = true;
      if (isBounceInteractionEvent(event)) bounceSession.hasInteraction = true;
      bounceSessions.set(bounceKey, bounceSession);
    }
    eventCount += 1;
  });

  const windowSessions = [];
  sessions.forEach((session) => {
    const startedAt = sessionStart(session);
    const endedAt = sessionEnd(session, now);
    if (!overlapsWindow(startedAt, endedAt, windowStart, windowEnd)) return;
    const durationMs = Math.min(
      activeDurationMsForPresence(session),
      clippedDurationMs(session, windowStart, windowEnd, now),
    );
    windowSessions.push(session);
    trafficRecords.push(session);
    const actorId = actorIdForHealthPresence(session);
    const path = session.path || session.screen || '/';
    const source = session.sourceLabel || session.sourceKey || session.platform || 'Unknown';
    const bounceKey = presenceSessionKey(session);
    if (bounceKey) {
      const bounceSession = bounceSessions.get(bounceKey) || {
        paths: new Set(),
        durationMs: 0,
        hasRouteChange: false,
        hasInteraction: false,
      };
      bounceSession.paths.add(path);
      bounceSession.durationMs += durationMs;
      bounceSessions.set(bounceKey, bounceSession);
    }
    if (actorId) {
      activeUsers.add(actorId);
      const userItem = durationUsers.get(actorId) || { label: actorId, durationMs: 0 };
      userItem.durationMs += durationMs;
      durationUsers.set(actorId, userItem);
    }
    const pathItem = durationPaths.get(path) || { path, durationMs: 0, sessions: 0 };
    pathItem.durationMs += durationMs;
    pathItem.sessions += 1;
    durationPaths.set(path, pathItem);
    increment(sourceCounts, source);
    increment(sessionPathCounts, path);
  });

  const totalDurationMs = [...durationUsers.values()].reduce((sum, item) => sum + item.durationMs, 0);
  const sessionCount = windowSessions.length;

  return {
    activeUsers: activeUsers.size,
    eventCount,
    sessionCount,
    failureEventCount,
    lastEventAt,
    totalDurationMs,
    averageActiveDurationMs: activeUsers.size ? Math.round(totalDurationMs / activeUsers.size) : 0,
    averageSessionEvents: sessionCount ? eventCount / sessionCount : 0,
    topEvents: topCounts(eventCounts, 3),
    userRegions: topCounts(regionCounts, 5),
    deviceDistribution: topCounts(deviceCounts, 5),
    sessionSources: topCounts(sourceCounts, 3),
    sessionPaths: topCounts(sessionPathCounts, 3).map((item) => ({ path: item.label, count: item.count })),
    ...summarizeTrafficAttribution(trafficRecords, { dedupe: true, limit: 3 }),
    topDurationUsers: topDurations(durationUsers, 3),
    topDurationPaths: topDurations(durationPaths, 3),
    topBouncePages: topBouncePagesForSessions(bounceSessions, 3),
  };
}

function retentionSummary(firstSeenByActor, activeCurrentActors, now, day) {
  const cohortStart = new Date(now.getTime() - day * HEALTH_WINDOW_MS);
  const cohortEnd = new Date(now.getTime() - (day - 1) * HEALTH_WINDOW_MS);
  let sampleSize = 0;
  let retainedUsers = 0;

  firstSeenByActor.forEach((firstSeenAt, actorId) => {
    if (firstSeenAt >= cohortStart && firstSeenAt < cohortEnd) {
      sampleSize += 1;
      if (activeCurrentActors.has(actorId)) retainedUsers += 1;
    }
  });

  return {
    sampleSize,
    retainedUsers,
    rate: sampleSize ? retainedUsers / sampleSize : null,
  };
}

function emptyHealthWindow() {
  return {
    activeUsers: 0,
    eventCount: 0,
    sessionCount: 0,
    failureEventCount: 0,
    lastEventAt: null,
    totalDurationMs: 0,
    averageActiveDurationMs: 0,
    averageSessionEvents: 0,
    topEvents: [],
    userRegions: [],
    deviceDistribution: [],
    sessionSources: [],
    sessionPaths: [],
    trafficSources: [],
    trafficMediums: [],
    trafficCampaigns: [],
    trafficLandingPaths: [],
    topDurationUsers: [],
    topDurationPaths: [],
    topBouncePages: [],
    newUsers: 0,
    retention: Object.fromEntries(
      HEALTH_RETENTION_DAYS.map((day) => [`d${day}`, { sampleSize: 0, retainedUsers: 0, rate: null }]),
    ),
  };
}

function attentionWindowLabels(comparisonWindow) {
  if (comparisonWindow === 'day') {
    return {
      currentWindow: '所选日期',
      previousWindow: '前一天',
      previousFullWindow: '前一天',
      trailingWindow: '所选日期最后 3 小时',
    };
  }

  return {
    currentWindow: '近 24h',
    previousWindow: '前 24h',
    previousFullWindow: '前一个 24h',
    trailingWindow: '最近 3 小时',
  };
}

function attentionItemsForHealth(current, previous, now, { comparisonWindow = 'rolling_24h' } = {}) {
  const items = [];
  const labels = attentionWindowLabels(comparisonWindow);
  const activeUsersChange = percentChange(current.activeUsers, previous.activeUsers);
  const sessionsChange = percentChange(current.sessionCount, previous.sessionCount);
  const eventsChange = percentChange(current.eventCount, previous.eventCount);

  if (previous.eventCount > 0 && current.eventCount === 0) {
    items.push({ code: 'event_stream_stopped', severity: 'high', message: `${labels.currentWindow}没有新事件，但${labels.previousFullWindow}有事件。` });
  }
  if (current.lastEventAt && now.getTime() - current.lastEventAt.getTime() >= 3 * 60 * 60 * 1000 && previous.eventCount > 0) {
    items.push({ code: 'no_recent_events', severity: 'medium', message: `${labels.trailingWindow}没有收到新事件。` });
  }
  if (previous.activeUsers >= 3 && activeUsersChange <= -0.4) {
    items.push({ code: 'active_users_dropped', severity: 'medium', message: `${labels.currentWindow}活跃用户较${labels.previousWindow}下降 ${formatPercentForMessage(activeUsersChange)}。` });
  }
  if (previous.sessionCount >= 3 && sessionsChange <= -0.4) {
    items.push({ code: 'sessions_dropped', severity: 'medium', message: `${labels.currentWindow}活跃会话较${labels.previousWindow}下降 ${formatPercentForMessage(sessionsChange)}。` });
  }
  if (previous.eventCount >= 5 && eventsChange <= -0.4) {
    items.push({ code: 'events_dropped', severity: 'medium', message: `${labels.currentWindow}用户行为事件较${labels.previousWindow}下降 ${formatPercentForMessage(eventsChange)}。` });
  }
  if (previous.eventCount >= 5 && eventsChange >= 1) {
    items.push({ code: 'events_spiked', severity: 'low', message: `${labels.currentWindow}用户行为事件较${labels.previousWindow}上升 ${formatPercentForMessage(eventsChange)}。` });
  }
  if (current.failureEventCount > previous.failureEventCount && current.failureEventCount > 0) {
    items.push({ code: 'failure_events_increased', severity: 'high', message: `${labels.currentWindow}失败或错误事件 ${current.failureEventCount} 条，高于${labels.previousFullWindow}。` });
  }

  const topEvent = current.topEvents[0];
  if (topEvent && current.eventCount >= 10 && topEvent.count / current.eventCount >= 0.8) {
    items.push({ code: 'top_event_concentration', severity: 'low', message: `${labels.currentWindow}高频事件 ${topEvent.label} 占比过高。` });
  }

  return items;
}

export function summarizeProjectHealthForWindow({
  events = [],
  presenceSessions = [],
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  now = currentEnd,
  retention = null,
  newUsers = null,
} = {}) {
  const windowEnd = validDate(currentEnd) || validDate(now) || new Date();
  const resolvedCurrentStart = validDate(currentStart) || new Date(windowEnd.getTime() - HEALTH_WINDOW_MS);
  const resolvedPreviousEnd = validDate(previousEnd) || resolvedCurrentStart;
  const resolvedPreviousStart = validDate(previousStart) || new Date(resolvedPreviousEnd.getTime() - HEALTH_WINDOW_MS);
  const current = summarizeWindow({
    events,
    sessions: presenceSessions,
    windowStart: resolvedCurrentStart,
    windowEnd,
    now: windowEnd,
  });
  const previous = summarizeWindow({
    events,
    sessions: presenceSessions,
    windowStart: resolvedPreviousStart,
    windowEnd: resolvedPreviousEnd,
    now: windowEnd,
  });
  const firstSeenByActor = new Map();
  const activeCurrentActors = new Set();

  events.forEach((event) => {
    const actorId = actorIdForEvent(event);
    const occurredAt = eventTime(event);
    if (!actorId || !occurredAt) return;
    const firstSeenAt = firstSeenByActor.get(actorId);
    if (!firstSeenAt || occurredAt < firstSeenAt) firstSeenByActor.set(actorId, occurredAt);
    if (occurredAt >= resolvedCurrentStart && occurredAt < windowEnd) activeCurrentActors.add(actorId);
  });
  presenceSessions.forEach((session) => {
    const actorId = actorIdForHealthPresence(session);
    const startedAt = sessionStart(session);
    if (!actorId || !startedAt) return;
    const firstSeenAt = firstSeenByActor.get(actorId);
    if (!firstSeenAt || startedAt < firstSeenAt) firstSeenByActor.set(actorId, startedAt);
    if (overlapsWindow(startedAt, sessionEnd(session, windowEnd), resolvedCurrentStart, windowEnd)) activeCurrentActors.add(actorId);
  });

  current.newUsers = Number.isFinite(newUsers)
    ? Math.max(0, newUsers)
    : [...firstSeenByActor.values()].filter((firstSeenAt) => firstSeenAt >= resolvedCurrentStart && firstSeenAt < windowEnd).length;
  current.retention = retention || Object.fromEntries(
    HEALTH_RETENTION_DAYS.map((day) => [`d${day}`, retentionSummary(firstSeenByActor, activeCurrentActors, windowEnd, day)]),
  );

  const attentionItems = attentionItemsForHealth(current, previous, windowEnd);

  return {
    window: {
      currentStart: resolvedCurrentStart,
      currentEnd: windowEnd,
      previousStart: resolvedPreviousStart,
      previousEnd: resolvedPreviousEnd,
      retentionDays: HEALTH_RETENTION_DAYS,
    },
    status: attentionItems.length ? 'needs_attention' : 'normal',
    attentionSummary: attentionItems[0]?.message || '',
    attentionItems,
    current,
    previous,
    trends: {
      activeUsers: percentChange(current.activeUsers, previous.activeUsers),
      sessions: percentChange(current.sessionCount, previous.sessionCount),
      averageActiveDuration: percentChange(current.averageActiveDurationMs, previous.averageActiveDurationMs),
      events: percentChange(current.eventCount, previous.eventCount),
    },
  };
}

export function summarizeProjectHealthFromDailyReports({
  currentReport,
  previousReport,
  retention = null,
} = {}) {
  const current = {
    ...emptyHealthWindow(),
    ...(currentReport?.current || {}),
    newUsers: Number(currentReport?.current?.newUsers || currentReport?.newActorKeys?.length || 0),
    retention: retention || emptyHealthWindow().retention,
  };
  const previous = {
    ...emptyHealthWindow(),
    ...(previousReport?.current || {}),
    newUsers: Number(previousReport?.current?.newUsers || previousReport?.newActorKeys?.length || 0),
  };
  const currentStart = validDate(currentReport?.sourceWindow?.startAt);
  const currentEnd = validDate(currentReport?.sourceWindow?.endAt);
  const previousStart = validDate(previousReport?.sourceWindow?.startAt);
  const previousEnd = validDate(previousReport?.sourceWindow?.endAt);
  const attentionItems = attentionItemsForHealth(current, previous, currentEnd || new Date(), {
    comparisonWindow: 'day',
  });

  return {
    window: {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      reportDate: currentReport?.reportDate || '',
      previousReportDate: previousReport?.reportDate || '',
      granularity: 'day',
      timezone: DAILY_REPORT_TIMEZONE,
      retentionDays: HEALTH_RETENTION_DAYS,
    },
    status: attentionItems.length ? 'needs_attention' : 'normal',
    attentionSummary: attentionItems[0]?.message || '',
    attentionItems,
    current,
    previous,
    trends: {
      activeUsers: percentChange(current.activeUsers, previous.activeUsers),
      sessions: percentChange(current.sessionCount, previous.sessionCount),
      averageActiveDuration: percentChange(current.averageActiveDurationMs, previous.averageActiveDurationMs),
      events: percentChange(current.eventCount, previous.eventCount),
    },
  };
}

export function summarizeProjectHealth({ events = [], presenceSessions = [], now = new Date() } = {}) {
  const windowEnd = validDate(now) || new Date();
  const currentStart = new Date(windowEnd.getTime() - HEALTH_WINDOW_MS);
  const previousStart = new Date(windowEnd.getTime() - 2 * HEALTH_WINDOW_MS);
  return summarizeProjectHealthForWindow({
    events,
    presenceSessions,
    currentStart,
    currentEnd: windowEnd,
    previousStart,
    previousEnd: currentStart,
    now: windowEnd,
  });
}

export function publicPresenceSession(session) {
  return {
    _id: session._id,
    projectId: session.projectId,
    presenceId: session.presenceId,
    sessionId: session.sessionId,
    anonymousId: session.anonymousId,
    userId: session.userId,
    deviceId: session.deviceId,
    deviceFingerprint: session.deviceFingerprint,
    platform: session.platform,
    deviceInfo: session.deviceInfo,
    sourceType: session.sourceType,
    sourceKey: session.sourceKey,
    sourceLabel: session.sourceLabel,
    sourceDetails: session.sourceDetails,
    attribution: normalizeAttribution(session.attribution),
    path: session.path,
    title: session.title,
    screen: session.screen,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    endedAt: session.endedAt,
    state: session.state,
    heartbeatIntervalMs: session.heartbeatIntervalMs,
    heartbeatCount: session.heartbeatCount,
    durationMs: session.durationMs,
    activeDurationMs: activeDurationMsForPresence(session),
    lastActiveAt: session.lastActiveAt,
    activeState: session.activeState,
    idleTimeoutMs: Number.isFinite(session.idleTimeoutMs) ? Math.max(0, session.idleTimeoutMs) : ACTIVE_IDLE_TIMEOUT_MS,
  };
}
