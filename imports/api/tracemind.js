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
