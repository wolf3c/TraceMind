const crypto = require('node:crypto');

const SDK_VERSION = '0.1.0';
const DEFAULT_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/capture';
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawargs|rawarguments|toolarguments|rawresult|toolresult|resourcecontent|token|secret|password|email|phone|input|enteredtext)/i;

function normalizeFieldKey(key) {
  return String(key || '').toLowerCase().replace(/[_\-\s]+/g, '');
}

function isPrimitiveValue(value) {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean';
}

function sanitizeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => {
      if (FORBIDDEN_FIELD_PATTERN.test(normalizeFieldKey(key))) return false;
      if (!isPrimitiveValue(value)) return false;
      if (typeof value === 'string' && /^https?:\/\/\S+\?\S+/.test(value)) return false;
      return true;
    }),
  );
}

function safeString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
}

function stableHash(value) {
  const json = JSON.stringify(value || {});
  return `tm_target_${crypto.createHash('sha256').update(json).digest('hex').slice(0, 24)}`;
}

function resultSizeBucket(result) {
  let size = 0;
  try {
    size = JSON.stringify(result || '').length;
  } catch (error) {
    size = 0;
  }
  if (size > 100000) return 'large';
  if (size > 10000) return 'medium';
  return 'small';
}

function uriScheme(uri) {
  const match = String(uri || '').match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match ? match[1].toLowerCase() : 'unknown';
}

