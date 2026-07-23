import crypto from 'node:crypto';
import { WebApp } from 'meteor/webapp';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { TraceMindServer } from '@tracemind/server-node';
import { minify } from 'terser';
import {
  CaptureDeliveryHourlyRollups,
  CaptureDeliveryReports,
  ACTIVE_IDLE_TIMEOUT_MS,
  CURRENT_AGENT_GUIDANCE_VERSION,
  CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID,
  DATA_RETENTION_POLICY,
  EVENT_DEFINITIONS,
  FeedbackReports,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PresenceSessions,
  ProductUsageMarkers,
  RawBehaviors,
  SemanticEvents,
  UserFeedbackReports,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  mcpServerNameForProject,
  normalizeAttribution,
  normalizeCaptureSource,
  publicRawBehavior,
  publicSemanticEvent,
  summarizePresenceSessions,
} from '/imports/api/tracemind';
import { SDK_RELEASE_MANIFEST, latestSdkForSetup } from '/imports/api/sdk_release';
import { summarizeSemanticEvents } from '/imports/api/semantic';
import {
  classifyDeliveryRecoveryEpisode,
  deliveryRecoveryEvidenceQuality,
  sanitizeDeliveryRecoveryEpisode,
  sanitizeRuntimeContext,
} from '/imports/api/runtime_context';
import { queueProjectDailyHealthRefresh, reportDateForDate, resolveProjectDailyHealth } from './daily_reports';
import {
  recordSetupAttemptFirstCapture,
  recordSetupAttemptMcpConnection,
  recordSetupAttemptMcpTool,
} from './setup_attempts';
import {
  configureIngestionGuardForTest,
  drainIngestionGuardForTest,
  evaluateIngestionGuard,
  flushIngestionGuardRollups,
  resetIngestionGuardForTest,
} from './ingestion_guard';
import { buildProjectRecentOnline, resolveProjectByKey, resolveProjectByMcpToken } from './tracemind_methods';

export {
  configureIngestionGuardForTest,
  drainIngestionGuardForTest,
  resetIngestionGuardForTest,
};

const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_MCP_PROTOCOLS = new Set(['2025-06-18', '2025-03-26']);
const AGENT_GUIDANCE_VERSION = CURRENT_AGENT_GUIDANCE_VERSION;
const CAPTURE_SETUP_PLATFORMS = ['web', 'ios', 'macos', 'android', 'react_native', 'hybrid', 'mini_program', 'browser_extension', 'mcp_node', 'mcp_python', 'agent_skill', 'server_node', 'server_python', 'server_http'];
export const CAPTURE_SCRIPT_ENTRY_CACHE_CONTROL = 'public, max-age=60, must-revalidate';
export const CAPTURE_SCRIPT_IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const TRACE_MIND_SDK_SOURCE_REPO = 'https://github.com/wolf3c/TraceMind.git';
const TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR = '.tracemind-sdk-source';
const PRODUCT_USAGE_EVENT_NAME = 'customer_project_capture_active';
const PRODUCT_USAGE_SOURCE_KEY = 'tracemind-server';
const CAPTURE_SCRIPT_ORIGIN_CONFIG_KEY = 'TRACEMIND_CAPTURE_SCRIPT_ORIGIN';
const PRODUCT_USAGE_PROJECT_ID_CONFIG_KEY = 'TRACEMIND_PRODUCT_USAGE_PROJECT_ID';
const PRODUCT_USAGE_PROJECT_KEY_CONFIG_KEY = 'TRACEMIND_PRODUCT_USAGE_PROJECT_KEY';
const PRODUCT_USAGE_PENDING_RETRY_MS = 10 * 60 * 1000;
const SDK_NAME_BY_SOURCE_PATH = {
  'sdk/ios': 'swift',
  'sdk/android': 'android',
  'sdk/react-native': 'react_native',
  'sdk/mini-program': 'mini_program',
  'sdk/browser-extension': 'browser_extension',
  'sdk/mcp-node': 'mcp_node',
  'sdk/mcp-python': 'mcp_python',
  'sdk/server-node': 'server_node',
  'sdk/server-python': 'server_python',
};
const MINI_PROGRAM_PROVIDERS = ['wechat', 'alipay', 'douyin', 'dingtalk'];
const MINI_PROGRAM_PROVIDER_LABELS = {
  wechat: 'WeChat',
  alipay: 'Alipay',
  douyin: 'Douyin',
  dingtalk: 'DingTalk',
};
const MINI_PROGRAM_PROVIDER_API_NAMES = {
  wechat: 'wx',
  alipay: 'my',
  douyin: 'tt',
  dingtalk: 'dd',
};
const MINI_PROGRAM_PROVIDER_FILE_NAMES = {
  wechat: 'app.js',
  alipay: 'app.js',
  douyin: 'app.js',
  dingtalk: 'app.js',
};

async function recordSetupAttemptSafely(record) {
  try {
    return await record();
  } catch (error) {
    console.error('[TraceMind] setup attempt tracking failed', error);
    return null;
  }
}
const MINI_PROGRAM_PLATFORM_ALIASES = {
  wechat_mini_program: 'wechat',
  weixin_mini_program: 'wechat',
  wx_mini_program: 'wechat',
  alipay_mini_program: 'alipay',
  ali_mini_program: 'alipay',
  douyin_mini_program: 'douyin',
  tt_mini_program: 'douyin',
  bytedance_mini_program: 'douyin',
  dingtalk_mini_program: 'dingtalk',
  ding_mini_program: 'dingtalk',
  dd_mini_program: 'dingtalk',
};
const BROWSER_EXTENSION_PLATFORM_ALIASES = new Set(['chrome_extension', 'edge_extension', 'firefox_extension', 'web_extension']);
const AGENT_GUIDANCE_RESOURCES = {
  skill: '/agents/tracemind/SKILL.md',
  agentSnippet: '/agents/tracemind/AGENTS_SNIPPET.md',
  manifest: '/agents/tracemind/manifest.json',
};
const AGENT_SETUP_CHECK_TOOL = 'tracemind.check_agent_setup';
const AGENT_SETUP_CONTENT_LIMIT = 120000;
const AGENT_SETUP_SAFE_UPDATE_INSTRUCTIONS = [
  'Tell the user which local files will be updated before editing.',
  'Do not overwrite user-edited rules; merge only missing TraceMind guidance.',
  'Do not duplicate a full TraceMind rules block when the project already has one.',
  'Keep MCP URLs, Bearer tokens, mcpToken values, projectKey values, and secrets out of committed instruction files.',
  'After updating, call tracemind.check_agent_setup again and report the new status.',
];
const MCP_TOOL_DISCOVERY_RECOVERY_GUIDANCE = 'If reporting tools such as tracemind.project_health, tracemind.query_delivery_diagnostics, tracemind.recent_online, tracemind.query_raw_behaviors, or tracemind.submit_feedback are missing from the current active tool list, read MCP tools/list or retry discovery with the exact tool name before concluding they are unavailable; if they are still missing, refresh the connector/session/MCP config/token and call tracemind.project_info again.';
const MCP_TOOL_DISCOVERY_FALLBACK_GUIDANCE = 'Do not compensate for missing current online or project health capabilities by increasing tracemind.summary.limit; use the documented fallback source and mark the data gap until discovery is repaired.';
const MCP_TOOL_DISCOVERY_RECOVERY_STEP = 'MCP tools/list or exact tool discovery if reporting tools are missing';
const SUMMARY_DEFAULT_LIMIT = 200;
const SUMMARY_MAX_LIMIT = 500;
const DELIVERY_DIAGNOSTICS_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DELIVERY_DIAGNOSTICS_BUCKET_MS = 60 * 60 * 1000;
const DELIVERY_DIAGNOSTICS_MAX_REPORTS = 5000;
const DELIVERY_DIAGNOSTICS_PLATFORMS = new Set([
  'web',
  'ios',
  'macos',
  'android',
  'mini_program',
  'browser_extension',
  'server',
]);
const SERVER_PROJECT_KEY_ENV_VAR = 'TRACEMIND_PROJECT_KEY';
const SERVER_DEFAULT_SOURCE_KEY = 'billing-api';
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
  'sourceCode',
  'sourceDiff',
  'codeDiff',
  'rawRequestBody',
  'requestBody',
  'rawResponseBody',
  'responseBody',
  'stack',
  'stackTrace',
  'rawLog',
  'fullUrl',
  'inputValue',
  'headers',
  'cookies',
  'authorization',
];

const SAFE_DERIVED_ANALYTICS_KEYS = new Set([
  'messageFingerprint',
  'stackFingerprint',
  'topFrameFingerprint',
  'causeFingerprint',
]);

const APP_ERROR_PROPERTY_KEYS = new Set([
  'errorKind',
  'errorType',
  'messageFingerprint',
  'messagePreview',
  'stackFingerprint',
  'topFrameFingerprint',
  'causeType',
  'causeFingerprint',
  'fatal',
  'handled',
  'source',
  'screen',
  'release',
  'component',
  'operation',
  'feature',
  'routeName',
  'correlationId',
  'requestId',
  'httpStatus',
  'status',
  'occurredAt',
]);
const APP_ERROR_CONTEXT_KEYS = new Set([
  'source',
  'screen',
  'release',
  'component',
  'status',
  'occurredAt',
]);
const APPROVED_AUTO_EVENT_NAMES = new Set([
  'app_error',
  'identify',
  'mcp_tool_call',
  'mcp_resource_read',
  'mcp_prompt_request',
  'agent_skill_lifecycle',
]);
const CAPTURE_SCRIPT_ENTRY_PATH = '/capture.js';
const CAPTURE_SCRIPT_ASSET_PATH_PATTERN = /^\/capture\.([a-f0-9]{64})\.js$/;
const captureScriptAssetCache = new Map();

function normalizedOrigin(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch (error) {
    return '';
  }
}

function publicSettings() {
  return Meteor.settings?.public || {};
}

function configuredCaptureScriptOrigin() {
  return normalizedOrigin(
    privateSettings()[CAPTURE_SCRIPT_ORIGIN_CONFIG_KEY]
      || publicSettings().captureScriptOrigin
      || publicSettings()[CAPTURE_SCRIPT_ORIGIN_CONFIG_KEY]
      || process.env[CAPTURE_SCRIPT_ORIGIN_CONFIG_KEY],
  );
}

function captureScriptUrlFromOrigin(origin) {
  return `${normalizedOrigin(origin)}${CAPTURE_SCRIPT_ENTRY_PATH}`;
}

function captureSetupScriptUrl() {
  const configuredOrigin = configuredCaptureScriptOrigin();
  return configuredOrigin
    ? captureScriptUrlFromOrigin(configuredOrigin)
    : Meteor.absoluteUrl(CAPTURE_SCRIPT_ENTRY_PATH);
}

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

function safeCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
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

function availableCapabilitiesResult() {
  return {
    currentOnline: {
      tool: 'tracemind.recent_online',
      source: 'tracemind_presence_sessions',
      canonicalUse: 'current online users, real-time users, active now, active pages, regions, high-frequency events, and last 30 minutes activity',
      notReplacedBy: ['tracemind.summary'],
    },
    projectHealth: {
      tool: 'tracemind.project_health',
      source: 'tracemind_project_daily_reports and tracemind_project_hourly_reports',
      canonicalUse: 'product health, today health, daily health, delivery health, trend changes, attention items, and change verification',
      notReplacedBy: ['tracemind.summary', 'tracemind.query_events'],
    },
    deliveryDiagnostics: {
      tool: 'tracemind.query_delivery_diagnostics',
      source: 'tracemind_capture_delivery_reports',
      canonicalUse: 'privacy-safe recent delivery failure, retry, drop, queue-depth, and recovery-duration drilldown',
      notReplacedBy: ['tracemind.summary', 'tracemind.query_events', 'tracemind.query_raw_behaviors'],
    },
  };
}

function projectInfoResult(project = {}) {
  return {
    projectId: project._id,
    projectName: projectDisplayName(project),
    mcpServerName: mcpServerNameForProject(project),
    availableCapabilities: availableCapabilitiesResult(),
  };
}

export function mcpInitializeInstructions(project) {
  return project
    ? `使用 TraceMind 工具查看项目 "${projectDisplayName(project)}" 的语义行为事件；开发者明确要求直接反馈给 TraceMind、submit feedback 或上报问题/想法时，使用 tracemind.submit_feedback。当前 MCP server 建议命名为 ${mcpServerNameForProject(project)}。`
    : '使用 TraceMind 工具查看当前 Web 项目的语义行为事件；开发者明确要求直接反馈给 TraceMind、submit feedback 或上报问题/想法时，使用 tracemind.submit_feedback。后续 tools/list 会在有效 MCP token 下返回项目身份。';
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
      description: projectScopedDescription('返回当前 TraceMind coding agent 权威指导版本、公开 skill/rules 资源、数据保留规则和推荐工作流；也说明开发者要求直接反馈给 TraceMind / submit feedback / 上报问题或想法时应调用 tracemind.submit_feedback。老用户应对比本地 Skill/AGENTS，必要时调用 tracemind.check_agent_setup。', project),
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: AGENT_SETUP_CHECK_TOOL,
      title: projectScopedTitle('TraceMind Check Agent Setup', project),
      description: projectScopedDescription('检查客户仓库中已安装的 TraceMind Skill / AGENTS rules 是否过期，是否包含 registry SDK 指引、project binding、agent_guidance 和 capture_setup 更新规则，并返回安全合并建议。', project),
      inputSchema: {
        type: 'object',
        properties: {
          skillContent: {
            type: 'string',
            description: '本地 TraceMind Skill/SKILL.md 内容。只用于文本级规则检查，不会原文回显。',
          },
          agentInstructionContent: {
            type: 'string',
            description: '本地 AGENTS.md、CLAUDE.md、Codex instructions 或同类 agent rules 内容。只用于文本级规则检查，不会原文回显。',
          },
          manifestContent: {
            type: 'string',
            description: '可选的 TraceMind manifest.json 内容。只用于文本级规则检查，不会原文回显。',
          },
          fileHints: {
            type: 'array',
            items: { type: 'string' },
            description: '可选的本地文件路径提示，例如 .codex/skills/tracemind/SKILL.md、AGENTS.md。',
          },
        },
      },
    },
    {
      name: 'tracemind.project_health',
      title: projectScopedTitle('TraceMind Project Health', project),
      description: projectScopedDescription('读取 Dashboard 同源的日报/小时项目健康结构、数据保留规则、SDK 升级提示和 agent setup 更新提醒，帮助 agent 先判断产品健康、today health、daily health、delivery health、trend changes、change verification、今天是否正常、上线前/发布后是否需要关注，再下钻语义事件证据；不用于实时在线人数，实时用户请用 tracemind.recent_online。', project),
      inputSchema: {
        type: 'object',
        properties: {
          reportDate: {
            type: 'string',
            description: 'YYYY-MM-DD，自然日报告日期；省略时使用今天。',
          },
        },
      },
    },
    {
      name: 'tracemind.query_delivery_diagnostics',
      title: projectScopedTitle('TraceMind Query Delivery Diagnostics', project),
      description: projectScopedDescription('查询最近 7 天失败、重试或丢弃上报的脱敏聚合；按小时、endpoint、source/platform、reason 与证据分类返回诊断计数、队列峰值、可归因恢复区间和单独标注的旧版墙钟耗时，不返回运行实例/区间标识、原始错误、请求/响应体、URL、日志或用户内容。', project),
      inputSchema: {
        type: 'object',
        properties: {
          startAt: { type: 'string', description: 'ISO 时间，查询起点；默认最近 24 小时，最多保留最近 7 天。' },
          endAt: { type: 'string', description: 'ISO 时间，查询终点；默认当前时间。' },
          platform: { type: 'string', description: '可选平台过滤，例如 web、ios、android、server。' },
          endpoint: { type: 'string', enum: ['capture', 'presence', 'user_feedback'], description: '可选上报端点过滤。' },
          sourceType: { type: 'string', description: '可选来源类型过滤，例如 web、server_app、mcp_server。' },
          sourceKey: { type: 'string', description: '可选稳定来源 key 过滤，例如 hostname、bundle id 或服务名。' },
        },
      },
    },
    {
      name: 'tracemind.recent_online',
      title: projectScopedTitle('TraceMind Recent Online', project),
      description: projectScopedDescription('读取 Dashboard 同源的近 30 分钟实时在线结构，帮助 agent 判断 current online users、real-time users、active now、currently using product、last 30 minutes、现在是否有人在线、当前在线人数、用户集中在哪些页面或地区，以及最近高频事件；不使用 tracemind.summary 的样本 DAU 替代在线人数。', project),
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'tracemind.capture_setup',
      title: projectScopedTitle('TraceMind Capture Setup', project),
      description: projectScopedDescription('返回当前项目的 Auto Capture 项目 key 和指定平台的接入代码与步骤；接 SDK 前如果本地 TraceMind Skill/AGENTS 可能过期，应先调用 tracemind.check_agent_setup。', project),
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: CAPTURE_SETUP_PLATFORMS,
            description: '要接入的平台；省略时返回 Web 脚本。小程序使用 mini_program，并用 provider 指定微信、支付宝、抖音或钉钉；浏览器插件使用 browser_extension；也接受 wechat_mini_program、chrome_extension 等别名。',
          },
          provider: {
            type: 'string',
            enum: MINI_PROGRAM_PROVIDERS,
            description: 'platform 为 mini_program 时的小程序宿主：wechat、alipay、douyin 或 dingtalk。',
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
          platform: { type: 'string', description: 'web、ios、macos、android、react_native、hybrid、mini_program、browser_extension、mcp_node、mcp_python、agent_skill、server_node、server_python、server_http 或 server。' },
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
      name: 'tracemind.submit_feedback',
      title: projectScopedTitle('TraceMind Submit Feedback', project),
      description: projectScopedDescription('将开发者明确要求直接反馈给 TraceMind、submit feedback、上报问题或上报想法的脱敏报告写入 TraceMind 反馈库。提交前应先收集可复核证据，并避免发送 PII、token、raw prompt、源码 diff 或原始用户内容。', project),
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['issue', 'idea'], description: '反馈类型：issue 或 idea。' },
          title: { type: 'string', description: '简短标题。' },
          summary: { type: 'string', description: '已脱敏的问题或想法摘要。' },
          expected: { type: 'string', description: '可选，预期行为。' },
          actual: { type: 'string', description: '可选，实际行为。' },
          suggestion: { type: 'string', description: '可选，建议改进。' },
          reproductionSteps: {
            type: 'array',
            items: { type: 'string' },
            description: '可选，简短复现步骤。',
          },
          evidence: {
            type: 'object',
            properties: {
              startAt: { type: 'string' },
              endAt: { type: 'string' },
              paths: { type: 'array', items: { type: 'string' } },
              eventIds: { type: 'array', items: { type: 'string' } },
              rawBehaviorIds: { type: 'array', items: { type: 'string' } },
              actionKeys: { type: 'array', items: { type: 'string' } },
              targetHashes: { type: 'array', items: { type: 'string' } },
              userIds: { type: 'array', items: { type: 'string' } },
              sessionIds: { type: 'array', items: { type: 'string' } },
              deviceIds: { type: 'array', items: { type: 'string' } },
              examples: { type: 'array', items: { type: 'string' } },
            },
          },
          environment: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['web', 'ios', 'macos', 'android', 'mini_program', 'browser_extension', 'server', 'unknown'] },
              sourceType: { type: 'string', enum: ['web', 'ios', 'macos', 'android', 'mini_program', 'browser_extension', 'mcp_server', 'agent_skill', 'server_app', 'unknown'] },
              sourceKey: { type: 'string' },
            },
          },
        },
        required: ['type', 'title', 'summary'],
      },
    },
    {
      name: 'tracemind.query_user_feedback',
      title: projectScopedTitle('TraceMind Query User Feedback', project),
      description: projectScopedDescription('查询终端用户通过客户 app 主动提交的反馈，默认返回摘要和行为证据引用，详情查询可返回完整 message。', project),
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '反馈记录 ID；提供后返回单条记录。' },
          status: { type: 'string', enum: ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate'] },
          kind: { type: 'string', enum: ['issue', 'idea', 'question', 'other'] },
          startAt: { type: 'string', description: 'ISO 时间，提交时间起点。' },
          endAt: { type: 'string', description: 'ISO 时间，提交时间终点。' },
          path: { type: 'string', description: '页面 path 或 screen。' },
          platform: { type: 'string', description: 'web、ios、macos、android、mini_program、browser_extension、server 或 unknown。' },
          sourceType: { type: 'string', description: '来源类型，例如 web、ios、android、mini_program、browser_extension、server_app。' },
          userId: { type: 'string' },
          anonymousId: { type: 'string' },
          sessionId: { type: 'string' },
          deviceId: { type: 'string' },
          keyword: { type: 'string', description: '标题、正文或自定义字段关键词。' },
          hasContact: { type: 'boolean', description: '是否只查询包含用户主动联系方式的反馈。' },
          includeMessage: { type: 'boolean', description: '是否返回完整 message；默认列表只返回摘要。' },
          limit: { type: 'number', description: '最多返回多少条，默认 50。' },
        },
      },
    },
    {
      name: 'tracemind.update_user_feedback',
      title: projectScopedTitle('TraceMind Update User Feedback', project),
      description: projectScopedDescription('仅更新终端用户反馈的处理状态、备注、解决说明或重复关联；不会修改用户原始反馈 message。', project),
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '反馈记录 ID。' },
          status: { type: 'string', enum: ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate'] },
          note: { type: 'string', description: '处理备注。' },
          resolution: { type: 'string', description: '解决说明。' },
          linkedIssueUrl: { type: 'string', description: '关联 issue 或任务 URL。' },
          duplicateOf: { type: 'string', description: '重复反馈的目标反馈 ID。' },
        },
        required: ['id'],
      },
    },
    {
      name: 'tracemind.summary',
      title: projectScopedTitle('TraceMind Behavior Summary', project),
      description: projectScopedDescription('汇总当前产品最近语义事件样本，支持非自然日时间窗、功能/路径/来源过滤和证据聚合；默认读取 200 条，最大 500 条，用于下钻分析，不替代 Dashboard 日报口径或 project_health。', project),
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '最多统计多少条最近语义事件样本，默认 200，最大 500；summary.totalEvents/topActions/dailyActiveUsers 均为样本口径。优先用 topIntentActions 判断用户意图，用 topFieldInteractions 解释输入框等字段交互噪声。',
          },
          startAt: { type: 'string', description: 'ISO 时间，查询起点。' },
          endAt: { type: 'string', description: 'ISO 时间，查询终点。' },
          eventType: { type: 'string', description: '事件类型，例如 click、custom。' },
          eventName: { type: 'string', description: '事件名，例如 checkout_started。' },
          userId: { type: 'string', description: '业务用户 ID。' },
          sessionId: { type: 'string', description: 'Session ID。' },
          deviceId: { type: 'string', description: '设备 ID。' },
          targetHash: { type: 'string', description: '元素目标哈希，用于区分同页相同文案的按钮或输入框。' },
          actionKey: { type: 'string', description: '稳定交互动作 key，用于按工程标识和路径聚合行为。' },
          lifecycleState: { type: 'string', enum: ['foreground', 'background', 'unknown'], description: '按事件发生时的生命周期证据过滤。' },
          connectivityState: { type: 'string', enum: ['online', 'offline', 'unknown'], description: '按事件发生时的联网证据过滤。' },
          attributionSource: { type: 'string', description: '流量归因来源，可来自 Web UTM/referrer 或 native deeplink/referrer app，例如 github、google、direct、partner。' },
          attributionMedium: { type: 'string', description: '流量归因媒介，例如 social、cpc、direct、deeplink、universal_link、app_link。' },
          attributionCampaign: { type: 'string', description: '流量归因 campaign，例如 launch-week。' },
          landingPath: { type: 'string', description: '首次落地 path，不包含 query string。' },
        },
      },
    },
    {
      name: 'tracemind.query_events',
      title: projectScopedTitle('TraceMind Query Semantic Events', project),
      description: projectScopedDescription('按时间、事件类型、事件名、用户、Session、设备、路径和来源过滤查询语义事件；语义事件明细保留 10 天，用于 Dashboard 同源运营结论后的证据事件下钻，不替代 project_health/recent_online。', project),
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
          actionKey: { type: 'string', description: '稳定交互动作 key，用于按工程标识和路径聚合行为。' },
          path: { type: 'string', description: '页面或接口路径。' },
          lifecycleState: { type: 'string', enum: ['foreground', 'background', 'unknown'], description: '按事件发生时的生命周期证据过滤。' },
          connectivityState: { type: 'string', enum: ['online', 'offline', 'unknown'], description: '按事件发生时的联网证据过滤。' },
          attributionSource: { type: 'string', description: '流量归因来源，可来自 Web UTM/referrer 或 native deeplink/referrer app，例如 github、google、direct、partner。' },
          attributionMedium: { type: 'string', description: '流量归因媒介，例如 social、cpc、direct、deeplink、universal_link、app_link。' },
          attributionCampaign: { type: 'string', description: '流量归因 campaign，例如 launch-week。' },
          landingPath: { type: 'string', description: '首次落地 path，不包含 query string。' },
        },
      },
    },
    {
      name: 'tracemind.query_raw_behaviors',
      title: projectScopedTitle('TraceMind Query Raw Behaviors', project),
      description: projectScopedDescription('必要时查询原始行为日志，用于复核语义事件背后的原始采集数据；raw behavior 明细保留 10 天，超出窗口应优先查看语义事件和日报/小时健康报告。', project),
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
          actionKey: { type: 'string', description: '稳定交互动作 key，用于按工程标识和路径聚合行为。' },
          path: { type: 'string', description: '页面或接口路径。' },
          lifecycleState: { type: 'string', enum: ['foreground', 'background', 'unknown'], description: '按行为发生时的生命周期证据过滤。' },
          connectivityState: { type: 'string', enum: ['online', 'offline', 'unknown'], description: '按行为发生时的联网证据过滤。' },
          attributionSource: { type: 'string', description: '流量归因来源，可来自 Web UTM/referrer 或 native deeplink/referrer app，例如 github、google、direct、partner。' },
          attributionMedium: { type: 'string', description: '流量归因媒介，例如 social、cpc、direct、deeplink、universal_link、app_link。' },
          attributionCampaign: { type: 'string', description: '流量归因 campaign，例如 launch-week。' },
          landingPath: { type: 'string', description: '首次落地 path，不包含 query string。' },
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

function requestedLimitValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

function summarySampleMetadata(args, events, appliedLimit) {
  const requestedLimit = requestedLimitValue(args.limit);
  return {
    source: 'tracemind_semantic_events',
    mode: 'recent_semantic_event_sample',
    requestedLimit,
    defaultLimit: SUMMARY_DEFAULT_LIMIT,
    appliedLimit,
    maxLimit: SUMMARY_MAX_LIMIT,
    sampleSize: events.length,
    limitCapped: requestedLimit !== null && requestedLimit > appliedLimit,
    totalsAreSampled: true,
    fullDayMetricsTool: 'tracemind.project_health',
  };
}

let productUsageConfig = null;
const productUsageTasks = new Set();
let productUsageMissingConfigWarningLogged = false;
let productUsageInstrumentationState = initialProductUsageInstrumentationState();

function initialProductUsageInstrumentationState() {
  return {
    enabled: false,
    configured: false,
    missingConfigKeys: [PRODUCT_USAGE_PROJECT_ID_CONFIG_KEY, PRODUCT_USAGE_PROJECT_KEY_CONFIG_KEY],
    lastStartedAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureKind: '',
  };
}

function privateSettings() {
  return Meteor.settings?.private || {};
}

function configuredValue(settingsKey, envKey, fallback = '') {
  return String(privateSettings()[settingsKey] || process.env[envKey] || fallback || '').trim();
}

function overrideValue(overrides, key, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return String(overrides[key] ?? '').trim();
  }
  return String(fallback || '').trim();
}

function resolveProductUsageConfig(overrides = {}) {
  const productProjectId = overrideValue(
    overrides,
    'productProjectId',
    configuredValue(PRODUCT_USAGE_PROJECT_ID_CONFIG_KEY, PRODUCT_USAGE_PROJECT_ID_CONFIG_KEY),
  );
  const productProjectKey = overrideValue(
    overrides,
    'productProjectKey',
    configuredValue(PRODUCT_USAGE_PROJECT_KEY_CONFIG_KEY, PRODUCT_USAGE_PROJECT_KEY_CONFIG_KEY),
  );
  const endpoint = String(
    overrides.endpoint
      || configuredValue('TRACEMIND_PRODUCT_USAGE_ENDPOINT', 'TRACEMIND_PRODUCT_USAGE_ENDPOINT', Meteor.absoluteUrl('/api/capture')),
  ).trim();

  return {
    productProjectId,
    productProjectKey,
    endpoint,
    sourceKey: String(overrides.sourceKey || PRODUCT_USAGE_SOURCE_KEY).trim() || PRODUCT_USAGE_SOURCE_KEY,
    now: overrides.now,
    transport: overrides.transport,
    logger: overrides.logger,
  };
}

function productUsageNow(config = productUsageConfig) {
  return config?.now?.() || new Date();
}

function productUsageMissingConfigKeys(config = {}) {
  return [
    ...(config.productProjectId ? [] : [PRODUCT_USAGE_PROJECT_ID_CONFIG_KEY]),
    ...(config.productProjectKey ? [] : [PRODUCT_USAGE_PROJECT_KEY_CONFIG_KEY]),
  ];
}

function productUsageWarning(code, message) {
  return { code, severity: 'warning', message };
}

function productUsageInstrumentationWarnings(state, context = {}) {
  const warnings = [];
  if (!state.configured) {
    warnings.push(productUsageWarning(
      'missing_config',
      `Product usage instrumentation is disabled because ${state.missingConfigKeys.join(', ')} is missing.`,
    ));
  }
  if (state.lastFailureAt && (!state.lastSuccessAt || new Date(state.lastFailureAt) > new Date(state.lastSuccessAt))) {
    if (state.lastFailureKind !== 'missing_config') {
      warnings.push(productUsageWarning(
        'last_flush_failed',
        'The latest product usage marker flush failed; customer active-project counts may be incomplete until a later activity retries successfully.',
      ));
    }
  }
  if (context.productUsageSummary && context.summary?.totalEvents === 0 && context.hasPresenceEvidence) {
    warnings.push(productUsageWarning(
      'zero_events_with_presence',
      'This TraceMind project has presence activity, but customer_project_capture_active is empty; do not treat the zero marker count as proof that no customer project is active.',
    ));
  }
  return warnings;
}

function publicProductUsageInstrumentationHealth(context = {}) {
  const state = {
    ...productUsageInstrumentationState,
    missingConfigKeys: [...productUsageInstrumentationState.missingConfigKeys],
  };
  const warnings = productUsageInstrumentationWarnings(state, context);
  return {
    enabled: state.enabled,
    configured: state.configured,
    authoritative: state.enabled && state.configured && warnings.length === 0,
    missingConfigKeys: state.missingConfigKeys,
    lastStartedAt: state.lastStartedAt,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastFailureKind: state.lastFailureKind,
    warnings,
  };
}

function productUsageSummaryRequested(args = {}) {
  return String(args.eventName || '').trim() === PRODUCT_USAGE_EVENT_NAME;
}

function updateProductUsageFailure(kind, now = productUsageNow()) {
  productUsageInstrumentationState.lastFailureAt = now;
  productUsageInstrumentationState.lastFailureKind = kind;
}

function updateProductUsageSuccess(now = productUsageNow()) {
  productUsageInstrumentationState.lastSuccessAt = now;
}

function productUsageFailureKind(error) {
  if (duplicateKey(error)) return 'marker_duplicate';
  return 'flush_failed';
}

export function startProductUsageInstrumentation(overrides = {}) {
  const config = resolveProductUsageConfig(overrides);
  const missingConfigKeys = productUsageMissingConfigKeys(config);
  const now = productUsageNow(config);

  productUsageInstrumentationState = {
    ...productUsageInstrumentationState,
    enabled: missingConfigKeys.length === 0,
    configured: missingConfigKeys.length === 0,
    missingConfigKeys,
    lastStartedAt: now,
    ...(missingConfigKeys.length
      ? { lastFailureAt: now, lastFailureKind: 'missing_config' }
      : productUsageInstrumentationState.lastFailureKind === 'missing_config'
        ? { lastFailureAt: null, lastFailureKind: '' }
        : {}),
  };

  if (missingConfigKeys.length) {
    productUsageConfig = null;
    if (!productUsageMissingConfigWarningLogged) {
      const logger = config.logger || console.warn;
      logger(`[TraceMind] product usage instrumentation disabled; missing ${missingConfigKeys.join(', ')}`);
      productUsageMissingConfigWarningLogged = true;
    }
    return false;
  }

  productUsageConfig = config;
  productUsageMissingConfigWarningLogged = false;
  TraceMindServer.start({
    projectKey: config.productProjectKey,
    sourceKey: config.sourceKey,
    endpoint: config.endpoint,
    ...(config.now ? { now: config.now } : {}),
    ...(config.transport ? { transport: config.transport } : {}),
  });
  return true;
}

function productUsageActivityDate(payload = {}) {
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : null;
  if (occurredAt && !Number.isNaN(occurredAt.getTime())) return occurredAt;
  return productUsageNow();
}

function duplicateKey(error) {
  return error?.code === 11000
    || error?.error === 11000
    || String(error?.message || '').includes('E11000');
}

function pendingMarkerIsStale(marker, now) {
  const lastAttemptAt = marker.lastAttemptAt || marker.updatedAt || marker.createdAt || null;
  if (!lastAttemptAt) return true;
  return new Date(now).getTime() - new Date(lastAttemptAt).getTime() >= PRODUCT_USAGE_PENDING_RETRY_MS;
}

