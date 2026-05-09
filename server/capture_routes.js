import { WebApp } from 'meteor/webapp';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import {
  EVENT_DEFINITIONS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PresenceSessions,
  RawBehaviors,
  SemanticEvents,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  mcpServerNameForProject,
  normalizeCaptureSource,
  publicRawBehavior,
  publicSemanticEvent,
  summarizePresenceSessions,
} from '/imports/api/tracemind';
import { summarizeSemanticEvents } from '/imports/api/semantic';
import { resolveProjectByKey, resolveProjectByMcpToken } from './tracemind_methods';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_MCP_PROTOCOLS = new Set(['2025-06-18', '2025-03-26']);
const AGENT_GUIDANCE_VERSION = '2026.05.09.1';
const AGENT_GUIDANCE_RESOURCES = {
  skill: '/agents/tracemind/SKILL.md',
  agentSnippet: '/agents/tracemind/AGENTS_SNIPPET.md',
  manifest: '/agents/tracemind/manifest.json',
};
const FORBIDDEN_ANALYTICS_KEYS = [
  'email',
  'phone',
  'password',
  'secret',
  'token',
  'accessToken',
  'apiKey',
  'rawPrompt',
  'rawArgs',
  'rawArguments',
  'toolArguments',
  'rawResult',
  'toolResult',
  'resourceContent',
  'rawUserContent',
  'rawRequestBody',
  'requestBody',
  'rawResponseBody',
  'responseBody',
  'headers',
  'cookies',
  'authorization',
];
const APPROVED_AUTO_EVENT_NAMES = new Set([
  'identify',
  'mcp_tool_call',
  'mcp_resource_read',
  'mcp_prompt_request',
  'agent_skill_lifecycle',
]);

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

function projectDisplayName(project = {}) {
  return String(project.name || 'current TraceMind project').trim() || 'current TraceMind project';
}

function projectScopedTitle(title, project = {}) {
  return `${title} - ${projectDisplayName(project)}`;
}

function projectScopedDescription(description, project = {}) {
  return `${description} This MCP server is bound to TraceMind project "${projectDisplayName(project)}" only.`;
}

function projectInfoResult(project = {}) {
  return {
    projectId: project._id,
    projectName: projectDisplayName(project),
    mcpServerName: mcpServerNameForProject(project),
  };
}

export function mcpInitializeInstructions(project) {
  return project
    ? `使用 TraceMind 工具查看项目 "${projectDisplayName(project)}" 的语义行为事件。当前 MCP server 建议命名为 ${mcpServerNameForProject(project)}。`
    : '使用 TraceMind 工具查看当前 Web 项目的语义行为事件。后续 tools/list 会在有效 MCP token 下返回项目身份。';
}

export function mcpTools(project) {
  return [
    {
      name: 'tracemind.event_definitions',
      title: projectScopedTitle('TraceMind Event Definitions', project),
      description: projectScopedDescription('返回 TraceMind 语义事件定义表，帮助 LLM 判断应该查询哪些事件。', project),
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tracemind.project_info',
      title: projectScopedTitle('TraceMind Project Info', project),
      description: projectScopedDescription('返回当前 MCP server 绑定的 TraceMind 项目身份，用于多项目场景下确认项目归属。', project),
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tracemind.agent_guidance',
      title: projectScopedTitle('TraceMind Agent Guidance', project),
      description: projectScopedDescription('返回当前 TraceMind coding agent 指导版本、公开 skill/rules 资源和推荐工作流。', project),
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tracemind.capture_setup',
      title: projectScopedTitle('TraceMind Capture Setup', project),
      description: projectScopedDescription('返回当前项目的 Auto Capture 项目 key 和指定平台的一行接入代码。', project),
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['web', 'ios', 'android', 'react_native', 'mcp_node', 'mcp_python', 'agent_skill', 'server_node', 'server_python', 'server_http'],
            description: '要接入的平台；省略时返回 Web 脚本。',
          },
        },
      },
    },
    {
      name: 'tracemind.search_event_names',
      title: projectScopedTitle('TraceMind Search Event Names', project),
      description: projectScopedDescription('搜索内置事件定义和当前项目已出现的自定义事件，帮助 agent 复用事件名。', project),
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '业务意图或事件关键词，例如 checkout、signup、export。' },
          limit: { type: 'number', description: '最多返回多少个事件，默认 20。' },
        },
      },
    },
    {
      name: 'tracemind.suggest_instrumentation',
      title: projectScopedTitle('TraceMind Suggest Instrumentation', project),
      description: projectScopedDescription('根据业务意图和代码上下文摘要，建议复用事件、跳过手动埋点或创建 draft custom event。', project),
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', description: '准备记录的用户行为或业务结果。' },
          context: { type: 'string', description: '相关代码或产品流程摘要。' },
          platform: { type: 'string', description: 'web、ios、android、react_native、mcp_node、mcp_python、agent_skill、server_node、server_python、server_http 或 server。' },
        },
      },
    },
    {
      name: 'tracemind.validate_event_payload',
      title: projectScopedTitle('TraceMind Validate Event Payload', project),
      description: projectScopedDescription('校验单个 TraceMind 事件 payload 的命名、字段和隐私风险。', project),
      inputSchema: {
        type: 'object',
        properties: {
          eventType: { type: 'string' },
          eventName: { type: 'string' },
          properties: { type: 'object' },
          context: { type: 'object' },
        },
      },
    },
    {
      name: 'tracemind.validate_instrumentation_diff',
      title: projectScopedTitle('TraceMind Validate Instrumentation Diff', project),
      description: projectScopedDescription('检查本次代码 diff 中的 TraceMind 埋点命名、隐私字段和明显错误用法。', project),
      inputSchema: {
        type: 'object',
        properties: {
          diff: { type: 'string', description: 'git diff 文本。' },
        },
      },
    },
    {
      name: 'tracemind.privacy_check',
      title: projectScopedTitle('TraceMind Privacy Check', project),
      description: projectScopedDescription('检查字段名和值样例是否疑似 PII、secret、token、raw prompt、raw user content 或完整 query URL。', project),
      inputSchema: {
        type: 'object',
        properties: {
          fields: { type: 'object', description: '字段名和值样例。' },
        },
      },
    },
    {
      name: 'tracemind.summary',
      title: projectScopedTitle('TraceMind Behavior Summary', project),
      description: projectScopedDescription('汇总当前 Web 产品最近的语义行为事件。', project),
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
      title: projectScopedTitle('TraceMind Query Semantic Events', project),
      description: projectScopedDescription('按时间、事件类型、事件名、用户、Session、设备等维度查询语义事件。', project),
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
      title: projectScopedTitle('TraceMind Query Raw Behaviors', project),
      description: projectScopedDescription('必要时查询原始行为日志，用于复核语义事件背后的原始采集数据。', project),
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

async function loadProjectPresenceSessions(project, limit = 500) {
  return PresenceSessions.find(
    { projectId: project._id },
    { sort: { lastSeenAt: -1 }, limit },
  ).fetchAsync();
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    isError: false,
  };
}

