import { WebApp } from 'meteor/webapp';
import { Random } from 'meteor/random';
import {
  EVENT_DEFINITIONS,
  RawBehaviors,
  SemanticEvents,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  normalizeCaptureSource,
  publicRawBehavior,
  publicSemanticEvent,
} from '/imports/api/tracemind';
import { summarizeSemanticEvents } from '/imports/api/semantic';
import { resolveProjectByKey, resolveProjectByMcpToken } from './tracemind_methods';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_MCP_PROTOCOLS = new Set(['2025-06-18', '2025-03-26']);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safeString(value, max = 200, fallback = '') {
  return String(value || fallback).slice(0, max);
}

function safeObject(value, maxBytes = 8192) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > maxBytes) {
    return { truncated: true, preview: json.slice(0, maxBytes) };
  }
  return JSON.parse(json);
}

function clientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

function geoFromHeaders(req) {
  return {
    country: req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['cloudfront-viewer-country'] || null,
    region: req.headers['x-vercel-ip-country-region'] || req.headers['x-appengine-region'] || null,
    city: req.headers['x-vercel-ip-city'] || req.headers['x-appengine-city'] || null,
    source: 'headers',
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

function mcpTools() {
  return [
    {
      name: 'tracemind.event_definitions',
      title: 'TraceMind Event Definitions',
      description: '返回 TraceMind 语义事件定义表，帮助 LLM 判断应该查询哪些事件。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tracemind.summary',
      title: 'TraceMind Behavior Summary',
      description: '汇总当前 Web 产品最近的语义行为事件。',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '最多统计多少条最近语义事件，默认 200。',
          },
          startAt: { type: 'string', description: 'ISO 时间，查询起点。' },
          endAt: { type: 'string', description: 'ISO 时间，查询终点。' },
          eventType: { type: 'string', description: '事件类型，例如 click、custom。' },
          eventName: { type: 'string', description: '事件名，例如 checkout_started。' },
          userId: { type: 'string', description: '业务用户 ID。' },
          sessionId: { type: 'string', description: 'Session ID。' },
          deviceId: { type: 'string', description: '设备 ID。' },
          targetHash: { type: 'string', description: '元素目标哈希，用于区分同页相同文案的按钮或输入框。' },
        },
      },
    },
    {
      name: 'tracemind.query_events',
      title: 'TraceMind Query Semantic Events',
      description: '按时间、事件类型、事件名、用户、Session、设备等维度查询语义事件。',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '最多返回多少条事件，默认 50。',
          },
          startAt: { type: 'string', description: 'ISO 时间，查询起点。' },
          endAt: { type: 'string', description: 'ISO 时间，查询终点。' },
          eventType: { type: 'string', description: '事件类型，例如 click、custom。' },
          eventName: { type: 'string', description: '事件名，例如 checkout_started。' },
          userId: { type: 'string', description: '业务用户 ID。' },
          anonymousId: { type: 'string', description: '匿名用户 ID。' },
          sessionId: { type: 'string', description: 'Session ID。' },
          deviceId: { type: 'string', description: '设备 ID。' },
          targetHash: { type: 'string', description: '元素目标哈希，用于区分同页相同文案的按钮或输入框。' },
          path: { type: 'string', description: '页面或接口路径。' },
        },
      },
    },
    {
      name: 'tracemind.query_raw_behaviors',
      title: 'TraceMind Query Raw Behaviors',
      description: '必要时查询原始行为日志，用于复核语义事件背后的原始采集数据。',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '最多返回多少条原始日志，默认 50。',
          },
          startAt: { type: 'string', description: 'ISO 时间，查询起点。' },
          endAt: { type: 'string', description: 'ISO 时间，查询终点。' },
          eventType: { type: 'string', description: '原始事件类型，例如 click、custom。' },
          eventName: { type: 'string', description: '事件名，例如 checkout_started。' },
          userId: { type: 'string', description: '业务用户 ID。' },
          anonymousId: { type: 'string', description: '匿名用户 ID。' },
          sessionId: { type: 'string', description: 'Session ID。' },
          deviceId: { type: 'string', description: '设备 ID。' },
          targetHash: { type: 'string', description: '元素目标哈希，用于区分同页相同文案的按钮或输入框。' },
          path: { type: 'string', description: '页面或接口路径。' },
        },
      },
    },
  ];
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function mcpTokenFromRequest(req, url) {
  return url.searchParams.get('mcpToken') || bearerToken(req);
}

