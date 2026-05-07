import { Mongo } from 'meteor/mongo';

export const Developers = new Mongo.Collection('tracemind_developers');
export const Projects = new Mongo.Collection('tracemind_projects');
export const RawBehaviors = new Mongo.Collection('tracemind_raw_behaviors');
export const SemanticEvents = new Mongo.Collection('tracemind_semantic_events');

export const EVENT_TYPES = {
  page_view: '浏览页面',
  click: '点击元素',
  input: '修改输入',
  submit: '提交表单',
  route_change: '页面跳转',
  api_call: '调用接口',
  custom: '自定义行为',
};

export const EVENT_DEFINITIONS = [
  {
    eventType: 'page_view',
    name: '页面浏览',
    meaning: '用户打开或刷新了一个页面，用于分析访问量、落地页、路径入口和页面级留存。',
    typicalProperties: ['title', 'path', 'referrer'],
    platforms: ['web', 'ios', 'android', 'server'],
  },
  {
    eventType: 'click',
    name: '元素点击',
    meaning: '用户点击了页面或客户端界面上的元素，用于分析功能入口、按钮转化和交互兴趣。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android'],
  },
  {
    eventType: 'input',
    name: '输入变化',
    meaning: '用户修改了输入控件，用于分析表单填写、设置修改和关键流程参与度。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android'],
  },
  {
    eventType: 'submit',
    name: '表单提交',
    meaning: '用户提交了表单或确认动作，用于分析注册、支付、创建、搜索等转化节点。',
    typicalProperties: ['target', 'targetHash', 'targetText', 'targetTag', 'path'],
    platforms: ['web', 'ios', 'android'],
  },
  {
    eventType: 'route_change',
    name: '页面跳转',
    meaning: '用户在应用内发生路由变化，用于分析路径流转、漏斗顺序和页面间跳转。',
    typicalProperties: ['path', 'referrer'],
    platforms: ['web', 'ios', 'android'],
  },
  {
    eventType: 'api_call',
    name: '接口调用',
    meaning: '客户端或服务端记录了一次接口调用，用于分析接口失败、关键后端流程和服务端埋点。',
    typicalProperties: ['method', 'status', 'path'],
    platforms: ['web', 'ios', 'android', 'server'],
  },
  {
    eventType: 'custom',
    name: '自定义事件',
    meaning: '开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。',
    typicalProperties: ['eventName', 'properties', 'context'],
    platforms: ['web', 'ios', 'android', 'server'],
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

function cleanString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
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

function normalizeSourceType(value) {
  const sourceType = cleanString(value, 40).toLowerCase();
  return ['web', 'ios', 'android', 'server'].includes(sourceType) ? sourceType : 'unknown';
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

      return {
        sourceType,
        sourceKey,
        sourceLabel: sourceKey,
        sourceDetails: {
          origin: pageUrl.origin,
          path: detailUrl ? `${detailUrl.pathname || '/'}${detailUrl.search || ''}` : '/',
          referrer,
        },
      };
    }
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
  if (filters.path) query.path = String(filters.path);
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
  if (filters.path) query.path = String(filters.path);
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
    method: behavior.method,
    status: behavior.status,
    properties: behavior.properties,
    context: behavior.context,
    occurredAt: behavior.occurredAt,
    semanticStatus: behavior.semanticStatus,
    semanticEventId: behavior.semanticEventId,
  };
}
