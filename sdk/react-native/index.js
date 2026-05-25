const SDK_VERSION = '0.1.0';
const SDK_CONTENT_HASH = 'sha256:5c69e6c053570abf24b2eba6eebd44b7e149795d63f094b4d024b10554f297e6';
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|input|enteredtext)/i;
const FEEDBACK_FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|sourcecode|sourcediff|codediff|toolarguments|toolresult|resourcecontent)/i;
const FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;
const ATTRIBUTION_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$/;
const ATTRIBUTION_DOMAIN_PATTERN = /^[a-z0-9.-]+$/;
const ATTRIBUTION_REFERRER_TYPES = new Set(['direct', 'internal', 'external', 'search', 'social']);
const APP_ERROR_CONTEXT_KEYS = new Set(['source', 'screen', 'release', 'component', 'status', 'occurredAt']);

function isPrimitiveValue(value) {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean';
}

function normalizeFieldKey(key) {
  return String(key).toLowerCase().replace(/[_\-\s]+/g, '');
}

function sanitizeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key, value]) => {
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
    Object.entries(fields)
      .filter(([key, value]) => {
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
  return safeString(text.split('?')[0] || fallback, 500, fallback);
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

function stableErrorFingerprint(errorType, message) {
  let hash = 2166136261;
  const text = `${errorType}:${sanitizeErrorMessageForHash(message)}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `tm_error_${(hex + hex + hex).slice(0, 24)}`;
}

function appErrorPayload(errorOrInfo, options = {}, defaultSource = 'react_native') {
  const info = errorOrInfo && typeof errorOrInfo === 'object' && !(errorOrInfo instanceof Error) ? errorOrInfo : {};
  const error = errorOrInfo instanceof Error ? errorOrInfo : info.error;
  const merged = { ...info, ...options };
  const errorType = cleanErrorField(merged.errorType || error?.name || (typeof errorOrInfo === 'string' ? 'Error' : ''), 80) || 'Error';
  const message = merged.message || error?.message || (typeof errorOrInfo === 'string' ? errorOrInfo : errorType);
  const properties = {
    errorKind: cleanErrorField(merged.errorKind, 40) || 'runtime',
    errorType,
    messageFingerprint: cleanErrorField(merged.messageFingerprint, 120) || stableErrorFingerprint(errorType, message),
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

function sanitizeDeepLinkPayload(payload = {}) {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    ...(input.url ? { url: safeString(input.url, 500) } : {}),
    ...(input.referrer ? { referrer: safeString(input.referrer, 300) } : {}),
    ...(input.sourcePackage ? { sourcePackage: safeString(input.sourcePackage, 200) } : {}),
    ...(input.sourceApplication ? { sourceApplication: safeString(input.sourceApplication, 200) } : {}),
  };
}

function sanitizeFeedbackContact(contact) {
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

function resolveNativeModule(explicitNativeModule) {
  if (explicitNativeModule) return explicitNativeModule;
  try {
    const { NativeModules } = require('react-native');
    return NativeModules.TraceMindModule;
  } catch (error) {
    return null;
  }
}

function createTraceMindClient({ nativeModule, platform } = {}) {
  const resolvedNativeModule = resolveNativeModule(nativeModule);

  function assertNativeModule() {
    if (!resolvedNativeModule) {
      throw new Error('TraceMind native module is unavailable. Make sure the native iOS and Android SDKs are linked.');
    }
  }

  return {
    start({ projectKey, endpoint } = {}) {
      if (!projectKey) {
        throw new Error('TraceMind.start requires projectKey.');
      }
      assertNativeModule();
      resolvedNativeModule.start({
        projectKey,
        endpoint,
        deviceInfo: {
          framework: 'react_native',
          sdkVersion: SDK_VERSION,
          sdkContentHash: SDK_CONTENT_HASH,
        },
      });
    },

    identify(userId, traits = {}) {
      if (!userId) {
        throw new Error('TraceMind.identify requires userId.');
      }
      assertNativeModule();
      resolvedNativeModule.identify(userId, sanitizeFields(traits));
    },

    capture(type, payload = {}) {
      assertNativeModule();
      resolvedNativeModule.capture(type, {
        ...payload,
        properties: sanitizeFields(payload.properties),
        context: sanitizeFields(payload.context),
        deviceInfo: {
          ...(payload.deviceInfo || {}),
          framework: 'react_native',
          sdkVersion: SDK_VERSION,
          sdkContentHash: SDK_CONTENT_HASH,
        },
      });
    },

    captureError(errorOrInfo, options = {}) {
      assertNativeModule();
      this.capture('app_error', appErrorPayload(errorOrInfo, options));
    },

    setScreen(screen) {
      assertNativeModule();
      if (resolvedNativeModule.setScreen) {
        resolvedNativeModule.setScreen(String(screen || '').slice(0, 160));
      }
    },

    setAttribution(attribution = {}) {
      assertNativeModule();
      if (resolvedNativeModule.setAttribution) {
        resolvedNativeModule.setAttribution(sanitizeAttribution(attribution));
      }
    },

    recordDeepLink(payload = {}) {
      assertNativeModule();
      if (resolvedNativeModule.recordDeepLink) {
        resolvedNativeModule.recordDeepLink(sanitizeDeepLinkPayload(payload));
      }
    },

    submitFeedback(payload = {}) {
      assertNativeModule();
      return resolvedNativeModule.submitFeedback({
        ...payload,
        message: sanitizeFeedbackMessage(payload.message),
        deviceInfo: {
          ...(payload.deviceInfo || {}),
          framework: 'react_native',
          sdkVersion: SDK_VERSION,
          sdkContentHash: SDK_CONTENT_HASH,
        },
      });
    },

    platform,
  };
}

const TraceMind = createTraceMindClient();

module.exports = {
  TraceMind,
  createTraceMindClient,
  sanitizeFields,
  sanitizeAttribution,
  sanitizeFeedbackFields,
  appErrorPayload,
};