function safeLimit(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

async function loadProjectEvents(project, limit) {
  return SemanticEvents.find(
    { projectId: project._id },
    { sort: { occurredAt: -1 }, limit },
  ).fetchAsync();
}

async function queryProjectEvents(project, args = {}) {
  return SemanticEvents.find(
    buildEventQuery(project._id, args),
    { sort: { occurredAt: -1 }, limit: safeLimit(args.limit, 50, 500) },
  ).fetchAsync();
}

async function queryProjectRawBehaviors(project, args = {}) {
  return RawBehaviors.find(
    buildRawBehaviorQuery(project._id, args),
    { sort: { occurredAt: -1 }, limit: safeLimit(args.limit, 50, 500) },
  ).fetchAsync();
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    isError: false,
  };
}

async function callMcpTool(project, name, args = {}) {
  if (name === 'tracemind.event_definitions') {
    return textResult(
      EVENT_DEFINITIONS.map((event) => `${event.eventType}: ${event.meaning}`).join('\n'),
      { eventDefinitions: EVENT_DEFINITIONS },
    );
  }

  if (name === 'tracemind.summary') {
    const events = await queryProjectEvents(project, { ...args, limit: safeLimit(args.limit, 200, 500) });
    const summary = summarizeSemanticEvents(events);
    return textResult(
      `TraceMind 找到 ${summary.totalEvents} 条语义事件。主要事件类型：${summary.topEvents.map((item) => `${item.eventType}（${item.count}）`).join('，') || '暂无'}。`,
      { project: { _id: project._id, name: project.name }, summary, eventDefinitions: EVENT_DEFINITIONS },
    );
  }

  if (name === 'tracemind.query_events' || name === 'tracemind.recent_events') {
    const events = await queryProjectEvents(project, args);
    const recentEvents = events.map(publicSemanticEvent);
    return textResult(
      recentEvents.map((event) => `${event.occurredAt?.toISOString?.() || event.occurredAt} ${event.eventName || event.eventType}: ${event.meaning}`).join('\n') || '没有找到语义事件。',
      { project: { _id: project._id, name: project.name }, events: recentEvents, eventDefinitions: EVENT_DEFINITIONS },
    );
  }

  if (name === 'tracemind.query_raw_behaviors') {
    const rawBehaviors = (await queryProjectRawBehaviors(project, args)).map(publicRawBehavior);
    return textResult(
      rawBehaviors.map((behavior) => `${behavior.occurredAt?.toISOString?.() || behavior.occurredAt} ${behavior.eventName || behavior.type}: ${behavior.path}`).join('\n') || '没有找到原始行为日志。',
      { project: { _id: project._id, name: project.name }, rawBehaviors },
    );
  }

  throw new Error(`Unknown tool: ${name}`);
}