function guidanceResult(extra = {}) {
  return {
    ok: true,
    guidanceVersion: AGENT_GUIDANCE_VERSION,
    resources: AGENT_GUIDANCE_RESOURCES,
    workflow: [
      'Call tracemind.agent_guidance before TraceMind instrumentation work.',
      'If multiple TraceMind MCP servers exist or the project is unclear, call tracemind.project_info first.',
      'Call tracemind.capture_setup with platform web, ios, android, react_native, mcp_node, mcp_python, agent_skill, server_node, server_python, or server_http before installing Auto Capture or adding manual events.',
      'Use capture_setup installCommands, filesToEdit, initLocation, idempotencyChecks, and initSnippet for platform setup.',
      'If setup succeeds but no data appears, check platform loading and network restrictions such as Web CSP, iOS ATS, Android network security, React Native native linking, and server egress/proxy/TLS policy.',
      'Verify existing Auto Capture initialization before editing so the agent does not add duplicate setup.',
      'Search existing events before adding a custom event.',
      'Validate payloads and diffs before finishing.',
      'Ask the user before updating local skill or instruction files.',
    ],
    ...extra,
  };
}

function addFinding(findings, severity, code, message, path) {
  findings.push({
    severity,
    code,
    message,
    ...(path ? { path } : {}),
  });
}

const AUTO_CAPTURE_SIGNALS = [
  'app/session start',
  'screen or page view',
  'tap or click',
  'input changed without input values',
  'submit through form or keyboard done/search/send',
];

const MCP_AUTO_CAPTURE_SIGNALS = [
  'MCP server/session start',
  'MCP tool call completed',
  'MCP resource read completed',
  'MCP prompt request completed',
];

const AGENT_SKILL_AUTO_CAPTURE_SIGNALS = [
  'skill lifecycle started/completed/failed when the host exposes lifecycle hooks',
];

const PRIVACY_CONSTRAINTS = [
  'Do not capture input values.',
  'Do not capture screenshots, DOM snapshots, native snapshots, or session replay.',
  'Do not capture secrets, tokens, raw prompts, raw user content, or full query URLs.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in app code.',
];

const MCP_PRIVACY_CONSTRAINTS = [
  'Do not capture raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs.',
  'Capture only safe MCP metadata such as tool/resource/prompt names, status, duration, error type, size buckets, and sanitized primitive custom fields.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in MCP server or Skill runtime code.',
];

const SERVER_PRIVACY_CONSTRAINTS = [
  'Do not capture request body, response body, headers, cookies, authorization values, secrets, tokens, raw prompts, raw user content, or full query URLs.',
  'Capture only stable business outcomes with sanitized primitive properties and context.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in server application code.',
];

const SUPPORTED_MANUAL_PROPERTY_TYPES = ['string', 'number', 'boolean'];

const MANUAL_CAPTURE_WORKFLOW = [
  'Use Auto Capture for behavior facts; use manual capture only for stable business outcomes Auto Capture cannot infer.',
  'Call tracemind.search_event_names before adding a custom event name.',
  'If no approved event exists, create or request a draft custom event proposal instead of inventing an event name.',
  'Call tracemind.validate_event_payload with the approved event name and sanitized primitive properties before coding.',
  'Implement TraceMind.identify after login when a stable userId is available, then TraceMind.capture("custom", ...) for the business outcome.',
  'Run tracemind.validate_instrumentation_diff before finishing instrumentation changes.',
];

const MANUAL_CAPTURE_WARNINGS = [
  'Manual events are for stable business outcomes, not raw input values or screen contents.',
  'Only string, number, and boolean properties/context values are preserved.',
  'Nested objects, arrays, null values, PII-like keys, credential values, raw prompts/content, input values, and full query URLs are omitted by SDK sanitization.',
];

const SERVER_MANUAL_CAPTURE_WARNINGS = [
  ...MANUAL_CAPTURE_WARNINGS,
  'Ordinary server applications use manual capture only in this first version; TraceMind does not auto-capture every request.',
  'Pass a stable internal userId on each server capture when the backend can safely identify the actor.',
];

const WEB_NETWORK_RESTRICTION_CHECKS = [
  'If capture.js does not load, check Content-Security-Policy script-src allows the TraceMind origin.',
  'If events do not upload, check Content-Security-Policy connect-src allows the TraceMind /api/capture endpoint.',
  'Check capture.js returns JavaScript MIME type when X-Content-Type-Options: nosniff is enabled, and remove stale SRI/CORP/COEP rules that block the TraceMind script or endpoint.',
];

const IOS_NETWORK_RESTRICTION_CHECKS = [
  'Check Info.plist NSAppTransportSecurity / ATS policy allows the HTTPS TraceMind endpoint and does not rely on insecure HTTP in production.',
  'Check TLS certificate validity, certificate pinning allowlists, MDM policy, enterprise proxy, and device network restrictions for the TraceMind domain.',
];

const ANDROID_NETWORK_RESTRICTION_CHECKS = [
  'Check AndroidManifest.xml declares android.permission.INTERNET before expecting capture uploads.',
  'Check cleartext traffic policy, network_security_config, certificate pinning, proxy, and custom CA policy for the TraceMind endpoint; use HTTPS in production instead of relying on cleartext exceptions.',
];

const REACT_NATIVE_NETWORK_RESTRICTION_CHECKS = [
  ...IOS_NETWORK_RESTRICTION_CHECKS,
  ...ANDROID_NETWORK_RESTRICTION_CHECKS,
  'Confirm the React Native native module is linked, pods/Gradle dependencies are installed, and native initialization runs before the first product screen.',
];

const SERVER_NETWORK_RESTRICTION_CHECKS = [
  'Check egress firewall, VPC, security group, DNS, proxy, and TLS CA bundle policy allow outbound HTTPS to the TraceMind capture endpoint.',
  'Check the backend HTTP client sets Content-Type: application/json, has reasonable timeout/retry behavior, and sends the sanitized payload returned by capture_setup.',
];

const MCP_RUNTIME_NETWORK_RESTRICTION_CHECKS = [
  ...SERVER_NETWORK_RESTRICTION_CHECKS,
  'For MCP and Agent Skill instrumentation, confirm capture code runs in executable server/runtime hooks, not only in a static SKILL.md document.',
];

