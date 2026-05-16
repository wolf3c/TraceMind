const crypto = require('node:crypto');

const SDK_VERSION = '0.1.0';
const DEFAULT_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/capture';
const DEFAULT_FEEDBACK_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback';
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|input|enteredtext)/i;
const FEEDBACK_FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|sourcecode|sourcediff|codediff|toolarguments|toolresult|resourcecontent)/i;
const FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;

function normalizeFieldKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
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
      if (typeof value === 'string' && FULL_QUERY_URL_PATTERN.test(value)) return false;
      return true;
    }),
  );
}

function sanitizeFeedbackFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => {
      if (FEEDBACK_FORBIDDEN_FIELD_PATTERN.test(normalizeFieldKey(key))) return false;
      if (!isPrimitiveValue(value)) return false;
      if (typeof value === 'string' && (FULL_QUERY_URL_PATTERN.test(value) || /\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token|raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body)\b/i.test(value))) return false;
      return true;
    }),
  );
}

function safeString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
}

function feedbackEndpointFor(endpoint) {
  const value = safeString(endpoint, 1000, DEFAULT_ENDPOINT);
  const pathValue = value.split(/[?#]/)[0];
  if (!pathValue.endsWith('/api/capture')) return DEFAULT_FEEDBACK_ENDPOINT;
  return `${pathValue.slice(0, -'/api/capture'.length)}/api/user-feedback`;
}

function stableHash(value) {
  const json = JSON.stringify(value || {});
  return `tm_target_${crypto.createHash('sha256').update(json).digest('hex').slice(0, 24)}`;
}

function sanitizeFeedbackContact(contact = {}) {
  if (!contact || typeof contact !== 'object' || contact.consent !== true) return { consent: false };
  return {
    consent: true,
    ...(contact.name ? { name: safeString(contact.name, 120) } : {}),
    ...(contact.email ? { email: safeString(contact.email, 160) } : {}),
    ...(contact.phone ? { phone: safeString(contact.phone, 80) } : {}),
    ...(contact.preferredChannel ? { preferredChannel: safeString(contact.preferredChannel, 40) } : {}),
  };
}

function sanitizeFeedbackMessage(message = {}) {
  const input = message && typeof message === 'object' && !Array.isArray(message) ? message : { body: message };
  const kind = safeString(input.kind, 20, 'other').toLowerCase();
  return {
    formatVersion: 1,
    kind: ['issue', 'idea', 'question', 'other'].includes(kind) ? kind : 'other',
    title: safeString(input.title, 160),
    body: safeString(input.body || input.text, 4000),
    contact: sanitizeFeedbackContact(input.contact),
    fields: sanitizeFeedbackFields(input.fields),
    attachments: [],
  };
}

function createTraceMindServerClient(options = {}) {
  const projectKey = options.projectKey;
  if (!projectKey) throw new Error('TraceMindServer requires projectKey.');

  const sourceKey = safeString(options.sourceKey, 200, 'server-app');
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const feedbackEndpoint = options.feedbackEndpoint || feedbackEndpointFor(endpoint);
  const queueLimit = Number.isFinite(options.queueLimit) ? Math.max(1, options.queueLimit) : 1000;
  const now = options.now || (() => new Date());
  const transport = options.transport || (async (body) => {
    if (typeof fetch !== 'function') throw new Error('TraceMindServer default transport requires global fetch.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`TraceMind capture failed with HTTP ${response.status}`);
    return response.json().catch(() => ({ ok: true }));
  });
  const feedbackTransport = options.feedbackTransport || (async (body) => {
    if (typeof fetch !== 'function') throw new Error('TraceMindServer default transport requires global fetch.');
    const response = await fetch(feedbackEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`TraceMind user feedback failed with HTTP ${response.status}`);
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

  function source(details = {}) {
    const safeDetails = sanitizeFields(details);
    return {
      type: 'server_app',
      key: sourceKey,
      label: sourceKey,
      details: {
        ...safeDetails,
        language: 'javascript',
        runtime: `node ${process.version}`,
        sdkVersion: SDK_VERSION,
      },
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
      // Telemetry must never affect the server application.
    }
  }

  const client = {
    state,

    capture(type, payload = {}) {
      const eventName = safeString(payload.eventName || payload.name || type, 120);
      const target = payload.target || (eventName ? { type: 'server_event', name: eventName, sourceKey } : undefined);
      enqueue({
        userId: safeString(payload.userId, 160),
        anonymousId: safeString(payload.anonymousId || state.anonymousId, 120),
        sessionId: safeString(payload.sessionId || state.sessionId, 120),
        deviceId: safeString(payload.deviceId || state.deviceId, 120),
        type,
        eventName,
        path: safeString(payload.path, 500, '/'),
        source: source(payload.sourceDetails),
        ...(target ? { target, targetHash: stableHash(target) } : {}),
        properties: sanitizeFields(payload.properties),
        context: sanitizeFields(payload.context),
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

    async submitFeedback(payload = {}) {
      const body = {
        projectKey,
        sessionId: safeString(payload.sessionId || state.sessionId, 120),
        anonymousId: safeString(payload.anonymousId || state.anonymousId, 120),
        userId: safeString(payload.userId, 160),
        deviceId: safeString(payload.deviceId || state.deviceId, 120),
        platform: 'server',
        source: source(payload.sourceDetails),
        path: safeString(payload.path, 500, '/'),
        message: sanitizeFeedbackMessage(payload.message),
        occurredAt: now().toISOString(),
      };
      return feedbackTransport(body);
    },
  };

  return client;
}

let defaultClient = null;

const TraceMindServer = {
  start(options = {}) {
    defaultClient = createTraceMindServerClient(options);
    return defaultClient;
  },

  capture(type, payload) {
    if (!defaultClient) throw new Error('TraceMindServer.start must be called before capture.');
    return defaultClient.capture(type, payload);
  },

  async flush() {
    if (!defaultClient) return { ok: true, accepted: 0 };
    return defaultClient.flush();
  },

  async submitFeedback(payload) {
    if (!defaultClient) throw new Error('TraceMindServer.start must be called before submitFeedback.');
    return defaultClient.submitFeedback(payload);
  },
};

module.exports = {
  TraceMindServer,
  createTraceMindServerClient,
  sanitizeFields,
  sanitizeFeedbackFields,
};