function createTraceMindMcpClient(options = {}) {
  const projectKey = options.projectKey;
  if (!projectKey) throw new Error('TraceMindMCP requires projectKey.');

  const sourceKey = safeString(options.sourceKey, 200, 'mcp-server');
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const queueLimit = Number.isFinite(options.queueLimit) ? Math.max(1, options.queueLimit) : 1000;
  const now = options.now || (() => new Date());
  const identityResolver = options.identityResolver;
  const transport = options.transport || (async (body) => {
    if (typeof fetch !== 'function') throw new Error('TraceMindMCP default transport requires global fetch.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`TraceMind capture failed with HTTP ${response.status}`);
    return response.json().catch(() => ({ ok: true }));
  });

  const state = {
    projectKey,
    endpoint,
    sourceKey,
    sessionId: `tm_sess_${crypto.randomBytes(12).toString('hex')}`,
    anonymousId: `tm_anon_${crypto.randomBytes(12).toString('hex')}`,
    deviceId: `tm_dev_${crypto.randomBytes(12).toString('hex')}`,
    queue: [],
  };

  function source(type = 'mcp_server', key = sourceKey, details = {}) {
    return {
      type,
      key,
      label: key,
      details: {
        language: 'javascript',
        runtime: `node ${process.version}`,
        sdkVersion: SDK_VERSION,
        ...details,
      },
    };
  }

  function resolveIdentity(request) {
    const resolved = typeof identityResolver === 'function' ? identityResolver(request) || {} : {};
    return {
      userId: safeString(resolved.userId || request?.userId, 160),
      anonymousId: safeString(resolved.anonymousId || request?.anonymousId || state.anonymousId, 120),
      sessionId: safeString(resolved.sessionId || request?.sessionId || state.sessionId, 120),
      deviceId: safeString(resolved.deviceId || request?.deviceId || state.deviceId, 120),
    };
  }

  function enqueue(event) {
    try {
      state.queue.push({
        platform: 'server',
        occurredAt: now().toISOString(),
        ...event,
      });
      while (state.queue.length > queueLimit) state.queue.shift();
    } catch (error) {
      // Telemetry must never affect the MCP server.
    }
  }

  function toolEvent(toolName, request, startedAt, status, result, error) {
    const target = { type: 'mcp_tool', name: safeString(toolName, 160), sourceKey };
    const identity = resolveIdentity(request || {});
    enqueue({
      ...identity,
      type: 'tool_call',
      eventName: 'mcp_tool_call',
      path: `mcp://tool/${target.name}`,
      source: source('mcp_server'),
      target,
      targetHash: stableHash(target),
      properties: sanitizeFields({
        toolName: target.name,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        resultSizeBucket: status === 'success' ? resultSizeBucket(result) : undefined,
        errorType: error ? error.name || 'Error' : undefined,
      }),
    });
  }

  function resourceEvent(resourceName, uri, request, startedAt, status, result, error) {
    const scheme = uriScheme(uri);
    const target = {
      type: 'mcp_resource',
      name: safeString(resourceName, 160),
      uriScheme: scheme,
      uriTemplateHash: stableHash({ resourceName, scheme }),
    };
    const identity = resolveIdentity(request || {});
    enqueue({
      ...identity,
      type: 'resource_read',
      eventName: 'mcp_resource_read',
      path: `mcp://resource/${target.name}`,
      source: source('mcp_server'),
      target,
      targetHash: stableHash(target),
      properties: sanitizeFields({
        resourceName: target.name,
        uriScheme: scheme,
        uriTemplateHash: target.uriTemplateHash,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        resultSizeBucket: status === 'success' ? resultSizeBucket(result) : undefined,
        errorType: error ? error.name || 'Error' : undefined,
      }),
    });
  }

  function promptEvent(promptName, request, startedAt, status, result, error) {
    const target = { type: 'mcp_prompt', name: safeString(promptName, 160), sourceKey };
    const identity = resolveIdentity(request || {});
    enqueue({
      ...identity,
      type: 'prompt_request',
      eventName: 'mcp_prompt_request',
      path: `mcp://prompt/${target.name}`,
      source: source('mcp_server'),
      target,
      targetHash: stableHash(target),
      properties: sanitizeFields({
        promptName: target.name,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        resultSizeBucket: status === 'success' ? resultSizeBucket(result) : undefined,
        errorType: error ? error.name || 'Error' : undefined,
      }),
    });
  }

  function wrapHandler(recordEvent, handler) {
    return async function wrappedTraceMindMcpHandler(request, ...rest) {
      const startedAt = Date.now();
      try {
        const result = await handler.call(this, request, ...rest);
        recordEvent(request, startedAt, 'success', result);
        return result;
      } catch (error) {
        recordEvent(request, startedAt, 'error', undefined, error);
        throw error;
      }
    };
  }

  const client = {
    state,

    wrapTool(toolName, handler) {
      return wrapHandler(
        (request, startedAt, status, result, error) => toolEvent(toolName, request, startedAt, status, result, error),
        handler,
      );
    },

    wrapResource(resourceName, uri, handler) {
      return wrapHandler(
        (request, startedAt, status, result, error) => resourceEvent(resourceName, uri, request, startedAt, status, result, error),
        handler,
      );
    },

    wrapPrompt(promptName, handler) {
      return wrapHandler(
        (request, startedAt, status, result, error) => promptEvent(promptName, request, startedAt, status, result, error),
        handler,
      );
    },

    capture(type, payload = {}) {
      const target = payload.target || (payload.eventName ? { type: 'custom', name: payload.eventName, sourceKey } : undefined);
      enqueue({
        userId: safeString(payload.userId, 160),
        anonymousId: safeString(payload.anonymousId || state.anonymousId, 120),
        sessionId: safeString(payload.sessionId || state.sessionId, 120),
        deviceId: safeString(payload.deviceId || state.deviceId, 120),
        type,
        eventName: safeString(payload.eventName || payload.name || type, 120),
        path: safeString(payload.path, 500, '/'),
        source: source('mcp_server'),
        ...(target ? { target, targetHash: stableHash(target) } : {}),
        properties: sanitizeFields(payload.properties),
        context: sanitizeFields(payload.context),
      });
    },

    captureSkillLifecycle({ skillName, version, phase, success, durationMs, userId, anonymousId, sessionId } = {}) {
      const name = safeString(skillName, 160, 'agent-skill');
      const target = { type: 'agent_skill', name, version: safeString(version, 80) };
      enqueue({
        userId: safeString(userId, 160),
        anonymousId: safeString(anonymousId || state.anonymousId, 120),
        sessionId: safeString(sessionId || state.sessionId, 120),
        deviceId: state.deviceId,
        type: 'skill_lifecycle',
        eventName: 'agent_skill_lifecycle',
        path: `agent-skill://${name}`,
        source: source('agent_skill', name, { version: target.version }),
        target,
        targetHash: stableHash(target),
        properties: sanitizeFields({
          skillName: name,
          version: target.version,
          phase,
          success,
          durationMs,
        }),
      });
    },

    async flush() {
      if (!state.queue.length) return { ok: true, accepted: 0 };
      const events = state.queue.splice(0, state.queue.length);
      const body = {
        projectKey,
        sessionId: state.sessionId,
        anonymousId: state.anonymousId,
        deviceId: state.deviceId,
        events,
      };
      try {
        return await transport(body);
      } catch (error) {
        state.queue.unshift(...events);
        while (state.queue.length > queueLimit) state.queue.shift();
        throw error;
      }
    },
  };

  return client;
}

function patchRegistration(server, methodName, wrapRegisteredHandler) {
  if (!server || typeof server[methodName] !== 'function') return;
  const original = server[methodName].bind(server);
  server[methodName] = (...args) => {
    const handlerIndex = args.findIndex((arg) => typeof arg === 'function');
    if (handlerIndex >= 0) {
      args[handlerIndex] = wrapRegisteredHandler(args, args[handlerIndex]);
    }
    return original(...args);
  };
}

let defaultClient = null;

const TraceMindMCP = {
  start(server, options = {}) {
    defaultClient = createTraceMindMcpClient(options);
    patchRegistration(server, 'tool', (args, handler) => defaultClient.wrapTool(args[0], handler));
    patchRegistration(server, 'resource', (args, handler) => defaultClient.wrapResource(args[0], args[1], handler));
    patchRegistration(server, 'prompt', (args, handler) => defaultClient.wrapPrompt(args[0], handler));
    return defaultClient;
  },

  capture(type, payload) {
    if (!defaultClient) throw new Error('TraceMindMCP.start must be called before capture.');
    return defaultClient.capture(type, payload);
  },

  captureSkillLifecycle(payload) {
    if (!defaultClient) throw new Error('TraceMindMCP.start must be called before captureSkillLifecycle.');
    return defaultClient.captureSkillLifecycle(payload);
  },

  async flush() {
    if (!defaultClient) return { ok: true, accepted: 0 };
    return defaultClient.flush();
  },
};

module.exports = {
  TraceMindMCP,
  createTraceMindMcpClient,
  sanitizeFields,
};