async function claimProductUsageMarker(project, activitySource, reportDate, now) {
  const existing = await ProductUsageMarkers.findOneAsync({ projectId: project._id, reportDate });
  if (existing) {
    const status = existing.status || 'sent';
    if (status === 'sent') return false;
    if (status === 'pending' && !pendingMarkerIsStale(existing, now)) return false;
    if (status !== 'pending' && status !== 'failed') return false;

    const claimSelector = { _id: existing._id, status };
    if (status === 'pending') {
      if (existing.lastAttemptAt) {
        claimSelector.lastAttemptAt = existing.lastAttemptAt;
      } else {
        claimSelector.$or = [
          { lastAttemptAt: { $exists: false } },
          { lastAttemptAt: null },
        ];
      }
    }
    const updated = await ProductUsageMarkers.updateAsync(claimSelector, {
      $set: {
        developerId: project.developerId,
        activitySource,
        status: 'pending',
        lastAttemptAt: now,
        updatedAt: now,
      },
      $unset: {
        lastFailureAt: '',
        lastFailureKind: '',
      },
      $inc: { attemptCount: 1 },
    });
    return updated > 0;
  }

  try {
    await ProductUsageMarkers.insertAsync({
      projectId: project._id,
      developerId: project.developerId,
      reportDate,
      activitySource,
      status: 'pending',
      attemptCount: 1,
      lastAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (duplicateKey(error)) return false;
    throw error;
  }
}

async function markProductUsageMarkerSent(projectId, reportDate, now) {
  await ProductUsageMarkers.updateAsync(
    { projectId, reportDate },
    {
      $set: {
        status: 'sent',
        sentAt: now,
        updatedAt: now,
      },
      $unset: {
        lastFailureAt: '',
        lastFailureKind: '',
      },
    },
  );
}

async function markProductUsageMarkerFailed(projectId, reportDate, failureKind, now) {
  await ProductUsageMarkers.updateAsync(
    { projectId, reportDate },
    {
      $set: {
        status: 'failed',
        lastFailureAt: now,
        lastFailureKind: failureKind,
        updatedAt: now,
      },
    },
  );
}

async function recordProductUsageActivity(project, activitySource, payload = {}) {
  if (!productUsageConfig?.productProjectId || !productUsageConfig?.productProjectKey) return;
  if (!project?._id || !project.developerId) return;
  if (project._id === productUsageConfig.productProjectId) return;

  const now = productUsageNow();
  const reportDate = reportDateForDate(productUsageActivityDate(payload));
  let claimed = false;
  try {
    claimed = await claimProductUsageMarker(project, activitySource, reportDate, now);
    if (!claimed) return;

    productUsageInstrumentationState.lastAttemptAt = now;
    TraceMindServer.capture('custom', {
      eventName: PRODUCT_USAGE_EVENT_NAME,
      userId: project.developerId,
      path: '/internal/product-usage',
      properties: {
        reportDate,
        customerAccountId: project.developerId,
        customerProjectId: project._id,
        activitySource,
      },
      context: {
        source: 'capture_ingestion',
        platform: 'server',
      },
    });
    await TraceMindServer.flush();
    await markProductUsageMarkerSent(project._id, reportDate, now);
    updateProductUsageSuccess(now);
  } catch (error) {
    const failureKind = productUsageFailureKind(error);
    updateProductUsageFailure(failureKind, now);
    if (claimed) {
      await markProductUsageMarkerFailed(project._id, reportDate, failureKind, now);
    }
    throw error;
  }
}

function queueProductUsageActivity(project, activitySource, payload = {}) {
  const task = recordProductUsageActivity(project, activitySource, payload).catch((error) => {
    (productUsageConfig?.logger || console.error)('[TraceMind] product usage instrumentation failed', error);
  });
  productUsageTasks.add(task);
  task.finally(() => productUsageTasks.delete(task));
}

export async function drainProductUsageInstrumentationForTest() {
  while (productUsageTasks.size) {
    await Promise.allSettled([...productUsageTasks]);
  }
}

export function configureProductUsageInstrumentationForTest(overrides = {}) {
  return startProductUsageInstrumentation(overrides);
}

export function resetProductUsageInstrumentationForTest() {
  productUsageConfig = null;
  productUsageTasks.clear();
  productUsageMissingConfigWarningLogged = false;
  productUsageInstrumentationState = initialProductUsageInstrumentationState();
}

export function productUsageInstrumentationHealthForTest() {
  return publicProductUsageInstrumentationHealth();
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

function deliveryDiagnosticsRetentionDays() {
  return DATA_RETENTION_POLICY.detailWindows.find((item) => item.dataSet === 'capture_delivery_reports')?.retentionDays || 7;
}

function deliveryDiagnosticsDate(value, fieldName, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Meteor.Error('invalid-delivery-diagnostics-date', `${fieldName} must be a valid ISO timestamp.`);
  }
  return date;
}

function deliveryDiagnosticsWindow(args = {}, now = new Date()) {
  const retentionDays = deliveryDiagnosticsRetentionDays();
  const retentionStartAt = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const requestedEndAt = deliveryDiagnosticsDate(args.endAt, 'endAt', now);
  const endAt = requestedEndAt > now ? now : requestedEndAt;
  const requestedStartAt = deliveryDiagnosticsDate(
    args.startAt,
    'startAt',
    new Date(endAt.getTime() - DELIVERY_DIAGNOSTICS_DEFAULT_WINDOW_MS),
  );
  const outsideRetention = endAt <= retentionStartAt;
  const startAt = outsideRetention
    ? endAt
    : new Date(Math.max(requestedStartAt.getTime(), retentionStartAt.getTime()));

  if (!outsideRetention && startAt >= endAt) {
    throw new Meteor.Error('invalid-delivery-diagnostics-window', 'startAt must be earlier than endAt.');
  }

  return {
    startAt,
    endAt,
    retentionStartAt,
    retentionDays,
    bucket: 'hour',
    truncatedByRetention: requestedStartAt < retentionStartAt,
    outsideRetention,
  };
}

function deliveryDiagnosticsPlatform(report = {}) {
  const explicit = safeString(report.platform, 40).toLowerCase();
  if (DELIVERY_DIAGNOSTICS_PLATFORMS.has(explicit)) return explicit;
  const sourceType = safeString(report.sourceType, 80, 'unknown').toLowerCase();
  if (['web', 'ios', 'macos', 'android', 'mini_program', 'browser_extension'].includes(sourceType)) {
    return sourceType;
  }
  if (['server_app', 'mcp_server', 'agent_skill', 'server'].includes(sourceType)) return 'server';
  return 'unknown';
}

function deliveryDiagnosticsPlatformQuery(platform) {
  const legacySourceTypes = platform === 'server'
    ? ['server_app', 'mcp_server', 'agent_skill', 'server']
    : [platform];
  return [
    { platform },
    { platform: { $exists: false }, sourceType: { $in: legacySourceTypes } },
  ];
}

function deliveryDiagnosticsHttpStatusClass(lastError) {
  const match = String(lastError || '').match(/(?:http(?:\s+status)?|status)\D{0,12}([1-5]\d{2})/i);
  if (!match) return 'none';
  return `${match[1][0]}xx`;
}

function deliveryDiagnosticsReasonClass(report = {}) {
  const lastError = String(report.lastError || '').toLowerCase();
  if (Number(report.droppedStorage) > 0 || /(storage|quota|queue_load)/.test(lastError)) return 'storage';
  if (Number(report.droppedOldest) > 0) return 'queue_overflow';
  if (deliveryDiagnosticsHttpStatusClass(lastError) !== 'none') return 'http';
  if (/(dns|enotfound|eai_again|name not resolved)/.test(lastError)) return 'dns';
  if (/(tls|ssl|certificate|cert_|handshake|unable to verify)/.test(lastError)) return 'tls';
  if (/(timeout|timed out|aborterror|aborted)/.test(lastError)) return 'timeout';
  if (/(network|failed to fetch|load failed|connection|econnreset|econnrefused|socket)/.test(lastError)) return 'network';
  if (Number(report.retryCount) > 0) return 'retry';
  return 'unknown';
}

function deliveryDiagnosticsLegacyElapsedDuration(report, reasonClass) {
  if (report.deliveryEpisodeId) return null;
  if (!['http', 'dns', 'tls', 'timeout', 'network'].includes(reasonClass)) return null;
  const failedAt = safeDate(report.lastFailedFlushAt);
  const recoveredAt = safeDate(report.createdAt);
  if (!failedAt || !recoveredAt || failedAt > recoveredAt) return null;
  const duration = recoveredAt.getTime() - failedAt.getTime();
  const maxDuration = deliveryDiagnosticsRetentionDays() * 24 * 60 * 60 * 1000;
  return duration <= maxDuration ? duration : null;
}

function deliveryDiagnosticsAttributedRecoveryEpisode(report) {
  const episode = sanitizeDeliveryRecoveryEpisode(report.recoveryEpisode);
  return episode && report.deliveryEpisodeId === episode.episodeId ? episode : null;
}

function emptyDurationComposition() {
  return {
    foregroundOnline: 0,
    foregroundOffline: 0,
    backgroundOnline: 0,
    backgroundOffline: 0,
    runtimeAbsent: 0,
    unknown: 0,
  };
}

function addDurationComposition(target, episode = {}) {
  target.foregroundOnline += safeCount(episode.foregroundOnlineMs);
  target.foregroundOffline += safeCount(episode.foregroundOfflineMs);
  target.backgroundOnline += safeCount(episode.backgroundOnlineMs);
  target.backgroundOffline += safeCount(episode.backgroundOfflineMs);
  target.runtimeAbsent += safeCount(episode.runtimeAbsentMs);
  target.unknown += safeCount(episode.unknownMs);
}

function incrementLabelCount(counts, label) {
  if (!label) return;
  counts[label] = safeCount(counts[label]) + 1;
}

function publicLabelCounts(counts, key) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => ({ [key]: label, count }));
}

function emptyRecoveryDurationSummary() {
  return {
    sampleCount: 0,
    total: 0,
    min: null,
    max: null,
  };
}

function addRecoveryDuration(summary, duration) {
  if (!Number.isFinite(duration) || duration < 0) return;
  summary.sampleCount += 1;
  summary.total += duration;
  summary.min = summary.min === null ? duration : Math.min(summary.min, duration);
  summary.max = summary.max === null ? duration : Math.max(summary.max, duration);
}

function publicRecoveryDurationSummary(summary) {
  return {
    sampleCount: summary.sampleCount,
    min: summary.min,
    average: summary.sampleCount ? Math.round(summary.total / summary.sampleCount) : null,
    max: summary.max,
  };
}

function deliveryDiagnosticsBucketStart(createdAt) {
  return new Date(Math.floor(createdAt.getTime() / DELIVERY_DIAGNOSTICS_BUCKET_MS) * DELIVERY_DIAGNOSTICS_BUCKET_MS);
}

function summarizeDeliveryDiagnostics(reports = []) {
  const groups = new Map();
  const summary = {
    diagnosticReportCount: 0,
    retryCount: 0,
    droppedOldest: 0,
    droppedStorage: 0,
    maxQueueDepth: 0,
    recoveryDurationMs: emptyRecoveryDurationSummary(),
    legacyElapsedDurationMs: emptyRecoveryDurationSummary(),
    attributedEpisodeCount: 0,
    recoveredInNewRuntimeCount: 0,
    recoveryClassificationCounts: {},
    evidenceQualityCounts: {},
    durationCompositionMs: emptyDurationComposition(),
  };

  reports.forEach((report) => {
    const createdAt = safeDate(report.createdAt);
    if (!createdAt) return;
    const platform = deliveryDiagnosticsPlatform(report);
    const sourceType = safeString(report.sourceType, 80, 'unknown');
    const sourceKey = safeString(report.sourceKey, 200, 'unknown');
    const reasonClass = deliveryDiagnosticsReasonClass(report);
    const httpStatusClass = deliveryDiagnosticsHttpStatusClass(report.lastError);
    const endpoint = safeString(report.endpoint, 40, 'unknown');
    const recoveryEpisode = deliveryDiagnosticsAttributedRecoveryEpisode(report);
    const recoveryClassification = recoveryEpisode
      ? classifyDeliveryRecoveryEpisode(recoveryEpisode)
      : 'legacy';
    const recoveryEvidenceQuality = recoveryEpisode
      ? deliveryRecoveryEvidenceQuality(recoveryEpisode)
      : 'legacy';
    const bucketStartAt = deliveryDiagnosticsBucketStart(createdAt);
    const bucketEndAt = new Date(bucketStartAt.getTime() + DELIVERY_DIAGNOSTICS_BUCKET_MS);
    const key = JSON.stringify([
      bucketStartAt.toISOString(),
      platform,
      sourceType,
      sourceKey,
      endpoint,
      reasonClass,
      httpStatusClass,
      recoveryClassification,
      recoveryEvidenceQuality,
    ]);
    const group = groups.get(key) || {
      startAt: bucketStartAt,
      endAt: bucketEndAt,
      source: { platform, sourceType, sourceKey },
      endpoint,
      reasonClass,
      httpStatusClass,
      recoveryClassification,
      recoveryEvidenceQuality,
      diagnosticReportCount: 0,
      retryCount: 0,
      droppedOldest: 0,
      droppedStorage: 0,
      maxQueueDepth: 0,
      recoveryDurationMs: emptyRecoveryDurationSummary(),
      legacyElapsedDurationMs: emptyRecoveryDurationSummary(),
      attributedEpisodeCount: 0,
      recoveredInNewRuntimeCount: 0,
      recoveryClassificationCounts: {},
      evidenceQualityCounts: {},
      durationCompositionMs: emptyDurationComposition(),
    };
    const recoveryDuration = recoveryEpisode?.totalDurationMs ?? null;
    const legacyElapsedDuration = deliveryDiagnosticsLegacyElapsedDuration(report, reasonClass);

    group.diagnosticReportCount += 1;
    group.retryCount += safeCount(report.retryCount);
    group.droppedOldest += safeCount(report.droppedOldest);
    group.droppedStorage += safeCount(report.droppedStorage);
    group.maxQueueDepth = Math.max(group.maxQueueDepth, safeCount(report.maxQueueDepth));
    addRecoveryDuration(group.recoveryDurationMs, recoveryDuration);
    addRecoveryDuration(group.legacyElapsedDurationMs, legacyElapsedDuration);
    if (recoveryDuration !== null) {
      group.attributedEpisodeCount += 1;
      group.recoveredInNewRuntimeCount += recoveryEpisode.recoveredInNewRuntime ? 1 : 0;
      incrementLabelCount(group.recoveryClassificationCounts, recoveryClassification);
      incrementLabelCount(group.evidenceQualityCounts, recoveryEvidenceQuality);
      addDurationComposition(group.durationCompositionMs, recoveryEpisode);
    }
    groups.set(key, group);

    summary.diagnosticReportCount += 1;
    summary.retryCount += safeCount(report.retryCount);
    summary.droppedOldest += safeCount(report.droppedOldest);
    summary.droppedStorage += safeCount(report.droppedStorage);
    summary.maxQueueDepth = Math.max(summary.maxQueueDepth, safeCount(report.maxQueueDepth));
    addRecoveryDuration(summary.recoveryDurationMs, recoveryDuration);
    addRecoveryDuration(summary.legacyElapsedDurationMs, legacyElapsedDuration);
    if (recoveryDuration !== null) {
      summary.attributedEpisodeCount += 1;
      summary.recoveredInNewRuntimeCount += recoveryEpisode.recoveredInNewRuntime ? 1 : 0;
      incrementLabelCount(summary.recoveryClassificationCounts, recoveryClassification);
      incrementLabelCount(summary.evidenceQualityCounts, recoveryEvidenceQuality);
      addDurationComposition(summary.durationCompositionMs, recoveryEpisode);
    }
  });

  function publicDiagnosticsAggregate(value) {
    const denominator = value.attributedEpisodeCount + value.legacyElapsedDurationMs.sampleCount;
    return {
      ...value,
      recoveryDurationMs: publicRecoveryDurationSummary(value.recoveryDurationMs),
      legacyElapsedDurationMs: {
        semantics: 'unattributed_wall_clock_elapsed',
        ...publicRecoveryDurationSummary(value.legacyElapsedDurationMs),
      },
      recoveryClassificationCounts: publicLabelCounts(value.recoveryClassificationCounts, 'classification'),
      evidenceQualityCounts: publicLabelCounts(value.evidenceQualityCounts, 'quality'),
      attributionCoverage: denominator ? value.attributedEpisodeCount / denominator : 0,
    };
  }

  return {
    summary: publicDiagnosticsAggregate(summary),
    buckets: [...groups.values()]
      .map(publicDiagnosticsAggregate)
      .sort((left, right) => (
        left.startAt - right.startAt
        || left.source.platform.localeCompare(right.source.platform)
        || left.source.sourceType.localeCompare(right.source.sourceType)
        || left.source.sourceKey.localeCompare(right.source.sourceKey)
        || left.endpoint.localeCompare(right.endpoint)
        || left.reasonClass.localeCompare(right.reasonClass)
        || left.httpStatusClass.localeCompare(right.httpStatusClass)
      )),
  };
}

async function readDeliveryDiagnostics(project, args = {}) {
  const now = new Date();
  const window = deliveryDiagnosticsWindow(args, now);
  const query = {
    projectId: project._id,
    createdAt: { $gte: window.startAt, $lt: window.endAt },
  };
  const sourceType = safeString(args.sourceType, 80).trim();
  const sourceKey = safeString(args.sourceKey, 200).trim();
  const endpoint = safeString(args.endpoint, 40).trim();
  const requestedPlatform = safeString(args.platform, 40).toLowerCase().trim();
  if (sourceType) query.sourceType = sourceType;
  if (sourceKey) query.sourceKey = sourceKey;
  if (endpoint && !['capture', 'presence', 'user_feedback'].includes(endpoint)) {
    throw new Meteor.Error('invalid-delivery-diagnostics-endpoint', 'endpoint is not supported.');
  }
  if (endpoint) query.endpoint = endpoint;
  if (requestedPlatform && !DELIVERY_DIAGNOSTICS_PLATFORMS.has(requestedPlatform)) {
    throw new Meteor.Error('invalid-delivery-diagnostics-platform', 'platform is not supported.');
  }
  if (requestedPlatform) query.$or = deliveryDiagnosticsPlatformQuery(requestedPlatform);

  const cursor = CaptureDeliveryReports.find(
    query,
    {
      sort: { createdAt: -1 },
      limit: DELIVERY_DIAGNOSTICS_MAX_REPORTS,
      fields: {
        platform: 1,
        sourceType: 1,
        sourceKey: 1,
        retryCount: 1,
        droppedOldest: 1,
        droppedStorage: 1,
        maxQueueDepth: 1,
        lastError: 1,
        lastFailedFlushAt: 1,
        endpoint: 1,
        deliveryEpisodeId: 1,
        recoveryDurationMs: 1,
        recoveryClassification: 1,
        recoveryEvidenceQuality: 1,
        recoveredInNewRuntime: 1,
        recoveryEpisode: 1,
        createdAt: 1,
      },
    },
  );
  const [matchedReportCount, reports] = await Promise.all([
    CaptureDeliveryReports.find(query).countAsync(),
    cursor.fetchAsync(),
  ]);
  const diagnostics = summarizeDeliveryDiagnostics(reports);

  return {
    ok: true,
    project: { _id: project._id, name: project.name },
    window,
    summary: diagnostics.summary,
    buckets: diagnostics.buckets,
    dataLimit: {
      matchedReportCount,
      analyzedReportCount: reports.length,
      maxReports: DELIVERY_DIAGNOSTICS_MAX_REPORTS,
      truncated: matchedReportCount > reports.length,
    },
  };
}

async function loadProjectPresenceSessions(project, limit = 500) {
  return PresenceSessions.find(
    { projectId: project._id },
    { sort: { lastSeenAt: -1 }, limit },
  ).fetchAsync();
}

function normalizeMcpReportDate(reportDateInput) {
  const reportDate = String(reportDateInput || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : reportDateForDate(new Date());
}

function projectHealthResult(project, reportDate, report, health = {}) {
  return {
    ok: true,
    project: { _id: project._id, name: project.name },
    reportDate,
    previousReportDate: health.window?.previousReportDate || '',
    timezone: report?.timezone || health.window?.timezone || 'Asia/Shanghai',
    status: report?.status || 'missing',
    computedAt: report?.computedAt || null,
    sourceWindow: report?.sourceWindow || null,
    health: {
      window: health.window || {},
      status: health.status || 'normal',
      attentionSummary: health.attentionSummary || '',
      attentionItems: health.attentionItems || [],
      captureScriptFindings: health.captureScriptFindings || health.current?.captureScriptFindings || [],
      sdkUpgradeFindings: health.sdkUpgradeFindings || health.current?.sdkUpgradeFindings || [],
      current: health.current || {},
      previous: health.previous || {},
      trends: health.trends || {},
      hourlyComparison: health.hourlyComparison || {},
    },
    delivery: report?.delivery || {},
    dataRetention: dataRetentionPolicyResult(),
    agentSetupNotice: agentSetupNotice(),
  };
}

async function readProjectHealth(project, args = {}) {
  const reportDate = normalizeMcpReportDate(args.reportDate);
  const now = new Date();
  queueProjectDailyHealthRefresh(project._id, reportDate, { now });
  const { report, health } = await resolveProjectDailyHealth(project._id, reportDate, { now });
  return projectHealthResult(project, reportDate, report, health);
}

function recentOnlineResult(project, recentOnline = {}) {
  return {
    ok: true,
    project: { _id: project._id, name: project.name },
    window: recentOnline.window || {},
    totalOnlineUsers: safeCount(recentOnline.totalOnlineUsers),
    buckets: (recentOnline.buckets || []).map((bucket) => ({
      startAt: bucket.startAt,
      endAt: bucket.endAt,
      onlineUsers: safeCount(bucket.onlineUsers),
    })),
    topRegions: (recentOnline.topRegions || []).map((item) => ({
      label: safeString(item.label, 120, 'Unknown'),
      count: safeCount(item.count),
    })),
    topDurationPaths: (recentOnline.topDurationPaths || []).map((item) => ({
      path: safeString(item.path, 300, '/'),
      durationMs: safeCount(item.durationMs),
      sessions: safeCount(item.sessions),
    })),
    topEvents: (recentOnline.topEvents || []).map((item) => ({
      label: safeString(item.label, 160, 'unknown_event'),
      count: safeCount(item.count),
    })),
  };
}

async function readRecentOnline(project) {
  return recentOnlineResult(project, await buildProjectRecentOnline(project));
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    isError: false,
  };
}

function agentSetupNotice(extra = {}) {
  return {
    guidanceVersion: AGENT_GUIDANCE_VERSION,
    resources: AGENT_GUIDANCE_RESOURCES,
    checkTool: AGENT_SETUP_CHECK_TOOL,
    recommendedAction: 'If local TraceMind Skill or AGENTS rules may be stale, read them and call tracemind.check_agent_setup before instrumentation or SDK setup; merge only missing guidance after user confirmation.',
    ...extra,
  };
}

function dataRetentionPolicyResult() {
  return {
    detailWindows: DATA_RETENTION_POLICY.detailWindows.map((item) => ({ ...item })),
    retainedSummaries: DATA_RETENTION_POLICY.retainedSummaries.map((item) => ({ ...item })),
    note: DATA_RETENTION_POLICY.note,
  };
}

