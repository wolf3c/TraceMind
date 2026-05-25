const crypto = require('node:crypto');

const SDK_VERSION = '0.1.0';
const SDK_CONTENT_HASH = 'sha256:3589d33c9722a7460d4b4638b10d810c1700d7b4cb9fb6ba50570ff1c62f8e25';
const DEFAULT_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/capture';
const DEFAULT_FEEDBACK_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback';
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|input|enteredtext)/i;
const FEEDBACK_FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|sourcecode|sourcediff|codediff|toolarguments|toolresult|resourcecontent)/i;
const FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;
const ATTRIBUTION_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$/;
const ATTRIBUTION_DOMAIN_PATTERN = /^[a-z0-9.-]+$/;
const ATTRIBUTION_REFERRER_TYPES = new Set(['direct', 'internal', 'external', 'search', 'social']);
const APP_ERROR_CONTEXT_KEYS = new Set(['source', 'screen', 'release', 'component', 'status', 'occurredAt']);

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

function sanitizeAppErrorContext(fields) {
  const sanitized = sanitizeFields(fields);
  return Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => APP_ERROR_CONTEXT_KEYS.has(key)),
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

function stripQueryPath(value, fallback = '/') {
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

function cleanErrorField(value, max = 160) {
  const text = safeString(value, max);
  if (!text) return '';
  if (/@|https?:|[?&=]|%40|bearer\s+|api[_-]?key|access[_-]?token|secret|password/i.test(text)) return '';
  return text;
}

function sanitizeErrorMessageForHash(value) {
  return safeString(value, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[email]')
    .replace(/https?:\/\/\S+\?\S+/ig, '[url]')
    .replace(/\b(bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|access[_-]?token\s*[:=]\s*\S+|secret\S*)\b/ig, '[secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function messageFingerprint(errorType, message) {
  return `tm_error_${crypto.createHash('sha256').update(`${errorType}:${sanitizeErrorMessageForHash(message)}`).digest('hex').slice(0, 24)}`;
}

function appErrorPayload(errorOrInfo, options = {}, defaultSource = 'server') {
  const info = errorOrInfo && typeof errorOrInfo === 'object' && !(errorOrInfo instanceof Error) ? errorOrInfo : {};
  const error = errorOrInfo instanceof Error ? errorOrInfo : info.error;
  const merged = { ...info, ...options };
  const errorType = cleanErrorField(merged.errorType || error?.name || (typeof errorOrInfo === 'string' ? 'Error' : ''), 80) || 'Error';
  const message = merged.message || error?.message || (typeof errorOrInfo === 'string' ? errorOrInfo : errorType);
  const properties = {
    errorKind: cleanErrorField(merged.errorKind, 40) || 'runtime',
    errorType,
    messageFingerprint: cleanErrorField(merged.messageFingerprint, 120) || messageFingerprint(errorType, message),
    fatal: merged.fatal === true,
    handled: merged.handled === false ? false : true,
    source: cleanErrorField(merged.source, 40) || defaultSource,
    status: 'error',
  };
  const release = cleanErrorField(merged.release || merged.properties?.release, 80);
  const component = cleanErrorField(merged.component || merged.properties?.component, 120);
  if (release) properties.release = release;
  if (component) properties.component = component;
  const rawPath = merged.path || merged.screen;
  const path = rawPath ? stripQueryPath(rawPath) : '';
  return {
    eventName: 'app_error',
    ...(path ? { path } : {}),
    properties,
    context: sanitizeAppErrorContext(merged.context),
    sourceDetails: merged.sourceDetails,
    userId: merged.userId,
    anonymousId: merged.anonymousId,
    sessionId: merged.sessionId,
    deviceId: merged.deviceId,
    attribution: merged.attribution,
  };
}

function cleanAttributionValue(value) {
  const text = safeString(value, 120).replace(/\s+/g, '-');
  if (!text || text.includes('@') || /https?:|[?&=]|%40/i.test(text)) return undefined;
  return ATTRIBUTION_VALUE_PATTERN.test(text) ? text : undefined;
}

function cleanAttributionDomain(value) {
  const domain = safeString(value, 200).replace(/^\.+|\.+$/g, '').toLowerCase();
  if (!domain || domain.includes('@') || /[/?#&=]/.test(domain)) return undefined;
  return ATTRIBUTION_DOMAIN_PATTERN.test(domain) ? domain : undefined;
}

function cleanAttributionPath(value) {
  const path = safeString(value, 500).split('?')[0];
  if (!path || !path.startsWith('/') || path.includes('@') || /^https?:/i.test(path)) return undefined;
  return path;
}

function cleanReferrerType(value) {
  const referrerType = safeString(value, 40).toLowerCase();
  return ATTRIBUTION_REFERRER_TYPES.has(referrerType) ? referrerType : undefined;
}

function sanitizeAttribution(attribution = {}) {
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return {};
  const next = {
    source: cleanAttributionValue(attribution.source),
    medium: cleanAttributionValue(attribution.medium),
    campaign: cleanAttributionValue(attribution.campaign),
    content: cleanAttributionValue(attribution.content),
    referrerDomain: cleanAttributionDomain(attribution.referrerDomain),
    referrerType: cleanReferrerType(attribution.referrerType),
    landingPath: cleanAttributionPath(attribution.landingPath),
    gclidPresent: attribution.gclidPresent === true ? true : undefined,
    fbclidPresent: attribution.fbclidPresent === true ? true : undefined,
    msclkidPresent: attribution.msclkidPresent === true ? true : undefined,
  };
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
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
        sdkContentHash: SDK_CONTENT_HASH,
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
      const attribution = sanitizeAttribution(payload.attribution);
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
        ...(Object.keys(attribution).length ? { attribution } : {}),
        properties: sanitizeFields(payload.properties),
        context: sanitizeFields(payload.context),
      });
    },

    captureError(errorOrInfo, options = {}) {
      this.capture('app_error', appErrorPayload(errorOrInfo, options, 'server'));
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

  captureError(errorOrInfo, options) {
    if (!defaultClient) throw new Error('TraceMindServer.start must be called before captureError.');
    return defaultClient.captureError(errorOrInfo, options);
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
  sanitizeAttribution,
  sanitizeFeedbackFields,
};