function clientScript(host) {
  return `
(function () {
  if (window.__TraceMindLoaded) return;
  window.__TraceMindLoaded = true;

  var script = document.currentScript;
  var projectKey = script && script.getAttribute('data-tracemind-token');
  var endpoint = (script && script.getAttribute('data-tracemind-endpoint')) || '${host}/api/capture';
  var staticUserId = script && script.getAttribute('data-tracemind-user-id');
  var userIdProvider = script && script.getAttribute('data-tracemind-user-id-provider');
  var sessionId = localStorage.getItem('tracemind_session_id') || ('tm_sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  var anonymousId = localStorage.getItem('tracemind_anonymous_id') || ('tm_anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  var deviceId = localStorage.getItem('tracemind_device_id') || ('tm_dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  localStorage.setItem('tracemind_session_id', sessionId);
  localStorage.setItem('tracemind_anonymous_id', anonymousId);
  localStorage.setItem('tracemind_device_id', deviceId);

  function hash(value, prefix) {
    var h = 5381;
    for (var i = 0; i < value.length; i += 1) h = ((h << 5) + h) + value.charCodeAt(i);
    return (prefix || 'tm_hash_') + (h >>> 0).toString(36);
  }

  function fingerprintInfo() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory
    };
  }

  function deviceInfo() {
    return Object.assign({}, fingerprintInfo(), {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      referrer: document.referrer
    });
  }

  function currentSource() {
    return {
      type: 'web',
      url: location.href,
      referrer: document.referrer
    };
  }

  var fingerprint = hash(JSON.stringify(fingerprintInfo()), 'tm_fp_');

  function textOf(element) {
    if (!element) return '';
    return (element.innerText || element.getAttribute('aria-label') || element.placeholder || element.name || element.id || '').trim().slice(0, 120);
  }

  function attr(element, name) {
    return element && element.getAttribute && element.getAttribute(name);
  }

  function elementIndex(element) {
    if (!element || !element.parentElement) return 1;
    var tag = element.tagName;
    var index = 1;
    var node = element.previousElementSibling;
    while (node) {
      if (node.tagName === tag) index += 1;
      node = node.previousElementSibling;
    }
    return index;
  }

  function selectorPart(element) {
    if (!element || !element.tagName) return '';
    var tag = element.tagName.toLowerCase();
    var id = element.id ? ('#' + element.id) : '';
    var testId = attr(element, 'data-testid') || attr(element, 'data-test') || attr(element, 'data-cy');
    if (id) return tag + id;
    if (testId) return tag + '[data-testid="' + testId.slice(0, 80) + '"]';
    return tag + ':nth-of-type(' + elementIndex(element) + ')';
  }

  function elementPath(element) {
    var parts = [];
    var node = element;
    while (node && node.nodeType === 1 && parts.length < 6) {
      parts.unshift(selectorPart(node));
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.filter(Boolean).join('>');
  }

  function targetInfo(element) {
    if (!element) return {};
    var info = {
      tag: element.tagName,
      text: textOf(element),
      id: element.id || undefined,
      className: String(element.className || '').slice(0, 160) || undefined,
      name: element.name || undefined,
      type: element.type || undefined,
      role: attr(element, 'role') || undefined,
      ariaLabel: attr(element, 'aria-label') || undefined,
      placeholder: element.placeholder || undefined,
      testId: attr(element, 'data-testid') || attr(element, 'data-test') || attr(element, 'data-cy') || undefined,
      path: elementPath(element)
    };
    Object.keys(info).forEach(function (key) {
      if (info[key] === undefined || info[key] === '') delete info[key];
    });
    return info;
  }

  function valueAtPath(path) {
    if (!path) return undefined;
    var parts = path.split('.');
    var value = window;
    for (var i = 0; i < parts.length; i += 1) {
      if (!parts[i]) return undefined;
      value = value && value[parts[i]];
    }
    return value;
  }

  function normalizeUserId(value) {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  }

  function currentUserId() {
    if (userIdProvider) {
      try {
        var provider = valueAtPath(userIdProvider);
        return normalizeUserId(typeof provider === 'function' ? provider() : provider);
      } catch (error) {
        return undefined;
      }
    }
    return normalizeUserId(staticUserId) || normalizeUserId(localStorage.getItem('tracemind_user_id'));
  }

  function send(type, data) {
    if (!projectKey) return;
    var payload = Object.assign({
      projectKey: projectKey,
      sessionId: sessionId,
      anonymousId: anonymousId,
      userId: currentUserId(),
      deviceId: deviceId,
      deviceFingerprint: fingerprint,
      platform: 'web',
      deviceInfo: deviceInfo(),
      source: currentSource(),
      type: type,
      eventName: data && data.eventName,
      path: location.pathname + location.search,
      title: document.title,
      occurredAt: new Date().toISOString()
    }, data || {});

    navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([JSON.stringify(payload)], { type: 'application/json' })) ||
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
  }

  send('page_view');
  document.addEventListener('click', function (event) {
    var target = event.target;
    var targetDetails = targetInfo(target);
    send('click', {
      targetText: textOf(target),
      targetTag: target && target.tagName,
      target: targetDetails,
      targetHash: hash(JSON.stringify(targetDetails), 'tm_target_')
    });
  }, true);

  document.addEventListener('change', function (event) {
    var target = event.target;
    var targetDetails = targetInfo(target);
    send('input', {
      targetText: textOf(target),
      targetTag: target && target.tagName,
      target: targetDetails,
      targetHash: hash(JSON.stringify(targetDetails), 'tm_target_')
    });
  }, true);

  document.addEventListener('submit', function (event) {
    var target = event.target;
    var targetDetails = targetInfo(target);
    send('submit', {
      targetText: textOf(target),
      targetTag: target && target.tagName,
      target: targetDetails,
      targetHash: hash(JSON.stringify(targetDetails), 'tm_target_')
    });
  }, true);

  var pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(history, arguments);
    setTimeout(function () { send('route_change'); }, 0);
  };
  window.addEventListener('popstate', function () { send('route_change'); });

  window.TraceMind = {
    capture: send,
    identify: function (userId, traits) {
      localStorage.setItem('tracemind_user_id', userId);
      send('custom', { eventName: 'identify', userId: userId, properties: traits || {} });
    },
    sessionId: sessionId,
    anonymousId: anonymousId,
    deviceId: deviceId
  };
})();`;
}