function commonSetup(project, platform) {
  const captureApiUrl = Meteor.absoluteUrl('/api/capture');
  const presenceApiUrl = Meteor.absoluteUrl('/api/presence');
  const notes = [
    'Use projectKey only for Auto Capture writes.',
    'Do not use the MCP token as data-tracemind-token.',
    'Do not put MCP tokens in frontend code.',
    'Do not capture input values, screenshots, secrets, raw prompts, raw user content, or full query URLs.',
  ];
  return {
    platform,
    captureApiUrl,
    presenceApiUrl,
    autoCapturedSignals: AUTO_CAPTURE_SIGNALS,
    privacyConstraints: PRIVACY_CONSTRAINTS,
    supportedPropertyTypes: SUPPORTED_MANUAL_PROPERTY_TYPES,
    manualCaptureWorkflow: MANUAL_CAPTURE_WORKFLOW,
    manualCaptureWarnings: MANUAL_CAPTURE_WARNINGS,
    notes,
  };
}

function platformSetup(project, platform) {
  const common = commonSetup(project, platform);

  if (platform === 'server_node') {
    return {
      ...common,
      platform: 'server_node',
      eventPlatform: 'server',
      install: 'Install @tracemind/server-node and add manual capture at stable server-side business outcomes.',
      installCommands: [
        'Install @tracemind/server-node from the TraceMind SDK distribution; in this repo the package is sdk/server-node.',
        'Import TraceMindServer in the backend entrypoint or instrumentation module.',
      ],
      filesToEdit: [
        'package.json',
        'Server entrypoint such as src/server.ts, src/index.ts, app.js, or server.js',
        'Business outcome handlers such as payment, webhook, job, sync, or workspace creation modules',
      ],
      initLocation: 'Run once during server startup before business handlers call TraceMindServer.capture.',
      idempotencyChecks: [
        'Search the backend for TraceMindServer.start(',
        'Check package.json for an existing @tracemind/server-node dependency.',
        'Search server-side business handlers for existing TraceMindServer.capture calls.',
      ],
      initSnippet: `import { TraceMindServer } from "@tracemind/server-node";\n\nTraceMindServer.start({\n  projectKey: "${project.projectKey}",\n  sourceKey: "billing-api"\n});`,
      source: {
        type: 'server_app',
        key: 'Developer configured server/service name, for example billing-api',
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, and environment.',
      autoCapturedSignals: [],
      privacyConstraints: SERVER_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: SERVER_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm test --prefix sdk/server-node',
        'Run the backend test or integration path that triggers the manual capture, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Do not rely on global server identify by default. Pass a stable internal userId on each TraceMindServer.capture call when available.',
      manualCaptureWarnings: SERVER_MANUAL_CAPTURE_WARNINGS,
      manualCaptureExamples: [
        'TraceMindServer.capture("custom", { eventName: approvedEventName, userId: "user_123", properties: { amount: 2900, success: true }, context: { source: "stripe_webhook" } })',
      ],
      manualCaptureExample: 'TraceMindServer.capture("custom", { eventName: approvedEventName, userId: "user_123", properties: { amount: 2900, success: true }, context: { source: "stripe_webhook" } })',
    };
  }

  if (platform === 'server_python') {
    return {
      ...common,
      platform: 'server_python',
      eventPlatform: 'server',
      install: 'Install tracemind-server and add manual capture at stable server-side business outcomes.',
      installCommands: [
        'Install tracemind-server from the TraceMind SDK distribution; in this repo the package is sdk/server-python.',
        'Import TraceMindServer in the backend entrypoint or instrumentation module.',
      ],
      filesToEdit: [
        'pyproject.toml, requirements.txt, or equivalent dependency file',
        'Server entrypoint such as app.py, main.py, or server.py',
        'Business outcome handlers such as payment, webhook, job, sync, or workspace creation modules',
      ],
      initLocation: 'Run once during server startup before business handlers call TraceMindServer.capture.',
      idempotencyChecks: [
        'Search the backend for TraceMindServer.start(',
        'Check Python dependency files for an existing tracemind-server dependency.',
        'Search server-side business handlers for existing TraceMindServer.capture calls.',
      ],
      initSnippet: `from tracemind_server import TraceMindServer\n\nTraceMindServer.start(project_key="${project.projectKey}", source_key="billing-api")`,
      source: {
        type: 'server_app',
        key: 'Developer configured server/service name, for example billing-api',
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, and environment.',
      autoCapturedSignals: [],
      privacyConstraints: SERVER_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: SERVER_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'python3 -m unittest discover -s sdk/server-python/tests',
        'Run the backend test or integration path that triggers the manual capture, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Do not rely on global server identify by default. Pass a stable internal userId on each TraceMindServer.capture call when available.',
      manualCaptureWarnings: SERVER_MANUAL_CAPTURE_WARNINGS,
      manualCaptureExamples: [
        'TraceMindServer.capture("custom", event_name=approved_event_name, user_id="user_123", properties={"amount": 2900, "success": True}, context={"source": "stripe_webhook"})',
      ],
      manualCaptureExample: 'TraceMindServer.capture("custom", event_name=approved_event_name, user_id="user_123", properties={"amount": 2900, "success": True}, context={"source": "stripe_webhook"})',
    };
  }

  if (platform === 'server_http') {
    const payloadTemplate = {
      projectKey: project.projectKey,
      platform: 'server',
      type: 'custom',
      eventName: 'approved_event_name',
      userId: 'user_123',
      source: {
        type: 'server_app',
        key: 'billing-api',
        label: 'Billing API',
        details: {
          language: 'your_server_language',
          runtime: 'your_runtime',
          environment: 'production',
        },
      },
      properties: {
        amount: 2900,
        success: true,
      },
      context: {
        source: 'stripe_webhook',
      },
    };
    return {
      ...common,
      platform: 'server_http',
      eventPlatform: 'server',
      install: 'Use the HTTPS /api/capture endpoint directly when a first-party SDK is not available for the backend language.',
      installCommands: [
        'Use the backend HTTP client already present in the project.',
        'POST sanitized JSON to the returned captureApiUrl with content-type application/json.',
      ],
      filesToEdit: [
        'Backend instrumentation helper or analytics module',
        'Business outcome handlers such as payment, webhook, job, sync, or workspace creation modules',
      ],
      initLocation: 'Create a small server-side helper around /api/capture, then call it only from approved business outcome handlers.',
      idempotencyChecks: [
        'Search the backend for /api/capture and projectKey usage.',
        'Search server-side business handlers for existing TraceMind capture helper calls.',
      ],
      initSnippet: `POST ${common.captureApiUrl}\nContent-Type: application/json\n\n${JSON.stringify(payloadTemplate, null, 2)}`,
      payloadTemplate,
      source: {
        type: 'server_app',
        key: 'Developer configured server/service name, for example billing-api',
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, and environment.',
      autoCapturedSignals: [],
      privacyConstraints: SERVER_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: SERVER_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'Run the backend test or integration path that triggers the manual capture, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Do not rely on global server identify by default. Include a stable internal userId in each approved server capture payload when available.',
      manualCaptureWarnings: SERVER_MANUAL_CAPTURE_WARNINGS,
      manualCaptureExamples: [
        `POST ${common.captureApiUrl} with the returned payloadTemplate after replacing eventName with an approved event name.`,
      ],
      manualCaptureExample: `POST ${common.captureApiUrl} with the returned payloadTemplate after replacing eventName with an approved event name.`,
    };
  }

  if (platform === 'mcp_node') {
    return {
      ...common,
      platform: 'mcp_node',
      eventPlatform: 'server',
      install: 'Install @tracemind/mcp-node and initialize it around the MCP server instance.',
      installCommands: [
        'Install @tracemind/mcp-node from the TraceMind SDK distribution; in this repo the package is sdk/mcp-node.',
        'Import TraceMindMCP in the MCP server entrypoint.',
      ],
      filesToEdit: [
        'package.json',
        'MCP server entrypoint such as src/server.ts, src/index.ts, or server.js',
        'tool/resource/prompt registration modules when fallback wrappers are needed',
      ],
      initLocation: 'Run once after creating the MCP server object and before registering or serving tools.',
      idempotencyChecks: [
        'Search the MCP server for TraceMindMCP.start(',
        'Check package.json for an existing @tracemind/mcp-node dependency.',
        'Search tool/resource/prompt registration code for existing TraceMindMCP.wrapTool, wrapResource, or wrapPrompt calls.',
      ],
      initSnippet: `import { TraceMindMCP } from "@tracemind/mcp-node";\n\nTraceMindMCP.start(server, {\n  projectKey: "${project.projectKey}",\n  sourceKey: "docs-mcp"\n});`,
      source: {
        type: 'mcp_server',
        key: 'Developer configured MCP server/package name, for example docs-mcp',
      },
      sourceModel: 'platform is server; sourceType is mcp_server; sourceKey is the configured MCP server/package name; sourceDetails records language, runtime, sdkVersion, and mcpFramework.',
      autoCapturedSignals: MCP_AUTO_CAPTURE_SIGNALS,
      privacyConstraints: MCP_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: MCP_RUNTIME_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm test --prefix sdk/mcp-node',
        'Run the MCP server, trigger a tool/resource/prompt request, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Use identityResolver(request) to return { userId, anonymousId, sessionId } when the MCP server can safely identify the actor.',
      manualCaptureExamples: [
        'TraceMindMCP.capture("custom", { eventName: approvedEventName, userId: "user_123", properties: { documentCount: 12, success: true }, context: { toolName: "sync_docs" } })',
      ],
      manualCaptureExample: 'TraceMindMCP.capture("custom", { eventName: approvedEventName, userId: "user_123", properties: { documentCount: 12, success: true }, context: { toolName: "sync_docs" } })',
    };
  }

  if (platform === 'mcp_python') {
    return {
      ...common,
      platform: 'mcp_python',
      eventPlatform: 'server',
      install: 'Install tracemind-mcp and initialize it around the Python MCP server instance.',
      installCommands: [
        'Install tracemind-mcp from the TraceMind SDK distribution; in this repo the package is sdk/mcp-python.',
        'Import TraceMindMCP in the MCP server entrypoint.',
      ],
      filesToEdit: [
        'pyproject.toml, requirements.txt, or equivalent dependency file',
        'MCP server entrypoint such as server.py, main.py, or app.py',
        'tool/resource/prompt registration modules when fallback decorators are needed',
      ],
      initLocation: 'Run once after creating the MCP server object and before registering or serving tools.',
      idempotencyChecks: [
        'Search the MCP server for TraceMindMCP.start(',
        'Check Python dependency files for an existing tracemind-mcp dependency.',
        'Search tool/resource/prompt registration code for existing TraceMindMCP.wrap_tool, wrap_resource, or wrap_prompt calls.',
      ],
      initSnippet: `from tracemind_mcp import TraceMindMCP\n\nTraceMindMCP.start(server, project_key="${project.projectKey}", source_key="docs-mcp")`,
      source: {
        type: 'mcp_server',
        key: 'Developer configured MCP server/package name, for example docs-mcp',
      },
      sourceModel: 'platform is server; sourceType is mcp_server; sourceKey is the configured MCP server/package name; sourceDetails records language, runtime, sdkVersion, and mcpFramework.',
      autoCapturedSignals: MCP_AUTO_CAPTURE_SIGNALS,
      privacyConstraints: MCP_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: MCP_RUNTIME_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'python3 -m unittest discover -s sdk/mcp-python/tests',
        'Run the MCP server, trigger a tool/resource/prompt request, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Use identity_resolver(request) to return { "userId": "...", "anonymousId": "...", "sessionId": "..." } when the MCP server can safely identify the actor.',
      manualCaptureExamples: [
        'TraceMindMCP.capture("custom", event_name=approved_event_name, user_id="user_123", properties={"documentCount": 12, "success": True}, context={"toolName": "sync_docs"})',
      ],
      manualCaptureExample: 'TraceMindMCP.capture("custom", event_name=approved_event_name, user_id="user_123", properties={"documentCount": 12, "success": True}, context={"toolName": "sync_docs"})',
    };
  }

  if (platform === 'agent_skill') {
    return {
      ...common,
      platform: 'agent_skill',
      eventPlatform: 'server',
      install: 'Use TraceMind MCP guidance to instrument the host agent runtime; static Skill files cannot auto-capture by themselves.',
      installCommands: [
        'Confirm the host agent runtime exposes Skill lifecycle hooks before adding auto-capture.',
        'If lifecycle hooks exist, initialize the TraceMind MCP SDK in the host runtime and call the lifecycle helper from started/completed/failed hooks.',
        'If lifecycle hooks do not exist, keep the Skill as an instrumentation tutorial and add manual capture in the MCP server or host runtime instead.',
      ],
      filesToEdit: [
        'Host agent runtime plugin/extension entrypoint if lifecycle hooks are available',
        'Skill README or SKILL.md tutorial section for manual capture guidance',
        'MCP server or tool runtime code that owns actual execution when no Skill hook exists',
      ],
      initLocation: 'Only in the executable host agent runtime. Do not put runtime secrets or capture code in a static Skill file.',
      idempotencyChecks: [
        'Search host runtime code for TraceMindMCP.start(',
        'Search Skill docs for existing TraceMind instrumentation guidance.',
        'Confirm the hook is executable runtime code, not only a static SKILL.md instruction file.',
      ],
      initSnippet: `TraceMindMCP.captureSkillLifecycle({\n  skillName: "docs-indexer",\n  version: "1.2.0",\n  phase: "completed",\n  success: true\n});`,
      source: {
        type: 'agent_skill',
        key: 'Skill name or stable host runtime skill id, for example docs-indexer',
      },
      sourceModel: 'platform is server; sourceType is agent_skill; sourceKey is the stable Skill name or host runtime skill id; sourceDetails records skill version and host runtime.',
      autoCapturedSignals: AGENT_SKILL_AUTO_CAPTURE_SIGNALS,
      privacyConstraints: MCP_PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: MCP_RUNTIME_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'Run the host agent runtime hook test if available.',
        'Trigger a Skill started/completed/failed lifecycle event, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'Only pass userId from a host runtime identity resolver when it is a stable internal user id and not an email or other PII.',
      manualCaptureExamples: [
        'TraceMindMCP.captureSkillLifecycle({ skillName: "docs-indexer", version: "1.2.0", phase: "completed", success: true })',
      ],
      manualCaptureExample: 'TraceMindMCP.captureSkillLifecycle({ skillName: "docs-indexer", version: "1.2.0", phase: "completed", success: true })',
      manualCaptureWarnings: [
        ...MANUAL_CAPTURE_WARNINGS,
        'Static Skill files cannot auto-capture. Auto Capture requires executable host agent lifecycle hooks or MCP/runtime code.',
      ],
    };
  }

  if (platform === 'ios') {
    return {
      ...common,
      platform: 'ios',
      eventPlatform: 'ios',
      install: 'Add the TraceMind Swift Package from sdk/ios, then import TraceMind in your App entrypoint.',
      installCommands: [
        'Add the TraceMind Swift Package from the TraceMind SDK distribution; in this repo the package is sdk/ios.',
        'Import TraceMind in App.swift, AppDelegate.swift, or the app startup file that owns launch.',
      ],
      filesToEdit: [
        'Package.swift or the Xcode Swift Package dependency list',
        'App.swift',
        'AppDelegate.swift',
        'SceneDelegate.swift if it owns startup in an older UIKit app',
      ],
      initLocation: 'Run once during app startup, before the first user screen is shown.',
      idempotencyChecks: [
        'Search the app for TraceMind.start(',
        'Check Package.swift or the Xcode project for an existing TraceMind package dependency.',
      ],
      initSnippet: `TraceMind.start(projectKey: "${project.projectKey}")`,
      source: {
        type: 'ios',
        key: 'iOS bundle id, for example com.example.app',
      },
      sourceModel: 'platform remains ios; sourceKey is the iOS bundle id; sourceDetails.framework is swift.',
      networkRestrictionChecks: IOS_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'swift test --package-path sdk/ios',
        'Run the app, trigger launch/screen/tap/input/submit, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'try? TraceMind.identify("user_123", traits: ["plan": "pro"])',
      manualCaptureExamples: [
        'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutViewController", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
      ],
      manualCaptureExample: 'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutViewController", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
    };
  }

  if (platform === 'android') {
    return {
      ...common,
      platform: 'android',
      eventPlatform: 'android',
      install: 'Add the sdk/android Gradle module and initialize TraceMind from Application.onCreate().',
      installCommands: [
        'Add the TraceMind Android SDK module or dependency; in this repo the Gradle module is sdk/android.',
        'Import com.tracemind.TraceMind in the Application class.',
      ],
      filesToEdit: [
        'settings.gradle or settings.gradle.kts',
        'app/build.gradle or app/build.gradle.kts',
        'AndroidManifest.xml if a custom Application class must be registered',
        'Application.kt or Application.java',
      ],
      initLocation: 'Run once from Application.onCreate() before user activities are shown.',
      idempotencyChecks: [
        'Search the app for TraceMind.start(',
        'Check AndroidManifest.xml for the Application class that owns startup.',
        'Check Gradle settings/build files for an existing TraceMind SDK dependency or module include.',
      ],
      initSnippet: `TraceMind.start(application, projectKey = "${project.projectKey}")`,
      source: {
        type: 'android',
        key: 'Android package name, for example com.example.app',
      },
      sourceModel: 'platform remains android; sourceKey is the Android package name; sourceDetails.framework is kotlin.',
      networkRestrictionChecks: ANDROID_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm run test:sdk:android',
        'Run the app, trigger launch/screen/tap/input/submit, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'TraceMind.identify(userId = "user_123", traits = mapOf("plan" to "pro"))',
      manualCaptureExamples: [
        'TraceMind.capture(type = "custom", eventName = approvedEventName, path = "CheckoutActivity", properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true), context = mapOf("source" to "pricing"))',
      ],
      manualCaptureExample: 'TraceMind.capture(type = "custom", eventName = approvedEventName, path = "CheckoutActivity", properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true), context = mapOf("source" to "pricing"))',
    };
  }

  if (platform === 'react_native') {
    return {
      ...common,
      platform: 'react_native',
      eventPlatform: 'ios_or_android',
      install: 'Install @tracemind/react-native from sdk/react-native and run the native package install step for iOS and Android.',
      installCommands: [
        'Install @tracemind/react-native from the TraceMind SDK distribution; in this repo the package is sdk/react-native.',
        'Run the native dependency install step required by the target React Native app, such as pod install for iOS.',
        'Ensure the underlying iOS and Android TraceMind native modules are linked.',
      ],
      filesToEdit: [
        'package.json',
        'index.js',
        'App.js, App.tsx, or the app bootstrap module',
        'ios/Podfile or native iOS project files when manual linking is required',
        'android/settings.gradle and android/app/build.gradle when manual linking is required',
      ],
      initLocation: 'Run once in the React Native bootstrap path before the first product screen is rendered.',
      idempotencyChecks: [
        'Search JavaScript and TypeScript files for TraceMind.start(',
        'Check package.json for an existing @tracemind/react-native dependency.',
        'Check native iOS and Android projects for an existing TraceMind native module link.',
      ],
      initSnippet: `TraceMind.start({ projectKey: "${project.projectKey}" })`,
      source: {
        type: 'ios_or_android',
        key: 'Native bundle id or package name; React Native is marked in deviceInfo.framework.',
      },
      sourceModel: 'Do not create a react_native platform value. Events keep platform ios or android and mark deviceInfo.framework/sourceDetails.framework as react_native.',
      networkRestrictionChecks: REACT_NATIVE_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm test --prefix sdk/react-native',
        'Run the iOS and Android app variants, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'TraceMind.identify("user_123", { plan: "pro" })',
      manualCaptureExamples: [
        'TraceMind.capture("custom", { eventName: approvedEventName, path: "Checkout", properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
      ],
      manualCaptureExample: 'TraceMind.capture("custom", { eventName: approvedEventName, path: "Checkout", properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
    };
  }

  const captureScriptUrl = Meteor.absoluteUrl('/capture.js');
  return {
    ...common,
    platform: 'web',
    eventPlatform: 'web',
    captureScriptUrl,
    captureSnippet: `<script src="${captureScriptUrl}" data-tracemind-token="${project.projectKey}" async></script>`,
    initSnippet: `<script src="${captureScriptUrl}" data-tracemind-token="${project.projectKey}" async></script>`,
    installCommands: [
      'No package install is required. Add captureSnippet to the global HTML head or root document layout.',
    ],
    filesToEdit: [
      'main HTML file, root layout, app.html, _document, or equivalent global document entry',
    ],
    initLocation: 'Global document head or root layout loaded on every page.',
    idempotencyChecks: [
      'Search for /capture.js',
      'Search for data-tracemind-token',
      'Do not add a second script if Auto Capture is already initialized for this project.',
    ],
    source: {
      type: 'web',
      key: 'Request Origin or Referer hostname.',
    },
    sourceModel: 'platform is web; sourceKey is normalized from request Origin or Referer hostname.',
    networkRestrictionChecks: WEB_NETWORK_RESTRICTION_CHECKS,
    verificationCommands: [
      'Run the web app, trigger a page load/click/input/submit, then query TraceMind raw behaviors or semantic events.',
    ],
    identifySnippet: 'window.TraceMind.identify("user_123", { plan: "pro" })',
    manualCaptureExamples: [
      'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
    ],
    manualCaptureExample: 'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
  };
}

function captureSetupResult(project, args = {}) {
  if (!project?.projectKey) {
    return {
      ok: false,
      findings: [{
        severity: 'error',
        code: 'missing_project_key',
        message: 'Current project is missing a public Auto Capture project key.',
      }],
    };
  }

  const requestedPlatform = String(args.platform || '').toLowerCase().replace('-', '_');
  const platform = ['ios', 'android', 'react_native', 'mcp_node', 'mcp_python', 'agent_skill', 'server_node', 'server_python', 'server_http', 'web'].includes(requestedPlatform)
    ? requestedPlatform
    : 'web';

  return {
    ok: true,
    projectKey: project.projectKey,
    tokenType: 'public_auto_capture_project_key',
    ...platformSetup(project, platform),
  };
}

function flattenFields(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, fieldValue]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      return [{ path, key, value: fieldValue }, ...flattenFields(fieldValue, path)];
    }
    return [{ path, key, value: fieldValue }];
  });
}