function guidanceResult(extra = {}) {
  return {
    ok: true,
    guidanceVersion: AGENT_GUIDANCE_VERSION,
    resources: AGENT_GUIDANCE_RESOURCES,
    agentSetupNotice: agentSetupNotice(),
    dataRetention: dataRetentionPolicyResult(),
    availableCapabilities: availableCapabilitiesResult(),
    analysisWorkflows: [
      {
        name: 'Daily operations review',
        prompt: 'Review the Dashboard-aligned daily health report, trend changes, attention items, traffic, active users, sessions, active time, events, and delivery health.',
        steps: ['tracemind.project_info', MCP_TOOL_DISCOVERY_RECOVERY_STEP, 'tracemind.project_health', 'tracemind.recent_online if the user asks about current online users or the last 30 minutes', 'tracemind.summary/query_events only for non-natural-day windows or evidence drilldown', 'treat tracemind.summary totals as sample-derived when used for fallback evidence'],
      },
      {
        name: 'Last 24 hours operations review',
        prompt: 'Summarize product performance for a rolling 24 hour window when the user asks for the past day rather than a natural daily report.',
        steps: ['tracemind.project_info', 'tracemind.summary with startAt/endAt', 'tracemind.query_events if evidence or path/action/source drilldown is needed'],
      },
      {
        name: 'Recent online review',
        prompt: 'Check whether users are online right now, where they are active, and which events are happening in the last 30 minutes.',
        steps: ['tracemind.project_info', 'tracemind.recent_online', 'tracemind.query_events if drilldown is needed'],
      },
      {
        name: 'Traffic source review',
        prompt: 'Explain which traffic sources, campaigns, referrers, or landing paths are driving growth, conversion, or drops.',
        steps: ['tracemind.project_info', 'tracemind.project_health', 'tracemind.summary with attributionSource/attributionMedium/attributionCampaign/landingPath filters', 'tracemind.query_events for source-specific evidence', 'tracemind.query_raw_behaviors only when semantic evidence is insufficient'],
      },
      {
        name: 'Feature usage analysis',
        prompt: 'Analyze whether a feature is actually being used, who uses it, and which paths or actions lead to it.',
        steps: ['tracemind.project_info', 'tracemind.project_health', 'tracemind.summary with event/path/traffic attribution filters', 'tracemind.query_events by path, actionKey, targetHash, eventName, attributionSource, attributionMedium, attributionCampaign, or landingPath'],
      },
      {
        name: 'Anomaly or drop investigation',
        prompt: 'Investigate why active users, sessions, events, conversion intent, or upload health dropped for a selected day.',
        steps: ['tracemind.project_info', 'tracemind.project_health', 'tracemind.query_delivery_diagnostics for recent delivery retry/drop/root-cause drilldown', 'tracemind.query_events for affected window', 'tracemind.query_raw_behaviors only when semantic evidence is insufficient'],
      },
    ],
    workflow: [
      'Call tracemind.agent_guidance before TraceMind instrumentation work.',
      'If multiple TraceMind MCP servers exist or the project is unclear, call tracemind.project_info first.',
      'Use availableCapabilities.currentOnline for current online users, real-time users, active now, active pages, and last 30 minutes activity; its canonical tool is tracemind.recent_online and it is not replaced by tracemind.summary.',
      'Use availableCapabilities.projectHealth for product health, today health, daily health, delivery health, trend changes, attention items, and change verification; its canonical tool is tracemind.project_health and it is not replaced by tracemind.summary or tracemind.query_events.',
      'Use tracemind.query_delivery_diagnostics for privacy-safe hourly source/platform, reason class, HTTP status class, queue depth, and recovery-duration drilldown within the 7-day delivery-detail window; do not expose raw errors, request/response bodies, URLs, logs, or user content.',
      'For operations review, use Dashboard-aligned tracemind.project_health and tracemind.recent_online before instrumentation setup.',
      'Only call tracemind.capture_setup when installing, upgrading, or changing TraceMind capture code.',
      'For product behavior analysis, use tracemind.project_health for daily health and tracemind.recent_online for real-time online status, then use tracemind.summary and tracemind.query_events for evidence drilldown.',
      'Treat tracemind.summary results as sampled evidence: summary.totalEvents, topActions, and dailyActiveUsers are derived from the returned semantic-event sample, not full-day totals. Prefer topIntentActions for user-intent interpretation; use topFieldInteractions to explain high-frequency input or editable-field noise.',
      'For traffic source analysis, use project_health traffic source summaries first, then drill down with attributionSource, attributionMedium, attributionCampaign, and landingPath filters in tracemind.summary, tracemind.query_events, or tracemind.query_raw_behaviors.',
      'Respect data retention windows: capture delivery diagnostics are retained for 7 days; presence sessions, raw behaviors, and semantic events are retained for 10 days. If event or raw detail is unavailable outside those windows, use daily/hourly project_health reports before assuming data loss.',
      'Call tracemind.capture_setup with platform web, ios, macos, android, react_native, hybrid, mini_program, browser_extension, mcp_node, mcp_python, agent_skill, server_node, server_python, or server_http before installing Auto Capture or adding manual events.',
      'Use capture_setup installCommands, filesToEdit, initLocation, idempotencyChecks, and initSnippet for platform setup.',
      'For server_node, server_python, and server_http setup, use capture_setup projectKeyUsage, configurationModes, preDeployChecks, postDeployVerification, and expectedCaptureQuery before judging deployment success or inactivity.',
      'For SDK platforms, use capture_setup latestSdk, installedVersionDetection, installedSdkManifest, upgradeCommands, and verificationCommands; write .tracemind-sdk.json for local_source vendored installs and compare contentHash instead of relying only on displayVersion.',
      'When project_health returns sdkUpgradeFindings, update the vendored SDK through the coding agent workflow rather than silently editing customer code.',
      'When project_health returns captureScriptFindings, call tracemind.capture_setup({ platform: "web" }), replace fixed or self-hosted Web scripts with the returned stable captureScriptUrl snippet, check CDN/service worker/WebView caches, verify window.TraceMind.status().scriptReleaseId, then re-check project_health.',
      'Use capture_setup trafficAttribution guidance before adding source-related manual events or URL/deeplink handlers.',
      'If setup succeeds but no data appears, check platform loading and network restrictions such as Web CSP, iOS/macOS ATS, Android network security, React Native native linking, Hybrid WebView bridge/storage rules, Mini Program request domain allowlists, Browser Extension host permissions/CSP/service worker context, and server egress/proxy/TLS policy.',
      'Verify existing Auto Capture initialization before editing so the agent does not add duplicate setup.',
      'Search existing events before adding a custom event.',
      'Validate payloads and diffs before finishing.',
      'If local TraceMind Skill or AGENTS rules may be stale, call tracemind.check_agent_setup with the local file content before editing instrumentation or SDK setup.',
      MCP_TOOL_DISCOVERY_RECOVERY_GUIDANCE,
      MCP_TOOL_DISCOVERY_FALLBACK_GUIDANCE,
      'When the developer reports a product issue or idea, ask whether they want to submit feedback unless they explicitly asked you to submit it.',
      'If the developer asks whether you can directly feedback to TraceMind, look for and use tracemind.submit_feedback instead of concluding from a partial active tool list that no feedback tool exists.',
      'Before calling tracemind.submit_feedback, collect a short sanitized summary plus TraceMind evidence references such as event ids, raw behavior ids, paths, actionKeys, targetHashes, and time window.',
      'Prefer evidence references over raw copied content, screenshots, source diffs, raw prompts, tool arguments, tool results, request bodies, response bodies, headers, cookies, authorization values, or full query URLs.',
      'When implementing an end-user feedback entry in a customer app, use the SDK user feedback API: TraceMind.submitFeedback / window.TraceMind.submitFeedback / TraceMindServer.submitFeedback. Do not use /api/capture, capture("custom"), or tracemind.submit_feedback for terminal user feedback.',
      'For terminal user feedback triage, use tracemind.query_user_feedback to read reports and tracemind.update_user_feedback to update status, notes, resolution, linkedIssueUrl, or duplicateOf.',
      'Ask the user before updating local skill or instruction files; merge missing TraceMind guidance instead of overwriting custom rules.',
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

function setupCheckContent(value) {
  return String(value || '').slice(0, AGENT_SETUP_CONTENT_LIMIT);
}

function parseManifestGuidanceVersion(manifestContent) {
  if (!manifestContent) return '';
  try {
    const manifest = JSON.parse(manifestContent);
    return safeString(manifest.guidanceVersion, 80);
  } catch (error) {
    return '';
  }
}

function extractGuidanceVersion(skillContent, manifestContent, combinedContent) {
  const skillMatch = skillContent.match(/\bversion:\s*[`'"]?(\d{4}\.\d{2}\.\d{2}\.\d+)[`'"]?/i);
  if (skillMatch) return skillMatch[1];

  const manifestVersion = parseManifestGuidanceVersion(manifestContent);
  if (manifestVersion) return manifestVersion;

  const combinedMatch = combinedContent.match(/\bguidanceVersion\b[^0-9]{0,20}(\d{4}\.\d{2}\.\d{2}\.\d+)/);
  return combinedMatch ? combinedMatch[1] : '';
}

function compareGuidanceVersions(a, b) {
  const left = String(a || '').split('.').map((item) => Number(item) || 0);
  const right = String(b || '').split('.').map((item) => Number(item) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] || 0) < (right[index] || 0)) return -1;
    if ((left[index] || 0) > (right[index] || 0)) return 1;
  }
  return 0;
}

function contentHasPattern(content, patterns) {
  return patterns.some((pattern) => pattern.test(content));
}

function detectSensitiveAgentSetupContent(findings, contents) {
  Object.entries(contents).forEach(([path, content]) => {
    if (!content) return;
    const hasSensitiveContent = [
      /tm_mcp_[A-Za-z0-9._-]+/i,
      /bearer\s+[A-Za-z0-9._~+/=-]{6,}/i,
      /tm_proj_[A-Za-z0-9._-]+/i,
      /https?:\/\/[^\s`"']+\/mcp\?[^\s`"']*(?:mcpToken|token)=/i,
      /\b(api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\b\s*[:=]/i,
    ].some((pattern) => pattern.test(content));

    if (hasSensitiveContent) {
      addFinding(
        findings,
        'warning',
        'sensitive_content_present',
        'Local agent setup content appears to include MCP URLs, tokens, project keys, or secret-like values. Keep credentials out of committed instruction files.',
        path,
      );
    }
  });
}

function checkAgentSetupResult(args = {}) {
  const input = args && typeof args === 'object' ? args : {};
  const skillContent = setupCheckContent(input.skillContent);
  const agentInstructionContent = setupCheckContent(input.agentInstructionContent);
  const manifestContent = setupCheckContent(input.manifestContent);
  const combinedContent = [skillContent, agentInstructionContent, manifestContent].filter(Boolean).join('\n');
  const fileHintCount = Array.isArray(input.fileHints) ? input.fileHints.filter(Boolean).slice(0, 20).length : 0;
  const findings = [];

  detectSensitiveAgentSetupContent(findings, {
    skillContent,
    agentInstructionContent,
    manifestContent,
  });

  if (!combinedContent.trim()) {
    addFinding(
      findings,
      'info',
      'no_agent_setup_content',
      'No local TraceMind Skill, AGENTS rules, or manifest content was provided. Read the local files and call this tool again.',
    );
    return {
      ok: true,
      guidanceVersion: AGENT_GUIDANCE_VERSION,
      status: 'unknown',
      installedGuidanceVersion: null,
      findings,
      recommendedActions: [
        'Read the local TraceMind Skill file if one is installed.',
        'Read project instruction files such as AGENTS.md, CLAUDE.md, .cursorrules, or Codex rules.',
        'Read a local .tracemind-sdk.json or TraceMind manifest if present.',
        'Call tracemind.check_agent_setup again with the file contents before changing instrumentation or SDK setup.',
      ],
      resources: AGENT_GUIDANCE_RESOURCES,
      fileHintCount,
      agentSetupNotice: agentSetupNotice({ status: 'unknown' }),
      safeUpdateInstructions: AGENT_SETUP_SAFE_UPDATE_INSTRUCTIONS,
    };
  }

  if (!skillContent && !agentInstructionContent) {
    addFinding(
      findings,
      'warning',
      'agent_rules_missing',
      'No local TraceMind Skill or AGENTS-style instruction content was provided.',
    );
  }

  const installedGuidanceVersion = extractGuidanceVersion(skillContent, manifestContent, combinedContent) || null;
  if (!installedGuidanceVersion) {
    addFinding(
      findings,
      'warning',
      'guidance_version_missing',
      'Local TraceMind rules do not include a detectable guidance version.',
    );
  } else if (compareGuidanceVersions(installedGuidanceVersion, AGENT_GUIDANCE_VERSION) < 0) {
    addFinding(
      findings,
      'warning',
      'skill_version_outdated',
      `Local TraceMind guidance version is older than ${AGENT_GUIDANCE_VERSION}.`,
    );
  }

  [
    {
      code: 'missing_agent_guidance_check',
      message: 'Local rules should call tracemind.agent_guidance before TraceMind instrumentation or SDK setup work.',
      patterns: [/tracemind\.agent_guidance/],
    },
    {
      code: 'missing_agent_setup_check',
      message: 'Local rules should call tracemind.check_agent_setup when the installed TraceMind Skill or AGENTS rules may be stale.',
      patterns: [/tracemind\.check_agent_setup/],
    },
    {
      code: 'missing_capture_setup',
      message: 'Local rules should call tracemind.capture_setup before installing SDKs or adding manual capture.',
      patterns: [/tracemind\.capture_setup/],
    },
    {
      code: 'missing_registry_guidance',
      message: 'Local rules should use registry install commands when capture_setup returns distributionMode: "registry".',
      patterns: [/distributionMode[^.\n]{0,80}registry/i, /registry install/i, /npm[\s\S]{0,80}PyPI[\s\S]{0,80}Maven Central/i],
    },
    {
      code: 'missing_server_deploy_verification',
      message: 'Local rules should run capture_setup preDeployChecks and postDeployVerification for server_node, server_python, and server_http setup.',
      patterns: [
        /server_node[\s\S]{0,160}server_python[\s\S]{0,160}server_http[\s\S]{0,240}preDeployChecks[\s\S]{0,120}postDeployVerification/i,
        /preDeployChecks[\s\S]{0,120}postDeployVerification[\s\S]{0,160}server/i,
      ],
    },
    {
      code: 'missing_project_key_usage_guidance',
      message: 'Local rules should separate the returned public projectKey from MCP tokens, Bearer tokens, and TraceMind internal dogfood configuration.',
      patterns: [
        /public\s+projectKey[\s\S]{0,120}capture writes[\s\S]{0,160}(MCP token|Bearer token)[\s\S]{0,180}(dogfood|internal product usage)/i,
        /projectKey[\s\S]{0,160}(MCP token|Bearer token)[\s\S]{0,180}(dogfood|internal product usage)/i,
      ],
    },
    {
      code: 'missing_source_ref_guidance',
      message: 'Local rules should treat latestSdk.sourceRef as the immutable SDK source reference for local-source fallback installs.',
      patterns: [/latestSdk\.sourceRef/],
    },
    {
      code: 'missing_content_hash_guidance',
      message: 'Local rules should compare latestSdk.contentHash or sourceDetails.sdkContentHash instead of relying only on displayVersion.',
      patterns: [/contentHash/, /sdkContentHash/],
    },
    {
      code: 'missing_web_script_update_guidance',
      message: 'Local rules should tell agents to handle project_health captureScriptFindings by refreshing Web Auto Capture through capture_setup and verifying window.TraceMind.status().scriptReleaseId.',
      patterns: [/captureScriptFindings[\s\S]{0,240}window\.TraceMind\.status\(\)[\s\S]{0,120}scriptReleaseId/i],
    },
    {
      code: 'missing_mcp_tool_discovery_recovery_guidance',
      message: 'Local rules should tell agents to recover from partial MCP tool discovery by reading tools/list or retrying exact tool discovery before concluding reporting tools are unavailable.',
      patterns: [
        /active tool list[\s\S]{0,220}project_health[\s\S]{0,160}recent_online[\s\S]{0,220}(query_raw_behaviors|submit_feedback)[\s\S]{0,260}tools\/list[\s\S]{0,180}exact tool name[\s\S]{0,320}summary\.limit/i,
        /reporting tools[\s\S]{0,180}project_health[\s\S]{0,160}recent_online[\s\S]{0,220}(query_raw_behaviors|submit_feedback)[\s\S]{0,260}active tool list[\s\S]{0,180}tools\/list[\s\S]{0,180}exact tool name[\s\S]{0,320}summary\.limit/i,
        /tools\/list[\s\S]{0,180}exact tool name[\s\S]{0,260}project_health[\s\S]{0,160}recent_online[\s\S]{0,220}(query_raw_behaviors|submit_feedback)[\s\S]{0,320}summary\.limit/i,
      ],
    },
    {
      code: 'missing_delivery_diagnostics_guidance',
      message: 'Local rules should use tracemind.query_delivery_diagnostics for privacy-safe recent delivery drilldown and preserve its 7-day and no-raw-content boundaries.',
      patterns: [
        /query_delivery_diagnostics[\s\S]{0,360}(7 days|7-day|7 天)[\s\S]{0,420}(raw errors|raw error|原始错误)[\s\S]{0,420}(request\/response bodies|request or response bodies|请求\/响应体)/i,
        /query_delivery_diagnostics[\s\S]{0,360}(privacy-safe|脱敏|隐私安全)[\s\S]{0,420}(7 days|7-day|7 天)[\s\S]{0,420}(raw errors|raw error|原始错误)/i,
      ],
    },
    {
      code: 'missing_summary_sample_guidance',
      message: 'Local rules should tell agents that tracemind.summary totals are sample-derived and should be interpreted through summarySample.',
      patterns: [
        /summarySample[\s\S]{0,180}(sample-derived|sampled|样本)/i,
        /tracemind\.summary[\s\S]{0,180}(sample-derived|sampled|样本)[\s\S]{0,180}summarySample/i,
      ],
    },
    {
      code: 'missing_project_binding',
      message: 'Local rules should include TraceMind project binding checks with Project ID, expected MCP server, and tracemind.project_info verification.',
      patterns: [/TraceMind Project Binding/i, /TraceMind project binding/i, /Project ID[\s\S]{0,240}Expected MCP server/i],
    },
  ].forEach((check) => {
    if (!contentHasPattern(combinedContent, check.patterns)) {
      addFinding(findings, 'warning', check.code, check.message);
    }
  });

  if (/(^|\n)\s*-?\s*Expected MCP server:\s*`?tracemind`?\s*(\n|$)/i.test(combinedContent)
    || /MCP server named [`'"]?tracemind[`'"]?/i.test(combinedContent)) {
    addFinding(
      findings,
      'warning',
      'old_mcp_server_name',
      'Local rules appear to reference the old shared MCP server name "tracemind"; prefer the project-scoped tracemind-<project-code> name and verify with tracemind.project_info.',
    );
  }

  const findingCodes = new Set(findings.map((finding) => finding.code));
  const status = findingCodes.has('agent_rules_missing')
    ? 'missing'
    : findingCodes.has('skill_version_outdated')
      ? 'outdated'
      : [...findingCodes].some((code) => code.startsWith('missing_') || code === 'guidance_version_missing' || code === 'sensitive_content_present' || code === 'old_mcp_server_name')
        ? 'incomplete'
        : 'current';

  const recommendedActions = [];
  if (status === 'missing') {
    recommendedActions.push('Read the public TraceMind Skill and AGENTS snippet, then install or merge them into the customer project with user approval.');
  }
  if (status === 'outdated') {
    recommendedActions.push('Read the current public TraceMind Skill and AGENTS snippet, then merge only the missing guidance into the local files.');
  }
  if (status === 'incomplete') {
    recommendedActions.push('Patch only the missing TraceMind rules listed in findings; do not append a duplicate full block.');
  }
  if (findingCodes.has('sensitive_content_present')) {
    recommendedActions.push('Remove committed MCP URLs, tokens, project keys, and secret-like values from local instruction files.');
  }
  if (findingCodes.has('old_mcp_server_name')) {
    recommendedActions.push('Prefer a project-scoped MCP server name such as tracemind-<project-code> and verify the binding with tracemind.project_info.');
  }
  if (findingCodes.has('missing_server_deploy_verification')) {
    recommendedActions.push('Add server setup guidance that runs capture_setup preDeployChecks before deploy and postDeployVerification after a real business event.');
  }
  if (findingCodes.has('missing_project_key_usage_guidance')) {
    recommendedActions.push('Clarify that customer server capture uses the returned public projectKey, not MCP tokens, Bearer tokens, or TraceMind internal dogfood configuration.');
  }
  if (findingCodes.has('missing_web_script_update_guidance')) {
    recommendedActions.push('Add Web Auto Capture update guidance for captureScriptFindings, returned stable captureScriptUrl, CDN/service worker/WebView cache checks, and window.TraceMind.status().scriptReleaseId verification.');
  }
  if (findingCodes.has('missing_mcp_tool_discovery_recovery_guidance')) {
    recommendedActions.push('Add MCP tool discovery recovery guidance for missing reporting tools including project_health and recent_online: read tools/list or retry exact tool discovery, refresh connector/session/MCP config/token if needed, and do not increase summary.limit as a substitute for current online or project health.');
  }
  if (findingCodes.has('missing_delivery_diagnostics_guidance')) {
    recommendedActions.push('Add tracemind.query_delivery_diagnostics guidance for privacy-safe 7-day hourly source/platform, reason, HTTP status, queue-depth, and recovery-duration drilldown without raw errors, bodies, URLs, logs, or user content.');
  }
  if (findingCodes.has('missing_summary_sample_guidance')) {
    recommendedActions.push('Add summarySample guidance: tracemind.summary totals are sample-derived and full-day metrics should come from tracemind.project_health.');
  }
  recommendedActions.push('Call tracemind.agent_guidance to confirm the current authority version before instrumentation work.');
  recommendedActions.push('Call tracemind.capture_setup for the target platform and use registry install commands when distributionMode is registry.');

  return {
    ok: true,
    guidanceVersion: AGENT_GUIDANCE_VERSION,
    status,
    installedGuidanceVersion,
    findings,
    recommendedActions,
    resources: AGENT_GUIDANCE_RESOURCES,
    fileHintCount,
    agentSetupNotice: agentSetupNotice({ status }),
    safeUpdateInstructions: AGENT_SETUP_SAFE_UPDATE_INSTRUCTIONS,
  };
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
  'For app_error, capture only sanitized summary fields such as errorKind, errorType, messageFingerprint, messagePreview, stackFingerprint, topFrameFingerprint, causeType, causeFingerprint, fatal, handled, source, path/screen, release, component, operation, feature, routeName, correlationId, requestId, httpStatus, status, and occurredAt; do not capture raw stacks, logs, source code, request/response bodies, headers, cookies, auth values, screenshots, recordings, or raw messages.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in app code.',
];

const MCP_PRIVACY_CONSTRAINTS = [
  'Do not capture raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs.',
  'Capture only safe MCP metadata such as tool/resource/prompt names, status, duration, error type, size buckets, and sanitized primitive custom fields.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in MCP server or Skill runtime code.',
];

const SERVER_PRIVACY_CONSTRAINTS = [
  'Do not capture request body, response body, headers, cookies, authorization values, secrets, tokens, raw prompts, raw user content, or full query URLs.',
  'For app_error, capture only sanitized summary fields, sanitized messagePreview, and irreversible fingerprints; do not capture raw stack traces, raw logs, request/response bodies, headers, cookies, auth values, or raw messages.',
  'Capture only stable business outcomes with sanitized primitive properties and context.',
  'Use the returned public projectKey only for capture writes; never use an MCP token in server application code.',
];

const TRAFFIC_ATTRIBUTION_FIELDS = [
  'source',
  'medium',
  'campaign',
  'content',
  'referrerDomain',
  'referrerType',
  'landingPath',
  'gclidPresent',
  'fbclidPresent',
  'msclkidPresent',
];

const TRAFFIC_ATTRIBUTION_ANALYSIS_FILTERS = [
  'attributionSource',
  'attributionMedium',
  'attributionCampaign',
  'landingPath',
];

const TRAFFIC_ATTRIBUTION_PRIVACY_CONSTRAINTS = [
  'Do not capture utm_term, arbitrary ref parameters, full URLs with query strings, search terms, click IDs, emails, tokens, secrets, raw prompts, or raw user content.',
  'Use only whitelisted source/medium/campaign/content fields, safe referrer domain/type, landing path without query string, and boolean click-id-present markers.',
  'Keep sourceType/sourceKey for capture runtime governance; use attribution only for product traffic acquisition analysis.',
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

const HYBRID_NETWORK_RESTRICTION_CHECKS = [
  ...WEB_NETWORK_RESTRICTION_CHECKS,
  ...IOS_NETWORK_RESTRICTION_CHECKS,
  ...ANDROID_NETWORK_RESTRICTION_CHECKS,
  'Confirm the WebView enables JavaScript and DOM storage/localStorage so the Web Auto Capture queue and identity store can work.',
  'Confirm WebView navigation, deeplink, and bridge code pass only sanitized route/source metadata and never raw input values, cookies, tokens, or page content.',
];

const MINI_PROGRAM_AUTO_CAPTURE_SIGNALS = [
  'mini program app/session start',
  'app show/hide foreground and background lifecycle',
  'page view and page show/hide',
  'route/page path without query strings',
  'presence heartbeat for foreground online intervals',
  'tap/input/submit only when developers call helper functions from event handlers',
];

const BROWSER_EXTENSION_AUTO_CAPTURE_SIGNALS = [
  'extension UI start for popup/options/sidebar/devtools pages',
  'extension-owned page view',
  'click on extension-owned UI elements',
  'input changed without input values',
  'submit from extension-owned forms',
  'extension-owned JavaScript error and unhandled rejection summaries as app_error without stack traces',
  'extension UI route/path without query strings',
  'presence heartbeat for foreground extension-owned UI pages',
  'background/service worker manual capture only',
];

const BROWSER_EXTENSION_MANIFEST_PERMISSIONS = [
  'Add the TraceMind HTTPS origin to host_permissions or extension CSP connect-src so /api/capture, /api/presence, and /api/user-feedback can be reached.',
  'Do not request tabs/history/bookmarks/cookies permissions for TraceMind V1 instrumentation.',
  'Initialize the SDK from extension-owned popup/options/sidebar/devtools pages and from background/service worker only for manual capture.',
];

const BROWSER_EXTENSION_NETWORK_RESTRICTION_CHECKS = [
  'Confirm manifest host_permissions or content_security_policy allows HTTPS requests to the TraceMind endpoint.',
  'Confirm background service worker code does not rely on DOM auto capture; only manual capture, identify, submitFeedback, and flush are available there.',
  'Confirm popup/options/sidebar/devtools pages call TraceMind.start before the first user interaction.',
  'Confirm content scripts do not inject no-code host-page capture in V1 and do not read page content, cookies, input values, or full tab URLs.',
];

function miniProgramNetworkRestrictionChecks(provider = 'wechat') {
  const apiName = MINI_PROGRAM_PROVIDER_API_NAMES[provider] || 'host';
  const label = MINI_PROGRAM_PROVIDER_LABELS[provider] || 'Mini Program host';
  return [
    `Confirm ${label} request domain allowlist includes the TraceMind HTTPS endpoint before relying on ${apiName}.request uploads.`,
    `Confirm ${apiName}.request is available in the mini program runtime and not blocked by dev/prod environment settings.`,
    'Confirm local storage APIs are available so anonymous/device IDs and retry state can persist across launches.',
    'Confirm lifecycle wrappers are installed in App and Page entrypoints before testing app/page show and hide events.',
  ];
}

const SERVER_NETWORK_RESTRICTION_CHECKS = [
  'Check egress firewall, VPC, security group, DNS, proxy, and TLS CA bundle policy allow outbound HTTPS to the TraceMind capture endpoint.',
  'Check the backend HTTP client sets Content-Type: application/json, has reasonable timeout/retry behavior, and sends the sanitized payload returned by capture_setup.',
];

const MCP_RUNTIME_NETWORK_RESTRICTION_CHECKS = [
  ...SERVER_NETWORK_RESTRICTION_CHECKS,
  'For MCP and Agent Skill instrumentation, confirm capture code runs in executable server/runtime hooks, not only in a static SKILL.md document.',
];

function trafficAttributionGuidance(platform = 'web') {
  const base = {
    fields: TRAFFIC_ATTRIBUTION_FIELDS,
    analysisFilters: TRAFFIC_ATTRIBUTION_ANALYSIS_FILTERS,
    privacyConstraints: TRAFFIC_ATTRIBUTION_PRIVACY_CONSTRAINTS,
    manualCaptureGuidance: [
      'For product apps, set attribution before manual business events when conversion or funnel analysis needs acquisition channel context.',
      'For Web, Auto Capture persists first-touch attribution for the browser visit and attaches it to page, presence, interaction, and manual custom events.',
      'For native and React Native, call the URL/deeplink helper when the app opens from a universal link, app link, custom scheme, or another app; use setAttribution only for already-sanitized custom source settings.',
      'Do not store traffic source only in context.source when it should be available to MCP attribution filters and health summaries.',
    ],
  };
  const byPlatform = {
    web: {
      platformNotes: [
        'Web Auto Capture derives first-touch attribution from whitelisted UTM params, referrer domain/type, landing path, and boolean click markers.',
        'Web strips query strings from captured paths and never stores full landing URLs or click IDs.',
      ],
      setupExamples: [
        'Install captureSnippet. No manual traffic attribution code is needed for ordinary Web UTM/referrer tracking.',
        'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { success: true } }) // current visit attribution is attached automatically',
      ],
    },
    ios: {
      platformNotes: [
        'iOS records traffic attribution when the app opens from universal links, custom URL schemes, or another source application.',
        'Call TraceMind.recordOpenURL from SwiftUI onOpenURL, UIApplicationDelegate URL handlers, SceneDelegate URL contexts, or universal links handling before capture events fire.',
      ],
      setupExamples: [
        'TraceMind.recordOpenURL(url, sourceApplication: sourceApplication)',
        'TraceMind.setAttribution(TraceMindAttribution(source: "partner", medium: "universal_link", campaign: "launch", landingPath: "/invite", referrerType: "external"))',
      ],
    },
    macos: {
      platformNotes: [
        'macOS uses the same Swift attribution helpers for custom URL schemes, universal links, and app handoff flows when the app can observe the opened URL.',
      ],
      setupExamples: [
        'TraceMind.recordOpenURL(url, sourceApplication: sourceApplication)',
        'TraceMind.setAttribution(TraceMindAttribution(source: "partner", medium: "deeplink", campaign: "launch", landingPath: "/invite", referrerType: "external"))',
      ],
    },
    android: {
      platformNotes: [
        'Android records traffic attribution from app links, custom schemes, Activity intent data, Activity referrer, or an explicit source package.',
        'The SDK attempts to read Activity intent/referrer on creation; call TraceMind.recordDeepLink from explicit app links or deeplink routing code when the app updates intent data later.',
      ],
      setupExamples: [
        'TraceMind.recordDeepLink(url = intent.data?.toString(), referrer = referrer?.toString(), sourcePackage = callingPackage)',
        'TraceMind.setAttribution(TraceMindAttribution.sanitized(source = "partner", medium = "deeplink", campaign = "launch", landingPath = "/invite", referrerType = "external"))',
      ],
    },
    react_native: {
      platformNotes: [
        'React Native uses native attribution helpers under the bridge while events remain platform ios or android.',
        'Use native attribution helpers through TraceMind.recordDeepLink from Linking.getInitialURL and Linking URL subscriptions, or TraceMind.setAttribution for sanitized custom source settings.',
      ],
      setupExamples: [
        'TraceMind.recordDeepLink({ url, referrer, sourcePackage })',
        'TraceMind.setAttribution({ source: "partner", medium: "deeplink", campaign: "launch", landingPath: "/invite", referrerType: "external" })',
      ],
    },
    hybrid: {
      platformNotes: [
        'Hybrid apps use Web first-touch attribution inside the WebView and native URL/deeplink helpers in the shell.',
        'Keep events on their owning runtime: WebView events remain web, while shell events remain ios, android, or macos.',
        'Pass only sanitized route/source metadata across the native-WebView bridge.',
      ],
      setupExamples: [
        'Install captureSnippet in the WebView document and TraceMind.start in the native shell startup.',
        'Call window.TraceMind.identify and native TraceMind.identify with the same stable internal userId after login.',
        'Use TraceMind.recordOpenURL or TraceMind.recordDeepLink in the native shell when the hybrid app opens from a link.',
      ],
    },
    mini_program: {
      platformNotes: [
        'Mini Program SDKs do not receive browser referrer or DOM URLs; use setAttribution only with already-sanitized campaign, scene, QR, share, or channel metadata.',
        'Mini Program page paths strip query strings before capture; sourceDetails.provider records the host such as wechat, alipay, douyin, or dingtalk.',
      ],
      setupExamples: [
        'TraceMind.setAttribution({ source: "partner", medium: "mini_program", campaign: "launch", landingPath: "/pages/invite/index" })',
        'TraceMind.capture("custom", { eventName: approvedEventName, properties: { success: true } })',
      ],
    },
    browser_extension: {
      platformNotes: [
        'Browser Extension attribution should describe sanitized product acquisition or extension workflow source, not host-page content.',
        'Extension UI paths strip query strings; sourceDetails.browser, manifestVersion, runtimeContext, and sdkVersion describe the extension runtime.',
      ],
      setupExamples: [
        'TraceMind.setAttribution({ source: "chrome-web-store", medium: "extension", campaign: "launch", landingPath: "/popup.html" })',
        'TraceMind.capture("custom", { eventName: approvedEventName, properties: { success: true } })',
      ],
    },
    server_node: {
      platformNotes: [
        'Ordinary server apps should not infer user traffic source automatically in v1.',
        'If a server-side business event needs source analysis, pass only an already-sanitized attribution object that came from product traffic context.',
      ],
      setupExamples: [
        'TraceMindServer.capture("custom", { eventName: approvedEventName, attribution: { source: "partner", medium: "referral", campaign: "launch", landingPath: "/invite" } })',
      ],
    },
    server_python: {
      platformNotes: [
        'Ordinary server apps should not infer user traffic source automatically in v1.',
        'If a server-side business event needs source analysis, pass only an already-sanitized attribution object that came from product traffic context.',
      ],
      setupExamples: [
        'TraceMindServer.capture("custom", event_name=approved_event_name, attribution={"source": "partner", "medium": "referral", "campaign": "launch", "landingPath": "/invite"})',
      ],
    },
    server_http: {
      platformNotes: [
        'Direct HTTP capture may include attribution only when the caller already has sanitized product traffic context.',
      ],
      setupExamples: [
        'Include "attribution": { "source": "partner", "medium": "referral", "campaign": "launch", "landingPath": "/invite" } in the safe /api/capture payload.',
      ],
    },
    mcp_node: {
      platformNotes: [
        'MCP sourceType/sourceKey describes the tool runtime, not product traffic acquisition.',
        'Use attribution filters only when analyzing captured product app events, not to label MCP tool calls as marketing traffic.',
      ],
      setupExamples: [
        'Use tracemind.summary/query_events filters: { "attributionSource": "partner", "attributionCampaign": "launch" }',
      ],
    },
    mcp_python: {
      platformNotes: [
        'MCP sourceType/sourceKey describes the tool runtime, not product traffic acquisition.',
        'Use attribution filters only when analyzing captured product app events, not to label MCP tool calls as marketing traffic.',
      ],
      setupExamples: [
        'Use tracemind.summary/query_events filters: { "attributionSource": "partner", "attributionCampaign": "launch" }',
      ],
    },
    agent_skill: {
      platformNotes: [
        'Agent Skill sourceType/sourceKey describes the agent runtime, not product traffic acquisition.',
        'Coding agents should use attribution filters when analyzing product growth, funnels, or drops by channel.',
      ],
      setupExamples: [
        'Ask MCP for tracemind.project_health first, then drill down with tracemind.summary/query_events filters such as attributionSource, attributionMedium, attributionCampaign, or landingPath.',
      ],
    },
  };

  return {
    ...base,
    ...(byPlatform[platform] || byPlatform.web),
  };
}

function serverProjectKeyUsage() {
  return {
    tokenType: 'public_auto_capture_project_key',
    recommendedStorage: 'inline_project_key',
    forbiddenSubstitutes: [
      'MCP token',
      'Bearer token',
      'TraceMind internal product usage dogfood variables',
    ],
    notes: [
      'projectKey is a public write key returned by tracemind.capture_setup for the current customer project.',
      `Use ${SERVER_PROJECT_KEY_ENV_VAR} only when the customer server already manages public runtime config through deployment env vars.`,
    ],
  };
}

function serverDeployVerificationFields({
  platform,
  inlineInitSnippet,
  envInitSnippet,
  captureApiUrl,
}) {
  const expectedCaptureQuery = {
    platform,
    eventType: 'custom',
    eventNamePlaceholder: 'approved_event_name',
    sourceType: 'server_app',
    sourceKey: SERVER_DEFAULT_SOURCE_KEY,
  };
  return {
    projectKeyUsage: serverProjectKeyUsage(),
    configurationModes: [
      {
        mode: 'inline_project_key',
        recommended: true,
        initSnippet: inlineInitSnippet,
        deploymentNotes: [
          'Recommended default: use the public projectKey returned by tracemind.capture_setup directly in the server initialization snippet.',
          'The public projectKey is allowed in customer server source code because it only writes capture data for this project.',
        ],
      },
      {
        mode: 'env_project_key',
        recommended: false,
        variableName: SERVER_PROJECT_KEY_ENV_VAR,
        initSnippet: envInitSnippet,
        deploymentNotes: [
          `Use only when the customer project already prefers deployment environment config; set ${SERVER_PROJECT_KEY_ENV_VAR} to the public projectKey returned by tracemind.capture_setup.`,
          `Before deploy, verify ${SERVER_PROJECT_KEY_ENV_VAR} exists in the deployment environment. Do not use MCP tokens, Bearer tokens, or TraceMind internal dogfood configuration values here.`,
        ],
      },
    ],
    preDeployChecks: [
      'Confirm the returned initSnippet runs once during server startup before any business handler calls capture.',
      'Confirm capture setup uses the returned public projectKey only; do not use an MCP token, Bearer token, or TraceMind internal product usage dogfood variables as the server capture key.',
      `If using env_project_key mode, confirm the deployment environment defines ${SERVER_PROJECT_KEY_ENV_VAR}.`,
      `Confirm the server can egress to ${captureApiUrl} over its production DNS/TLS/proxy path and send Content-Type: application/json.`,
    ],
    postDeployVerification: {
      trigger: 'Trigger the real business path that owns the newly added approved server custom event.',
      query: expectedCaptureQuery,
      failureTriage: [
        'SDK initialization did not run before the business handler.',
        'projectKey/env is missing or not the public projectKey returned by tracemind.capture_setup.',
        'egress/TLS/proxy cannot reach the TraceMind capture endpoint.',
        '/api/capture delivery is rejected, blocked, or not flushed by the server runtime.',
        'approved event name was not used or the query window/sourceKey does not match the emitted event.',
      ],
      zeroResultWarning: 'A zero result after deploy is not proof that users were inactive until the init, projectKey/env, network, delivery, and approved event name checks have passed.',
    },
    expectedCaptureQuery,
  };
}

function webCaptureScriptUpgradePrompt() {
  return `TraceMind 检测到旧 Web Auto Capture 脚本仍在运行。请执行：
1. 调用 tracemind.capture_setup({ platform: "web" }) 获取最新 Web 接入片段。
2. 搜索项目中的 capture.js、capture.<hash>.js、TraceMind script、自托管脚本副本。
3. 如果使用 capture.<hash>.js 或本地复制脚本，改回 capture_setup 返回的稳定 captureScriptUrl。
4. 检查 service worker、Workbox、CDN、反向代理、WebView bundle 是否缓存或内置旧脚本。
5. 部署后打开真实页面，调用 window.TraceMind.status()，确认 scriptReleaseId 等于最新版本。
6. 触发一次真实行为，再调用 tracemind.project_health，确认 captureScriptFindings 消失。`;
}

function commonSetup(project, platform) {
  const captureApiUrl = Meteor.absoluteUrl('/api/capture');
  const presenceApiUrl = Meteor.absoluteUrl('/api/presence');
  const userFeedbackApiUrl = Meteor.absoluteUrl('/api/user-feedback');
  const notes = [
    'Use projectKey only for Auto Capture writes.',
    'Do not use the MCP token as data-tracemind-token.',
    'Do not put MCP tokens in frontend code.',
    'Do not capture input values, screenshots, secrets, raw prompts, raw user content, or full query URLs.',
  ];
  const userFeedbackWorkflow = [
    'Use TraceMind submitFeedback for terminal user feedback entries in the customer app.',
    'Do not send terminal user feedback through /api/capture, capture("custom"), or tracemind.submit_feedback.',
    'Contact fields are allowed only when the end user explicitly submits them in the feedback payload.',
    'Keep attachments empty in v1; screenshots, recordings, public boards, voting, roadmap, and changelog are out of scope.',
  ];
  const errorCaptureWorkflow = [
    'Use app_error for safe product/runtime error context, not as a Sentry or Crashlytics replacement.',
    'Web Auto Capture records window error and unhandledrejection summaries automatically; call captureError manually for handled errors that affect product flow.',
    'Native, React Native, Mini Program, Browser Extension background/service worker, and server SDKs use manual captureError only in v1.',
    'Do not add native crash reporters, global request/log/database hooks, sourcemap upload, stack symbolication, crash dumps, screenshots, recordings, or session replay.',
    'Only send sanitized summary fields: errorKind, errorType, messageFingerprint, messagePreview, stackFingerprint, topFrameFingerprint, causeType, causeFingerprint, fatal, handled, source, path/screen, release, component, operation, feature, routeName, correlationId, requestId, httpStatus, status, and occurredAt.',
  ];
  return {
    platform,
    captureApiUrl,
    presenceApiUrl,
    userFeedbackApiUrl,
    autoCapturedSignals: AUTO_CAPTURE_SIGNALS,
    privacyConstraints: PRIVACY_CONSTRAINTS,
    supportedPropertyTypes: SUPPORTED_MANUAL_PROPERTY_TYPES,
    manualCaptureWorkflow: MANUAL_CAPTURE_WORKFLOW,
    manualCaptureWarnings: MANUAL_CAPTURE_WARNINGS,
    trafficAttribution: trafficAttributionGuidance(platform),
    errorCaptureWorkflow,
    errorCaptureMethods: {
      web: 'window.TraceMind.captureError(errorOrInfo)',
      ios: 'try? TraceMind.captureError(error, path: "CheckoutViewController", component: "CheckoutViewController")',
      macos: 'try? TraceMind.captureError(error, path: "CheckoutWindow", component: "CheckoutWindow")',
      android: 'TraceMind.captureError(error, path = "CheckoutActivity", component = "CheckoutActivity")',
      react_native: 'TraceMind.captureError(error, { path: "Checkout", component: "CheckoutScreen" })',
      hybrid: 'Use window.TraceMind.captureError(...) inside the WebView and the matching native TraceMind.captureError(...) API in the shell.',
      mini_program: 'TraceMind.captureError(error, { path: "/pages/checkout/index", component: "CheckoutPage" })',
      browser_extension: 'TraceMind.captureError(error, { path: "/popup.html", component: "Popup" })',
      server_node: 'TraceMindServer.captureError(error, { path: "/jobs", component: "InvoiceWorker" })',
      server_python: 'TraceMindServer.capture_error(error, path="/jobs", component="InvoiceWorker")',
      server_http: `POST ${captureApiUrl} with type "app_error" and only sanitized summary fields, sanitized messagePreview, and irreversible fingerprints`,
    },
    userFeedbackWorkflow,
    userFeedbackMethods: {
      web: 'window.TraceMind.submitFeedback({ message })',
      ios: 'TraceMind.submitFeedback(message: feedbackMessage)',
      macos: 'TraceMind.submitFeedback(message: feedbackMessage)',
      android: 'TraceMind.submitFeedback(message)',
      react_native: 'TraceMind.submitFeedback({ message })',
      hybrid: 'Use window.TraceMind.submitFeedback({ message }) from the WebView or the matching native TraceMind.submitFeedback(...) API from the shell.',
      mini_program: 'TraceMind.submitFeedback({ message })',
      browser_extension: 'TraceMind.submitFeedback({ message })',
      server_node: 'TraceMindServer.submitFeedback({ message, userId, sessionId })',
      server_python: 'TraceMindServer.submit_feedback(message=message, user_id=user_id, session_id=session_id)',
      server_http: `POST ${userFeedbackApiUrl}`,
    },
    notes,
  };
}

function localSourceSdkBase(sdkSourcePath, customerVendorPath) {
  const sdkName = SDK_NAME_BY_SOURCE_PATH[sdkSourcePath];
  return {
    distributionMode: 'local_source',
    publishStatus: 'not_published',
    sdkSourceRepo: TRACE_MIND_SDK_SOURCE_REPO,
    sdkSourceCheckoutDir: TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR,
    sdkSourcePath,
    customerVendorPath,
    ...(sdkName ? sdkGovernanceFields(sdkName, sdkSourcePath, customerVendorPath) : {}),
    installNotes: [
      'TraceMind SDK packages are not registry-published yet; install from the local source copied from sdkSourceRepo.',
      `If ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR} or ${customerVendorPath} already exists, inspect it before overwriting.`,
    ],
  };
}

function installedSdkManifestFor(sdkName, sdkSourcePath, customerVendorPath) {
  const sdk = latestSdkForSetup(sdkName);
  if (!sdk) return null;
  return {
    schemaVersion: 1,
    sdkName,
    displayVersion: sdk.displayVersion,
    contentHash: sdk.contentHash,
    sourceRepo: sdk.sourceRepo,
    sourceRef: sdk.sourceRef,
    sdkSourcePath,
    vendorPath: customerVendorPath,
    verificationCommands: sdk.verificationCommands,
  };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sdkManifestWriteCommand(installedSdkManifest, manifestPath) {
  const script = `const fs = require("fs"); fs.writeFileSync(${JSON.stringify(manifestPath)}, JSON.stringify(${JSON.stringify(installedSdkManifest)}, null, 2) + "\\n");`;
  return `node -e ${shellSingleQuote(script)}`;
}

function resolveSdkSourceRef(sourceRef) {
  const resolved = safeString(sourceRef || SDK_RELEASE_MANIFEST?.sourceRef, 120);
  if (!resolved) {
    throw new Error('Missing TraceMind SDK sourceRef. Run npm run prepare:sdk-release-ref before exposing local source SDK setup.');
  }
  return resolved;
}

function localSourceCheckoutCommands(sourceRef) {
  const resolvedSourceRef = resolveSdkSourceRef(sourceRef);
  return [
    `test -d ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR} || git clone --filter=blob:none --no-checkout ${TRACE_MIND_SDK_SOURCE_REPO} ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR}`,
    `git -C ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR} fetch --depth 1 origin ${shellSingleQuote(resolvedSourceRef)}`,
    `git -C ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR} checkout --detach FETCH_HEAD`,
  ];
}

function sdkSourceHashVerifyCommand(sdkName, expectedHash) {
  const script = [
    `const gate = require("./${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR}/scripts/check-sdk-release-manifest.js");`,
    `const config = gate.SDK_CONFIGS.find((entry) => entry.sdkName === ${JSON.stringify(sdkName)});`,
    'if (!config) { console.error("TraceMind SDK config not found."); process.exit(1); }',
    'const actual = gate.contentHash(gate.discoverRuntimeFiles(config));',
    `if (actual !== ${JSON.stringify(expectedHash)}) { console.error("TraceMind SDK source hash mismatch: expected ${expectedHash}, got " + actual + ". Stop and ask TraceMind for the pinned SDK sourceRef."); process.exit(1); }`,
  ].join(' ');
  return `node -e ${shellSingleQuote(script)}`;
}

function sdkGovernanceFields(sdkName, sdkSourcePath, customerVendorPath) {
  const sdk = latestSdkForSetup(sdkName);
  if (!sdk) return {};
  const latestSdk = {
    sdkName: sdk.sdkName,
    displayVersion: sdk.displayVersion,
    contentHash: sdk.contentHash,
    sourceRepo: sdk.sourceRepo,
    sourceRef: sdk.sourceRef,
    sdkSourcePath: sdk.sdkSourcePath,
    minimumSupportedHash: sdk.minimumSupportedHash,
    verificationCommands: sdk.verificationCommands,
    distributionMode: sdk.distributionMode,
    publishStatus: sdk.publishStatus,
    ...(sdk.registry ? { registry: sdk.registry } : {}),
    ...(sdk.localSourceFallback ? { localSourceFallback: sdk.localSourceFallback } : {}),
  };
  const isRegistryPublished = sdk.distributionMode === 'registry' && sdk.registry;
  const installedSdkManifest = isRegistryPublished ? null : installedSdkManifestFor(sdkName, sdkSourcePath, customerVendorPath);
  if (isRegistryPublished) {
    return {
      latestSdk,
      registry: sdk.registry,
      localSourceFallback: {
        ...sdk.localSourceFallback,
        customerVendorPath,
        sdkSourceCheckoutDir: TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR,
        installCommands: localSourceCopyCommands(sdkSourcePath, customerVendorPath),
      },
      installedVersionDetection: {
        packageName: sdk.registry.packageName,
        packageVersion: sdk.registry.packageVersion,
        detectionOrder: [
          `Check the package manager lockfile for ${sdk.registry.packageName} at ${sdk.registry.packageVersion}.`,
          'Compare sourceDetails.sdkContentHash from tracemind.project_health with latestSdk.contentHash when runtime events are available.',
          'If the registry package cannot be installed, use localSourceFallback only after confirming the registry outage.',
        ],
      },
      upgradePolicy: sdk.upgradePolicy,
      upgradeCommands: [
        'Call tracemind.project_health to see whether TraceMind already found an SDK update or unknown SDK version.',
        ...sdk.registry.installCommands,
        'Run the returned verificationCommands in the customer project, then report success or the exact failing command.',
        'For TraceMind SDK source changes, run npm run update:sdk-manifest, npm run test:sdk-release, and npm run check:sdk-registry-publication -- <version> before deployment.',
      ],
    };
  }
  return {
    latestSdk,
    installedSdkManifest,
    installedVersionDetection: {
      manifestPath: `${customerVendorPath}/.tracemind-sdk.json`,
      rootManifestPath: '.tracemind-sdk.json',
      detectionOrder: [
        `Read ${customerVendorPath}/.tracemind-sdk.json if it exists.`,
        'Compare installed contentHash with latestSdk.contentHash; do not rely only on displayVersion.',
        'If the manifest is missing, inspect sourceDetails.sdkContentHash from tracemind.project_health or treat the SDK version as unknown.',
      ],
    },
    upgradePolicy: sdk.upgradePolicy,
    upgradeCommands: [
      'Call tracemind.project_health to see whether TraceMind already found an SDK update or unknown SDK version.',
      `Read ${customerVendorPath}/.tracemind-sdk.json and compare contentHash with latestSdk.contentHash.`,
      ...localSourceCheckoutCommands(sdk.sourceRef),
      sdkSourceHashVerifyCommand(sdkName, sdk.contentHash),
      `Copy ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR}/${sdkSourcePath}/. into ${customerVendorPath}/ without changing app instrumentation semantics.`,
      sdkManifestWriteCommand(installedSdkManifest, `${customerVendorPath}/.tracemind-sdk.json`),
      'Run the returned verificationCommands in the customer project, then report success or the exact failing command.',
      'For TraceMind SDK source changes, run npm run update:sdk-manifest and npm run test:sdk-release before committing.',
    ],
  };
}

function localSourceCopyCommands(sdkSourcePath, customerVendorPath) {
  const sdkName = SDK_NAME_BY_SOURCE_PATH[sdkSourcePath];
  const installedSdkManifest = sdkName ? installedSdkManifestFor(sdkName, sdkSourcePath, customerVendorPath) : null;
  return [
    ...localSourceCheckoutCommands(installedSdkManifest?.sourceRef),
    ...(installedSdkManifest ? [sdkSourceHashVerifyCommand(sdkName, installedSdkManifest.contentHash)] : []),
    `mkdir -p ${customerVendorPath}`,
    `cp -R ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR}/${sdkSourcePath}/. ${customerVendorPath}/`,
    ...(installedSdkManifest ? [sdkManifestWriteCommand(installedSdkManifest, `${customerVendorPath}/.tracemind-sdk.json`)] : []),
  ];
}

function localJsSdkSetup({ packageName, sdkSourcePath, customerVendorPath }) {
  return {
    ...localSourceSdkBase(sdkSourcePath, customerVendorPath),
    packageManagerNotes: [
      'Choose exactly one dependency command based on the project lockfile: package-lock.json uses npm, pnpm-lock.yaml uses pnpm, yarn.lock uses yarn.',
      `The local file dependency keeps imports stable as ${packageName}.`,
    ],
    dependencyEdits: [
      `package.json dependencies should resolve ${packageName} from file:${customerVendorPath}.`,
    ],
    installCommands: [
      ...localSourceCopyCommands(sdkSourcePath, customerVendorPath),
      `npm install ./${customerVendorPath}`,
      `pnpm add ./${customerVendorPath}`,
      `yarn add file:./${customerVendorPath}`,
      'Run exactly one package-manager command above based on the project lockfile; do not run npm, pnpm, and yarn together.',
    ],
    idempotencyChecks: [
      `Search package.json for an existing ${packageName} dependency.`,
      `Search the repository for an existing ${customerVendorPath} vendored SDK copy.`,
      `Search the source for imports from ${packageName}.`,
    ],
  };
}

function registryJsSdkSetup({ packageName, sdkName, sdkSourcePath, customerVendorPath }) {
  const sdk = latestSdkForSetup(sdkName);
  if (sdk?.distributionMode !== 'registry' || !sdk.registry) {
    return localJsSdkSetup({ packageName, sdkSourcePath, customerVendorPath });
  }
  return {
    distributionMode: 'registry',
    publishStatus: sdk.publishStatus,
    ...sdkGovernanceFields(sdkName, sdkSourcePath, customerVendorPath),
    packageManagerNotes: [
      'Choose exactly one dependency command based on the project lockfile: package-lock.json uses npm, pnpm-lock.yaml uses pnpm, yarn.lock uses yarn.',
      `The registry package keeps imports stable as ${packageName}.`,
    ],
    dependencyEdits: [
      `package.json dependencies should resolve ${packageName} from the registry version ${sdk.registry.packageVersion}.`,
    ],
    installCommands: sdk.registry.installCommands,
    idempotencyChecks: [
      `Search package.json for an existing ${packageName} dependency.`,
      `Search the source for imports from ${packageName}.`,
      'Do not vendor a local SDK copy unless localSourceFallback is explicitly needed.',
    ],
  };
}

function localSwiftSdkSetup() {
  const customerVendorPath = 'vendor/TraceMind';
  return {
    ...localSourceSdkBase('sdk/ios', customerVendorPath),
    packageManagerNotes: [
      'Use a local Swift Package dependency until TraceMind publishes a registry package.',
      'For Xcode-managed projects, add a local package dependency pointing at vendor/TraceMind.',
    ],
    dependencyEdits: [
      'Package.swift dependencies: [.package(path: "vendor/TraceMind")]',
      'Target dependencies: .product(name: "TraceMind", package: "TraceMind")',
    ],
    installCommands: [
      ...localSourceCopyCommands('sdk/ios', customerVendorPath),
      'For Package.swift apps, add dependencies: [.package(path: "vendor/TraceMind")] and target dependency .product(name: "TraceMind", package: "TraceMind").',
      'For Xcode-managed apps, add a local Swift Package dependency pointing at vendor/TraceMind.',
    ],
    idempotencyChecks: [
      'Check Package.swift or the Xcode project for an existing TraceMind local package dependency.',
      'Search the repository for an existing vendor/TraceMind vendored SDK copy.',
    ],
  };
}

function localAndroidSdkSetup() {
  const customerVendorPath = 'vendor/tracemind-android';
  return {
    ...localSourceSdkBase('sdk/android', customerVendorPath),
    packageManagerNotes: [
      'Use a local Gradle module until TraceMind publishes a Maven artifact.',
      'Apply the same dependency semantics in Groovy or Kotlin Gradle syntax based on the target project.',
    ],
    dependencyEdits: [
      'settings.gradle(.kts): include(":tracemind")',
      'settings.gradle(.kts): project(":tracemind").projectDir = file("vendor/tracemind-android")',
      'app/build.gradle(.kts): implementation(project(":tracemind"))',
    ],
    installCommands: [
      ...localSourceCopyCommands('sdk/android', customerVendorPath),
      'Add include(":tracemind") and project(":tracemind").projectDir = file("vendor/tracemind-android") to settings.gradle(.kts).',
      'Add implementation(project(":tracemind")) to the Gradle app module dependencies.',
    ],
    idempotencyChecks: [
      'Check settings.gradle(.kts) for an existing :tracemind module include.',
      'Check app/build.gradle(.kts) for an existing implementation(project(":tracemind")) dependency.',
      'Search the repository for an existing vendor/tracemind-android vendored SDK copy.',
    ],
  };
}

function registryAndroidSdkSetup() {
  const sdkName = 'android';
  const sdkSourcePath = 'sdk/android';
  const customerVendorPath = 'vendor/tracemind-android';
  const sdk = latestSdkForSetup(sdkName);
  if (sdk?.distributionMode !== 'registry' || !sdk.registry) {
    return localAndroidSdkSetup();
  }
  return {
    distributionMode: 'registry',
    publishStatus: sdk.publishStatus,
    ...sdkGovernanceFields(sdkName, sdkSourcePath, customerVendorPath),
    packageManagerNotes: [
      'Use Maven Central for normal Android installs.',
      'Use localSourceFallback only when Maven Central is unavailable or a locked-down environment requires vendored source.',
    ],
    dependencyEdits: [
      'settings.gradle(.kts): ensure mavenCentral() is present.',
      `app/build.gradle(.kts): implementation("${sdk.registry.groupId}:${sdk.registry.artifactId}:${sdk.registry.packageVersion}")`,
    ],
    installCommands: sdk.registry.installCommands,
    idempotencyChecks: [
      `Check Gradle files for an existing ${sdk.registry.groupId}:${sdk.registry.artifactId} dependency.`,
      'Check AndroidManifest.xml for the Application class that owns startup.',
      'Search the app for TraceMind.start(',
    ],
  };
}

function localPythonSdkSetup({ packageLabel, moduleName, sdkSourcePath, customerVendorPath }) {
  const sdkSetup = localSourceSdkBase(sdkSourcePath, customerVendorPath);
  return {
    ...sdkSetup,
    packageManagerNotes: [
      'TraceMind Python SDKs do not have package metadata yet; do not use a fake pip install command.',
      `Add ${customerVendorPath} to PYTHONPATH or the project packaging source path so imports from ${moduleName} resolve.`,
    ],
    dependencyEdits: [
      `Runtime/test environment should include PYTHONPATH=$PWD/${customerVendorPath}:$PYTHONPATH.`,
      `Python imports should resolve ${moduleName} from ${customerVendorPath}/${moduleName}.`,
    ],
    installCommands: [
      ...localSourceCheckoutCommands(sdkSetup.installedSdkManifest?.sourceRef),
      ...(sdkSetup.installedSdkManifest ? [sdkSourceHashVerifyCommand(sdkSetup.installedSdkManifest.sdkName, sdkSetup.installedSdkManifest.contentHash)] : []),
      `mkdir -p ${customerVendorPath}`,
      `cp -R ${TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR}/${sdkSourcePath}/${moduleName} ${customerVendorPath}/`,
      ...(sdkSetup.installedSdkManifest ? [sdkManifestWriteCommand(sdkSetup.installedSdkManifest, `${customerVendorPath}/.tracemind-sdk.json`)] : []),
      `Add ${customerVendorPath} to PYTHONPATH in the app runtime, test runner, or deployment environment before importing ${moduleName}.`,
    ],
    idempotencyChecks: [
      `Search Python dependency files and runtime config for an existing ${packageLabel} or ${moduleName} setup.`,
      `Search the repository for an existing ${customerVendorPath} vendored SDK copy.`,
      `Search Python files for imports from ${moduleName}.`,
    ],
  };
}

function registryPythonSdkSetup({ packageLabel, moduleName, sdkName, sdkSourcePath, customerVendorPath }) {
  const sdk = latestSdkForSetup(sdkName);
  if (sdk?.distributionMode !== 'registry' || !sdk.registry) {
    return localPythonSdkSetup({ packageLabel, moduleName, sdkSourcePath, customerVendorPath });
  }
  return {
    distributionMode: 'registry',
    publishStatus: sdk.publishStatus,
    ...sdkGovernanceFields(sdkName, sdkSourcePath, customerVendorPath),
    packageManagerNotes: [
      `Install ${packageLabel} from PyPI for normal Python projects.`,
      'Use localSourceFallback only when PyPI is unavailable or a locked-down environment requires vendored source.',
    ],
    dependencyEdits: [
      `Add ${packageLabel}==${sdk.registry.packageVersion} to pyproject.toml, requirements.txt, or the equivalent dependency file.`,
      `Python imports should resolve ${moduleName} from the installed ${packageLabel} package.`,
    ],
    installCommands: sdk.registry.installCommands,
    idempotencyChecks: [
      `Search Python dependency files for an existing ${packageLabel} dependency.`,
      `Search Python files for imports from ${moduleName}.`,
      'Do not vendor a local SDK copy unless localSourceFallback is explicitly needed.',
    ],
  };
}

function miniProgramSetup(project, provider) {
  const common = commonSetup(project, 'mini_program');
  const sdkSetup = registryJsSdkSetup({
    packageName: '@tracemind/mini-program',
    sdkName: 'mini_program',
    sdkSourcePath: 'sdk/mini-program',
    customerVendorPath: 'vendor/tracemind/mini-program',
  });
  const providerLabel = MINI_PROGRAM_PROVIDER_LABELS[provider] || 'Mini Program';
  const apiName = MINI_PROGRAM_PROVIDER_API_NAMES[provider] || 'host';
  const exampleFile = MINI_PROGRAM_PROVIDER_FILE_NAMES[provider] || 'app.js';
  return {
    ...common,
    ...sdkSetup,
    platform: 'mini_program',
    provider,
    providerLabel,
    eventPlatform: 'mini_program',
    install: sdkSetup.distributionMode === 'registry'
      ? `Install @tracemind/mini-program from npm and configure provider: "${provider}" for ${providerLabel}.`
      : `Vendor @tracemind/mini-program from the TraceMind GitHub source repo, install it as a local file dependency, and configure provider: "${provider}" for ${providerLabel}.`,
    installCommands: [
      ...sdkSetup.installCommands,
      `Initialize TraceMind once in ${exampleFile} with provider: "${provider}".`,
      'Wrap App/Page lifecycle or call the returned lifecycle helpers from existing App and Page handlers.',
      'Wire tap/input/submit helpers manually from existing event handlers; do not promise no-code interaction capture in v1.',
    ],
    filesToEdit: [
      'package.json or mini program dependency manifest',
      exampleFile,
      'Page files that own page show/hide lifecycle',
      'Event handler files for tap/input/submit helpers when business interaction evidence is needed',
      'Mini program request domain/network allowlist configuration',
    ],
    initLocation: 'Run once in the mini program App bootstrap before the first Page is shown, then call lifecycle helpers from App/Page handlers.',
    idempotencyChecks: [
      ...sdkSetup.idempotencyChecks,
      'Search the mini program source for @tracemind/mini-program.',
      'Search App and Page entrypoints for TraceMind.start(',
      'Search event handlers for existing TraceMind.trackTap, TraceMind.trackInput, or TraceMind.trackSubmit calls before adding duplicates.',
      `Confirm the host runtime exposes ${apiName}.request and storage APIs.`,
    ],
    initSnippet: `import { TraceMind } from "@tracemind/mini-program";\n\nTraceMind.start({\n  projectKey: "${project.projectKey}",\n  provider: "${provider}",\n  appId: "your-mini-program-app-id",\n  appName: "Your Mini Program"\n});`,
    source: {
      type: 'mini_program',
      key: 'Mini program appId when available, otherwise developer configured sourceKey.',
      details: { provider },
    },
    sourceModel: 'platform is mini_program; sourceType is mini_program; sourceKey is the mini program appId or configured sourceKey; sourceDetails.provider records wechat, alipay, douyin, or dingtalk; sourceDetails.sdkVersion and sdkContentHash support SDK upgrade governance.',
    autoCapturedSignals: MINI_PROGRAM_AUTO_CAPTURE_SIGNALS,
    privacyConstraints: PRIVACY_CONSTRAINTS,
    networkRestrictionChecks: miniProgramNetworkRestrictionChecks(provider),
    verificationCommands: [
      'npm test --prefix sdk/mini-program',
      'Run the mini program in the target provider dev tool, trigger launch/show/hide/page show/page hide, then query TraceMind raw behaviors or semantic events.',
      'Trigger helper-wired tap/input/submit handlers and confirm payloads do not include input values or full query URLs.',
    ],
    identifySnippet: 'TraceMind.identify("user_123", { plan: "pro" })',
    manualCaptureExamples: [
      'TraceMind.trackTap("checkout_button", { path: "/pages/pricing/index", properties: { plan: "pro" } })',
      'TraceMind.trackInput("phone_input", { path: "/pages/pricing/index", properties: { field: "phone" } })',
      'TraceMind.trackSubmit("checkout_form", { path: "/pages/pricing/index", properties: { success: true } })',
      'TraceMind.capture("custom", { eventName: approvedEventName, properties: { amount: 29, success: true } })',
      'TraceMind.captureError(error, { path: "/pages/checkout/index", component: "CheckoutPage", handled: true })',
    ],
    manualCaptureExample: 'TraceMind.capture("custom", { eventName: approvedEventName, properties: { amount: 29, success: true } })',
    manualCaptureWarnings: [
      ...MANUAL_CAPTURE_WARNINGS,
      'Mini Program v1 does not do compile-time WXML/AXML/TTML rewriting or no-code tap/input/submit capture; use helpers from existing handlers.',
    ],
  };
}

function browserExtensionSetup(project) {
  const common = commonSetup(project, 'browser_extension');
  const sdkSetup = registryJsSdkSetup({
    packageName: '@tracemind/browser-extension',
    sdkName: 'browser_extension',
    sdkSourcePath: 'sdk/browser-extension',
    customerVendorPath: 'vendor/tracemind/browser-extension',
  });
  return {
    ...common,
    ...sdkSetup,
    platform: 'browser_extension',
    eventPlatform: 'browser_extension',
    install: sdkSetup.distributionMode === 'registry'
      ? 'Install @tracemind/browser-extension from npm and initialize it from extension-owned popup/options/sidebar/devtools pages; use background/service worker only for manual capture.'
      : 'Vendor @tracemind/browser-extension from the TraceMind GitHub source repo, install it as a local file dependency, and initialize it from extension-owned popup/options/sidebar/devtools pages; use background/service worker only for manual capture.',
    installCommands: [
      ...sdkSetup.installCommands,
      'Initialize TraceMind once from popup, options, sidebar, or devtools entrypoints that own extension UI DOM.',
      'Initialize TraceMind from background/service worker only when manual business events, identify, submitFeedback, or flush are needed.',
      'Do not add content-script no-code host-page capture in V1; wire only explicit safe business events if a later content-script helper is approved.',
    ],
    filesToEdit: [
      'package.json or extension dependency manifest',
      'manifest.json',
      'popup/options/sidebar/devtools bootstrap file',
      'background or service worker file only when manual capture is needed there',
      'extension CSP or host_permissions configuration',
    ],
    initLocation: 'Run once in each extension-owned popup/options/sidebar/devtools bootstrap before the first interaction; in background/service worker, run once before manual capture calls.',
    idempotencyChecks: [
      ...sdkSetup.idempotencyChecks,
      'Search the extension source for @tracemind/browser-extension.',
      'Search popup/options/sidebar/devtools and background/service worker entrypoints for TraceMind.start(',
      'Search event handlers for existing TraceMind.trackTap, TraceMind.trackInput, or TraceMind.trackSubmit calls before adding duplicates.',
      'Confirm manifest host_permissions or content_security_policy allows the TraceMind HTTPS endpoint.',
    ],
    initSnippet: `import { TraceMind } from "@tracemind/browser-extension";\n\nTraceMind.start({\n  projectKey: "${project.projectKey}",\n  extensionName: "Your Extension"\n});`,
    source: {
      type: 'browser_extension',
      key: 'Browser extension id when available, otherwise developer configured extensionId.',
      details: {
        browser: 'chrome | edge | firefox',
        runtimeContext: 'popup | options | sidebar | devtools | background',
      },
    },
    sourceModel: 'platform is browser_extension; sourceType is browser_extension; sourceKey is the extension id or configured extensionId; sourceDetails.browser, manifestVersion, runtimeContext, sdkVersion, and sdkContentHash are the only persisted extension source details.',
    autoCapturedSignals: BROWSER_EXTENSION_AUTO_CAPTURE_SIGNALS,
    privacyConstraints: PRIVACY_CONSTRAINTS,
    manifestPermissions: BROWSER_EXTENSION_MANIFEST_PERMISSIONS,
    networkRestrictionChecks: BROWSER_EXTENSION_NETWORK_RESTRICTION_CHECKS,
    verificationCommands: [
      'npm test --prefix sdk/browser-extension',
      'Load the extension in Chrome/Edge/Firefox dev tools, open popup/options/sidebar/devtools UI, trigger page view/click/input/submit, then query TraceMind raw behaviors or semantic events.',
      'Trigger background/service worker manual capture and confirm no DOM auto capture is registered there.',
      'Confirm payloads do not include host-page DOM, input values, cookies, browser history, bookmarks, full tab URLs, or query strings.',
    ],
    identifySnippet: 'TraceMind.identify("user_123", { plan: "pro" })',
    manualCaptureExamples: [
      'TraceMind.trackTap("export_button", { path: "/popup.html", properties: { format: "csv" } })',
      'TraceMind.trackInput("search_box", { path: "/popup.html", properties: { field: "query" } })',
      'TraceMind.trackSubmit("settings_form", { path: "/options.html", properties: { success: true } })',
      'TraceMind.capture("custom", { eventName: approvedEventName, properties: { success: true } })',
      'TraceMind.captureError(error, { path: "/popup.html", component: "Popup", handled: true })',
    ],
    manualCaptureExample: 'TraceMind.capture("custom", { eventName: approvedEventName, properties: { success: true } })',
    manualCaptureWarnings: [
      ...MANUAL_CAPTURE_WARNINGS,
      'Browser Extension V1 captures extension-owned UI only; do not promise host-page content-script no-code capture.',
    ],
  };
}

function platformSetup(project, platform, options = {}) {
  const common = commonSetup(project, platform);

  if (platform === 'mini_program') {
    return miniProgramSetup(project, options.provider || 'wechat');
  }

  if (platform === 'browser_extension') {
    return browserExtensionSetup(project);
  }

  if (platform === 'hybrid') {
    const captureScriptUrl = captureSetupScriptUrl();
    const captureSnippet = `<script src="${captureScriptUrl}" data-tracemind-token="${project.projectKey}" data-tracemind-framework="hybrid" async></script>`;
    const swiftSdkSetup = localSwiftSdkSetup();
    const androidSdkSetup = registryAndroidSdkSetup();
    return {
      ...common,
      platform: 'hybrid',
      eventPlatform: 'web_plus_native',
      distributionMode: 'web_snippet_plus_registry_native',
      publishStatus: 'partially_published',
      sdkSourceRepo: TRACE_MIND_SDK_SOURCE_REPO,
      sdkSourceCheckoutDir: TRACE_MIND_SDK_SOURCE_CHECKOUT_DIR,
      nativeSdkInstallOptions: [
        {
          platform: 'ios_or_macos',
          sdkSourcePath: swiftSdkSetup.sdkSourcePath,
          customerVendorPath: swiftSdkSetup.customerVendorPath,
          latestSdk: swiftSdkSetup.latestSdk,
          installedSdkManifest: swiftSdkSetup.installedSdkManifest,
          installedVersionDetection: swiftSdkSetup.installedVersionDetection,
          dependencyEdits: swiftSdkSetup.dependencyEdits,
        },
        {
          platform: 'android',
          sdkSourcePath: androidSdkSetup.sdkSourcePath,
          customerVendorPath: androidSdkSetup.customerVendorPath,
          latestSdk: androidSdkSetup.latestSdk,
          installedSdkManifest: androidSdkSetup.installedSdkManifest,
          installedVersionDetection: androidSdkSetup.installedVersionDetection,
          dependencyEdits: androidSdkSetup.dependencyEdits,
        },
      ],
      upgradePolicy: {
        level: 'recommended',
        agentPrompt: 'Ask your coding agent to read WebView setup, then check the native vendor/TraceMind and vendor/tracemind-android .tracemind-sdk.json files against nativeSdkInstallOptions.',
      },
      upgradeCommands: [
        ...swiftSdkSetup.upgradeCommands,
        ...androidSdkSetup.upgradeCommands,
      ],
      captureScriptUrl,
      captureSnippet,
      install: 'Install Web Auto Capture in the WebView document and the matching native SDK in the app shell, then connect identity and deeplink handling through a narrow bridge.',
      installCommands: [
        'Add captureSnippet to the WebView HTML document, root layout, or bundled H5 entry loaded inside the shell.',
        'For iOS/macOS shells: copy .tracemind-sdk-source/sdk/ios/. into vendor/TraceMind/ and add a local Swift Package dependency with .package(path: "vendor/TraceMind").',
        ...androidSdkSetup.installCommands,
        'Initialize TraceMind once in the native startup path and once in the WebView document using the same projectKey.',
        'After login, call identify in both layers with the same stable internal userId; use the bridge only for identity, sanitized route/source metadata, and deeplink handoff.',
      ],
      filesToEdit: [
        'WebView HTML document, app.html, root layout, or bundled H5 entry',
        'iOS/macOS App.swift, AppDelegate.swift, or SceneDelegate.swift when the shell is Apple-native',
        'Android Application.kt/Application.java and AndroidManifest.xml when the shell is Android-native',
        'WebView bridge, deeplink router, or Capacitor/Cordova/Electron/Tauri bootstrap module',
        'CSP, ATS, Android network security, or WebView configuration files when the TraceMind endpoint is restricted',
      ],
      initLocation: 'Load captureSnippet in every WebView page, and run the native TraceMind.start line once during shell startup before the first WebView screen is shown.',
      idempotencyChecks: [
        'Search WebView assets for /capture.js and data-tracemind-token.',
        'Search native dependency files for an existing vendor/TraceMind, vendor/tracemind-android, or TraceMind local SDK dependency before copying source.',
        'Search native shell code for TraceMind.start(',
        'Check that WebView and native shell use the same projectKey and do not mix in an MCP token.',
        'Search bridge code for existing TraceMind identity, deeplink, or route handoff helpers before adding another one.',
      ],
      initSnippet: `${captureSnippet}\n\n// iOS/macOS shell\nTraceMind.start(projectKey: "${project.projectKey}")\n\n// Android shell\nTraceMind.start(application, projectKey = "${project.projectKey}")`,
      source: {
        type: 'web_plus_native',
        key: 'WebView hostname plus native bundle id or package name.',
      },
      sourceModel: 'Do not create a hybrid event platform. WebView events remain platform web/sourceType web and can mark sourceDetails.framework through data-tracemind-framework; native shell events remain ios, macos, or android and can mark deviceInfo.framework/sourceDetails.framework as hybrid, capacitor, cordova, electron, tauri, or the specific shell framework when available.',
      autoCapturedSignals: [
        'WebView page view, route change, click, input changed without input values, submit, JavaScript error summaries, and active time from Web Auto Capture',
        'Native shell app/session start, screen/view changes, tap/click, input changed without input values, submit, and active time from the matching native SDK',
        'Deeplink/source attribution from native URL helpers plus Web first-touch attribution inside the WebView',
      ],
      privacyConstraints: PRIVACY_CONSTRAINTS,
      networkRestrictionChecks: HYBRID_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'Run the WebView content and trigger a page load/click/input/submit, then query TraceMind raw behaviors or semantic events.',
        'Run each native shell variant, trigger foreground/background and deeplink flows, then query TraceMind raw behaviors or semantic events.',
        'Confirm WebView and native shell events share the same stable userId after login and never include raw input values, cookies, tokens, or full query URLs.',
      ],
      identifySnippet: 'After login, call window.TraceMind.identify("user_123", { plan: "pro" }) in the WebView and TraceMind.identify(...) in the native shell with the same stable internal userId.',
      manualCaptureExamples: [
        'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { plan: "pro", amount: 29, trial: true }, context: { source: "webview_checkout" } })',
        'window.TraceMind.captureError(error, { component: "CheckoutWebView", handled: true })',
        'try? TraceMind.capture("custom", eventName: approvedEventName, path: "HybridShell", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "native_shell"])',
        'try? TraceMind.captureError(error, path: "HybridShell", component: "HybridShell", handled: true)',
        'TraceMind.capture(type = "custom", eventName = approvedEventName, path = "HybridShell", properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true), context = mapOf("source" to "native_shell"))',
        'TraceMind.captureError(error, path = "HybridShell", component = "HybridShell", handled = true)',
      ],
      manualCaptureExample: 'Use Web manual capture for WebView-owned business outcomes and native manual capture for shell-owned business outcomes; never duplicate the same outcome in both layers.',
    };
  }

  if (platform === 'server_node') {
    const sdkSetup = registryJsSdkSetup({
      packageName: '@tracemind/server-node',
      sdkName: 'server_node',
      sdkSourcePath: 'sdk/server-node',
      customerVendorPath: 'vendor/tracemind/server-node',
    });
    const initSnippet = `import { TraceMindServer } from "@tracemind/server-node";\n\nTraceMindServer.start({\n  projectKey: "${project.projectKey}",\n  sourceKey: "${SERVER_DEFAULT_SOURCE_KEY}"\n});`;
    const envInitSnippet = `import { TraceMindServer } from "@tracemind/server-node";\n\nTraceMindServer.start({\n  projectKey: process.env.${SERVER_PROJECT_KEY_ENV_VAR},\n  sourceKey: "${SERVER_DEFAULT_SOURCE_KEY}"\n});`;
    return {
      ...common,
      ...sdkSetup,
      ...serverDeployVerificationFields({
        platform: 'server_node',
        inlineInitSnippet: initSnippet,
        envInitSnippet,
        captureApiUrl: common.captureApiUrl,
      }),
      platform: 'server_node',
      eventPlatform: 'server',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install @tracemind/server-node from npm and add manual capture at stable server-side business outcomes.'
        : 'Vendor @tracemind/server-node from the TraceMind GitHub source repo, install it as a local file dependency, and add manual capture at stable server-side business outcomes.',
      installCommands: [
        ...sdkSetup.installCommands,
        'Import TraceMindServer in the backend entrypoint or instrumentation module.',
      ],
      filesToEdit: [
        'package.json',
        'Server entrypoint such as src/server.ts, src/index.ts, app.js, or server.js',
        'Business outcome handlers such as payment, webhook, job, sync, or workspace creation modules',
      ],
      initLocation: 'Run once during server startup before business handlers call TraceMindServer.capture.',
      idempotencyChecks: [
        ...sdkSetup.idempotencyChecks,
        'Search the backend for TraceMindServer.start(',
        'Check package.json for an existing @tracemind/server-node dependency.',
        'Search server-side business handlers for existing TraceMindServer.capture calls.',
      ],
      initSnippet,
      source: {
        type: 'server_app',
        key: `Developer configured server/service name, for example ${SERVER_DEFAULT_SOURCE_KEY}`,
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, sdkContentHash, and environment.',
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
        'TraceMindServer.captureError(error, { path: "/jobs", component: "InvoiceWorker", handled: true })',
      ],
      manualCaptureExample: 'TraceMindServer.capture("custom", { eventName: approvedEventName, userId: "user_123", properties: { amount: 2900, success: true }, context: { source: "stripe_webhook" } })',
    };
  }

  if (platform === 'server_python') {
    const sdkSetup = registryPythonSdkSetup({
      packageLabel: 'tracemind-server',
      moduleName: 'tracemind_server',
      sdkName: 'server_python',
      sdkSourcePath: 'sdk/server-python',
      customerVendorPath: 'vendor/tracemind_server',
    });
    const initSnippet = `from tracemind_server import TraceMindServer\n\nTraceMindServer.start(project_key="${project.projectKey}", source_key="${SERVER_DEFAULT_SOURCE_KEY}")`;
    const envInitSnippet = `import os\nfrom tracemind_server import TraceMindServer\n\nTraceMindServer.start(project_key=os.environ.get("${SERVER_PROJECT_KEY_ENV_VAR}"), source_key="${SERVER_DEFAULT_SOURCE_KEY}")`;
    return {
      ...common,
      ...sdkSetup,
      ...serverDeployVerificationFields({
        platform: 'server_python',
        inlineInitSnippet: initSnippet,
        envInitSnippet,
        captureApiUrl: common.captureApiUrl,
      }),
      platform: 'server_python',
      eventPlatform: 'server',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install tracemind-server from PyPI and add manual capture at stable server-side business outcomes.'
        : 'Vendor tracemind_server from the TraceMind GitHub source repo, add it to the Python source path, and add manual capture at stable server-side business outcomes.',
      installCommands: [
        ...sdkSetup.installCommands,
        'Import TraceMindServer in the backend entrypoint or instrumentation module.',
      ],
      filesToEdit: [
        'pyproject.toml, requirements.txt, or equivalent dependency file',
        'Server entrypoint such as app.py, main.py, or server.py',
        'Business outcome handlers such as payment, webhook, job, sync, or workspace creation modules',
      ],
      initLocation: 'Run once during server startup before business handlers call TraceMindServer.capture.',
      idempotencyChecks: [
        ...sdkSetup.idempotencyChecks,
        'Search the backend for TraceMindServer.start(',
        'Check Python dependency files for an existing tracemind-server dependency.',
        'Search server-side business handlers for existing TraceMindServer.capture calls.',
      ],
      initSnippet,
      source: {
        type: 'server_app',
        key: `Developer configured server/service name, for example ${SERVER_DEFAULT_SOURCE_KEY}`,
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, sdkContentHash, and environment.',
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
        'TraceMindServer.capture_error(error, path="/jobs", component="InvoiceWorker", handled=True)',
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
        key: SERVER_DEFAULT_SOURCE_KEY,
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
    const initSnippet = `POST ${common.captureApiUrl}\nContent-Type: application/json\n\n${JSON.stringify(payloadTemplate, null, 2)}`;
    const envPayloadTemplate = {
      ...payloadTemplate,
      projectKey: `<${SERVER_PROJECT_KEY_ENV_VAR} from deployment environment>`,
    };
    const envInitSnippet = `POST ${common.captureApiUrl}\nContent-Type: application/json\n\n${JSON.stringify(envPayloadTemplate, null, 2)}`;
    return {
      ...common,
      ...serverDeployVerificationFields({
        platform: 'server_http',
        inlineInitSnippet: initSnippet,
        envInitSnippet,
        captureApiUrl: common.captureApiUrl,
      }),
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
      initSnippet,
      payloadTemplate,
      source: {
        type: 'server_app',
        key: `Developer configured server/service name, for example ${SERVER_DEFAULT_SOURCE_KEY}`,
      },
      sourceModel: 'platform is server; sourceType is server_app; sourceKey is the configured backend service name; sourceDetails records language, runtime, framework, sdkVersion, sdkContentHash, and environment when an SDK is used.',
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
        `POST ${common.captureApiUrl} with type "app_error" and properties containing sanitized summary fields such as messageFingerprint, messagePreview, stackFingerprint, topFrameFingerprint, errorType, causeType, handled/fatal, source, component, release, correlationId, requestId, httpStatus, and status only.`,
      ],
      manualCaptureExample: `POST ${common.captureApiUrl} with the returned payloadTemplate after replacing eventName with an approved event name.`,
    };
  }

  if (platform === 'mcp_node') {
    const sdkSetup = registryJsSdkSetup({
      packageName: '@tracemind/mcp-node',
      sdkName: 'mcp_node',
      sdkSourcePath: 'sdk/mcp-node',
      customerVendorPath: 'vendor/tracemind/mcp-node',
    });
    return {
      ...common,
      ...sdkSetup,
      platform: 'mcp_node',
      eventPlatform: 'server',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install @tracemind/mcp-node from npm and initialize it around the MCP server instance.'
        : 'Vendor @tracemind/mcp-node from the TraceMind GitHub source repo, install it as a local file dependency, and initialize it around the MCP server instance.',
      installCommands: [
        ...sdkSetup.installCommands,
        'Import TraceMindMCP in the MCP server entrypoint.',
      ],
      filesToEdit: [
        'package.json',
        'MCP server entrypoint such as src/server.ts, src/index.ts, or server.js',
        'tool/resource/prompt registration modules when fallback wrappers are needed',
      ],
      initLocation: 'Run once after creating the MCP server object and before registering or serving tools.',
      idempotencyChecks: [
        ...sdkSetup.idempotencyChecks,
        'Search the MCP server for TraceMindMCP.start(',
        'Check package.json for an existing @tracemind/mcp-node dependency.',
        'Search tool/resource/prompt registration code for existing TraceMindMCP.wrapTool, wrapResource, or wrapPrompt calls.',
      ],
      initSnippet: `import { TraceMindMCP } from "@tracemind/mcp-node";\n\nTraceMindMCP.start(server, {\n  projectKey: "${project.projectKey}",\n  sourceKey: "docs-mcp"\n});`,
      source: {
        type: 'mcp_server',
        key: 'Developer configured MCP server/package name, for example docs-mcp',
      },
      sourceModel: 'platform is server; sourceType is mcp_server; sourceKey is the configured MCP server/package name; sourceDetails records language, runtime, sdkVersion, sdkContentHash, and mcpFramework.',
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
    const sdkSetup = registryPythonSdkSetup({
      packageLabel: 'tracemind-mcp',
      moduleName: 'tracemind_mcp',
      sdkName: 'mcp_python',
      sdkSourcePath: 'sdk/mcp-python',
      customerVendorPath: 'vendor/tracemind_mcp',
    });
    return {
      ...common,
      ...sdkSetup,
      platform: 'mcp_python',
      eventPlatform: 'server',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install tracemind-mcp from PyPI and initialize it around the Python MCP server instance.'
        : 'Vendor tracemind_mcp from the TraceMind GitHub source repo, add it to the Python source path, and initialize it around the Python MCP server instance.',
      installCommands: [
        ...sdkSetup.installCommands,
        'Import TraceMindMCP in the MCP server entrypoint.',
      ],
      filesToEdit: [
        'pyproject.toml, requirements.txt, or equivalent dependency file',
        'MCP server entrypoint such as server.py, main.py, or app.py',
        'tool/resource/prompt registration modules when fallback decorators are needed',
      ],
      initLocation: 'Run once after creating the MCP server object and before registering or serving tools.',
      idempotencyChecks: [
        ...sdkSetup.idempotencyChecks,
        'Search the MCP server for TraceMindMCP.start(',
        'Check Python dependency files for an existing tracemind-mcp dependency.',
        'Search tool/resource/prompt registration code for existing TraceMindMCP.wrap_tool, wrap_resource, or wrap_prompt calls.',
      ],
      initSnippet: `from tracemind_mcp import TraceMindMCP\n\nTraceMindMCP.start(server, project_key="${project.projectKey}", source_key="docs-mcp")`,
      source: {
        type: 'mcp_server',
        key: 'Developer configured MCP server/package name, for example docs-mcp',
      },
      sourceModel: 'platform is server; sourceType is mcp_server; sourceKey is the configured MCP server/package name; sourceDetails records language, runtime, sdkVersion, sdkContentHash, and mcpFramework.',
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
    const sdkSetup = localSwiftSdkSetup();
    return {
      ...common,
      ...sdkSetup,
      platform: 'ios',
      eventPlatform: 'ios',
      install: 'Vendor the TraceMind Swift Package from the TraceMind GitHub source repo, add it as a local Swift Package, then import TraceMind in your App entrypoint.',
      installCommands: [
        ...sdkSetup.installCommands,
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
        ...sdkSetup.idempotencyChecks,
        'Search the app for TraceMind.start(',
        'Check Package.swift or the Xcode project for an existing TraceMind package dependency.',
      ],
      initSnippet: `TraceMind.start(projectKey: "${project.projectKey}")`,
      source: {
        type: 'ios',
        key: 'iOS bundle id, for example com.example.app',
      },
      sourceModel: 'platform remains ios; sourceKey is the iOS bundle id; sourceDetails.framework is swift; sourceDetails.sdkVersion and sdkContentHash support SDK upgrade governance.',
      networkRestrictionChecks: IOS_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'swift test --package-path sdk/ios',
        'Run the app, trigger launch/screen/tap/input/submit, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'try? TraceMind.identify("user_123", traits: ["plan": "pro"])',
      manualCaptureExamples: [
        'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutViewController", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
        'try? TraceMind.captureError(error, path: "CheckoutViewController", component: "CheckoutViewController", handled: true)',
      ],
      manualCaptureExample: 'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutViewController", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
    };
  }

  if (platform === 'macos') {
    const sdkSetup = localSwiftSdkSetup();
    return {
      ...common,
      ...sdkSetup,
      platform: 'macos',
      eventPlatform: 'macos',
      install: 'Vendor the TraceMind Swift Package from the TraceMind GitHub source repo, add it as a local Swift Package, then initialize TraceMind once from the macOS app bootstrap.',
      installCommands: [
        ...sdkSetup.installCommands,
        'Import TraceMind in App.swift, AppDelegate.swift, or the app startup file that owns launch.',
      ],
      filesToEdit: [
        'Package.swift or the Xcode Swift Package dependency list',
        'App.swift',
        'AppDelegate.swift',
        'SceneDelegate.swift if it owns startup in an older AppKit app',
      ],
      initLocation: 'Run once during app startup, before the first user window is shown.',
      idempotencyChecks: [
        ...sdkSetup.idempotencyChecks,
        'Search the app for TraceMind.start(',
        'Check Package.swift or the Xcode project for an existing TraceMind package dependency.',
      ],
      initSnippet: `TraceMind.start(projectKey: "${project.projectKey}")`,
      source: {
        type: 'macos',
        key: 'macOS bundle id, for example com.example.app',
      },
      sourceModel: 'platform remains macos; sourceKey is the macOS bundle id; sourceDetails.framework is swift; sourceDetails.sdkVersion and sdkContentHash support SDK upgrade governance.',
      autoCapturedSignals: [
        'app/session start',
        'screen or window view',
        'window or main-window change',
      ],
      networkRestrictionChecks: IOS_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'swift test --package-path sdk/ios',
        'Run the app, trigger launch/window focus/screen changes, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'try? TraceMind.identify("user_123", traits: ["plan": "pro"])',
      manualCaptureExamples: [
        'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutWindow", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
        'try? TraceMind.captureError(error, path: "CheckoutWindow", component: "CheckoutWindow", handled: true)',
        'TraceMind.setScreen("CheckoutWindow")',
      ],
      manualCaptureExample: 'try? TraceMind.capture("custom", eventName: approvedEventName, path: "CheckoutWindow", properties: ["plan": "pro", "amount": 29, "trial": true], context: ["source": "pricing"])',
    };
  }

  if (platform === 'android') {
    const sdkSetup = registryAndroidSdkSetup();
    return {
      ...common,
      ...sdkSetup,
      platform: 'android',
      eventPlatform: 'android',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install the TraceMind Android SDK from Maven Central and initialize TraceMind from Application.onCreate().'
        : 'Vendor the TraceMind Android SDK from the TraceMind GitHub source repo, add it as a local Gradle module, and initialize TraceMind from Application.onCreate().',
      installCommands: [
        ...sdkSetup.installCommands,
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
        ...sdkSetup.idempotencyChecks,
        'Search the app for TraceMind.start(',
        'Check AndroidManifest.xml for the Application class that owns startup.',
        'Check Gradle settings/build files for an existing TraceMind SDK dependency or module include.',
      ],
      initSnippet: `TraceMind.start(application, projectKey = "${project.projectKey}")`,
      source: {
        type: 'android',
        key: 'Android package name, for example com.example.app',
      },
      sourceModel: 'platform remains android; sourceKey is the Android package name; sourceDetails.framework is kotlin; sourceDetails.sdkVersion and sdkContentHash support SDK upgrade governance.',
      networkRestrictionChecks: ANDROID_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm run test:sdk:android',
        'Run the app, trigger launch/screen/tap/input/submit, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'TraceMind.identify(userId = "user_123", traits = mapOf("plan" to "pro"))',
      manualCaptureExamples: [
        'TraceMind.capture(type = "custom", eventName = approvedEventName, path = "CheckoutActivity", properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true), context = mapOf("source" to "pricing"))',
        'TraceMind.captureError(error, path = "CheckoutActivity", component = "CheckoutActivity", handled = true)',
      ],
      manualCaptureExample: 'TraceMind.capture(type = "custom", eventName = approvedEventName, path = "CheckoutActivity", properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true), context = mapOf("source" to "pricing"))',
    };
  }

  if (platform === 'react_native') {
    const sdkSetup = registryJsSdkSetup({
      packageName: '@tracemind/react-native',
      sdkName: 'react_native',
      sdkSourcePath: 'sdk/react-native',
      customerVendorPath: 'vendor/tracemind/react-native',
    });
    return {
      ...common,
      ...sdkSetup,
      platform: 'react_native',
      eventPlatform: 'ios_or_android',
      install: sdkSetup.distributionMode === 'registry'
        ? 'Install @tracemind/react-native from npm and run the native package install step for iOS and Android.'
        : 'Vendor @tracemind/react-native from the TraceMind GitHub source repo, install it as a local file dependency, and run the native package install step for iOS and Android.',
      installCommands: [
        ...sdkSetup.installCommands,
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
        ...sdkSetup.idempotencyChecks,
        'Search JavaScript and TypeScript files for TraceMind.start(',
        'Check package.json for an existing @tracemind/react-native dependency.',
        'Check native iOS and Android projects for an existing TraceMind native module link.',
      ],
      initSnippet: `TraceMind.start({ projectKey: "${project.projectKey}" })`,
      source: {
        type: 'ios_or_android',
        key: 'Native bundle id or package name; React Native is marked in deviceInfo.framework.',
      },
      sourceModel: 'Do not create a react_native platform value. Events keep platform ios or android and mark deviceInfo.framework/sourceDetails.framework as react_native; sourceDetails.sdkVersion and sdkContentHash support SDK upgrade governance.',
      networkRestrictionChecks: REACT_NATIVE_NETWORK_RESTRICTION_CHECKS,
      verificationCommands: [
        'npm test --prefix sdk/react-native',
        'Run the iOS and Android app variants, then query TraceMind raw behaviors or semantic events.',
      ],
      identifySnippet: 'TraceMind.identify("user_123", { plan: "pro" })',
      manualCaptureExamples: [
        'TraceMind.capture("custom", { eventName: approvedEventName, path: "Checkout", properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
        'TraceMind.captureError(error, { path: "Checkout", component: "CheckoutScreen", handled: true })',
      ],
      manualCaptureExample: 'TraceMind.capture("custom", { eventName: approvedEventName, path: "Checkout", properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
    };
  }

  const captureScriptUrl = captureSetupScriptUrl();
  return {
    ...common,
    platform: 'web',
    eventPlatform: 'web',
    captureScriptUrl,
    captureSnippet: `<script src="${captureScriptUrl}" data-tracemind-token="${project.projectKey}" async></script>`,
    initSnippet: `<script src="${captureScriptUrl}" data-tracemind-token="${project.projectKey}" async></script>`,
    webCaptureScript: {
      latestReleaseId: CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID,
      versionSource: 'sourceDetails.scriptReleaseId',
      updateFindingCode: 'web_capture_script_update_required',
      upgradePrompt: webCaptureScriptUpgradePrompt(),
      verificationSteps: [
        `Open the customer app and confirm window.TraceMind.status().scriptReleaseId === "${CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID}".`,
        'Trigger a real page load, click, input, or submit event.',
        'Call tracemind.project_health and confirm health.captureScriptFindings is empty or no longer includes the Web source.',
      ],
    },
    installCommands: [
      'No package install is required. Add captureSnippet to the global HTML head or root document layout.',
    ],
    filesToEdit: [
      'main HTML file, root layout, app.html, _document, or equivalent global document entry',
    ],
    initLocation: 'Global document head or root layout loaded on every page.',
    idempotencyChecks: [
      'Search for /capture.js',
      'Search for capture.<hash>.js, self-hosted TraceMind script copies, service worker precache entries, CDN long-cache rules, and WebView bundles that may pin an old Web Auto Capture script.',
      'Search for data-tracemind-token',
      'Do not add a second script if Auto Capture is already initialized for this project.',
    ],
    source: {
      type: 'web',
      key: 'Request Origin or Referer hostname.',
    },
    sourceModel: 'platform is web; sourceKey is normalized from request Origin or Referer hostname.',
    autoCapturedSignals: [
      ...AUTO_CAPTURE_SIGNALS,
      'window error and unhandledrejection summaries as app_error without stack traces',
    ],
    networkRestrictionChecks: WEB_NETWORK_RESTRICTION_CHECKS,
    verificationCommands: [
      'Run the web app, trigger a page load/click/input/submit, then query TraceMind raw behaviors or semantic events.',
      `Open the app and check window.TraceMind.status().scriptReleaseId equals ${CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID}.`,
    ],
    identifySnippet: 'window.TraceMind.identify("user_123", { plan: "pro" })',
    manualCaptureExamples: [
      'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
      'window.TraceMind.captureError(error, { component: "CheckoutForm", handled: true })',
    ],
    manualCaptureExample: 'window.TraceMind.capture("custom", { eventName: approvedEventName, properties: { plan: "pro", amount: 29, trial: true }, context: { source: "pricing" } })',
  };
}

function captureSetupResult(project, args = {}) {
  if (!project?.projectKey) {
    return {
      ok: false,
      agentSetupNotice: agentSetupNotice(),
      findings: [{
        severity: 'error',
        code: 'missing_project_key',
        message: 'Current project is missing a public Auto Capture project key.',
      }],
    };
  }

  const requestedPlatform = String(args.platform || '').toLowerCase().replace(/-/g, '_');
  const requestedProvider = String(args.provider || '').toLowerCase().replace(/-/g, '_');
  const aliasProvider = MINI_PROGRAM_PLATFORM_ALIASES[requestedPlatform];
  const isBrowserExtensionAlias = BROWSER_EXTENSION_PLATFORM_ALIASES.has(requestedPlatform);
  const provider = MINI_PROGRAM_PROVIDERS.includes(requestedProvider)
    ? requestedProvider
    : aliasProvider || 'wechat';
  const platform = aliasProvider
    ? 'mini_program'
    : isBrowserExtensionAlias
      ? 'browser_extension'
    : CAPTURE_SETUP_PLATFORMS.includes(requestedPlatform)
      ? requestedPlatform
      : 'web';

  return {
    ok: true,
    projectKey: project.projectKey,
    tokenType: 'public_auto_capture_project_key',
    agentSetupNotice: agentSetupNotice(),
    ...platformSetup(project, platform, { provider }),
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

function privacyFindings(fields = {}, options = {}) {
  const findings = [];
  const allowedDerivedKeys = options.allowedDerivedKeys || new Set();
  flattenFields(fields).forEach((field) => {
    const value = String(field.value || '');
    const forbiddenKey = isForbiddenAnalyticsKey(field.key) && !allowedDerivedKeys.has(field.key);
    const looksLikeEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
    const looksLikeSecret = /(sk-|pk_|bearer\s+|api[_-]?key|access[_-]?token)/i.test(value);
    const looksLikeFullQueryUrl = /^https?:\/\/\S+\?\S+/.test(value);
    const looksLikeRawSensitiveContent = /\b(raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body|authorization\s*:|set-cookie\s*:)/i.test(value);

    if (forbiddenKey || looksLikeEmail || looksLikeSecret || looksLikeFullQueryUrl || looksLikeRawSensitiveContent) {
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

const FEEDBACK_TYPES = new Set(['issue', 'idea']);
const FEEDBACK_PLATFORMS = new Set(['web', 'ios', 'macos', 'android', 'mini_program', 'browser_extension', 'server', 'unknown']);
const FEEDBACK_SOURCE_TYPES = new Set(['web', 'ios', 'macos', 'android', 'mini_program', 'browser_extension', 'mcp_server', 'agent_skill', 'server_app', 'unknown']);
const FEEDBACK_ARRAY_LIMIT = 20;
const FEEDBACK_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_RATE_WINDOW_MS = 60 * 1000;
const FEEDBACK_RATE_LIMIT = 5;
const FEEDBACK_DAILY_LIMIT = 100;

function feedbackText(value, max = 1000) {
  return safeString(value, max).trim();
}

function feedbackDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function feedbackArray(value, maxLength = 160, limit = FEEDBACK_ARRAY_LIMIT) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => feedbackText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeFeedbackEvidence(evidenceInput = {}) {
  const evidence = safeObject(evidenceInput);
  const sanitized = {
    paths: feedbackArray(evidence.paths, 300),
    eventIds: feedbackArray(evidence.eventIds, 120),
    rawBehaviorIds: feedbackArray(evidence.rawBehaviorIds, 120),
    actionKeys: feedbackArray(evidence.actionKeys, 300),
    targetHashes: feedbackArray(evidence.targetHashes, 120),
    userIds: feedbackArray(evidence.userIds, 120),
    sessionIds: feedbackArray(evidence.sessionIds, 120),
    deviceIds: feedbackArray(evidence.deviceIds, 120),
    examples: feedbackArray(evidence.examples, 500, 10),
  };
  const startAt = feedbackDate(evidence.startAt);
  const endAt = feedbackDate(evidence.endAt);

  if (startAt) sanitized.startAt = startAt;
  if (endAt) sanitized.endAt = endAt;

  return sanitized;
}

function sanitizeFeedbackEnvironment(environmentInput = {}) {
  const environment = safeObject(environmentInput);
  const platform = String(environment.platform || 'unknown').toLowerCase();
  const sourceType = String(environment.sourceType || 'unknown').toLowerCase();

  return {
    platform: FEEDBACK_PLATFORMS.has(platform) ? platform : 'unknown',
    sourceType: FEEDBACK_SOURCE_TYPES.has(sourceType) ? sourceType : 'unknown',
    sourceKey: feedbackText(environment.sourceKey, 200),
  };
}

function feedbackTokenAttribution(project = {}, mcpToken = '') {
  const token = (project.mcpTokens || []).find((candidate) => candidate.token === mcpToken);
  if (!token) return {};
  return {
    mcpTokenId: token.id,
    mcpTokenName: token.name,
  };
}

function feedbackTokenScope(project = {}, mcpToken = '') {
  return feedbackTokenAttribution(project, mcpToken).mcpTokenId || 'unknown';
}

function canonicalFeedbackValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalFeedbackValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalFeedbackValue(value[key])]),
    );
  }
  return value;
}

function feedbackFingerprint(sanitized) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalFeedbackValue(sanitized)))
    .digest('hex');
}

function sanitizeFeedbackReport(args = {}) {
  return {
    type: feedbackText(args.type, 20).toLowerCase(),
    title: feedbackText(args.title, 160),
    summary: feedbackText(args.summary, 2000),
    expected: feedbackText(args.expected, 1000),
    actual: feedbackText(args.actual, 1000),
    suggestion: feedbackText(args.suggestion, 1000),
    reproductionSteps: feedbackArray(args.reproductionSteps, 500, 12),
    evidence: sanitizeFeedbackEvidence(args.evidence),
    environment: sanitizeFeedbackEnvironment(args.environment),
  };
}

function validateFeedbackReport(args = {}) {
  const sanitized = sanitizeFeedbackReport(args);
  const findings = [];

  if (!FEEDBACK_TYPES.has(sanitized.type)) {
    addFinding(findings, 'error', 'invalid_feedback_type', 'Feedback type must be issue or idea.', 'type');
  }
  if (!sanitized.title) {
    addFinding(findings, 'error', 'missing_feedback_title', 'Feedback title is required.', 'title');
  }
  if (!sanitized.summary) {
    addFinding(findings, 'error', 'missing_feedback_summary', 'Feedback summary is required.', 'summary');
  }

  privacyFindings(args).forEach((finding) => findings.push(finding));

  return { sanitized, findings };
}

async function submitFeedbackReport(project, args = {}, options = {}) {
  const { sanitized, findings } = validateFeedbackReport(args);

  if (findings.some((finding) => finding.severity === 'error')) {
    return textResult(
      'TraceMind rejected the feedback report.',
      validationResult(findings, [
        'Submit only sanitized summaries and TraceMind evidence references.',
        'Remove PII, secrets, tokens, raw prompts, raw user content, source diffs, request/response bodies, headers, cookies, authorization values, and full query URLs.',
      ]),
    );
  }

  const createdAt = new Date();
  const mcpTokenId = feedbackTokenScope(project, options.mcpToken);
  const fingerprint = feedbackFingerprint(sanitized);
  const dedupeAfter = new Date(createdAt.getTime() - FEEDBACK_DEDUPE_WINDOW_MS);
  const duplicate = await FeedbackReports.findOneAsync({
    projectId: project._id,
    mcpTokenId,
    feedbackFingerprint: fingerprint,
    createdAt: { $gte: dedupeAfter },
  }, { sort: { createdAt: -1 } });

  if (duplicate) {
    return textResult(
      `TraceMind feedback already submitted: ${duplicate._id}.`,
      {
        ok: true,
        deduplicated: true,
        feedbackId: duplicate._id,
        createdAt: duplicate.createdAt,
      },
    );
  }

  const rateWindowStart = new Date(createdAt.getTime() - FEEDBACK_RATE_WINDOW_MS);
  const dailyWindowStart = new Date(createdAt.getTime() - FEEDBACK_DEDUPE_WINDOW_MS);
  const [recentCount, dailyCount] = await Promise.all([
    FeedbackReports.find({ projectId: project._id, mcpTokenId, createdAt: { $gte: rateWindowStart } }).countAsync(),
    FeedbackReports.find({ projectId: project._id, mcpTokenId, createdAt: { $gte: dailyWindowStart } }).countAsync(),
  ]);

  if (recentCount >= FEEDBACK_RATE_LIMIT || dailyCount >= FEEDBACK_DAILY_LIMIT) {
    const rateFindings = [];
    addFinding(
      rateFindings,
      'error',
      'feedback_rate_limited',
      'Too many feedback reports were submitted from this MCP token. Retry later or consolidate repeated reports.',
    );
    return textResult(
      'TraceMind rejected the feedback report.',
      validationResult(rateFindings, [
        'Consolidate repeated feedback before submitting.',
        'Use one feedback report with evidence references when multiple observations describe the same issue.',
      ]),
    );
  }

  const feedbackId = await FeedbackReports.insertAsync({
    projectId: project._id,
    projectName: projectDisplayName(project),
    submittedVia: 'mcp',
    ...feedbackTokenAttribution(project, options.mcpToken),
    mcpTokenId,
    feedbackFingerprint: fingerprint,
    ...sanitized,
    createdAt,
    updatedAt: createdAt,
  });

  return textResult(
    `TraceMind feedback submitted: ${feedbackId}.`,
    {
      ok: true,
      feedbackId,
      createdAt,
    },
  );
}

const USER_FEEDBACK_KINDS = new Set(['issue', 'idea', 'question', 'other']);
const USER_FEEDBACK_STATUSES = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate']);
const USER_FEEDBACK_RATE_WINDOW_MS = 60 * 1000;
const USER_FEEDBACK_RATE_LIMIT = 10;
const USER_FEEDBACK_DAILY_LIMIT = 200;
const USER_FEEDBACK_EVIDENCE_WINDOW_BEFORE_MS = 10 * 60 * 1000;
const USER_FEEDBACK_EVIDENCE_WINDOW_AFTER_MS = 60 * 1000;
const USER_FEEDBACK_FORBIDDEN_VALUE_PATTERN = /\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token|raw\s+prompt|raw\s+user\s+content|source\s+diff|code\s+diff|request\s+body|response\s+body|authorization\s*:|set-cookie\s*:|tool\s+arguments?|tool\s+results?|resource\s+content)\b|sk-[A-Za-z0-9_-]{12,}/i;
const USER_FEEDBACK_FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;

function addUserFeedbackFinding(findings, code, message, path) {
  addFinding(findings, 'error', code, message, path);
}

function userFeedbackText(value, max = 1000, fallback = '') {
  return safeString(value, max, fallback).trim();
}

function isUserFeedbackPrimitive(value) {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function userFeedbackValueIsForbidden(value) {
  if (typeof value !== 'string') return false;
  return USER_FEEDBACK_FORBIDDEN_VALUE_PATTERN.test(value) || USER_FEEDBACK_FULL_QUERY_URL_PATTERN.test(value);
}

function validateUserFeedbackFreeText(findings, value, path) {
  if (userFeedbackValueIsForbidden(value)) {
    addUserFeedbackFinding(
      findings,
      'forbidden_user_feedback_field',
      'User feedback must not include secrets, tokens, raw prompts, source diffs, request/response bodies, headers, cookies, authorization values, tool arguments/results, resource content, or full query URLs.',
      path,
    );
  }
}

function isAllowedUserFeedbackKey(key) {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(String(key || ''));
}

function sanitizeUserFeedbackFields(fieldsInput, findings, pathPrefix = 'message.fields') {
  const fields = safeObject(fieldsInput);
  const sanitized = {};
  Object.entries(fields).slice(0, 50).forEach(([key, value]) => {
    const path = `${pathPrefix}.${key}`;
    if (!isAllowedUserFeedbackKey(key) || isForbiddenAnalyticsKey(key)) {
      addUserFeedbackFinding(findings, 'forbidden_user_feedback_field', 'User feedback custom field keys must be stable non-sensitive identifiers.', path);
      return;
    }
    if (!isUserFeedbackPrimitive(value)) {
      addUserFeedbackFinding(findings, 'invalid_user_feedback_field', 'User feedback custom fields only support string, number, and boolean values.', path);
      return;
    }
    if (userFeedbackValueIsForbidden(value)) {
      addUserFeedbackFinding(findings, 'forbidden_user_feedback_field', 'User feedback custom field values must not include secrets, tokens, raw prompts, source diffs, request/response bodies, or full query URLs.', path);
      return;
    }
    sanitized[key] = typeof value === 'string' ? userFeedbackText(value, 500) : value;
  });
  return sanitized;
}

function sanitizeUserFeedbackContact(contactInput, findings) {
  const contact = safeObject(contactInput);
  if (contact.consent !== true) return { consent: false };

  const sanitized = { consent: true };
  [
    ['name', 120],
    ['email', 160],
    ['phone', 80],
    ['preferredChannel', 40],
  ].forEach(([key, max]) => {
    const value = userFeedbackText(contact[key], max);
    if (!value) return;
    if (userFeedbackValueIsForbidden(value)) {
      addUserFeedbackFinding(findings, 'forbidden_user_feedback_field', 'Contact fields may contain user-submitted contact details, but not secrets, tokens, raw prompts, or full query URLs.', `message.contact.${key}`);
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
}

function sanitizeUserFeedbackMessage(messageInput = {}) {
  const findings = [];
  const input = safeObject(messageInput, 12000);
  const kind = userFeedbackText(input.kind, 20).toLowerCase();
  const title = userFeedbackText(input.title, 160);
  const body = userFeedbackText(input.body || input.text, 4000);

  if (kind && !USER_FEEDBACK_KINDS.has(kind)) {
    addUserFeedbackFinding(findings, 'invalid_user_feedback_kind', 'User feedback kind must be issue, idea, question, or other.', 'message.kind');
  }
  if (!title && !body) {
    addUserFeedbackFinding(findings, 'missing_user_feedback_message', 'User feedback requires a title or body.', 'message.body');
  }
  validateUserFeedbackFreeText(findings, title, 'message.title');
  validateUserFeedbackFreeText(findings, body, 'message.body');

  const message = {
    formatVersion: 1,
    kind: USER_FEEDBACK_KINDS.has(kind) ? kind : 'other',
    title,
    body,
    contact: sanitizeUserFeedbackContact(input.contact, findings),
    fields: sanitizeUserFeedbackFields(input.fields, findings),
    attachments: [],
  };

  return { message, findings };
}

function userFeedbackActorKey(payload = {}, req = {}, source = {}) {
  return userFeedbackText(
    payload.userId
      || payload.anonymousId
      || payload.sessionId
      || payload.deviceId
      || payload.deviceFingerprint
      || clientIp(req)
      || `${source.sourceType || 'unknown'}:${source.sourceKey || 'unknown'}`,
    200,
    'unknown',
  );
}

function userFeedbackRateKeys(payload = {}, req = {}, source = {}) {
  return uniqueFeedbackValues([
    payload.userId ? `user:${payload.userId}` : '',
    payload.anonymousId ? `anonymous:${payload.anonymousId}` : '',
    payload.sessionId ? `session:${payload.sessionId}` : '',
    payload.deviceId ? `device:${payload.deviceId}` : '',
    payload.deviceFingerprint ? `fingerprint:${payload.deviceFingerprint}` : '',
    clientIp(req) ? `ip:${clientIp(req)}` : '',
    `${source.sourceType || 'unknown'}:${source.sourceKey || 'unknown'}`,
  ], 20);
}

function uniqueFeedbackValues(values = [], max = 20) {
  return [...new Set(values.map((value) => userFeedbackText(value, 500)).filter(Boolean))].slice(0, max);
}

function userFeedbackDate(value) {
  const date = feedbackDate(value);
  return date || new Date();
}

async function buildUserFeedbackEvidence(project, payload = {}, occurredAt) {
  const startAt = new Date(occurredAt.getTime() - USER_FEEDBACK_EVIDENCE_WINDOW_BEFORE_MS);
  const endAt = new Date(occurredAt.getTime() + USER_FEEDBACK_EVIDENCE_WINDOW_AFTER_MS);
  const identityClauses = ['sessionId', 'userId', 'anonymousId', 'deviceId', 'deviceFingerprint']
    .map((field) => {
      const value = userFeedbackText(payload[field], 200);
      return value ? { [field]: value } : null;
    })
    .filter(Boolean);
  const path = userFeedbackText(payload.path || payload.screen, 500);
  const baseQuery = {
    projectId: project._id,
    occurredAt: { $gte: startAt, $lte: endAt },
  };
  const matchQuery = identityClauses.length
    ? { ...baseQuery, $or: identityClauses }
    : { ...baseQuery, ...(path ? { path } : {}) };
  const [events, rawBehaviors] = await Promise.all([
    SemanticEvents.find(matchQuery, { sort: { occurredAt: -1 }, limit: 20 }).fetchAsync(),
    RawBehaviors.find(matchQuery, { sort: { occurredAt: -1 }, limit: 20 }).fetchAsync(),
  ]);

  return {
    startAt,
    endAt,
    paths: uniqueFeedbackValues([path, ...events.map((event) => event.path), ...rawBehaviors.map((behavior) => behavior.path)]),
    eventIds: uniqueFeedbackValues(events.map((event) => event._id), 20),
    rawBehaviorIds: uniqueFeedbackValues(rawBehaviors.map((behavior) => behavior._id), 20),
    actionKeys: uniqueFeedbackValues([...events.map((event) => event.actionKey), ...rawBehaviors.map((behavior) => behavior.actionKey)]),
    targetHashes: uniqueFeedbackValues([...events.map((event) => event.targetHash), ...rawBehaviors.map((behavior) => behavior.targetHash)]),
    userIds: uniqueFeedbackValues([payload.userId, ...events.map((event) => event.userId), ...rawBehaviors.map((behavior) => behavior.userId)]),
    anonymousIds: uniqueFeedbackValues([payload.anonymousId, ...events.map((event) => event.anonymousId), ...rawBehaviors.map((behavior) => behavior.anonymousId)]),
    sessionIds: uniqueFeedbackValues([payload.sessionId, ...events.map((event) => event.sessionId), ...rawBehaviors.map((behavior) => behavior.sessionId)]),
    deviceIds: uniqueFeedbackValues([payload.deviceId, ...events.map((event) => event.deviceId), ...rawBehaviors.map((behavior) => behavior.deviceId)]),
  };
}

function sanitizeUserFeedbackEnvironment(source = {}, payload = {}) {
  return {
    platform: userFeedbackText(payload.platform, 40, 'unknown'),
    sourceType: source.sourceType || 'unknown',
    sourceKey: source.sourceKey || 'unknown',
    sourceLabel: source.sourceLabel || source.sourceKey || 'unknown',
    sourceDetails: safeObject(source.sourceDetails, 4096),
  };
}

function hasUserFeedbackContact(message = {}) {
  const contact = message.contact || {};
  return contact.consent === true && ['name', 'email', 'phone', 'preferredChannel'].some((key) => !!contact[key]);
}

function userFeedbackSearchText(message = {}) {
  const fields = safeObject(message.fields, 4096);
  const fieldParts = [];
  Object.entries(fields).forEach(([key, value]) => {
    fieldParts.push(key);
    if (isUserFeedbackPrimitive(value)) fieldParts.push(String(value));
  });
  return userFeedbackText([
    message.kind,
    message.title,
    message.body,
    ...fieldParts,
  ].filter(Boolean).join(' '), 8000);
}

async function insertUserFeedbackEvent(project, payload = {}, req = {}) {
  const { message, findings } = sanitizeUserFeedbackMessage(payload.message || payload);
  if (findings.some((finding) => finding.severity === 'error')) {
    return { ok: false, findings };
  }

  const source = normalizeCaptureSource(payload, req.headers || {});
  if (isSourceBlocked(project, source)) return { ok: true, ignored: true };

  const createdAt = new Date();
  const occurredAt = userFeedbackDate(payload.occurredAt);
  const actorKey = userFeedbackActorKey(payload, req, source);
  const rateKeys = userFeedbackRateKeys(payload, req, source);
  const fingerprint = feedbackFingerprint({
    actorKey,
    path: userFeedbackText(payload.path || payload.screen, 500),
    message,
  });
  const dedupeAfter = new Date(createdAt.getTime() - FEEDBACK_DEDUPE_WINDOW_MS);
  const duplicate = await UserFeedbackReports.findOneAsync({
    projectId: project._id,
    rateKeys: { $in: rateKeys },
    feedbackFingerprint: fingerprint,
    createdAt: { $gte: dedupeAfter },
  }, { sort: { createdAt: -1 } });

  if (duplicate) {
    return {
      ok: true,
      deduplicated: true,
      userFeedbackId: duplicate._id,
      createdAt: duplicate.createdAt,
    };
  }

  const rateWindowStart = new Date(createdAt.getTime() - USER_FEEDBACK_RATE_WINDOW_MS);
  const dailyWindowStart = new Date(createdAt.getTime() - FEEDBACK_DEDUPE_WINDOW_MS);
  const [recentCount, dailyCount] = await Promise.all([
    UserFeedbackReports.find({ projectId: project._id, rateKeys: { $in: rateKeys }, createdAt: { $gte: rateWindowStart } }).countAsync(),
    UserFeedbackReports.find({ projectId: project._id, rateKeys: { $in: rateKeys }, createdAt: { $gte: dailyWindowStart } }).countAsync(),
  ]);
  if (recentCount >= USER_FEEDBACK_RATE_LIMIT || dailyCount >= USER_FEEDBACK_DAILY_LIMIT) {
    const rateFindings = [];
    addUserFeedbackFinding(rateFindings, 'user_feedback_rate_limited', 'Too many user feedback reports were submitted from this actor. Retry later or consolidate repeated reports.');
    return { ok: false, findings: rateFindings };
  }

  const evidence = await buildUserFeedbackEvidence(project, payload, occurredAt);
  const environment = sanitizeUserFeedbackEnvironment(source, payload);
  const userFeedbackId = await UserFeedbackReports.insertAsync({
    projectId: project._id,
    projectName: projectDisplayName(project),
    submittedVia: 'sdk',
    status: 'new',
    actorKey,
    rateKeys,
    feedbackFingerprint: fingerprint,
    sessionId: userFeedbackText(payload.sessionId, 120),
    anonymousId: userFeedbackText(payload.anonymousId, 120),
    userId: userFeedbackText(payload.userId, 160),
    deviceId: userFeedbackText(payload.deviceId, 120),
    deviceFingerprint: userFeedbackText(payload.deviceFingerprint, 120),
    path: userFeedbackText(payload.path || payload.screen, 500),
    platform: userFeedbackText(payload.platform, 40, 'unknown'),
    ip: userFeedbackText(clientIp(req), 80),
    geo: { ...geoFromHeaders(req), ...safeObject(payload.geo, 2048) },
    message,
    searchText: userFeedbackSearchText(message),
    hasContact: hasUserFeedbackContact(message),
    evidence,
    environment,
    activityLog: [],
    occurredAt,
    createdAt,
    updatedAt: createdAt,
  });

  return { ok: true, userFeedbackId, createdAt };
}

export async function ingestUserFeedbackPayload(payload = {}, req = {}) {
  payload = payload || {};
  const project = await resolveProjectByKey(payload.projectKey);
  if (!project) {
    return { ok: false, statusCode: 401, error: 'invalid_project_key' };
  }

  if (Array.isArray(payload.events)) {
    let accepted = 0;
    let ignored = 0;
    const results = [];
    const sharedPayload = { ...payload };
    delete sharedPayload.events;

    for (const eventPayload of payload.events.slice(0, 50)) {
      const result = await insertUserFeedbackEvent(project, {
        ...sharedPayload,
        ...safeObject(eventPayload, 12000),
        projectKey: project.projectKey,
      }, req);
      results.push(result);
      if (result.ignored) ignored += 1;
      else if (result.ok) accepted += 1;
    }

    const firstError = results.find((result) => !result.ok);
    const result = firstError && accepted === 0
      ? { ok: false, findings: firstError.findings || [], accepted, ignored }
      : { ok: true, accepted, ignored, results };
    await safelyRecordDeliveryReport(project, payload, req, 'user_feedback', result);
    return result;
  }

  const result = await insertUserFeedbackEvent(project, payload, req);
  await safelyRecordDeliveryReport(project, payload, req, 'user_feedback', {
    accepted: result.ok && !result.ignored ? 1 : 0,
    ignored: result.ignored ? 1 : 0,
  });
  return result;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicUserFeedbackReport(report = {}, { includeMessage = false } = {}) {
  const message = report.message || {};
  const summaryMessage = includeMessage
    ? message
    : {
      formatVersion: message.formatVersion || 1,
      kind: message.kind || 'other',
      title: message.title || '',
      preview: userFeedbackText(message.body, 300),
      hasContact: !!report.hasContact,
      fields: safeObject(message.fields, 4096),
    };
  return {
    _id: report._id,
    projectId: report.projectId,
    status: report.status || 'new',
    submittedVia: report.submittedVia || 'sdk',
    message: summaryMessage,
    hasContact: !!report.hasContact,
    evidence: report.evidence || {},
    environment: report.environment || {},
    path: report.path || '',
    platform: report.platform || report.environment?.platform || 'unknown',
    sessionId: report.sessionId || '',
    userId: report.userId || '',
    anonymousId: report.anonymousId || '',
    deviceId: report.deviceId || '',
    note: report.note || '',
    resolution: report.resolution || '',
    linkedIssueUrl: report.linkedIssueUrl || '',
    duplicateOf: report.duplicateOf || '',
    activityLog: includeMessage ? (report.activityLog || []) : undefined,
    occurredAt: report.occurredAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function buildUserFeedbackQuery(project, args = {}) {
  const query = { projectId: project._id };
  const andClauses = [];
  if (args.id) query._id = userFeedbackText(args.id, 120);
  const status = userFeedbackText(args.status, 40);
  if (USER_FEEDBACK_STATUSES.has(status)) query.status = status;
  const kind = userFeedbackText(args.kind, 40);
  if (USER_FEEDBACK_KINDS.has(kind)) query['message.kind'] = kind;
  const startAt = feedbackDate(args.startAt);
  const endAt = feedbackDate(args.endAt);
  if (startAt || endAt) query.createdAt = {};
  if (startAt) query.createdAt.$gte = startAt;
  if (endAt) query.createdAt.$lte = endAt;
  ['userId', 'anonymousId', 'sessionId', 'deviceId'].forEach((field) => {
    const value = userFeedbackText(args[field], 200);
    if (value) query[field] = value;
  });
  const platform = userFeedbackText(args.platform, 40);
  if (platform) andClauses.push({ $or: [{ platform }, { 'environment.platform': platform }] });
  const sourceType = userFeedbackText(args.sourceType, 40);
  if (sourceType) query['environment.sourceType'] = sourceType;
  if (typeof args.hasContact === 'boolean') query.hasContact = args.hasContact;
  const path = userFeedbackText(args.path || args.screen, 500);
  if (path) {
    andClauses.push({ $or: [{ path }, { 'evidence.paths': path }] });
  }
  const keyword = userFeedbackText(args.keyword, 160);
  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), 'i');
    andClauses.push({ $or: [
      { 'message.title': regex },
      { 'message.body': regex },
      { searchText: regex },
    ] });
  }
  if (andClauses.length === 1) {
    Object.assign(query, andClauses[0]);
  } else if (andClauses.length > 1) {
    query.$and = andClauses;
  }
  return query;
}

async function queryUserFeedbackReports(project, args = {}) {
  const includeMessage = args.includeMessage === true || !!args.id;
  const reports = await UserFeedbackReports.find(
    buildUserFeedbackQuery(project, args),
    { sort: { createdAt: -1 }, limit: safeLimit(args.limit, args.id ? 1 : 50, 200) },
  ).fetchAsync();
  const feedback = reports.map((report) => publicUserFeedbackReport(report, { includeMessage }));
  return textResult(
    feedback.map((report) => `${report.createdAt?.toISOString?.() || report.createdAt} ${report.status} ${report.message.kind}: ${report.message.title || report.message.preview}`).join('\n') || '没有找到用户反馈。',
    {
      ok: true,
      project: { _id: project._id, name: project.name },
      feedback,
    },
  );
}

async function updateUserFeedbackReport(project, args = {}, options = {}) {
  const id = userFeedbackText(args.id, 120);
  if (!id) throw new Error('User feedback id is required.');
  const existing = await UserFeedbackReports.findOneAsync({ _id: id, projectId: project._id });
  if (!existing) throw new Error('User feedback not found.');

  const set = { updatedAt: new Date() };
  const status = userFeedbackText(args.status, 40);
  if (status) {
    if (!USER_FEEDBACK_STATUSES.has(status)) throw new Error(`Invalid user feedback status: ${status}`);
    set.status = status;
  }
  const note = userFeedbackText(args.note, 2000);
  const resolution = userFeedbackText(args.resolution, 2000);
  const linkedIssueUrl = userFeedbackText(args.linkedIssueUrl, 500);
  const duplicateOf = userFeedbackText(args.duplicateOf, 120);
  if (note) set.note = note;
  if (resolution) set.resolution = resolution;
  if (linkedIssueUrl) set.linkedIssueUrl = linkedIssueUrl;
  if (duplicateOf) set.duplicateOf = duplicateOf;

  const activity = {
    action: 'update_user_feedback',
    ...feedbackTokenAttribution(project, options.mcpToken),
    mcpTokenId: feedbackTokenScope(project, options.mcpToken),
    status: set.status || existing.status || 'new',
    note,
    resolution,
    linkedIssueUrl,
    duplicateOf,
    createdAt: set.updatedAt,
  };
  await UserFeedbackReports.updateAsync(
    { _id: id, projectId: project._id },
    {
      $set: set,
      $push: { activityLog: activity },
    },
  );
  const report = await UserFeedbackReports.findOneAsync({ _id: id, projectId: project._id });
  return textResult(
    `TraceMind user feedback updated: ${id}.`,
    {
      ok: true,
      feedback: publicUserFeedbackReport(report, { includeMessage: true }),
    },
  );
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

function isSafeDerivedAnalyticsKey(key) {
  return SAFE_DERIVED_ANALYTICS_KEYS.has(String(key || ''));
}

function isForbiddenAppErrorKey(key) {
  return isForbiddenAnalyticsKey(key) && !isSafeDerivedAnalyticsKey(key);
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

function safePathWithoutQuery(value, fallback = '/') {
  const text = safeString(value, 500, fallback);
  if (!text) return fallback;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return safeString(`${url.pathname || '/'}${url.hash || ''}`, 500, fallback);
    } catch (error) {
      return fallback;
    }
  }
  const withoutQuery = text.split('?')[0];
  return safeString(withoutQuery || fallback, 500, fallback);
}

function sanitizePrimitiveFieldValue(value) {
  if (!isSafeServerPrimitive(value)) return undefined;
  if (typeof value === 'string') {
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) return undefined;
    if (/(sk-|pk_|bearer\s+|api[_-]?key|access[_-]?token|secret|password)/i.test(value)) return undefined;
    if (/^https?:\/\/\S+\?\S+/.test(value)) return undefined;
    if (/\b(raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body|authorization\s*:|set-cookie\s*:)/i.test(value)) return undefined;
    return safeString(value, 500);
  }
  return value;
}

function sanitizeErrorMessagePreview(value) {
  const text = safeString(value, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[email]')
    .replace(/https?:\/\/\S+/ig, '[url]')
    .replace(/(^|\s)\/[^\s?]+\?\S+/g, '$1[url]')
    .replace(/\b(sk-[A-Za-z0-9_-]+|pk_[A-Za-z0-9_-]+|bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|access[_-]?token\s*[:=]\s*\S+|token\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|password\s*[:=]\s*\S+)\b/ig, '[redacted]')
    .replace(/\b\d{12,19}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  if (!text) return undefined;
  if (/@|https?:|%40|bearer\s+|api[_-]?key|access[_-]?token|sk-|pk_|secret|password/i.test(text)) return undefined;
  if (/\b(raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body|authorization\s*:|set-cookie\s*:)/i.test(text)) return undefined;
  return text;
}

const APP_ERROR_FINGERPRINT_PREFIXES = {
  messageFingerprint: 'tm_error_',
  stackFingerprint: 'tm_stack_',
  topFrameFingerprint: 'tm_frame_',
  causeFingerprint: 'tm_cause_',
};

const APP_ERROR_SHORT_TEXT_MAX = {
  errorKind: 40,
  errorType: 80,
  source: 40,
  release: 80,
  component: 120,
  operation: 120,
  feature: 120,
  routeName: 120,
  correlationId: 120,
  requestId: 120,
  status: 40,
  occurredAt: 80,
  causeType: 80,
};

function sanitizeAppErrorFieldValue(key, value) {
  if (key === 'messagePreview') return sanitizeErrorMessagePreview(value);
  if (key === 'httpStatus') {
    const status = typeof value === 'string' ? Number(value) : value;
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  }
  const fingerprintPrefix = APP_ERROR_FINGERPRINT_PREFIXES[key];
  if (fingerprintPrefix) {
    const fingerprint = safeString(value, 120).toLowerCase();
    return new RegExp(`^${fingerprintPrefix}[a-z0-9]{6,64}$`).test(fingerprint) ? fingerprint : undefined;
  }
  const nextValue = sanitizePrimitiveFieldValue(value);
  if (typeof nextValue === 'string') {
    return safeString(nextValue, APP_ERROR_SHORT_TEXT_MAX[key] || 160);
  }
  return nextValue;
}

function sanitizeAppErrorFields(fields = {}, allowedKeys = APP_ERROR_PROPERTY_KEYS) {
  const input = safeObject(fields, 4096);
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (!allowedKeys.has(key) || isForbiddenAppErrorKey(key)) return [];
      const nextValue = sanitizeAppErrorFieldValue(key, value);
      return nextValue === undefined ? [] : [[key, nextValue]];
    }),
  );
}

function sanitizeAppErrorProperties(fields = {}) {
  const properties = sanitizeAppErrorFields(fields, APP_ERROR_PROPERTY_KEYS);
  if (!properties.status) properties.status = 'error';
  return properties;
}

function sanitizeAppErrorContext(fields = {}) {
  return sanitizeAppErrorFields(fields, APP_ERROR_CONTEXT_KEYS);
}

function deliverySourcePayload(payload = {}) {
  const firstEvent = Array.isArray(payload.events) && payload.events.length > 0
    ? safeObject(payload.events[0])
    : {};
  return {
    ...payload,
    ...firstEvent,
    source: firstEvent.source || payload.source,
    sourceType: firstEvent.sourceType || payload.sourceType,
    sourceKey: firstEvent.sourceKey || payload.sourceKey,
    platform: firstEvent.platform || payload.platform,
  };
}

const DELIVERY_ROLLUP_HOUR_MS = 60 * 60 * 1000;

function deliveryHourStart(date) {
  const value = date instanceof Date ? date : new Date(date);
  return new Date(Math.floor(value.getTime() / DELIVERY_ROLLUP_HOUR_MS) * DELIVERY_ROLLUP_HOUR_MS);
}

function deliveryIsDiagnostic(report) {
  return Boolean(report.deliveryEpisodeId)
    || Boolean(report.lastError)
    || Number(report.retryCount) > 0
    || Number(report.droppedOldest) > 0
    || Number(report.droppedStorage) > 0;
}

function deliveryReportDocument(project, payload = {}, req = {}, endpoint, result = {}) {
  const stats = safeObject(payload.deliveryStats, 4096);
  if (Object.keys(stats).length === 0) return null;

  const sourcePayload = deliverySourcePayload(payload);
  const source = normalizeCaptureSource(sourcePayload, req.headers || {});
  const lastFailedFlushAt = safeDate(stats.lastFailedFlushAt);
  const recoveryEpisode = sanitizeDeliveryRecoveryEpisode(stats.recoveryEpisode);
  const report = {
    projectId: project._id,
    projectKey: project.projectKey,
    endpoint: safeString(endpoint, 40),
    platform: deliveryDiagnosticsPlatform({ platform: sourcePayload.platform, sourceType: source.sourceType }),
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceLabel: source.sourceLabel,
    sourceDetails: source.sourceDetails,
    sessionId: safeString(payload.sessionId, 120),
    deviceId: safeString(payload.deviceId, 120),
    batchId: safeString(stats.batchId, 120),
    reason: safeString(stats.reason, 80),
    queued: safeCount(stats.queued),
    sent: safeCount(stats.sent),
    accepted: safeCount(result.accepted ?? stats.accepted),
    ignored: safeCount(result.ignored ?? stats.ignored),
    droppedOldest: safeCount(stats.droppedOldest),
    droppedStorage: safeCount(stats.droppedStorage),
    retryCount: safeCount(stats.retryCount),
    coalescedPresence: safeCount(stats.coalescedPresence),
    maxQueueDepth: safeCount(stats.maxQueueDepth),
    lastError: safeString(stats.lastError, 160),
    ...(lastFailedFlushAt ? { lastFailedFlushAt } : {}),
    createdAt: new Date(),
  };
  if (recoveryEpisode) {
    report.deliveryEpisodeId = recoveryEpisode.episodeId;
    report.recoveryEpisode = recoveryEpisode;
    report.recoveryDurationMs = recoveryEpisode.totalDurationMs;
    report.recoveryClassification = classifyDeliveryRecoveryEpisode(recoveryEpisode);
    report.recoveryEvidenceQuality = deliveryRecoveryEvidenceQuality(recoveryEpisode);
    report.recoveryAcknowledgement = 'server_ack';
    report.recoveredInNewRuntime = recoveryEpisode.recoveredInNewRuntime;
  }
  return report;
}

async function upsertDeliveryHourlyRollup(report) {
  const hourStartAt = deliveryHourStart(report.createdAt);
  const hourKey = hourStartAt.toISOString();
  const failedFlush = deliveryIsDiagnostic(report);
  const now = new Date();
  const maxFields = {
    maxQueueDepth: report.maxQueueDepth,
    lastSeenAt: report.createdAt,
  };
  const minFields = {};
  const incrementFields = {
    reportCount: 1,
    sent: report.sent,
    accepted: report.accepted,
    ignored: report.ignored,
    droppedOldest: report.droppedOldest,
    droppedStorage: report.droppedStorage,
    retryCount: report.retryCount,
    coalescedPresence: report.coalescedPresence,
    failedFlushes: failedFlush ? 1 : 0,
  };
  if (report.deliveryEpisodeId && report.recoveryEpisode) {
    incrementFields.attributedEpisodeCount = 1;
    incrementFields.recoveredInNewRuntimeCount = report.recoveredInNewRuntime ? 1 : 0;
    incrementFields.recoveryDurationSampleCount = 1;
    incrementFields.recoveryDurationTotalMs = report.recoveryDurationMs;
    incrementFields['durationCompositionMs.foregroundOnline'] = report.recoveryEpisode.foregroundOnlineMs;
    incrementFields['durationCompositionMs.foregroundOffline'] = report.recoveryEpisode.foregroundOfflineMs;
    incrementFields['durationCompositionMs.backgroundOnline'] = report.recoveryEpisode.backgroundOnlineMs;
    incrementFields['durationCompositionMs.backgroundOffline'] = report.recoveryEpisode.backgroundOfflineMs;
    incrementFields['durationCompositionMs.runtimeAbsent'] = report.recoveryEpisode.runtimeAbsentMs;
    incrementFields['durationCompositionMs.unknown'] = report.recoveryEpisode.unknownMs;
    incrementFields[`recoveryClassificationCounts.${report.recoveryClassification}`] = 1;
    incrementFields[`evidenceQualityCounts.${report.recoveryEvidenceQuality}`] = 1;
    minFields.recoveryDurationMinMs = report.recoveryDurationMs;
    maxFields.recoveryDurationMaxMs = report.recoveryDurationMs;
  }
  if (failedFlush) maxFields.lastFailedFlushAt = report.createdAt;
  else maxFields.lastSuccessfulFlushAt = report.createdAt;

  await CaptureDeliveryHourlyRollups.rawCollection().updateOne(
    {
      projectId: report.projectId,
      hourKey,
      endpoint: report.endpoint,
      sourceType: report.sourceType,
      sourceKey: report.sourceKey,
    },
    {
      $setOnInsert: {
        projectId: report.projectId,
        projectKey: report.projectKey,
        hourKey,
        hourStartAt,
        hourEndAt: new Date(hourStartAt.getTime() + DELIVERY_ROLLUP_HOUR_MS),
        endpoint: report.endpoint,
        sourceType: report.sourceType,
        sourceKey: report.sourceKey,
        createdAt: now,
      },
      $set: {
        sourceLabel: report.sourceLabel,
        sourceDetails: report.sourceDetails,
        updatedAt: now,
      },
      $inc: incrementFields,
      ...(Object.keys(minFields).length ? { $min: minFields } : {}),
      $max: maxFields,
    },
    { upsert: true },
  );
}

async function recordDeliveryReport(project, payload = {}, req = {}, endpoint, result = {}) {
  const report = deliveryReportDocument(project, payload, req, endpoint, result);
  if (!report) return;

  if (report.deliveryEpisodeId) {
    const key = {
      projectId: report.projectId,
      endpoint: report.endpoint,
      deliveryEpisodeId: report.deliveryEpisodeId,
    };
    await CaptureDeliveryReports.rawCollection().updateOne(
      key,
      { $setOnInsert: { ...report, aggregateStored: false } },
      { upsert: true },
    );
    const claim = await CaptureDeliveryReports.rawCollection().updateOne(
      { ...key, aggregateStored: false },
      { $set: { aggregateStored: 'pending' } },
    );
    if (claim.modifiedCount === 0) return;
    try {
      const storedReport = await CaptureDeliveryReports.rawCollection().findOne(key);
      await upsertDeliveryHourlyRollup(storedReport || report);
      await CaptureDeliveryReports.rawCollection().updateOne(
        key,
        { $set: { aggregateStored: true } },
      );
    } catch (error) {
      await CaptureDeliveryReports.rawCollection().updateOne(
        { ...key, aggregateStored: 'pending' },
        { $set: { aggregateStored: false } },
      );
      throw error;
    }
    return;
  }

  await upsertDeliveryHourlyRollup(report);
  if (!deliveryIsDiagnostic(report)) return;

  await CaptureDeliveryReports.insertAsync({
    ...report,
    aggregateStored: true,
  });
}

async function safelyRecordDeliveryReport(project, payload = {}, req = {}, endpoint, result = {}) {
  try {
    await recordDeliveryReport(project, payload, req, endpoint, result);
  } catch (error) {
    console.error('[TraceMind] delivery observability write failed', {
      projectId: project?._id,
      endpoint,
      errorType: error?.name || 'Error',
    });
  }
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

function validateAppErrorFieldSet(fields, root, allowedKeys, findings) {
  Object.entries(safeObject(fields, 4096)).forEach(([key, value]) => {
    const path = `${root}.${key}`;
    if (!allowedKeys.has(key)) {
      addFinding(
        findings,
        'error',
        'unsupported_app_error_field',
        'app_error only accepts sanitized summary fields and irreversible fingerprints; omit raw stacks, logs, bodies, headers, cookies, auth values, input values, screenshots, recordings, and full query URLs.',
        path,
      );
      return;
    }
    if (!isSafeServerPrimitive(value)) {
      addFinding(
        findings,
        'error',
        'unsupported_app_error_field',
        'app_error fields must be primitive string, number, or boolean values.',
        path,
      );
      return;
    }
    if (sanitizeAppErrorFieldValue(key, value) === undefined) {
      addFinding(
        findings,
        'error',
        'forbidden_app_error_field_value',
        'app_error summary field values must not contain PII, secrets, raw content, or full query URLs.',
        path,
      );
    }
  });
}

function validateAppErrorPayload(args, findings) {
  validateAppErrorFieldSet(args.properties || {}, 'properties', APP_ERROR_PROPERTY_KEYS, findings);
  validateAppErrorFieldSet(args.context || {}, 'context', APP_ERROR_CONTEXT_KEYS, findings);
}

function validationResult(findings, recommendations = []) {
  return guidanceResult({
    ok: findings.every((finding) => finding.severity !== 'error'),
    findings,
    recommendations,
    requiresUserReview: findings.some((finding) => finding.severity === 'error' || finding.severity === 'warning'),
  });
}

const TRACE_MIND_DIFF_PAYLOAD_APIS = [
  'capture',
  'captureError',
  'capture_error',
  'submitFeedback',
  'submit_feedback',
  'captureSkillLifecycle',
  'capture_skill_lifecycle',
];
const TRACE_MIND_DIFF_PAYLOAD_API_PATTERN = TRACE_MIND_DIFF_PAYLOAD_APIS.join('|');
const TRACE_MIND_DIFF_CALL_PATTERN = new RegExp(
  `\\b(?:(?:window\\s*\\.\\s*)?TraceMind(?:MCP|Server)?\\s*\\.\\s*(?:${TRACE_MIND_DIFF_PAYLOAD_API_PATTERN})|(?:${TRACE_MIND_DIFF_PAYLOAD_API_PATTERN}))\\s*\\(`,
  'g',
);

function matchingClosingParenIndex(source, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function isLikelyFunctionDeclaration(source, matchIndex) {
  const lineStart = source.lastIndexOf('\n', matchIndex - 1) + 1;
  const linePrefix = source.slice(lineStart, matchIndex);
  return /\bfunction\s*\*?\s*$/.test(linePrefix);
}

function isLikelyNonTraceMindMemberCall(source, matchIndex, matchedText) {
  if (/^(?:window\s*\.\s*)?TraceMind/.test(matchedText)) return false;
  let index = matchIndex - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return source[index] === '.';
}

function isInsideStringOrComment(source, targetIndex) {
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < targetIndex; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
    }
  }

  return Boolean(quote || lineComment || blockComment);
}

function extractTraceMindDiffCallSnippets(addedText) {
  const source = String(addedText || '');
  const snippets = [];
  TRACE_MIND_DIFF_CALL_PATTERN.lastIndex = 0;
  let match;

  while ((match = TRACE_MIND_DIFF_CALL_PATTERN.exec(source))) {
    if (isInsideStringOrComment(source, match.index)) continue;
    if (isLikelyFunctionDeclaration(source, match.index)) continue;
    if (isLikelyNonTraceMindMemberCall(source, match.index, match[0])) continue;
    const openIndex = TRACE_MIND_DIFF_CALL_PATTERN.lastIndex - 1;
    const closeIndex = matchingClosingParenIndex(source, openIndex);
    const fallbackEnd = source.indexOf('\n', openIndex);
    const endIndex = closeIndex >= 0
      ? closeIndex + 1
      : (fallbackEnd >= 0 ? fallbackEnd : source.length);
    snippets.push(source.slice(match.index, endIndex));
  }

  return snippets;
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
      if (!key || seenKeys.has(key) || !isForbiddenAnalyticsKey(key) || isSafeDerivedAnalyticsKey(key)) return;
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

  const instrumentationText = extractTraceMindDiffCallSnippets(addedText).join('\n');
  privacyFindings({ diff: instrumentationText }).forEach((finding) => findings.push(finding));
  extractSensitiveKeysFromDiff(instrumentationText).forEach((finding) => findings.push(finding));

  const eventNameMatches = [...instrumentationText.matchAll(/eventName\s*:\s*['"]([^'"]+)['"]/g)];
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

export async function callMcpTool(project, name, args = {}, options = {}) {
  const result = await callMcpToolResult(project, name, args, options);
  await recordSetupAttemptSafely(() => recordSetupAttemptMcpTool(project, name, args, options));
  return result;
}

async function callMcpToolResult(project, name, args = {}, options = {}) {
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

  if (name === AGENT_SETUP_CHECK_TOOL) {
    const result = checkAgentSetupResult(args);
    return textResult(
      `TraceMind agent setup status: ${result.status}.`,
      result,
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
    const privacyOptions = args.eventType === 'app_error'
      ? { allowedDerivedKeys: SAFE_DERIVED_ANALYTICS_KEYS }
      : {};
    const findings = [
      ...validateEventIdentity(args.eventType, args.eventName),
      ...privacyFindings({ properties: args.properties || {}, context: args.context || {} }, privacyOptions),
    ];
    if (args.eventType === 'app_error') {
      validateAppErrorPayload(args, findings);
    }
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

  if (name === 'tracemind.submit_feedback') {
    return submitFeedbackReport(project, args, options);
  }

  if (name === 'tracemind.query_user_feedback') {
    return queryUserFeedbackReports(project, args);
  }

  if (name === 'tracemind.update_user_feedback') {
    return updateUserFeedbackReport(project, args, options);
  }

  if (name === 'tracemind.project_health') {
    const health = await readProjectHealth(project, args);
    return textResult(
      health.status === 'missing'
        ? `TraceMind 没有找到 ${health.reportDate} 的项目健康日报。`
        : `TraceMind ${health.reportDate} 项目健康状态：${health.health.status === 'needs_attention' ? '需关注' : '正常'}。${health.health.attentionSummary || ''}`.trim(),
      health,
    );
  }

  if (name === 'tracemind.query_delivery_diagnostics') {
    const diagnostics = await readDeliveryDiagnostics(project, args);
    return textResult(
      `TraceMind 找到 ${diagnostics.summary.diagnosticReportCount} 份脱敏上报诊断，聚合为 ${diagnostics.buckets.length} 个小时/source/reason 组。`,
      diagnostics,
    );
  }

  if (name === 'tracemind.recent_online') {
    const recentOnline = await readRecentOnline(project);
    return textResult(
      `TraceMind 近 30 分钟在线用户数：${recentOnline.totalOnlineUsers}。`,
      recentOnline,
    );
  }

  if (name === 'tracemind.summary') {
    const appliedLimit = safeLimit(args.limit, SUMMARY_DEFAULT_LIMIT, SUMMARY_MAX_LIMIT);
    const events = await queryProjectEvents(project, { ...args, limit: appliedLimit });
    const presenceSessions = await loadProjectPresenceSessions(project);
    const summary = summarizeSemanticEvents(events);
    const summarySample = summarySampleMetadata(args, events, appliedLimit);
    const structuredContent = {
      project: { _id: project._id, name: project.name },
      summary,
      summarySample,
      presence: summarizePresenceSessions(presenceSessions),
      eventDefinitions: EVENT_DEFINITIONS,
    };
    if (productUsageSummaryRequested(args)) {
      structuredContent.productUsageInstrumentation = publicProductUsageInstrumentationHealth({
        productUsageSummary: true,
        summary,
        hasPresenceEvidence: presenceSessions.length > 0,
      });
    }
    return textResult(
      `TraceMind 找到 ${summary.totalEvents} 条语义事件样本（最多读取最近 ${summarySample.appliedLimit} 条；summary.totalEvents/topActions/dailyActiveUsers 均为样本口径，不替代 tracemind.project_health 全天指标）。主要事件类型：${summary.topEvents.map((item) => `${item.eventType}（${item.count}）`).join('，') || '暂无'}。主要意图动作：${summary.topIntentActions.map((item) => `${item.actionKey}（${item.count}）`).join('，') || '暂无'}；字段交互噪声：${summary.topFieldInteractions.map((item) => `${item.actionKey}（${item.count}）`).join('，') || '暂无'}。`,
      structuredContent,
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

function normalizeClientScriptOrigins(input) {
  if (input && typeof input === 'object') {
    const apiOrigin = normalizedOrigin(input.apiOrigin || input.host || input.origin);
    const scriptOrigin = normalizedOrigin(input.scriptOrigin || input.captureScriptOrigin || input.host || input.origin || input.apiOrigin);
    return {
      apiOrigin,
      scriptOrigin: scriptOrigin || apiOrigin,
      cacheKey: `api=${apiOrigin}|script=${scriptOrigin || apiOrigin}`,
    };
  }

  const origin = normalizedOrigin(input);
  return {
    apiOrigin: origin,
    scriptOrigin: origin,
    cacheKey: origin,
  };
}

export function clientScript(host) {
  const origins = normalizeClientScriptOrigins(host);
  return `
(function () {
  var SCRIPT_RELEASE_ID = '${CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID}';
  var existingRuntime = window.__TraceMindRuntime;
  if (existingRuntime && existingRuntime.releaseId === SCRIPT_RELEASE_ID && existingRuntime.disabled !== true) return;
  if (existingRuntime && typeof existingRuntime.disable === 'function') existingRuntime.disable('replaced');
  var runtime = {
    releaseId: SCRIPT_RELEASE_ID,
    disabled: false,
    disable: function () {
      runtime.disabled = true;
    }
  };
  window.__TraceMindRuntime = runtime;
  window.__TraceMindLoaded = true;

  var script = document.currentScript;
  var projectKey = script && script.getAttribute('data-tracemind-token');
  var endpoint = (script && script.getAttribute('data-tracemind-endpoint')) || '${origins.apiOrigin}/api/capture';
  var presenceEndpoint = (script && script.getAttribute('data-tracemind-presence-endpoint')) || '${origins.apiOrigin}/api/presence';
  var feedbackEndpoint = (script && script.getAttribute('data-tracemind-feedback-endpoint')) || '${origins.apiOrigin}/api/user-feedback';
  var staticUserId = script && script.getAttribute('data-tracemind-user-id');
  var userIdProvider = script && script.getAttribute('data-tracemind-user-id-provider');
  var sourceFramework = frameworkName(script && script.getAttribute('data-tracemind-framework'));
  var pageContext = window.__TraceMindPageContext;
  if (!pageContext || typeof pageContext !== 'object' || !pageContext.runtimeInstanceId) {
    pageContext = {
      runtimeInstanceId: 'tm_runtime_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      sequence: 0,
      lifecycleState: 'unknown',
      connectivityState: 'unknown',
      lifecycleEvidence: 'unknown',
      connectivityEvidence: 'unknown',
      lifecycleConfidence: 'unknown',
      connectivityConfidence: 'unknown'
    };
    window.__TraceMindPageContext = pageContext;
  }

  function runtimeActive() {
    return window.__TraceMindRuntime === runtime && runtime.disabled !== true;
  }

  function setLifecycleState(state, evidence, confidence) {
    pageContext.lifecycleState = state;
    pageContext.lifecycleEvidence = evidence;
    pageContext.lifecycleConfidence = confidence;
  }

  function updateLifecycleFromVisibility() {
    if (document.visibilityState === 'visible') {
      setLifecycleState('foreground', 'document_visibility', 'high');
    } else if (document.visibilityState === 'hidden') {
      setLifecycleState('background', 'document_visibility', 'high');
    } else {
      setLifecycleState('unknown', 'unknown', 'unknown');
    }
  }

  function setConnectivityState(state, evidence, confidence) {
    pageContext.connectivityState = state;
    pageContext.connectivityEvidence = evidence;
    pageContext.connectivityConfidence = confidence;
  }

  function updateConnectivityFromPlatform() {
    if (navigator.onLine === false) {
      setConnectivityState('offline', 'platform_connectivity', 'medium');
    } else if (navigator.onLine === true) {
      setConnectivityState('online', 'platform_connectivity', 'low');
    } else {
      setConnectivityState('unknown', 'unknown', 'unknown');
    }
  }

  function markTransportSuccess() {
    setConnectivityState('online', 'transport_success', 'high');
  }

  function markTransportFailure() {
    if (navigator.onLine === false) {
      setConnectivityState('offline', 'platform_connectivity', 'medium');
    } else {
      setConnectivityState('unknown', 'transport_failure', 'low');
    }
  }

  function runtimeContextSnapshot() {
    pageContext.sequence += 1;
    return {
      schemaVersion: 1,
      runtimeInstanceId: pageContext.runtimeInstanceId,
      sequence: pageContext.sequence,
      lifecycleState: pageContext.lifecycleState,
      connectivityState: pageContext.connectivityState,
      lifecycleEvidence: pageContext.lifecycleEvidence,
      connectivityEvidence: pageContext.connectivityEvidence,
      lifecycleConfidence: pageContext.lifecycleConfidence,
      connectivityConfidence: pageContext.connectivityConfidence
    };
  }

  updateLifecycleFromVisibility();
  updateConnectivityFromPlatform();

  function frameworkName(value) {
    var text = String(value || '').trim().toLowerCase();
    return /^[a-z][a-z0-9_-]{0,39}$/.test(text) ? text : '';
  }

  function readLocal(key) {
    try {
      return window.localStorage && localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      if (!window.localStorage) return false;
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readSession(key) {
    try {
      return window.sessionStorage && sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeSession(key, value) {
    try {
      if (!window.sessionStorage) return false;
      sessionStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  var sessionId = readLocal('tracemind_session_id') || ('tm_sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  var anonymousId = readLocal('tracemind_anonymous_id') || ('tm_anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  var deviceId = readLocal('tracemind_device_id') || ('tm_dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  writeLocal('tracemind_session_id', sessionId);
  writeLocal('tracemind_anonymous_id', anonymousId);
  writeLocal('tracemind_device_id', deviceId);

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
      referrer: document.referrer ? safePageUrl(document.referrer) : ''
    });
  }

  function safePageUrl(value) {
    try {
      var url = new URL(value, location.origin);
      return url.origin + url.pathname + url.hash;
    } catch (error) {
      return '';
    }
  }

  function currentPath() {
    return (location.pathname || '/') + (location.hash || '');
  }

  function routeCapturePath() {
    var pathname = location.pathname || '/';
    var hashValue = location.hash || '';
    if (hashValue === '#' || hashValue === '#!') hashValue = '';
    return pathname + hashValue;
  }

  var lastRoutePath = routeCapturePath();

  function sendRouteChangeIfChanged(nextPath) {
    if (!nextPath || nextPath === lastRoutePath) return false;
    lastRoutePath = nextPath;
    stopPresence('end');
    send('route_change', { path: nextPath });
    startPresence('start');
    return true;
  }

  function safeCapturePath(value) {
    if (!value) return currentPath();
    try {
      var url = new URL(String(value), location.origin);
      return (url.pathname || '/') + (url.hash || '');
    } catch (error) {
      var text = String(value || '');
      var withoutQuery = text.split('?')[0];
      return withoutQuery || currentPath();
    }
  }

  function currentSource() {
    var details = { scriptReleaseId: SCRIPT_RELEASE_ID };
    if (sourceFramework) details.framework = sourceFramework;
    var source = {
      type: 'web',
      url: safePageUrl(location.href),
      referrer: document.referrer ? safePageUrl(document.referrer) : '',
      details: details
    };
    return source;
  }

  function attributionValue(value) {
    var text = String(value || '').trim().replace(/\\s+/g, '-').slice(0, 120);
    if (!text || text.indexOf('@') !== -1 || /https?:|[?&=]|%40/i.test(text)) return '';
    return /^[a-z0-9][a-z0-9._~:-]{0,119}$/i.test(text) ? text : '';
  }

  function parsedUrl(value) {
    try {
      return new URL(value, location.origin);
    } catch (error) {
      return null;
    }
  }

  function referrerDomain() {
    var referrerUrl = document.referrer ? parsedUrl(document.referrer) : null;
    return referrerUrl && referrerUrl.hostname ? referrerUrl.hostname.toLowerCase() : '';
  }

  function isSearchDomain(hostname) {
    return /(^|\\.)(google|bing|baidu|duckduckgo|yahoo|yandex|ecosia|brave)\\./i.test(hostname);
  }

  function isSocialDomain(hostname) {
    return /(^|\\.)((x|twitter|linkedin|facebook|fb|instagram|reddit|youtube|tiktok|producthunt)\\.com|t\\.co)$/i.test(hostname)
      || hostname === 'news.ycombinator.com';
  }

  function referrerType(hostname) {
    if (!hostname) return 'direct';
    var currentUrl = parsedUrl(location.href);
    var currentHost = currentUrl && currentUrl.hostname ? currentUrl.hostname.toLowerCase() : (location.hostname || '').toLowerCase();
    if (hostname === currentHost) return 'internal';
    if (isSearchDomain(hostname)) return 'search';
    if (isSocialDomain(hostname)) return 'social';
    return 'external';
  }

  function buildAttribution() {
    var pageUrl = parsedUrl(location.href);
    var params = pageUrl ? pageUrl.searchParams : null;
    var referrerHost = referrerDomain();
    var type = referrerType(referrerHost);
    var source = attributionValue(params && params.get('utm_source')) || referrerHost || 'direct';
    var medium = attributionValue(params && params.get('utm_medium')) || type;
    var attribution = {
      source: source,
      medium: medium,
      referrerType: type,
      landingPath: currentPath()
    };
    var campaign = attributionValue(params && params.get('utm_campaign'));
    var content = attributionValue(params && params.get('utm_content'));
    if (campaign) attribution.campaign = campaign;
    if (content) attribution.content = content;
    if (referrerHost) attribution.referrerDomain = referrerHost;
    if (params && params.has('gclid')) attribution.gclidPresent = true;
    if (params && params.has('fbclid')) attribution.fbclidPresent = true;
    if (params && params.has('msclkid')) attribution.msclkidPresent = true;
    return attribution;
  }

  var visitAttribution = null;
  var attributionStorageKey = 'tracemind_attribution_' + hash(projectKey || endpoint, 'tm_attr_');

  function currentAttribution() {
    if (visitAttribution) return Object.assign({}, visitAttribution);
    try {
      var stored = JSON.parse(readSession(attributionStorageKey) || 'null');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        visitAttribution = stored;
        return Object.assign({}, visitAttribution);
      }
    } catch (error) {
      // Ignore malformed session attribution and rebuild from the landing page.
    }
    visitAttribution = buildAttribution();
    writeSession(attributionStorageKey, JSON.stringify(visitAttribution));
    return Object.assign({}, visitAttribution);
  }

  var fingerprint = hash(JSON.stringify(fingerprintInfo()), 'tm_fp_');
  var heartbeatIntervalMs = ${PRESENCE_HEARTBEAT_INTERVAL_MS};
  var ACTIVE_IDLE_TIMEOUT_MS = 60 * 1000;
  var presenceTimer = null;
  var currentPresenceId = null;
  var activeDurationMs = 0;
  var activeStartedAt = null;
  var lastActiveAt = null;
  var windowIsFocused = !document.hasFocus || document.hasFocus();
  var MAX_QUEUE_EVENTS = 300;
  var CAPTURE_BATCH_SIZE = 20;
  var PRESENCE_BATCH_SIZE = 20;
  var FEEDBACK_BATCH_SIZE = 5;
  var MAX_UNLOAD_BATCH_BYTES = 60 * 1024;
  var RETRY_BASE_MS = 1000;
  var RETRY_MAX_MS = 60 * 1000;
  var FLUSH_DELAY_MS = 500;
  var queueStorageKey = 'tracemind_queue_' + hash(projectKey || endpoint, 'tm_q_');
  var statsStorageKey = 'tracemind_delivery_stats_' + hash(projectKey || endpoint, 'tm_ds_');
  var flushTimer = null;
  var flushing = false;
  var queueStorageAvailable = true;

  runtime.disable = function () {
    runtime.disabled = true;
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  function defaultDeliveryStats() {
    return {
      droppedOldest: 0,
      droppedStorage: 0,
      retryCount: 0,
      coalescedPresence: 0,
      maxQueueDepth: 0,
      lastError: '',
      lastFlushAt: '',
      lastFailedFlushAt: '',
      recoveryEpisodes: {}
    };
  }

  function loadDeliveryStats() {
    try {
      return Object.assign(defaultDeliveryStats(), JSON.parse(readLocal(statsStorageKey) || '{}'));
    } catch (error) {
      return defaultDeliveryStats();
    }
  }

  var deliveryStats = loadDeliveryStats();

  function persistDeliveryStats() {
    writeLocal(statsStorageKey, JSON.stringify(deliveryStats));
  }

  var RECOVERY_EPISODE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  var RECOVERY_ENDPOINT_KINDS = ['capture', 'presence', 'feedback'];
  var RECOVERY_DURATION_FIELDS = [
    'foregroundOnlineMs',
    'foregroundOfflineMs',
    'backgroundOnlineMs',
    'backgroundOfflineMs',
    'runtimeAbsentMs',
    'unknownMs'
  ];
  var RECOVERY_EVIDENCE_FLAGS = {
    visibility_observed: true,
    platform_online: true,
    platform_offline: true,
    transport_failed: true,
    transport_succeeded: true,
    page_hidden: true,
    page_shown: true,
    page_frozen: true,
    page_resumed: true,
    page_discarded: true,
    new_runtime: true,
    clock_anomaly: true
  };

  function recoveryEpisodeId() {
    return 'tm_episode_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function addRecoveryEvidence(episode, flag) {
    if (!episode || !RECOVERY_EVIDENCE_FLAGS[flag]) return;
    if (!Array.isArray(episode.evidenceFlags)) episode.evidenceFlags = [];
    if (episode.evidenceFlags.indexOf(flag) === -1) {
      episode.evidenceFlags.push(flag);
      episode.evidenceFlags.sort();
    }
  }

  function recoveryDurationTotal(episode) {
    return RECOVERY_DURATION_FIELDS.reduce(function (total, field) {
      return total + Number(episode && episode[field] || 0);
    }, 0);
  }

  function validStoredRecoveryEpisode(episode) {
    if (!episode || episode.schemaVersion !== 1) return false;
    if (typeof episode.episodeId !== 'string' || !episode.episodeId || episode.episodeId.length > 120) return false;
    if (typeof episode.originRuntimeInstanceId !== 'string' || !episode.originRuntimeInstanceId
      || episode.originRuntimeInstanceId.length > 120) return false;
    if (typeof episode.currentRuntimeInstanceId !== 'string' || !episode.currentRuntimeInstanceId
      || episode.currentRuntimeInstanceId.length > 120) return false;
    if (episode.failureTrigger !== 'transport_failure' && episode.failureTrigger !== 'platform_offline') return false;
    var startedAtMs = Date.parse(episode.startedAt);
    var lastObservedAtMs = Date.parse(episode.lastObservedAt);
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(lastObservedAtMs) || lastObservedAtMs < startedAtMs) return false;
    if (!Number.isInteger(episode.totalDurationMs) || episode.totalDurationMs < 0) return false;
    for (var i = 0; i < RECOVERY_DURATION_FIELDS.length; i += 1) {
      var value = episode[RECOVERY_DURATION_FIELDS[i]];
      if (!Number.isInteger(value) || value < 0) return false;
    }
    if (typeof episode.recoveredInNewRuntime !== 'boolean') return false;
    var runtimeChanged = episode.originRuntimeInstanceId !== episode.currentRuntimeInstanceId;
    var hasNewRuntimeFlag = Array.isArray(episode.evidenceFlags)
      && episode.evidenceFlags.indexOf('new_runtime') >= 0;
    if (episode.recoveredInNewRuntime !== runtimeChanged
      || (runtimeChanged && (episode.runtimeAbsentMs <= 0 || !hasNewRuntimeFlag))
      || (!runtimeChanged && (episode.runtimeAbsentMs !== 0 || hasNewRuntimeFlag))) return false;
    return recoveryDurationTotal(episode) === episode.totalDurationMs
      && lastObservedAtMs - startedAtMs === episode.totalDurationMs;
  }

  function recoveryBucket(episode) {
    var lifecycle = episode.observedLifecycleState;
    var connectivity = episode.observedConnectivityState;
    if (lifecycle === 'foreground' && connectivity === 'online') return 'foregroundOnlineMs';
    if (lifecycle === 'foreground' && connectivity === 'offline') return 'foregroundOfflineMs';
    if (lifecycle === 'background' && connectivity === 'online') return 'backgroundOnlineMs';
    if (lifecycle === 'background' && connectivity === 'offline') return 'backgroundOfflineMs';
    return 'unknownMs';
  }

  function settleRecoveryEpisode(episode, nowMs) {
    if (!episode) return;
    var observedAtMs = Date.parse(episode.lastObservedAt);
    if (!Number.isFinite(observedAtMs) || nowMs < observedAtMs) {
      addRecoveryEvidence(episode, 'clock_anomaly');
      return;
    }
    var elapsed = nowMs - observedAtMs;
    if (episode.currentRuntimeInstanceId !== pageContext.runtimeInstanceId) {
      if (elapsed === 0) return;
      episode.runtimeAbsentMs += elapsed;
      episode.currentRuntimeInstanceId = pageContext.runtimeInstanceId;
      episode.recoveredInNewRuntime = true;
      addRecoveryEvidence(episode, 'new_runtime');
    } else {
      episode[recoveryBucket(episode)] += elapsed;
    }
    episode.totalDurationMs += elapsed;
    episode.lastObservedAt = new Date(nowMs).toISOString();
    episode.observedLifecycleState = pageContext.lifecycleState;
    episode.observedConnectivityState = pageContext.connectivityState;
  }

  function settleAllRecoveryEpisodes(flag) {
    var nowMs = Date.now();
    RECOVERY_ENDPOINT_KINDS.forEach(function (kind) {
      var episode = deliveryStats.recoveryEpisodes[kind];
      if (!episode) return;
      settleRecoveryEpisode(episode, nowMs);
      addRecoveryEvidence(episode, flag);
    });
  }

  function syncRecoveryEpisodeObservations() {
    RECOVERY_ENDPOINT_KINDS.forEach(function (kind) {
      var episode = deliveryStats.recoveryEpisodes[kind];
      if (!episode) return;
      episode.observedLifecycleState = pageContext.lifecycleState;
      episode.observedConnectivityState = pageContext.connectivityState;
    });
    persistDeliveryStats();
  }

  function initializeRecoveryEpisodes() {
    var stored = deliveryStats.recoveryEpisodes;
    deliveryStats.recoveryEpisodes = {};
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      persistDeliveryStats();
      return;
    }
    var nowMs = Date.now();
    RECOVERY_ENDPOINT_KINDS.forEach(function (kind) {
      var episode = stored[kind];
      if (!validStoredRecoveryEpisode(episode)) return;
      var startedAtMs = Date.parse(episode.startedAt);
      if (nowMs - startedAtMs > RECOVERY_EPISODE_MAX_MS) return;
      episode.evidenceFlags = (Array.isArray(episode.evidenceFlags) ? episode.evidenceFlags : [])
        .filter(function (flag, index, flags) {
          return RECOVERY_EVIDENCE_FLAGS[flag] && flags.indexOf(flag) === index;
        })
        .sort();
      episode.observedLifecycleState = episode.observedLifecycleState || 'unknown';
      episode.observedConnectivityState = episode.observedConnectivityState || 'unknown';
      deliveryStats.recoveryEpisodes[kind] = episode;
      settleRecoveryEpisode(episode, nowMs);
      if (document.wasDiscarded === true) addRecoveryEvidence(episode, 'page_discarded');
    });
    persistDeliveryStats();
  }

  function openRecoveryEpisode(kind, failureTrigger) {
    var existing = deliveryStats.recoveryEpisodes[kind];
    if (existing) {
      addRecoveryEvidence(existing, failureTrigger === 'platform_offline' ? 'platform_offline' : 'transport_failed');
      persistDeliveryStats();
      return existing;
    }
    var nowIso = new Date().toISOString();
    var episode = {
      schemaVersion: 1,
      episodeId: recoveryEpisodeId(),
      originRuntimeInstanceId: pageContext.runtimeInstanceId,
      currentRuntimeInstanceId: pageContext.runtimeInstanceId,
      startedAt: nowIso,
      lastObservedAt: nowIso,
      totalDurationMs: 0,
      foregroundOnlineMs: 0,
      foregroundOfflineMs: 0,
      backgroundOnlineMs: 0,
      backgroundOfflineMs: 0,
      runtimeAbsentMs: 0,
      unknownMs: 0,
      recoveredInNewRuntime: false,
      failureTrigger: failureTrigger,
      evidenceFlags: [],
      observedLifecycleState: pageContext.lifecycleState,
      observedConnectivityState: pageContext.connectivityState
    };
    if (pageContext.lifecycleEvidence !== 'unknown') addRecoveryEvidence(episode, 'visibility_observed');
    if (pageContext.connectivityState === 'offline') addRecoveryEvidence(episode, 'platform_offline');
    if (pageContext.connectivityState === 'online') addRecoveryEvidence(episode, 'platform_online');
    if (failureTrigger === 'transport_failure') addRecoveryEvidence(episode, 'transport_failed');
    deliveryStats.recoveryEpisodes[kind] = episode;
    persistDeliveryStats();
    return episode;
  }

  function recoveryEpisodeSnapshot(kind) {
    var episode = deliveryStats.recoveryEpisodes[kind];
    if (!episode) return null;
    settleRecoveryEpisode(episode, Date.now());
    if (episode.totalDurationMs > RECOVERY_EPISODE_MAX_MS) {
      delete deliveryStats.recoveryEpisodes[kind];
      persistDeliveryStats();
      return null;
    }
    persistDeliveryStats();
    return {
      schemaVersion: 1,
      episodeId: episode.episodeId,
      originRuntimeInstanceId: episode.originRuntimeInstanceId,
      currentRuntimeInstanceId: episode.currentRuntimeInstanceId,
      startedAt: episode.startedAt,
      lastObservedAt: episode.lastObservedAt,
      totalDurationMs: episode.totalDurationMs,
      foregroundOnlineMs: episode.foregroundOnlineMs,
      foregroundOfflineMs: episode.foregroundOfflineMs,
      backgroundOnlineMs: episode.backgroundOnlineMs,
      backgroundOfflineMs: episode.backgroundOfflineMs,
      runtimeAbsentMs: episode.runtimeAbsentMs,
      unknownMs: episode.unknownMs,
      recoveredInNewRuntime: episode.recoveredInNewRuntime,
      failureTrigger: episode.failureTrigger,
      evidenceFlags: episode.evidenceFlags.slice()
    };
  }

  function clearRecoveryEpisode(kind) {
    delete deliveryStats.recoveryEpisodes[kind];
    persistDeliveryStats();
  }

  function loadQueue() {
    try {
      var parsed = JSON.parse(readLocal(queueStorageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(function (record) {
        return record && record.id && (record.kind === 'capture' || record.kind === 'presence' || record.kind === 'feedback') && record.payload;
      }) : [];
    } catch (error) {
      deliveryStats.lastError = 'queue_load_failed';
      persistDeliveryStats();
      return [];
    }
  }

  var queue = loadQueue();
  initializeRecoveryEpisodes();

  function persistQueue() {
    var encoded = JSON.stringify(queue);
    if (writeLocal(queueStorageKey, encoded)) {
      queueStorageAvailable = true;
      return true;
    }
    queueStorageAvailable = false;
    var candidate = queue.slice();
    var dropped = 0;
    while (candidate.length > 0) {
      candidate.shift();
      dropped += 1;
      if (writeLocal(queueStorageKey, JSON.stringify(candidate))) {
        queue = candidate;
        queueStorageAvailable = true;
        break;
      }
    }
    if (dropped > 0 && queueStorageAvailable) {
      deliveryStats.droppedStorage += dropped;
      deliveryStats.lastError = 'storage_quota';
      persistDeliveryStats();
    } else if (!queueStorageAvailable) {
      deliveryStats.lastError = 'storage_unavailable';
      persistDeliveryStats();
    }
    return queueStorageAvailable;
  }

  function trimQueue() {
    var dropped = 0;
    while (queue.length > MAX_QUEUE_EVENTS) {
      queue.shift();
      dropped += 1;
    }
    if (dropped > 0) {
      deliveryStats.droppedOldest += dropped;
      persistDeliveryStats();
    }
  }

  function recordId() {
    return 'tm_evt_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function batchId() {
    return 'tm_batch_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function retryDelay(attempts) {
    var base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)));
    return base + Math.floor(Math.random() * 250);
  }

  function queueStatus() {
    var nextRetryAt = null;
    queue.forEach(function (record) {
      if (record.nextAttemptAt && (!nextRetryAt || record.nextAttemptAt < nextRetryAt)) {
        nextRetryAt = record.nextAttemptAt;
      }
    });
    return {
      queueLength: queue.length,
      droppedOldest: deliveryStats.droppedOldest,
      droppedStorage: deliveryStats.droppedStorage,
      retryCount: deliveryStats.retryCount,
      coalescedPresence: deliveryStats.coalescedPresence,
      maxQueueDepth: deliveryStats.maxQueueDepth,
      lastError: deliveryStats.lastError,
      lastFlushAt: deliveryStats.lastFlushAt,
      lastFailedFlushAt: deliveryStats.lastFailedFlushAt,
      nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : '',
      scriptReleaseId: SCRIPT_RELEASE_ID,
      storage: queueStorageAvailable ? 'localStorage' : 'memory'
    };
  }

  function scheduleFlush(delay) {
    if (!runtimeActive()) return;
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushQueue('scheduled', false);
    }, delay === undefined ? FLUSH_DELAY_MS : delay);
  }

  function coalescePresenceHeartbeat(record) {
    if (record.kind !== 'presence' || record.payload.state !== 'heartbeat' || !record.payload.presenceId) return false;
    for (var i = queue.length - 1; i >= 0; i -= 1) {
      var existing = queue[i];
      if (existing.kind === 'presence' && existing.payload && existing.payload.state === 'heartbeat'
        && existing.payload.presenceId === record.payload.presenceId) {
        existing.payload = Object.assign({}, existing.payload, record.payload);
        existing.createdAt = record.createdAt;
        deliveryStats.coalescedPresence += 1;
        persistDeliveryStats();
        persistQueue();
        return true;
      }
    }
    return false;
  }

  function enqueue(kind, payload) {
    if (!projectKey || !runtimeActive()) return;
    var record = {
      id: recordId(),
      kind: kind,
      payload: Object.assign({}, payload || {}, { runtimeContext: runtimeContextSnapshot() }),
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: Date.now()
    };
    if (!coalescePresenceHeartbeat(record)) {
      queue.push(record);
    }
    deliveryStats.maxQueueDepth = Math.max(deliveryStats.maxQueueDepth, queue.length);
    trimQueue();
    persistQueue();
    persistDeliveryStats();
    scheduleFlush();
  }

  function dueRecords(kind, limit, maxBytes) {
    var now = Date.now();
    var selected = [];
    var bytes = 0;
    for (var i = 0; i < queue.length; i += 1) {
      var record = queue[i];
      if (record.kind !== kind || (record.nextAttemptAt && record.nextAttemptAt > now)) continue;
      var size = JSON.stringify(record.payload).length + 64;
      if (selected.length > 0 && (selected.length >= limit || bytes + size > maxBytes)) break;
      selected.push(record);
      bytes += size;
      if (selected.length >= limit) break;
    }
    return selected;
  }

  function deliveryReport(kind, reason, records) {
    var retryCount = deliveryStats.retryCount;
    records.forEach(function (record) {
      retryCount += record.attempts || 0;
    });
    var report = {
      batchId: batchId(),
      reason: reason || 'scheduled',
      queued: queue.length,
      sent: records.length,
      droppedOldest: deliveryStats.droppedOldest,
      droppedStorage: deliveryStats.droppedStorage,
      retryCount: retryCount,
      coalescedPresence: deliveryStats.coalescedPresence,
      maxQueueDepth: deliveryStats.maxQueueDepth,
      lastError: deliveryStats.lastError,
      lastFailedFlushAt: deliveryStats.lastFailedFlushAt
    };
    var recoveryEpisode = recoveryEpisodeSnapshot(kind);
    if (recoveryEpisode) report.recoveryEpisode = recoveryEpisode;
    return report;
  }

  function resetReportedStats() {
    deliveryStats.droppedOldest = 0;
    deliveryStats.droppedStorage = 0;
    deliveryStats.retryCount = 0;
    deliveryStats.coalescedPresence = 0;
    deliveryStats.maxQueueDepth = queue.length;
    deliveryStats.lastError = '';
    deliveryStats.lastFlushAt = new Date().toISOString();
    persistDeliveryStats();
  }

  function removeRecords(records) {
    var ids = {};
    records.forEach(function (record) { ids[record.id] = true; });
    queue = queue.filter(function (record) { return !ids[record.id]; });
    persistQueue();
  }

  function markRecordsFailed(kind, records, error) {
    var now = Date.now();
    var message = error && error.message ? error.message : 'network_error';
    records.forEach(function (record) {
      record.attempts = (record.attempts || 0) + 1;
      record.nextAttemptAt = now + retryDelay(record.attempts);
    });
    deliveryStats.retryCount += records.length;
    deliveryStats.lastError = String(message).slice(0, 160);
    deliveryStats.lastFailedFlushAt = new Date().toISOString();
    settleAllRecoveryEpisodes('transport_failed');
    markTransportFailure();
    syncRecoveryEpisodeObservations();
    openRecoveryEpisode(kind, 'transport_failure');
    persistQueue();
    persistDeliveryStats();
    scheduleFlush(retryDelay(1));
  }

  var scriptUpdateInProgress = false;

  function applyScriptUpdate(update) {
    if (!update || update.autoUpdate !== true || scriptUpdateInProgress) return;
    if (!update.latestReleaseId || update.latestReleaseId === SCRIPT_RELEASE_ID) return;
    if (!document.createElement || !document.head || !document.head.appendChild) return;
    scriptUpdateInProgress = true;
    var nextScript = document.createElement('script');
    nextScript.async = true;
    nextScript.src = update.latestScriptUrl || '${origins.scriptOrigin}/capture.js?tm_refresh=' + encodeURIComponent(update.latestReleaseId);
    function copyScriptAttribute(name, fallback) {
      var value = script && script.getAttribute(name);
      if (value) {
        nextScript.setAttribute(name, value);
      } else if (fallback) {
        nextScript.setAttribute(name, fallback);
      }
    }
    copyScriptAttribute('data-tracemind-token', projectKey);
    copyScriptAttribute('data-tracemind-endpoint');
    copyScriptAttribute('data-tracemind-presence-endpoint');
    copyScriptAttribute('data-tracemind-feedback-endpoint');
    copyScriptAttribute('data-tracemind-framework', sourceFramework);
    copyScriptAttribute('data-tracemind-user-id', staticUserId);
    copyScriptAttribute('data-tracemind-user-id-provider', userIdProvider);
    nextScript.onload = function () {
      runtime.disable('updated');
    };
    nextScript.onerror = function () {
      scriptUpdateInProgress = false;
    };
    document.head.appendChild(nextScript);
  }

  function handleServerResponse(body) {
    if (!body || typeof body !== 'object') return;
    applyScriptUpdate(body.webCaptureScriptUpdate);
  }

  function sendBatch(endpoint, body, unloadMode) {
    var json = JSON.stringify(body);
    if (unloadMode && navigator.sendBeacon) {
      return navigator.sendBeacon(endpoint, new Blob([json], { type: 'application/json' }));
    }
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: !!unloadMode
    }).then(function (response) {
      if (!response.ok) throw new Error('http_' + response.status);
      settleAllRecoveryEpisodes('transport_succeeded');
      markTransportSuccess();
      syncRecoveryEpisodeObservations();
      if (typeof response.json === 'function') {
        return response.json().then(function (body) {
          handleServerResponse(body);
          return response;
        }).catch(function () {
          return response;
        });
      }
      return response;
    });
  }

  function flushKind(kind, reason, unloadMode) {
    if (!runtimeActive()) return Promise.resolve();
    var records = dueRecords(
      kind,
      kind === 'capture' ? CAPTURE_BATCH_SIZE : (kind === 'presence' ? PRESENCE_BATCH_SIZE : FEEDBACK_BATCH_SIZE),
      unloadMode ? MAX_UNLOAD_BATCH_BYTES : Infinity
    );
    if (records.length === 0) return Promise.resolve();
    var body = {
      projectKey: projectKey,
      sessionId: sessionId,
      anonymousId: anonymousId,
      userId: currentUserId(),
      deviceId: deviceId,
      deviceFingerprint: fingerprint,
      platform: 'web',
      events: records.map(function (record) { return record.payload; }),
      deliveryStats: deliveryReport(kind, reason, records)
    };
    var targetEndpoint = kind === 'capture' ? endpoint : (kind === 'presence' ? presenceEndpoint : feedbackEndpoint);
    var result = sendBatch(targetEndpoint, body, unloadMode);
    if (result === true) {
      removeRecords(records);
      resetReportedStats();
      return Promise.resolve();
    }
    if (result === false) {
      markRecordsFailed(kind, records, new Error('beacon_rejected'));
      return Promise.resolve();
    }
    return result.then(function () {
      removeRecords(records);
      clearRecoveryEpisode(kind);
      resetReportedStats();
    }).catch(function (error) {
      markRecordsFailed(kind, records, error);
    });
  }

  function openOfflineEpisodesForDueRecords() {
    [
      ['capture', CAPTURE_BATCH_SIZE],
      ['presence', PRESENCE_BATCH_SIZE],
      ['feedback', FEEDBACK_BATCH_SIZE]
    ].forEach(function (entry) {
      if (dueRecords(entry[0], entry[1], Infinity).length > 0) {
        openRecoveryEpisode(entry[0], 'platform_offline');
      }
    });
  }

  function flushQueue(reason, unloadMode) {
    if (!runtimeActive()) return Promise.resolve(queueStatus());
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!unloadMode && navigator.onLine === false) {
      settleAllRecoveryEpisodes('platform_offline');
      setConnectivityState('offline', 'platform_connectivity', 'medium');
      syncRecoveryEpisodeObservations();
      openOfflineEpisodesForDueRecords();
      return Promise.resolve(queueStatus());
    }
    if (flushing && !unloadMode) return Promise.resolve(queueStatus());
    flushing = true;
    return flushKind('capture', reason, unloadMode)
      .then(function () { return flushKind('presence', reason, unloadMode); })
      .then(function () { return flushKind('feedback', reason, unloadMode); })
      .then(function () {
        flushing = false;
        return queueStatus();
      })
      .catch(function (error) {
        flushing = false;
        deliveryStats.lastError = error && error.message ? error.message : 'flush_failed';
        persistDeliveryStats();
        return queueStatus();
      });
  }

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

  function isInteractive(element) {
    if (!element || !element.tagName) return false;
    var tag = element.tagName.toLowerCase();
    var role = attr(element, 'role');
    return tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select'
      || tag === 'textarea' || tag === 'form' || role === 'button' || role === 'link'
      || element.isContentEditable || attr(element, 'contenteditable') === 'true';
  }

  function interactiveTarget(event) {
    var path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (var i = 0; i < path.length; i += 1) {
      if (isInteractive(path[i])) return path[i];
    }
    var node = event && event.target;
    while (node && node !== document && node.nodeType === 1) {
      if (isInteractive(node)) return node;
      node = node.parentElement;
    }
    return event && event.target;
  }

  function identityValue(source, value, confidence) {
    return {
      key: 'target:' + source + ':' + String(value).slice(0, 160),
      source: source,
      confidence: confidence
    };
  }

  function formIdentity(element) {
    var form = element && (element.form || (element.closest && element.closest('form')));
    if (!form) return null;
    var formKey = attr(form, 'data-testid') || attr(form, 'data-test') || attr(form, 'data-cy') || form.id || form.name;
    var controlKey = element.name || element.id || attr(element, 'aria-label') || element.type || element.tagName;
    if (!formKey || !controlKey) return null;
    return identityValue('form', formKey + ':' + controlKey, 'medium');
  }

  function targetIdentity(element, eventType, pagePath) {
    if (!element) return identityValue('missing', pagePath + ':' + eventType, 'low');
    var testId = attr(element, 'data-testid') || attr(element, 'data-test') || attr(element, 'data-cy');
    if (testId) return identityValue('data-testid', testId, 'high');
    if (element.id) return identityValue('id', element.id, 'high');
    if (element.name) return identityValue('name', element.name, 'high');
    var aria = attr(element, 'aria-label');
    var role = attr(element, 'role');
    if (aria && role) return identityValue('aria', role + ':' + aria, 'medium');
    var formBased = formIdentity(element);
    if (formBased) return formBased;
    var text = textOf(element);
    if (text) return identityValue('text', pagePath + ':' + (element.tagName || '').toLowerCase() + ':' + text, 'medium');
    return identityValue('path', pagePath + ':' + elementPath(element), 'low');
  }

  function actionKeyFor(eventType, identity, pagePath) {
    return ['web', pagePath, eventType, identity.key].join(':');
  }

  function isSubmitElement(element) {
    if (!element || !element.tagName) return false;
    var tag = element.tagName.toLowerCase();
    return (tag === 'button' || tag === 'input') && element.type === 'submit' && !!element.form;
  }

  function eventTargetDetails(event, eventType) {
    var pagePath = currentPath();
    var target = interactiveTarget(event);
    var targetDetails = targetInfo(target);
    var identity = targetIdentity(target, eventType, pagePath);
    return {
      pagePath: pagePath,
      element: target,
      target: targetDetails,
      identity: identity,
      identityKey: identity.key
    };
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
    return normalizeUserId(staticUserId) || normalizeUserId(readLocal('tracemind_user_id'));
  }

  function buildCapturePayload(type, data) {
    return Object.assign({
      projectKey: projectKey,
      sessionId: sessionId,
      anonymousId: anonymousId,
      userId: currentUserId(),
      deviceId: deviceId,
      deviceFingerprint: fingerprint,
      platform: 'web',
      deviceInfo: deviceInfo(),
      source: currentSource(),
      attribution: currentAttribution(),
      type: type,
      eventName: data && data.eventName,
      path: currentPath(),
      title: document.title,
      occurredAt: new Date().toISOString()
    }, data || {});
  }

  function buildFeedbackPayload(input) {
    input = input || {};
    return {
      projectKey: projectKey,
      sessionId: sessionId,
      anonymousId: anonymousId,
      userId: currentUserId(),
      deviceId: deviceId,
      deviceFingerprint: fingerprint,
      platform: 'web',
      deviceInfo: deviceInfo(),
      source: currentSource(),
      path: currentPath(),
      title: document.title,
      message: input.message || input,
      occurredAt: new Date().toISOString()
    };
  }

  function send(type, data) {
    if (!projectKey || !runtimeActive()) return;
    enqueue('capture', buildCapturePayload(type, data));
  }

  var recentErrorFingerprints = {};
  var ERROR_DEDUPE_WINDOW_MS = 5000;

  function cleanErrorString(value, max) {
    var text = String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max || 160);
    if (!text) return '';
    if (/@|https?:|[?&=]|%40|bearer\\s+|api[_-]?key|access[_-]?token|secret|password/i.test(text)) return '';
    return text;
  }

  function sanitizeAppErrorContext(context) {
    var input = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
    var output = {};
    var allowed = { source: true, screen: true, release: true, component: true, status: true, occurredAt: true };
    Object.keys(input).forEach(function (key) {
      if (!allowed[key]) return;
      var value = input[key];
      if (typeof value === 'string') {
        var clean = cleanErrorString(value, 160);
        if (clean) output[key] = clean;
      } else if (typeof value === 'number' && isFinite(value)) {
        output[key] = value;
      } else if (typeof value === 'boolean') {
        output[key] = value;
      }
    });
    return output;
  }

  function sanitizeMessageForFingerprint(value) {
    return String(value || '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig, '[email]')
      .replace(/https?:\\/\\/\\S+\\?\\S+/ig, '[url]')
      .replace(/\\b(bearer\\s+\\S+|api[_-]?key\\s*[:=]\\s*\\S+|access[_-]?token\\s*[:=]\\s*\\S+|secret\\S*)\\b/ig, '[secret]')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }

  function sanitizeMessagePreview(value) {
    var text = String(value || '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig, '[email]')
      .replace(/https?:\\/\\/\\S+/ig, '[url]')
      .replace(/(^|\\s)\\/[^\\s?]+\\?\\S+/g, '$1[url]')
      .replace(/\\b(sk-[A-Za-z0-9_-]+|pk_[A-Za-z0-9_-]+|bearer\\s+\\S+|api[_-]?key\\s*[:=]\\s*\\S+|access[_-]?token\\s*[:=]\\s*\\S+|token\\s*[:=]\\s*\\S+|secret\\s*[:=]\\s*\\S+|password\\s*[:=]\\s*\\S+)\\b/ig, '[redacted]')
      .replace(/\\b\\d{12,19}\\b/g, '[number]')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 160);
    if (!text) return '';
    if (/@|https?:|%40|bearer\\s+|api[_-]?key|access[_-]?token|sk-|pk_|secret|password/i.test(text)) return '';
    if (/\\b(raw\\s+prompt|raw\\s+user\\s+content|source\\s+diff|request\\s+body|response\\s+body|authorization\\s*:|set-cookie\\s*:)/i.test(text)) return '';
    return text;
  }

  function firstStackFrame(stack) {
    var lines = String(stack || '').split(/\\n+/).map(function (line) {
      return line.replace(/\\s+/g, ' ').trim();
    }).filter(Boolean);
    for (var index = 0; index < lines.length; index += 1) {
      if (/^(at\\s+|.*@|.*:\\d+:\\d+)/.test(lines[index]) && !/^[a-z]*error\\b/i.test(lines[index])) {
        return lines[index];
      }
    }
    return lines.length > 1 ? lines[1] : (lines[0] || '');
  }

  function errorCause(error, merged) {
    return merged.cause || (error && error.cause);
  }

  function causeTypeFor(cause, explicitType) {
    if (explicitType) return explicitType;
    if (!cause) return '';
    if (cause.name) return cause.name;
    if (cause.constructor && cause.constructor.name) return cause.constructor.name;
    return typeof cause === 'string' ? 'Error' : '';
  }

  function causeMessageFor(cause, explicitMessage) {
    if (explicitMessage) return explicitMessage;
    if (!cause) return '';
    return cause.message || (typeof cause === 'string' ? cause : '');
  }

  function addErrorDiagnosticString(properties, merged, key, max) {
    var raw = merged[key] || (merged.properties && merged.properties[key]);
    var clean = cleanErrorString(raw, max || 120);
    if (clean) properties[key] = clean;
  }

  function cleanDiagnosticFingerprint(value, prefix) {
    var text = cleanErrorString(value, 120).toLowerCase();
    return new RegExp('^' + prefix + '[a-z0-9]{6,64}$').test(text) ? text : '';
  }

  function addSafeErrorDiagnostics(properties, merged, error, message) {
    var preview = sanitizeMessagePreview(merged.messagePreview || (merged.properties && merged.properties.messagePreview) || message);
    if (preview) properties.messagePreview = preview;
    var stack = merged.stack || merged.stackTrace || (error && error.stack);
    var stackFingerprint = cleanDiagnosticFingerprint(merged.stackFingerprint || (merged.properties && merged.properties.stackFingerprint), 'tm_stack_');
    if (!stackFingerprint && stack) stackFingerprint = hash(sanitizeMessageForFingerprint(stack).slice(0, 1000), 'tm_stack_');
    if (stackFingerprint) properties.stackFingerprint = stackFingerprint;
    var topFrame = firstStackFrame(stack);
    var topFrameFingerprint = cleanDiagnosticFingerprint(merged.topFrameFingerprint || (merged.properties && merged.properties.topFrameFingerprint), 'tm_frame_');
    if (!topFrameFingerprint && topFrame) topFrameFingerprint = hash(sanitizeMessageForFingerprint(topFrame), 'tm_frame_');
    if (topFrameFingerprint) properties.topFrameFingerprint = topFrameFingerprint;
    var cause = errorCause(error, merged);
    var causeType = cleanErrorString(causeTypeFor(cause, merged.causeType || (merged.properties && merged.properties.causeType)), 80);
    if (causeType) properties.causeType = causeType;
    var causeFingerprint = cleanDiagnosticFingerprint(merged.causeFingerprint || (merged.properties && merged.properties.causeFingerprint), 'tm_cause_');
    var causeMessage = causeMessageFor(cause, merged.causeMessage || (merged.properties && merged.properties.causeMessage));
    if (!causeFingerprint && (causeType || causeMessage)) {
      causeFingerprint = hash(causeType + ':' + sanitizeMessageForFingerprint(causeMessage), 'tm_cause_');
    }
    if (causeFingerprint) properties.causeFingerprint = causeFingerprint;
    ['operation', 'feature', 'routeName', 'correlationId', 'requestId'].forEach(function (key) {
      addErrorDiagnosticString(properties, merged, key, 120);
    });
    var status = Number(merged.httpStatus || merged.statusCode || (merged.properties && (merged.properties.httpStatus || merged.properties.statusCode)));
    if (status >= 100 && status <= 599 && Math.floor(status) === status) properties.httpStatus = status;
  }

  function errorInfo(errorOrInfo, options) {
    var info = (errorOrInfo && typeof errorOrInfo === 'object' && !(errorOrInfo instanceof Error)) ? errorOrInfo : {};
    var error = errorOrInfo instanceof Error ? errorOrInfo : info.error;
    var merged = Object.assign({}, info, options || {});
    var errorType = cleanErrorString(merged.errorType || (error && error.name) || (typeof errorOrInfo === 'string' ? 'Error' : ''), 80) || 'Error';
    var message = merged.message || (error && error.message) || (typeof errorOrInfo === 'string' ? errorOrInfo : errorType);
    var properties = {
      errorKind: cleanErrorString(merged.errorKind, 40) || 'runtime',
      errorType: errorType,
      messageFingerprint: cleanErrorString(merged.messageFingerprint, 120) || hash(errorType + ':' + sanitizeMessageForFingerprint(message), 'tm_error_'),
      fatal: merged.fatal === true,
      handled: merged.handled === false ? false : true,
      source: cleanErrorString(merged.source, 40) || 'web',
      status: 'error'
    };
    var release = cleanErrorString(merged.release || (merged.properties && merged.properties.release), 80);
    var component = cleanErrorString(merged.component || (merged.properties && merged.properties.component), 120);
    if (release) properties.release = release;
    if (component) properties.component = component;
    addSafeErrorDiagnostics(properties, merged, error, message);
    return {
      path: safeCapturePath(merged.path || merged.screen),
      eventName: 'app_error',
      properties: properties,
      context: sanitizeAppErrorContext(merged.context)
    };
  }

  function shouldQueueError(fingerprint) {
    var now = Date.now();
    var last = recentErrorFingerprints[fingerprint] || 0;
    if (last && now - last < ERROR_DEDUPE_WINDOW_MS) return false;
    recentErrorFingerprints[fingerprint] = now;
    return true;
  }

  function captureError(errorOrInfo, options) {
    if (!projectKey) return { queued: false };
    var payload = errorInfo(errorOrInfo, options);
    if (!shouldQueueError(payload.properties.messageFingerprint)) return { queued: false };
    send('app_error', payload);
    return { queued: true, messageFingerprint: payload.properties.messageFingerprint };
  }

  function submitFeedback(input) {
    if (!projectKey) return { queued: false };
    enqueue('feedback', buildFeedbackPayload(input));
    return { queued: true };
  }

  function openFeedback(defaults) {
    defaults = defaults || {};
    if (typeof window.prompt !== 'function') return { queued: false };
    var body = window.prompt(defaults.prompt || 'Feedback');
    if (!body) return { queued: false };
    return submitFeedback({
      message: {
        formatVersion: 1,
        kind: defaults.kind || 'other',
        title: defaults.title || '',
        body: body,
        contact: defaults.contact || { consent: false },
        fields: defaults.fields || {},
        attachments: []
      }
    });
  }

  function newPresenceId() {
    return 'tm_pres_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function canAccrueActiveTime() {
    return document.visibilityState !== 'hidden' && windowIsFocused;
  }

  function resetActiveClock() {
    activeDurationMs = 0;
    activeStartedAt = null;
    lastActiveAt = null;
  }

  function settleActiveWindow(now) {
    now = now === undefined || now === null ? Date.now() : now;
    if (activeStartedAt === null || activeStartedAt === undefined || lastActiveAt === null || lastActiveAt === undefined) return;
    var idleCutoff = lastActiveAt + ACTIVE_IDLE_TIMEOUT_MS;
    var endAt = Math.min(now, idleCutoff);
    if (endAt > activeStartedAt) {
      activeDurationMs += endAt - activeStartedAt;
    }
    activeStartedAt = endAt < now ? null : endAt;
  }

  function inactiveActiveState(now) {
    if (!canAccrueActiveTime()) return 'inactive';
    if (lastActiveAt !== null && lastActiveAt !== undefined && now - lastActiveAt >= ACTIVE_IDLE_TIMEOUT_MS) return 'idle';
    return 'inactive';
  }

  function resumeActiveWindow() {
    if (!canAccrueActiveTime()) return;
    var now = Date.now();
    settleActiveWindow(now);
    lastActiveAt = now;
    if (activeStartedAt === null || activeStartedAt === undefined) activeStartedAt = now;
  }

  function pauseActiveWindow() {
    settleActiveWindow(Date.now());
    activeStartedAt = null;
  }

  function recordActiveInteraction() {
    if (!canAccrueActiveTime()) return;
    var now = Date.now();
    settleActiveWindow(now);
    lastActiveAt = now;
    if (activeStartedAt === null || activeStartedAt === undefined) activeStartedAt = now;
  }

  function buildPresencePayload(state) {
    var now = Date.now();
    settleActiveWindow(now);
    return {
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
      attribution: currentAttribution(),
      path: location.pathname,
      title: document.title,
      state: state,
      heartbeatIntervalMs: heartbeatIntervalMs,
      activeDurationMs: activeDurationMs,
      lastActiveAt: lastActiveAt ? new Date(lastActiveAt).toISOString() : undefined,
      activeState: activeStartedAt ? 'active' : inactiveActiveState(now),
      idleTimeoutMs: ACTIVE_IDLE_TIMEOUT_MS,
      occurredAt: new Date().toISOString()
    };
  }

  function sendPresence(state) {
    if (!projectKey || !currentPresenceId || !runtimeActive()) return;
    enqueue('presence', buildPresencePayload(state));
  }

  function stopPresence(state) {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    if (currentPresenceId) {
      pauseActiveWindow();
      sendPresence(state || 'end');
      currentPresenceId = null;
      resetActiveClock();
    }
  }

  function startPresence(state) {
    if (!projectKey || !runtimeActive() || document.visibilityState === 'hidden' || currentPresenceId) return;
    resetActiveClock();
    currentPresenceId = newPresenceId();
    resumeActiveWindow();
    sendPresence(state || 'start');
    presenceTimer = setInterval(function () {
      sendPresence('heartbeat');
    }, heartbeatIntervalMs);
  }

  var INPUT_IDLE_DEBOUNCE_MS = 5000;
  var inputDebounceTimers = {};
  var pendingInputEvents = {};

  function isTrustedUserInputEvent(event) {
    return !event || event.isTrusted !== false;
  }

  function inputEventKey(targetDetails) {
    return targetDetails.pagePath + ':' + targetDetails.identity.key;
  }

  function sendInputTargetDetails(targetDetails) {
    send('input', {
      targetText: textOf(targetDetails.element),
      targetTag: targetDetails.element && targetDetails.element.tagName,
      target: targetDetails.target,
      targetIdentity: targetDetails.identity,
      identitySource: targetDetails.identity.source,
      identityConfidence: targetDetails.identity.confidence,
      actionKey: actionKeyFor('input', targetDetails.identity, targetDetails.pagePath),
      path: targetDetails.pagePath,
      targetHash: hash(targetDetails.identityKey || JSON.stringify(targetDetails.target), 'tm_target_')
    });
  }

  function clearPendingInputEvent(key) {
    clearTimeout(inputDebounceTimers[key]);
    delete inputDebounceTimers[key];
    delete pendingInputEvents[key];
  }

  function queueInputEvent(event) {
    var targetDetails = eventTargetDetails(event, 'input');
    var key = inputEventKey(targetDetails);
    pendingInputEvents[key] = targetDetails;
    clearTimeout(inputDebounceTimers[key]);
    inputDebounceTimers[key] = setTimeout(function () {
      var latestTargetDetails = pendingInputEvents[key];
      if (!latestTargetDetails) return;
      sendInputTargetDetails(latestTargetDetails);
      clearPendingInputEvent(key);
    }, INPUT_IDLE_DEBOUNCE_MS);
  }

  function flushInputEvent(event, sendWhenMissing) {
    var targetDetails = eventTargetDetails(event, 'input');
    var key = inputEventKey(targetDetails);
    var pendingTargetDetails = pendingInputEvents[key];
    if (pendingTargetDetails) {
      sendInputTargetDetails(pendingTargetDetails);
      clearPendingInputEvent(key);
    } else if (sendWhenMissing) {
      sendInputTargetDetails(targetDetails);
    }
  }

  function shouldSendChangeWithoutPending(event) {
    var target = interactiveTarget(event);
    if (!target || !target.tagName) return true;
    var tag = target.tagName.toLowerCase();
    if (tag === 'textarea' || target.isContentEditable) return false;
    if (tag !== 'input') return true;
    var inputType = String(target.type || 'text').toLowerCase();
    return inputType === 'checkbox'
      || inputType === 'radio'
      || inputType === 'file'
      || inputType === 'range'
      || inputType === 'color'
      || inputType === 'date'
      || inputType === 'datetime-local'
      || inputType === 'month'
      || inputType === 'time'
      || inputType === 'week';
  }

  function sendTargetEvent(eventType, event) {
    recordActiveInteraction();
    var targetDetails = eventTargetDetails(event, eventType);
    send(eventType, {
      targetText: textOf(targetDetails.element),
      targetTag: targetDetails.element && targetDetails.element.tagName,
      target: targetDetails.target,
      targetIdentity: targetDetails.identity,
      identitySource: targetDetails.identity.source,
      identityConfidence: targetDetails.identity.confidence,
      actionKey: actionKeyFor(eventType, targetDetails.identity, targetDetails.pagePath),
      path: targetDetails.pagePath,
      targetHash: hash(targetDetails.identityKey || JSON.stringify(targetDetails.target), 'tm_target_')
    });
  }

  send('page_view');
  startPresence('start');
  document.addEventListener('click', function (event) {
    var target = interactiveTarget(event);
    sendTargetEvent(isSubmitElement(target) ? 'submit' : 'click', event);
  }, true);

  document.addEventListener('input', function (event) {
    if (!isTrustedUserInputEvent(event)) return;
    recordActiveInteraction();
    queueInputEvent(event);
  }, true);

  document.addEventListener('change', function (event) {
    if (!isTrustedUserInputEvent(event)) return;
    recordActiveInteraction();
    flushInputEvent(event, shouldSendChangeWithoutPending(event));
  }, true);

  document.addEventListener('blur', function (event) {
    if (!isTrustedUserInputEvent(event)) return;
    flushInputEvent(event, false);
  }, true);

  document.addEventListener('submit', function (event) {
    sendTargetEvent('submit', event);
  }, true);

  document.addEventListener('keydown', function (event) {
    recordActiveInteraction();
    var key = event.key || event.code;
    if (key === 'Enter' || key === 'Search') {
      var target = interactiveTarget(event);
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        sendTargetEvent('submit', event);
      }
    }
  }, true);

  document.addEventListener('scroll', recordActiveInteraction, true);
  document.addEventListener('touchstart', recordActiveInteraction, true);
  document.addEventListener('pointerdown', recordActiveInteraction, true);
  window.addEventListener('error', function (event) {
    captureError(event && (event.error || event.message), { handled: false, fatal: false, source: 'web' });
  });
  window.addEventListener('unhandledrejection', function (event) {
    captureError(event && event.reason, { handled: false, fatal: false, source: 'web', errorKind: 'unhandledrejection' });
  });

  function captureRouteChange(callback) {
    callback();
    var nextPath = routeCapturePath();
    setTimeout(function () {
      sendRouteChangeIfChanged(nextPath);
    }, 0);
  }

  var pushState = history.pushState;
  history.pushState = function () {
    var args = arguments;
    captureRouteChange(function () { pushState.apply(history, args); });
  };
  var replaceState = history.replaceState;
  history.replaceState = function () {
    var args = arguments;
    captureRouteChange(function () { replaceState.apply(history, args); });
  };
  window.addEventListener('popstate', function () {
    if (!runtimeActive()) return;
    sendRouteChangeIfChanged(routeCapturePath());
  });
  window.addEventListener('hashchange', function () {
    if (!runtimeActive()) return;
    sendRouteChangeIfChanged(routeCapturePath());
  });
  document.addEventListener('visibilitychange', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes(document.visibilityState === 'hidden' ? 'page_hidden' : 'page_shown');
    updateLifecycleFromVisibility();
    syncRecoveryEpisodeObservations();
    if (document.visibilityState === 'hidden') {
      stopPresence('background');
      flushQueue('visibilitychange', true);
    } else {
      startPresence('foreground');
      flushQueue('visibilitychange', false);
    }
  });
  window.addEventListener('blur', function () {
    if (!runtimeActive()) return;
    windowIsFocused = false;
    pauseActiveWindow();
    sendPresence('heartbeat');
  });
  window.addEventListener('focus', function () {
    if (!runtimeActive()) return;
    windowIsFocused = true;
    if (currentPresenceId) {
      resumeActiveWindow();
      sendPresence('foreground');
    } else {
      startPresence('foreground');
    }
  });
  window.addEventListener('online', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('platform_online');
    updateConnectivityFromPlatform();
    syncRecoveryEpisodeObservations();
    flushQueue('online', false);
  });
  window.addEventListener('offline', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('platform_offline');
    updateConnectivityFromPlatform();
    syncRecoveryEpisodeObservations();
    openOfflineEpisodesForDueRecords();
  });
  window.addEventListener('pageshow', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('page_shown');
    updateLifecycleFromVisibility();
    syncRecoveryEpisodeObservations();
  });
  document.addEventListener('freeze', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('page_frozen');
    updateLifecycleFromVisibility();
    syncRecoveryEpisodeObservations();
  });
  document.addEventListener('resume', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('page_resumed');
    updateLifecycleFromVisibility();
    syncRecoveryEpisodeObservations();
  });
  window.addEventListener('pagehide', function () {
    if (!runtimeActive()) return;
    settleAllRecoveryEpisodes('page_hidden');
    updateLifecycleFromVisibility();
    syncRecoveryEpisodeObservations();
    stopPresence('end');
    flushQueue('pagehide', true);
  });
  window.addEventListener('beforeunload', function () {
    if (!runtimeActive()) return;
    stopPresence('end');
    flushQueue('beforeunload', true);
  });

  window.TraceMind = {
    capture: send,
    captureError: captureError,
    presence: sendPresence,
    openFeedback: openFeedback,
    submitFeedback: submitFeedback,
    flush: function () {
      return flushQueue('manual', false);
    },
    status: queueStatus,
    identify: function (userId, traits) {
      writeLocal('tracemind_user_id', userId);
      send('custom', { eventName: 'identify', userId: userId, properties: traits || {} });
    },
    sessionId: sessionId,
    anonymousId: anonymousId,
    deviceId: deviceId
  };
})();`;
}

function normalizedScriptHost(host) {
  return normalizedOrigin(host) || String(host || '').trim().replace(/\/+$/, '');
}

function captureScriptAssetPath(hash) {
  return `/capture.${hash}.js`;
}

function captureScriptHash(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export async function buildCaptureScriptAsset(host) {
  const origins = normalizeClientScriptOrigins(host);
  const normalizedHost = origins.cacheKey || normalizedScriptHost(host);
  const cached = captureScriptAssetCache.get(normalizedHost);
  if (cached) return cached;

  const rawBody = clientScript(origins);
  const minified = await minify(rawBody, {
    compress: { passes: 2 },
    mangle: true,
    format: {
      ascii_only: true,
      comments: false,
    },
  });
  const body = minified.code;
  if (!body) throw new Error('TraceMind capture script minification produced an empty result.');

  const hash = captureScriptHash(body);
  const asset = {
    host: origins.apiOrigin,
    scriptOrigin: origins.scriptOrigin,
    body,
    hash,
    etag: `"sha256-${hash}"`,
    path: captureScriptAssetPath(hash),
    rawBytes: Buffer.byteLength(rawBody),
    bytes: Buffer.byteLength(body),
  };
  captureScriptAssetCache.set(normalizedHost, asset);
  return asset;
}

function captureScriptRedirectResponse(asset) {
  return {
    statusCode: 302,
    headers: {
      Location: asset.path,
      'Cache-Control': CAPTURE_SCRIPT_ENTRY_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
    },
    body: '',
  };
}

function captureScriptEntryResponse(asset) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': CAPTURE_SCRIPT_ENTRY_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
      ETag: asset.etag,
    },
    body: asset.body,
  };
}

function captureScriptAssetResponse(asset) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': CAPTURE_SCRIPT_IMMUTABLE_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
      ETag: asset.etag,
    },
    body: asset.body,
  };
}

export async function captureScriptResponse(pathname, host) {
  const apiOrigin = normalizedScriptHost(host);
  const asset = await buildCaptureScriptAsset({
    apiOrigin,
    scriptOrigin: configuredCaptureScriptOrigin() || apiOrigin,
  });
  if (pathname === CAPTURE_SCRIPT_ENTRY_PATH) return captureScriptEntryResponse(asset);

  const match = CAPTURE_SCRIPT_ASSET_PATH_PATTERN.exec(pathname);
  if (!match) return null;
  if (match[1] !== asset.hash) return captureScriptRedirectResponse(asset);
  return captureScriptAssetResponse(asset);
}

function requestHost(req) {
  const headers = req.headers || {};
  return `${headers['x-forwarded-proto'] || 'http'}://${headers.host || 'localhost'}`;
}

function cleanWebScriptReleaseId(value) {
  const releaseId = safeString(value, 80).trim();
  return /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(releaseId) ? releaseId : '';
}

function payloadWebScriptReleaseId(payload = {}) {
  const source = safeObject(payload.source);
  const details = {
    ...safeObject(payload.sourceDetails),
    ...safeObject(source.details),
  };
  return cleanWebScriptReleaseId(details.scriptReleaseId);
}

function payloadLooksLikeWebCapture(payload = {}) {
  const source = safeObject(payload.source);
  const sourceType = safeString(source.type || payload.sourceType || payload.platform, 40).toLowerCase();
  return sourceType === 'web' || (!sourceType && !payload.sourceType && !payload.platform);
}

function capturePayloadCandidates(payload = {}) {
  if (!Array.isArray(payload.events)) return [payload];
  const sharedPayload = { ...payload };
  delete sharedPayload.events;
  return payload.events.slice(0, 100).map((eventPayload) => ({
    ...sharedPayload,
    ...safeObject(eventPayload),
  }));
}

export function webCaptureScriptUpdateForPayload(payload = {}, req = {}) {
  const candidate = capturePayloadCandidates(payload).find((item) => (
    payloadLooksLikeWebCapture(item)
      && payloadWebScriptReleaseId(item) !== CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID
  ));
  if (!candidate) return null;

  const observedReleaseId = payloadWebScriptReleaseId(candidate) || 'legacy';
  const scriptOrigin = configuredCaptureScriptOrigin() || normalizedOrigin(requestHost(req));
  return {
    type: 'web_capture_script_update_available',
    latestReleaseId: CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID,
    observedReleaseId,
    reason: observedReleaseId === 'legacy' ? 'missing_script_release' : 'stale_script_release',
    latestScriptUrl: `${scriptOrigin}${CAPTURE_SCRIPT_ENTRY_PATH}?tm_refresh=${encodeURIComponent(CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID)}`,
    autoUpdate: true,
  };
}

function requestPathname(req, host) {
  return new URL(req.url || '/', host).pathname;
}

function isCaptureScriptPath(pathname) {
  return pathname === CAPTURE_SCRIPT_ENTRY_PATH || CAPTURE_SCRIPT_ASSET_PATH_PATTERN.test(pathname);
}

function sendHttpResponse(res, response) {
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
}

async function insertCaptureEvent(project, payload = {}, req = {}) {
  const source = normalizeCaptureSource(payload, req.headers || {});
  const isServerAppSource = source.sourceType === 'server_app';
  const eventType = safeString(payload.type, 40, 'custom');
  const isAppError = eventType === 'app_error';
  const sourceDetails = isServerAppSource
    ? sanitizeServerCaptureFields(source.sourceDetails)
    : (isAppError ? sanitizeServerCaptureFields(source.sourceDetails) : source.sourceDetails);
  const rawProperties = safeObject(payload.properties || payload.custom || payload.data);
  const rawContext = safeObject(payload.context);
  const properties = isAppError
    ? sanitizeAppErrorProperties(rawProperties)
    : (isServerAppSource ? sanitizeServerCaptureFields(rawProperties) : rawProperties);
  const context = isAppError
    ? sanitizeAppErrorContext(rawContext)
    : (isServerAppSource ? sanitizeServerCaptureFields(rawContext) : rawContext);
  const path = isAppError
    ? safePathWithoutQuery(payload.path || rawProperties.path || rawProperties.screen, '/')
    : safeString(payload.path, 500, '/');
  const runtimeContext = sanitizeRuntimeContext(payload.runtimeContext);

  if (isSourceBlocked(project, source)) {
    return { ok: true, ignored: true };
  }

  const behaviorDoc = {
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
    type: eventType,
    eventName: safeString(payload.eventName || payload.name || payload.type, 120),
    path,
    title: safeString(payload.title, 160),
    targetText: safeString(payload.targetText, 200),
    targetTag: safeString(payload.targetTag, 40),
    target: safeObject(payload.target, 4096),
    targetHash: safeString(payload.targetHash, 160),
    targetIdentity: safeObject(payload.targetIdentity, 2048),
    identitySource: safeString(payload.identitySource || payload.targetIdentity?.source, 80),
    identityConfidence: safeString(payload.identityConfidence || payload.targetIdentity?.confidence, 20),
    actionKey: safeString(payload.actionKey, 500),
    relatedActionKey: safeString(payload.relatedActionKey || context.relatedActionKey, 500),
    relatedTargetHash: safeString(payload.relatedTargetHash || context.relatedTargetHash, 160),
    correlationId: safeString(payload.correlationId || context.correlationId, 160),
    attribution: normalizeAttribution(payload.attribution),
    ...(runtimeContext ? { runtimeContext } : {}),
    method: safeString(payload.method, 20),
    status: safeString(payload.status, 20),
    properties,
    context,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    semanticStatus: 'pending',
    createdAt: new Date(),
  };
  const guard = await evaluateIngestionGuard({
    ...behaviorDoc,
    eventType,
  });
  if (guard.decision === 'drop_to_rollup') {
    return {
      ok: true,
      ignored: false,
      limited: true,
      sampled: 0,
      dropped: 1,
      guardMode: guard.mode,
      guardReason: guard.reason,
    };
  }

  await RawBehaviors.insertAsync(behaviorDoc);
  queueProductUsageActivity(project, 'capture', payload);
  await recordSetupAttemptSafely(() => recordSetupAttemptFirstCapture(project._id, { eventType }));

  return {
    ok: true,
    ignored: false,
    limited: guard.mode === 'sampled' || guard.mode === 'fused',
    sampled: guard.decision === 'sample_accept' ? 1 : 0,
    dropped: 0,
    guardMode: guard.mode,
    guardReason: guard.reason,
  };
}

const CAPTURE_GUARD_MODE_PRIORITY = { open: 0, shadow: 1, watch: 2, sampled: 3, fused: 4 };
const CAPTURE_GUARD_REASON_PRIORITY = {
  none: 0,
  volume_watch: 1,
  baseline_watch: 2,
  duplicate_storm: 3,
  storage_pressure: 4,
  storage_emergency: 5,
};

function strongerCaptureGuardValue(left, right, priority) {
  return (priority[right] || 0) > (priority[left] || 0) ? right : left;
}

function emptyCaptureIngestSummary() {
  return {
    accepted: 0,
    ignored: 0,
    limited: false,
    sampled: 0,
    dropped: 0,
    guardMode: 'open',
    guardReason: 'none',
  };
}

function addCaptureIngestResult(summary, result = {}) {
  if (result.ignored) summary.ignored += 1;
  else if (!result.dropped) summary.accepted += 1;

  summary.limited = summary.limited || Boolean(result.limited);
  summary.sampled += Number(result.sampled || 0);
  summary.dropped += Number(result.dropped || 0);
  summary.guardMode = strongerCaptureGuardValue(summary.guardMode, result.guardMode || 'open', CAPTURE_GUARD_MODE_PRIORITY);
  summary.guardReason = strongerCaptureGuardValue(summary.guardReason, result.guardReason || 'none', CAPTURE_GUARD_REASON_PRIORITY);
  return summary;
}

export async function ingestCapturePayload(payload = {}, req = {}) {
  payload = payload || {};
  const project = await resolveProjectByKey(payload.projectKey);
  if (!project) {
    return { ok: false, statusCode: 401, error: 'invalid_project_key' };
  }

  if (Array.isArray(payload.events)) {
    const summary = emptyCaptureIngestSummary();
    const sharedPayload = { ...payload };
    delete sharedPayload.events;

    for (const eventPayload of payload.events.slice(0, 100)) {
      const result = await insertCaptureEvent(project, {
        ...sharedPayload,
        ...safeObject(eventPayload),
        projectKey: project.projectKey,
      }, req);
      addCaptureIngestResult(summary, result);
    }

    if (summary.dropped > 0) {
      await flushIngestionGuardRollups();
    }
    const result = { ok: true, ...summary };
    await safelyRecordDeliveryReport(project, payload, req, 'capture', result);
    return result;
  }

  const result = await insertCaptureEvent(project, payload, req);
  const summary = addCaptureIngestResult(emptyCaptureIngestSummary(), result);
  if (summary.dropped > 0) {
    await flushIngestionGuardRollups();
  }
  await safelyRecordDeliveryReport(project, payload, req, 'capture', summary);
  return {
    ...result,
    accepted: summary.accepted,
    limited: summary.limited,
    sampled: summary.sampled,
    dropped: summary.dropped,
    guardMode: summary.guardMode,
    guardReason: summary.guardReason,
  };
}

function normalizePresenceState(value) {
  const state = safeString(value, 40, 'heartbeat');
  return ['start', 'heartbeat', 'end', 'background', 'foreground'].includes(state) ? state : 'heartbeat';
}

function normalizeActiveState(value) {
  const state = safeString(value, 40, 'inactive');
  return ['active', 'idle', 'inactive'].includes(state) ? state : 'inactive';
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function upsertPresenceEvent(project, payload = {}, req = {}) {
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
  const activeDurationMs = safeCount(payload.activeDurationMs);
  const lastActiveAt = safeDate(payload.lastActiveAt);
  const runtimeContext = sanitizeRuntimeContext(payload.runtimeContext);
  const idleTimeoutMs = Math.max(0, Number(payload.idleTimeoutMs) || ACTIVE_IDLE_TIMEOUT_MS);
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
      attribution: normalizeAttribution(payload.attribution),
      ...(runtimeContext ? { runtimeContext } : {}),
      path: safeString(payload.path, 500, '/'),
      title: safeString(payload.title, 160),
      screen: safeString(payload.screen, 160),
      lastSeenAt: occurredAt,
      ...(endedAt ? { endedAt } : {}),
      state: endedAt ? state : 'active',
      heartbeatIntervalMs: Math.max(0, Number(payload.heartbeatIntervalMs) || PRESENCE_HEARTBEAT_INTERVAL_MS),
      durationMs,
      activeDurationMs,
      lastActiveAt,
      activeState: normalizeActiveState(payload.activeState),
      idleTimeoutMs,
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
  queueProductUsageActivity(project, 'presence', payload);
  await recordSetupAttemptSafely(() => recordSetupAttemptFirstCapture(project._id, { eventType: 'presence' }));

  return { ok: true, ignored: false };
}

export async function ingestPresencePayload(payload = {}, req = {}) {
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
      const result = await upsertPresenceEvent(project, {
        ...sharedPayload,
        ...safeObject(eventPayload),
        projectKey: project.projectKey,
      }, req);
      if (result.ignored) ignored += 1;
      else accepted += 1;
    }

    const result = { ok: true, accepted, ignored };
    await safelyRecordDeliveryReport(project, payload, req, 'presence', result);
    return result;
  }

  const result = await upsertPresenceEvent(project, payload, req);
  await safelyRecordDeliveryReport(project, payload, req, 'presence', {
    accepted: result.ignored ? 0 : 1,
    ignored: result.ignored ? 1 : 0,
  });
  return result;
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

  const webCaptureScriptUpdate = webCaptureScriptUpdateForPayload(payload, req);
  sendJson(res, 202, {
    ok: true,
    ...(webCaptureScriptUpdate ? { webCaptureScriptUpdate } : {}),
  });
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

  const webCaptureScriptUpdate = webCaptureScriptUpdateForPayload(payload, req);
  sendJson(res, 202, {
    ok: true,
    ...(webCaptureScriptUpdate ? { webCaptureScriptUpdate } : {}),
  });
}

async function handleUserFeedback(req, res) {
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

  const result = await ingestUserFeedbackPayload(payload, req);
  if (!result.ok) {
    sendJson(res, result.statusCode || 400, result.error ? { error: result.error } : { ok: false, findings: result.findings || [] });
    return;
  }

  sendJson(res, 202, { ok: true, userFeedbackId: result.userFeedbackId, accepted: result.accepted });
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
  await recordSetupAttemptSafely(() => recordSetupAttemptMcpConnection(project, mcpToken));

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
      if (requestProject) {
        await recordSetupAttemptSafely(() => recordSetupAttemptMcpConnection(requestProject, mcpToken));
      }
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
      await recordSetupAttemptSafely(() => recordSetupAttemptMcpConnection(project, mcpToken));
      responses.push(jsonRpcResult(item.id, { tools: mcpTools(project) }));
      continue;
    }

    if (item.method === 'tools/call') {
      try {
        const result = await callMcpTool(project, item.params?.name, item.params?.arguments || {}, { mcpToken });
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
  WebApp.rawConnectHandlers.use((req, res, next) => {
    const host = requestHost(req);
    const pathname = requestPathname(req, host);
    if (!isCaptureScriptPath(pathname)) {
      next();
      return;
    }

    captureScriptResponse(pathname, host)
      .then((response) => sendHttpResponse(res, response))
      .catch((error) => {
        console.error('[TraceMind] capture script failed', error);
        res.writeHead(500, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end('/* TraceMind capture script unavailable. */');
      });
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

  WebApp.handlers.use('/api/user-feedback', (req, res) => {
    handleUserFeedback(req, res).catch((error) => {
      console.error('[TraceMind] user feedback failed', error);
      sendJson(res, 500, { error: 'user_feedback_failed' });
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