export async function ingestCapturePayload(payload = {}, req = {}) {
  payload = payload || {};
  const project = await resolveProjectByKey(payload.projectKey);
  if (!project) {
    return { ok: false, statusCode: 401, error: 'invalid_project_key' };
  }
  const source = normalizeCaptureSource(payload, req.headers || {});

  if (isSourceBlocked(project, source)) {
    return { ok: true, ignored: true };
  }

  await RawBehaviors.insertAsync({
    projectId: project._id,
    projectKey: project.projectKey,
    sessionId: safeString(payload.sessionId, 120),
    anonymousId: safeString(payload.anonymousId, 120),
    userId: safeString(payload.userId, 160),
    deviceId: safeString(payload.deviceId, 120),
    deviceFingerprint: safeString(payload.deviceFingerprint, 120),
    platform: safeString(payload.platform, 40, 'web'),
    deviceInfo: safeObject(payload.deviceInfo),
    ip: safeString(clientIp(req), 80),
    geo: { ...geoFromHeaders(req), ...safeObject(payload.geo, 2048) },
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceLabel: source.sourceLabel,
    sourceDetails: source.sourceDetails,
    type: safeString(payload.type, 40, 'custom'),
    eventName: safeString(payload.eventName || payload.name || payload.type, 120),
    path: safeString(payload.path, 500, '/'),
    title: safeString(payload.title, 160),
    targetText: safeString(payload.targetText, 200),
    targetTag: safeString(payload.targetTag, 40),
    target: safeObject(payload.target, 4096),
    targetHash: safeString(payload.targetHash, 160),
    method: safeString(payload.method, 20),
    status: safeString(payload.status, 20),
    properties: safeObject(payload.properties || payload.custom || payload.data),
    context: safeObject(payload.context),
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    semanticStatus: 'pending',
    createdAt: new Date(),
  });

  return { ok: true, ignored: false };
}

async function handleCapture(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }

  const result = await ingestCapturePayload(payload, req);
  if (!result.ok) {
    sendJson(res, result.statusCode || 400, { error: result.error });
    return;
  }

  sendJson(res, 202, { ok: true });
}