function privacyFindings(fields = {}) {
  const findings = [];
  flattenFields(fields).forEach((field) => {
    const value = String(field.value || '');
    const looksLikeEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
    const looksLikeSecret = /(sk-|pk_|bearer\s+|api[_-]?key|access[_-]?token)/i.test(value);
    const looksLikeFullQueryUrl = /^https?:\/\/\S+\?\S+/.test(value);

    if (isForbiddenAnalyticsKey(field.key) || looksLikeEmail || looksLikeSecret || looksLikeFullQueryUrl) {
      addFinding(
        findings,
        'error',
        'forbidden_property',
        'Do not send PII, secrets, tokens, raw prompts, raw user content, or full URLs with query strings.',
        field.path,
      );
    }
  });
  return findings;
}

function normalizePrivacyKey(key) {
  return String(key || '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
}

function isForbiddenAnalyticsKey(key) {
  const normalized = normalizePrivacyKey(key);
  return FORBIDDEN_ANALYTICS_KEYS.some((forbiddenKey) => (
    normalized.includes(normalizePrivacyKey(forbiddenKey))
  ));
}

function isSafeServerPrimitive(value) {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function sanitizeServerCaptureFields(fields = {}) {
  const object = safeObject(fields);
  return Object.fromEntries(
    Object.entries(object).filter(([key, value]) => {
      if (isForbiddenAnalyticsKey(key)) return false;
      if (!isSafeServerPrimitive(value)) return false;
      if (typeof value === 'string' && /^https?:\/\/\S+\?\S+/.test(value)) return false;
      return true;
    }),
  );
}

function validateEventName(eventName) {
  if (!eventName) return [];
  return /^[a-z][a-z0-9_]*$/.test(String(eventName))
    ? []
    : [{
      severity: 'warning',
      code: 'event_name_format',
      message: 'Use lower snake_case event names such as checkout_started.',
      path: 'eventName',
    }];
}

function validateEventIdentity(eventType, eventName) {
  const findings = [];
  if (eventType === 'custom' && !String(eventName || '').trim()) {
    addFinding(
      findings,
      'error',
      'missing_custom_event_name',
      'Custom events must include a business eventName such as checkout_started.',
      'eventName',
    );
  }
  validateEventName(eventName).forEach((finding) => findings.push(finding));
  return findings;
}

function validationResult(findings, recommendations = []) {
  return guidanceResult({
    ok: findings.every((finding) => finding.severity !== 'error'),
    findings,
    recommendations,
    requiresUserReview: findings.some((finding) => finding.severity === 'error' || finding.severity === 'warning'),
  });
}

function extractSensitiveKeysFromDiff(addedText) {
  const findings = [];
  const seenKeys = new Set();
  const keyPatterns = [
    /([A-Za-z_$][\w$.-]*)\s*:/g,
    /['"]([^'"]+)['"]\s*:/g,
  ];
  keyPatterns.forEach((keyPattern) => {
    [...String(addedText || '').matchAll(keyPattern)].forEach((match) => {
      const key = match[1];
      if (!key || seenKeys.has(key) || !isForbiddenAnalyticsKey(key)) return;
      seenKeys.add(key);
      addFinding(
        findings,
        'error',
        'forbidden_property',
        `Do not send sensitive analytics property: ${key}.`,
      );
    });
  });
  return findings;
}

async function diffFindings(project, diff = '') {
  const findings = [];
  const text = String(diff || '');
  const addedLines = text.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const addedText = addedLines.join('\n');

  if (/analytics\.track\s*\(/.test(addedText)) {
    addFinding(
      findings,
      'warning',
      'unapproved_sdk_call',
      'Use the project-approved TraceMind capture API or SDK helper instead of ad-hoc analytics.track calls.',
    );
  }

  privacyFindings({ diff: addedText }).forEach((finding) => findings.push(finding));
  extractSensitiveKeysFromDiff(addedText).forEach((finding) => findings.push(finding));

  const eventNameMatches = [...addedText.matchAll(/eventName\s*:\s*['"]([^'"]+)['"]/g)];
  const knownEvents = await projectEventNames(project, '', 50);
  const knownNames = new Set(knownEvents.flatMap((event) => [event.eventType, event.eventName]).filter(Boolean));
  eventNameMatches.forEach((match) => {
    validateEventIdentity('custom', match[1]).forEach((finding) => findings.push(finding));
    if (!knownNames.has(match[1]) && !APPROVED_AUTO_EVENT_NAMES.has(match[1])) {
      addFinding(
        findings,
        'warning',
        'new_event_requires_review',
        `Event name "${match[1]}" is not present in current TraceMind evidence. Treat it as a draft until the user approves it.`,
        'eventName',
      );
    }
  });

  return findings;
}

async function projectEventNames(project, query = '', limit = 20) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const customEvents = await SemanticEvents.find(
    { projectId: project._id, eventName: { $exists: true, $ne: '' } },
    { sort: { occurredAt: -1 }, limit: 300 },
  ).fetchAsync();
  const byName = new Map();

  EVENT_DEFINITIONS.forEach((definition) => {
    byName.set(definition.eventType, {
      eventType: definition.eventType,
      eventName: '',
      meaning: definition.meaning,
      source: 'definition',
    });
  });

  customEvents.forEach((event) => {
    const key = event.eventName || event.eventType;
    if (!byName.has(key)) {
      byName.set(key, {
        eventType: event.eventType,
        eventName: event.eventName,
        meaning: event.meaning,
        properties: event.properties || {},
        source: 'project',
      });
    }
  });

  return [...byName.values()]
    .filter((event) => {
      if (!normalizedQuery) return true;
      return [event.eventType, event.eventName, event.meaning]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .slice(0, safeLimit(limit, 20, 50));
}

export async function callMcpTool(project, name, args = {}) {
  if (name === 'tracemind.event_definitions') {
    return textResult(
      EVENT_DEFINITIONS.map((event) => `${event.eventType}: ${event.meaning}`).join('\n'),
      { eventDefinitions: EVENT_DEFINITIONS },
    );
  }

  if (name === 'tracemind.project_info') {
    const projectInfo = projectInfoResult(project);
    return textResult(
      `This TraceMind MCP server is bound to project "${projectInfo.projectName}" (${projectInfo.mcpServerName}).`,
      projectInfo,
    );
  }

  if (name === 'tracemind.agent_guidance') {
    const projectInfo = projectInfoResult(project);
    return textResult(
      `TraceMind agent guidance version ${AGENT_GUIDANCE_VERSION}.`,
      guidanceResult({
        projectName: projectInfo.projectName,
        mcpServerName: projectInfo.mcpServerName,
      }),
    );
  }

  if (name === 'tracemind.capture_setup') {
    const setup = captureSetupResult(project, args);
    return textResult(
      setup.ok
        ? `TraceMind ${setup.platform || 'web'} Auto Capture setup is available for this project.`
        : 'TraceMind Auto Capture setup is unavailable for this project.',
      setup,
    );
  }

  if (name === 'tracemind.search_event_names') {
    const events = await projectEventNames(project, args.query, args.limit);
    return textResult(
      events.map((event) => event.eventName || event.eventType).join('\n') || '没有找到可复用事件。',
      guidanceResult({ events }),
    );
  }

  if (name === 'tracemind.suggest_instrumentation') {
    const events = await projectEventNames(project, args.intent, 8);
    const normalizedPlatform = String(args.platform || '').toLowerCase().replace('-', '_');
    const intentText = String(args.intent || '').toLowerCase();
    const isMcpRuntimePlatform = ['mcp_node', 'mcp_python', 'agent_skill'].includes(normalizedPlatform);
    const isServerManualPlatform = ['server_node', 'server_python', 'server_http', 'server'].includes(normalizedPlatform);
    const automaticMcpMatch = isMcpRuntimePlatform && /(tool|resource|prompt|skill|lifecycle|call|read|request|started|completed|failed)/.test(intentText);
    const recommendations = automaticMcpMatch
      ? ['Use TraceMind MCP/Skill Auto Capture for lifecycle facts; add manual custom capture only for stable business outcomes.']
      : events.length
      ? [isServerManualPlatform ? 'Use server manual capture only for stable backend business outcomes; do not add request Auto Capture in this version.' : 'Reuse an existing event if the business meaning matches.']
      : ['Create a draft custom event proposal and ask the user for review before treating it as approved.'];
    return textResult(
      recommendations.join(' '),
      guidanceResult({
        intent: args.intent || '',
        platform: args.platform || '',
        events,
        recommendations,
        requiresUserReview: !automaticMcpMatch && events.length === 0,
      }),
    );
  }

  if (name === 'tracemind.validate_event_payload') {
    const findings = [
      ...validateEventIdentity(args.eventType, args.eventName),
      ...privacyFindings({ properties: args.properties || {}, context: args.context || {} }),
    ];
    if (args.eventType && !EVENT_DEFINITIONS.some((definition) => definition.eventType === args.eventType)) {
      addFinding(findings, 'warning', 'unknown_event_type', `Unknown eventType: ${args.eventType}`, 'eventType');
    }
    return textResult(
      findings.length ? 'TraceMind found instrumentation issues.' : 'TraceMind payload validation passed.',
      validationResult(findings, ['Use internal stable IDs instead of direct personal identifiers.']),
    );
  }

  if (name === 'tracemind.validate_instrumentation_diff') {
    const findings = await diffFindings(project, args.diff);
    return textResult(
      findings.length ? 'TraceMind found diff issues.' : 'TraceMind diff validation passed.',
      validationResult(findings, ['Call tracemind.search_event_names before introducing new custom events.']),
    );
  }

  if (name === 'tracemind.privacy_check') {
    const findings = privacyFindings(args.fields || {});
    return textResult(
      findings.length ? 'TraceMind found privacy risks.' : 'TraceMind privacy check passed.',
      validationResult(findings),
    );
  }

  if (name === 'tracemind.summary') {
    const events = await queryProjectEvents(project, { ...args, limit: safeLimit(args.limit, 200, 500) });
    const presenceSessions = await loadProjectPresenceSessions(project);
    const summary = summarizeSemanticEvents(events);
    return textResult(
      `TraceMind 找到 ${summary.totalEvents} 条语义事件。主要事件类型：${summary.topEvents.map((item) => `${item.eventType}（${item.count}）`).join('，') || '暂无'}。`,
      {
        project: { _id: project._id, name: project.name },
        summary,
        presence: summarizePresenceSessions(presenceSessions),
        eventDefinitions: EVENT_DEFINITIONS,
      },
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

export function clientScript(host) {
  return `
(function () {
  if (window.__TraceMindLoaded) return;
  window.__TraceMindLoaded = true;

  var script = document.currentScript;
  var projectKey = script && script.getAttribute('data-tracemind-token');
  var endpoint = (script && script.getAttribute('data-tracemind-endpoint')) || '${host}/api/capture';
  var presenceEndpoint = (script && script.getAttribute('data-tracemind-presence-endpoint')) || '${host}/api/presence';
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
  var heartbeatIntervalMs = ${PRESENCE_HEARTBEAT_INTERVAL_MS};
  var presenceTimer = null;
  var currentPresenceId = null;

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

  function newPresenceId() {
    return 'tm_pres_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function sendPresence(state) {
    if (!projectKey || !currentPresenceId) return;
    var payload = {
      projectKey: projectKey,
      presenceId: currentPresenceId,
      sessionId: sessionId,
      anonymousId: anonymousId,
      userId: currentUserId(),
      deviceId: deviceId,
      deviceFingerprint: fingerprint,
      platform: 'web',
      deviceInfo: deviceInfo(),
      source: currentSource(),
      path: location.pathname,
      title: document.title,
      state: state,
      heartbeatIntervalMs: heartbeatIntervalMs,
      occurredAt: new Date().toISOString()
    };

    navigator.sendBeacon && navigator.sendBeacon(presenceEndpoint, new Blob([JSON.stringify(payload)], { type: 'application/json' })) ||
      fetch(presenceEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
  }

  function stopPresence(state) {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    if (currentPresenceId) {
      sendPresence(state || 'end');
      currentPresenceId = null;
    }
  }

  function startPresence(state) {
    if (!projectKey || document.visibilityState === 'hidden' || currentPresenceId) return;
    currentPresenceId = newPresenceId();
    sendPresence(state || 'start');
    presenceTimer = setInterval(function () {
      sendPresence('heartbeat');
    }, heartbeatIntervalMs);
  }

  send('page_view');
  startPresence('start');
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
    stopPresence('end');
    pushState.apply(history, arguments);
    setTimeout(function () {
      send('route_change');
      startPresence('start');
    }, 0);
  };
  window.addEventListener('popstate', function () {
    stopPresence('end');
    send('route_change');
    startPresence('start');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      stopPresence('background');
    } else {
      startPresence('foreground');
    }
  });
  window.addEventListener('pagehide', function () { stopPresence('end'); });
  window.addEventListener('beforeunload', function () { stopPresence('end'); });

  window.TraceMind = {
    capture: send,
    presence: sendPresence,
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

async function insertCaptureEvent(project, payload = {}, req = {}) {
  const source = normalizeCaptureSource(payload, req.headers || {});
  const isServerAppSource = source.sourceType === 'server_app';
  const sourceDetails = isServerAppSource
    ? sanitizeServerCaptureFields(source.sourceDetails)
    : source.sourceDetails;
  const properties = safeObject(payload.properties || payload.custom || payload.data);
  const context = safeObject(payload.context);

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
    sourceDetails,
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
    properties: isServerAppSource ? sanitizeServerCaptureFields(properties) : properties,
    context: isServerAppSource ? sanitizeServerCaptureFields(context) : context,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    semanticStatus: 'pending',
    createdAt: new Date(),
  });

  return { ok: true, ignored: false };
}

export async function ingestCapturePayload(payload = {}, req = {}) {
  payload = payload || {};
  const project = await resolveProjectByKey(payload.projectKey);
  if (!project) {
    return { ok: false, statusCode: 401, error: 'invalid_project_key' };
  }

  if (Array.isArray(payload.events)) {
    let accepted = 0;
    let ignored = 0;
    const sharedPayload = { ...payload };
    delete sharedPayload.events;

    for (const eventPayload of payload.events.slice(0, 100)) {
      const result = await insertCaptureEvent(project, {
        ...sharedPayload,
        ...safeObject(eventPayload),
        projectKey: project.projectKey,
      }, req);
      if (result.ignored) ignored += 1;
      else accepted += 1;
    }

    return { ok: true, accepted, ignored };
  }

  return insertCaptureEvent(project, payload, req);
}

function normalizePresenceState(value) {
  const state = safeString(value, 40, 'heartbeat');
  return ['start', 'heartbeat', 'end', 'background', 'foreground'].includes(state) ? state : 'heartbeat';
}

export async function ingestPresencePayload(payload = {}, req = {}) {
  payload = payload || {};
  const project = await resolveProjectByKey(payload.projectKey);
  if (!project) {
    return { ok: false, statusCode: 401, error: 'invalid_project_key' };
  }

  const source = normalizeCaptureSource(payload, req.headers || {});
  if (isSourceBlocked(project, source)) {
    return { ok: true, ignored: true };
  }

  const now = new Date();
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : now;
  const state = normalizePresenceState(payload.state);
  const endedAt = state === 'end' || state === 'background' ? occurredAt : null;
  const presenceId = safeString(payload.presenceId, 120, `tm_pres_${Random.id(17)}`);
  const existing = await PresenceSessions.findOneAsync({ projectId: project._id, presenceId });
  const startedAt = existing?.startedAt || occurredAt;
  const durationMs = Math.max(0, (endedAt || occurredAt).getTime() - new Date(startedAt).getTime());
  const modifier = {
    $setOnInsert: {
      projectId: project._id,
      projectKey: project.projectKey,
      presenceId,
      startedAt,
      createdAt: now,
    },
    $set: {
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
      path: safeString(payload.path, 500, '/'),
      title: safeString(payload.title, 160),
      screen: safeString(payload.screen, 160),
      lastSeenAt: occurredAt,
      ...(endedAt ? { endedAt } : {}),
      state: endedAt ? state : 'active',
      heartbeatIntervalMs: Math.max(0, Number(payload.heartbeatIntervalMs) || PRESENCE_HEARTBEAT_INTERVAL_MS),
      durationMs,
      updatedAt: now,
    },
  };

  if (state === 'heartbeat') {
    modifier.$inc = { heartbeatCount: 1 };
  }

  await PresenceSessions.updateAsync(
    { projectId: project._id, presenceId },
    modifier,
    { upsert: true },
  );

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

async function handlePresence(req, res) {
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

  const result = await ingestPresencePayload(payload, req);
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
  const presenceSessions = await loadProjectPresenceSessions(project);

  sendJson(res, 200, {
    protocol: 'tracemind-mcp-preview',
    tools: mcpTools(project).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
    })),
    summary: summarizeSemanticEvents(events),
    presence: summarizePresenceSessions(presenceSessions),
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
  const mcpToken = mcpTokenFromRequest(req, url);
  const requestProject = await resolveProjectByMcpToken(mcpToken);

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
        instructions: mcpInitializeInstructions(requestProject),
      }));
      continue;
    }

    if (item.method === 'ping') {
      responses.push(jsonRpcResult(item.id, {}));
      continue;
    }

    const project = requestProject;
    if (!project) {
      responses.push(jsonRpcError(item.id, -32001, 'Invalid or missing MCP token'));
      continue;
    }

    if (item.method === 'tools/list') {
      responses.push(jsonRpcResult(item.id, { tools: mcpTools(project) }));
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

  WebApp.handlers.use('/api/presence', (req, res) => {
    handlePresence(req, res).catch((error) => {
      console.error('[TraceMind] presence failed', error);
      sendJson(res, 500, { error: 'presence_failed' });
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