async function handleMcpGet(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const mcpToken = mcpTokenFromRequest(req, url);
  const project = await resolveProjectByMcpToken(mcpToken);
  if (!project) {
    sendJson(res, 401, { error: 'invalid_mcp_token' });
    return;
  }

  const events = await SemanticEvents.find(
    { projectId: project._id },
    { sort: { occurredAt: -1 }, limit: 200 },
  ).fetchAsync();

  sendJson(res, 200, {
    protocol: 'tracemind-mcp-preview',
    tools: [
      {
        name: 'tracemind.event_definitions',
        description: '返回事件含义说明表，帮助 LLM 判断查询口径。',
      },
      {
        name: 'tracemind.summary',
        description: '汇总当前 Web 产品最近的语义行为事件。',
      },
      {
        name: 'tracemind.query_events',
        description: '按时间、事件名、用户、Session、设备等维度查询语义事件。',
      },
      {
        name: 'tracemind.query_raw_behaviors',
        description: '查询原始行为日志，用于复核语义分析。',
      },
    ],
    summary: summarizeSemanticEvents(events),
    eventDefinitions: EVENT_DEFINITIONS,
    recentEvents: events.slice(0, 50).map(publicSemanticEvent),
  });
}

async function handleMcpPost(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const protocolVersion = req.headers['mcp-protocol-version'];
  if (protocolVersion && !SUPPORTED_MCP_PROTOCOLS.has(protocolVersion)) {
    sendJson(res, 400, { error: 'unsupported_mcp_protocol_version' });
    return;
  }

  let message;
  try {
    message = JSON.parse(await readBody(req));
  } catch (error) {
    sendJson(res, 400, jsonRpcError(null, -32700, 'Parse error'));
    return;
  }

  const messages = Array.isArray(message) ? message : [message];
  const responses = [];
  const url = new URL(req.url, 'http://localhost');

  for (const item of messages) {
    if (item.id === undefined || item.id === null) {
      continue;
    }

    if (item.method === 'initialize') {
      res.setHeader('Mcp-Session-Id', `tm_mcp_${Random.secret(24)}`);
      responses.push(jsonRpcResult(item.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'tracemind',
          title: 'TraceMind',
          version: '1.0.0-mvp',
        },
        instructions: '使用 TraceMind 工具查看当前 Web 项目的语义行为事件。',
      }));
      continue;
    }

    if (item.method === 'ping') {
      responses.push(jsonRpcResult(item.id, {}));
      continue;
    }

    const mcpToken = mcpTokenFromRequest(req, url);
    const project = await resolveProjectByMcpToken(mcpToken);
    if (!project) {
      responses.push(jsonRpcError(item.id, -32001, 'Invalid or missing MCP token'));
      continue;
    }

    if (item.method === 'tools/list') {
      responses.push(jsonRpcResult(item.id, { tools: mcpTools() }));
      continue;
    }

    if (item.method === 'tools/call') {
      try {
        const result = await callMcpTool(project, item.params?.name, item.params?.arguments || {});
        responses.push(jsonRpcResult(item.id, result));
      } catch (error) {
        responses.push(jsonRpcError(item.id, -32602, error.message));
      }
      continue;
    }

    responses.push(jsonRpcError(item.id, -32601, `Method not found: ${item.method}`));
  }

  if (responses.length === 0) {
    res.writeHead(202, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  sendJson(res, 200, Array.isArray(message) ? responses : responses[0]);
}

export function registerTraceMindRoutes() {
  WebApp.handlers.use('/capture.js', (req, res) => {
    const host = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(clientScript(host));
  });

  WebApp.handlers.use('/api/capture', (req, res) => {
    handleCapture(req, res).catch((error) => {
      console.error('[TraceMind] capture failed', error);
      sendJson(res, 500, { error: 'capture_failed' });
    });
  });

  WebApp.handlers.use('/mcp', (req, res) => {
    const handler = req.method === 'POST' ? handleMcpPost : handleMcpGet;
    handler(req, res).catch((error) => {
      console.error('[TraceMind] MCP failed', error);
      sendJson(res, 500, { error: 'mcp_failed' });
    });
  });
}
