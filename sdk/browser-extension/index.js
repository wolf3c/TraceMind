const SDK_VERSION = '0.1.0';
const SDK_CONTENT_HASH = 'sha256:761e51dfbeb898f8df5d0d2a3187cac027eda2b271a047ff77dca5b96e8b9a33';
const DEFAULT_CAPTURE_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/capture';
const DEFAULT_PRESENCE_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/presence';
const DEFAULT_FEEDBACK_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback';
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 60000;
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|inputvalue|enteredtext)/i;
const INPUT_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|inputvalue|enteredtext|value)/i;
const FEEDBACK_FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|sourcecode|sourcediff|codediff|toolarguments|toolresult|resourcecontent)/i;
const FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;
const ATTRIBUTION_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$/;
const ATTRIBUTION_DOMAIN_PATTERN = /^[a-z0-9.-]+$/;
const ATTRIBUTION_REFERRER_TYPES = new Set(['direct', 'internal', 'external', 'search', 'social']);

function safeString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeFieldKey(key) {
  return String(key || '').toLowerCase().replace(/[_\-\s.]+/g, '');
}

function isPrimitiveValue(value) {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean';
}

function sanitizeFields(fields, pattern = FORBIDDEN_FIELD_PATTERN) {
  const input = safeObject(fields);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (pattern.test(normalizeFieldKey(key))) return false;
      if (!isPrimitiveValue(value)) return false;
      if (typeof value === 'string' && FULL_QUERY_URL_PATTERN.test(value)) return false;
      return true;
    }),
  );
}

function sanitizeFeedbackFields(fields) {
  return sanitizeFields(fields, FEEDBACK_FORBIDDEN_FIELD_PATTERN);
}

function stripQueryPath(value, fallback = '/') {
  const text = safeString(value, 500, fallback);
  if (!text) return '/';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.pathname || '/';
    } catch (error) {
      return '/';
    }
  }
  const withoutHash = text.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  if (!withoutQuery) return '/';
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
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
  const path = stripQueryPath(value);
  if (!path || path.includes('@') || /^https?:/i.test(path)) return undefined;
  return path;
}

function cleanReferrerType(value) {
  const referrerType = safeString(value, 40).toLowerCase();
  return ATTRIBUTION_REFERRER_TYPES.has(referrerType) ? referrerType : undefined;
}

function sanitizeAttribution(attribution = {}) {
  const input = safeObject(attribution);
  const next = {
    source: cleanAttributionValue(input.source),
    medium: cleanAttributionValue(input.medium),
    campaign: cleanAttributionValue(input.campaign),
    content: cleanAttributionValue(input.content),
    referrerDomain: cleanAttributionDomain(input.referrerDomain),
    referrerType: cleanReferrerType(input.referrerType),
    landingPath: cleanAttributionPath(input.landingPath),
    gclidPresent: input.gclidPresent === true ? true : undefined,
    fbclidPresent: input.fbclidPresent === true ? true : undefined,
    msclkidPresent: input.msclkidPresent === true ? true : undefined,
  };
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
}

function sanitizeFeedbackContact(contact) {
  const input = safeObject(contact);
  if (input.consent !== true) return { consent: false };
  return {
    consent: true,
    ...(input.name ? { name: safeString(input.name, 120) } : {}),
    ...(input.email ? { email: safeString(input.email, 160) } : {}),
    ...(input.phone ? { phone: safeString(input.phone, 80) } : {}),
    ...(input.preferredChannel ? { preferredChannel: safeString(input.preferredChannel, 40) } : {}),
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

function deriveSiblingEndpoint(endpoint, siblingPath, fallback) {
  try {
    const url = new URL(endpoint || DEFAULT_CAPTURE_ENDPOINT);
    if (url.pathname.endsWith('/api/capture')) {
      url.pathname = url.pathname.replace(/\/api\/capture$/, siblingPath);
    } else {
      url.pathname = siblingPath;
    }
    url.search = '';
    return url.toString();
  } catch (error) {
    return fallback;
  }
}

function stableHash(value) {
  const text = safeString(value, 500);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return `tm_target_${(hash >>> 0).toString(36)}`;
}

function detectBrowserName(navigatorObject) {
  const userAgent = safeString(navigatorObject?.userAgent, 300).toLowerCase();
  if (userAgent.includes('firefox')) return 'firefox';
  if (userAgent.includes('edg/')) return 'edge';
  if (userAgent.includes('chrome') || userAgent.includes('chromium')) return 'chrome';
  return 'unknown';
}

function globalHost(name) {
  return typeof globalThis !== 'undefined' ? globalThis[name] : undefined;
}

function createBrowserExtensionAdapter(options = {}) {
  const browserHost = options.browser || globalHost('browser');
  const chromeHost = options.chrome || globalHost('chrome');
  const host = browserHost || chromeHost || {};
  const storageHost = host.storage?.local;
  const memoryStorage = new Map();
  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const navigatorObject = options.navigator || (typeof navigator !== 'undefined' ? navigator : {});

  async function getStorage(key) {
    try {
      if (!storageHost?.get) return memoryStorage.get(key);
      if (storageHost.get.length >= 2) {
        return await new Promise((resolve) => {
          storageHost.get(key, (result = {}) => resolve(result[key]));
        });
      }
      const result = await storageHost.get(key);
      return result ? result[key] : undefined;
    } catch (error) {
      return memoryStorage.get(key);
    }
  }

  async function setStorage(key, value) {
    memoryStorage.set(key, value);
    try {
      if (!storageHost?.set) return;
      if (storageHost.set.length >= 2) {
        await new Promise((resolve) => storageHost.set({ [key]: value }, resolve));
        return;
      }
      await storageHost.set({ [key]: value });
    } catch (error) {
      // Keep the in-memory value when extension storage is unavailable.
    }
  }

  return {
    runtimeId() {
      return safeString(host.runtime?.id, 200);
    },
    manifest() {
      try {
        return safeObject(host.runtime?.getManifest?.());
      } catch (error) {
        return {};
      }
    },
    browserName() {
      return safeString(options.browserName, 40) || detectBrowserName(navigatorObject);
    },
    getStorage,
    setStorage,
    request({ url, data, method = 'POST', header = {} }) {
      if (!fetchImpl) throw new Error('TraceMind browser extension adapter requires fetch.');
      return fetchImpl(url, {
        method,
        headers: header,
        body: JSON.stringify(data),
      }).then((response) => {
        if (!response.ok) throw new Error(`TraceMind request failed with HTTP ${response.status}`);
        return response.json?.().catch?.(() => ({ ok: true })) || { ok: true };
      });
    },
    setInterval(callback, delay) {
      const interval = options.setInterval || (typeof setInterval === 'function' ? setInterval : null);
      if (!interval) return null;
      return interval(callback, delay);
    },
    clearInterval(id) {
      const clear = options.clearInterval || (typeof clearInterval === 'function' ? clearInterval : null);
      if (clear && id) clear(id);
    },
  };
}

function storageKey(projectKey, key) {
  return `tracemind:browser-extension:${projectKey}:${key}`;
}

function locationPath(locationObject) {
  if (!locationObject) return '/background';
  return stripQueryPath(`${locationObject.pathname || '/'}${locationObject.hash || ''}`);
}

function locationProtocol(locationObject) {
  const protocol = safeString(locationObject?.protocol, 40).toLowerCase();
  if (protocol) return protocol;
  try {
    return new URL(locationObject?.href || '').protocol.toLowerCase();
  } catch (error) {
    return '';
  }
}

function isExtensionOwnedPage(locationObject) {
  return ['chrome-extension:', 'moz-extension:', 'ms-browser-extension:', 'extension:'].includes(locationProtocol(locationObject));
}

function runtimeContextFor(config, documentObject, locationObject) {
  const configured = safeString(config.runtimeContext, 40).toLowerCase();
  if (configured) return configured;
  if (!documentObject) return 'background';
  if (!isExtensionOwnedPage(locationObject)) return 'content_script';
  const path = locationPath(locationObject).toLowerCase();
  if (path.includes('options')) return 'options';
  if (path.includes('devtools')) return 'devtools';
  if (path.includes('sidebar') || path.includes('sidepanel')) return 'sidebar';
  return 'popup';
}

function textOf(element) {
  if (!element) return '';
  return safeString(
    element.innerText
      || element.textContent
      || element.getAttribute?.('aria-label')
      || element.placeholder
      || element.name
      || element.id
      || element.tagName,
    120,
  );
}

function targetNameFor(element, fallback) {
  if (!element) return fallback;
  return safeString(
    element.getAttribute?.('data-testid')
      || element.getAttribute?.('data-test')
      || element.getAttribute?.('data-cy')
      || element.id
      || element.name
      || element.getAttribute?.('aria-label')
      || textOf(element)
      || fallback,
    160,
    fallback,
  );
}

function createTraceMindClient({
  adapter,
  document: documentObject = globalHost('document'),
  location: locationObject = globalHost('location'),
  now,
} = {}) {
  const state = {
    config: null,
    adapter: adapter || createBrowserExtensionAdapter(),
    document: documentObject,
    location: locationObject,
    captureQueue: [],
    presenceQueue: [],
    attribution: {},
    userId: '',
    anonymousId: '',
    sessionId: '',
    deviceId: '',
    presenceId: '',
    activeDurationMs: 0,
    lastActivityAt: 0,
    lastActiveTickAt: 0,
    presenceTimer: null,
    listeners: [],
  };
  const getNow = typeof now === 'function' ? now : () => Date.now();

  function assertStarted() {
    if (!state.config) throw new Error('TraceMind.start must be called before capture.');
  }

  function source() {
    const manifest = state.adapter.manifest();
    const extensionId = safeString(state.config.extensionId || state.adapter.runtimeId(), 200, 'unknown');
    const extensionName = safeString(state.config.extensionName || manifest.name || extensionId, 200, extensionId);
    return {
      type: 'browser_extension',
      key: extensionId,
      extensionId,
      label: extensionName,
      details: {
        browser: state.adapter.browserName(),
        manifestVersion: manifest.manifest_version || manifest.manifestVersion || '',
        runtimeContext: state.config.runtimeContext,
        sdkVersion: SDK_VERSION,
        sdkContentHash: SDK_CONTENT_HASH,
      },
    };
  }

  function deviceInfo() {
    const manifest = state.adapter.manifest();
    return sanitizeFields({
      framework: 'browser_extension',
      browser: state.adapter.browserName(),
      extensionVersion: manifest.version,
      runtimeContext: state.config.runtimeContext,
    });
  }

  function markActivity() {
    const nowMs = getNow();
    state.lastActivityAt = nowMs;
    if (!state.lastActiveTickAt) state.lastActiveTickAt = nowMs;
  }

  function updateActiveDuration(nowMs = getNow()) {
    if (!state.config || !state.lastActivityAt) {
      state.lastActiveTickAt = 0;
      return;
    }
    if (nowMs - state.lastActivityAt > state.config.idleTimeoutMs) {
      state.lastActiveTickAt = 0;
      return;
    }
    if (state.lastActiveTickAt) state.activeDurationMs += Math.max(0, nowMs - state.lastActiveTickAt);
    state.lastActiveTickAt = nowMs;
  }

  function activeState(nowMs = getNow()) {
    if (!state.lastActivityAt) return 'inactive';
    return nowMs - state.lastActivityAt <= state.config.idleTimeoutMs ? 'active' : 'inactive';
  }

  function eventPayload(type, payload = {}) {
    const input = safeObject(payload);
    const path = stripQueryPath(input.path || input.route || locationPath(state.location));
    const targetName = safeString(input.targetName || input.target || '', 160);
    const event = {
      projectKey: state.config.projectKey,
      platform: 'browser_extension',
      type,
      occurredAt: new Date(getNow()).toISOString(),
      anonymousId: state.anonymousId,
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      ...(state.userId ? { userId: state.userId } : {}),
      ...(input.userId ? { userId: safeString(input.userId, 120) } : {}),
      ...(input.eventName ? { eventName: safeString(input.eventName, 120) } : {}),
      path,
      source: source(),
      deviceInfo: deviceInfo(),
      properties: sanitizeFields(input.properties),
      context: sanitizeFields(input.context),
      ...(Object.keys(state.attribution).length ? { attribution: state.attribution } : {}),
    };
    if (targetName) {
      event.target = { type: 'browser_extension_element', name: targetName, path };
      event.targetHash = stableHash(`${type}:${path}:${targetName}`);
      event.actionKey = `browser_extension:${path}:${type}:${event.targetHash}`;
    }
    return event;
  }

  function presencePayload(stateName, payload = {}) {
    const nowMs = getNow();
    updateActiveDuration(nowMs);
    return {
      projectKey: state.config.projectKey,
      platform: 'browser_extension',
      state: ['start', 'heartbeat', 'end', 'background', 'foreground'].includes(stateName) ? stateName : 'heartbeat',
      presenceId: state.presenceId,
      occurredAt: new Date(nowMs).toISOString(),
      anonymousId: state.anonymousId,
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      ...(state.userId ? { userId: state.userId } : {}),
      path: stripQueryPath(payload.path || locationPath(state.location)),
      source: source(),
      deviceInfo: deviceInfo(),
      activeState: activeState(nowMs),
      activeDurationMs: Math.round(state.activeDurationMs),
      idleTimeoutMs: state.config.idleTimeoutMs,
      heartbeatIntervalMs: state.config.heartbeatIntervalMs,
      ...(state.lastActivityAt ? { lastActiveAt: new Date(state.lastActivityAt).toISOString() } : {}),
      ...(Object.keys(state.attribution).length ? { attribution: state.attribution } : {}),
    };
  }

  function enqueue(type, payload = {}) {
    assertStarted();
    state.captureQueue.push(eventPayload(type, payload));
  }

  function enqueuePresence(stateName, payload = {}) {
    assertStarted();
    state.presenceQueue.push(presencePayload(stateName, payload));
  }

  async function flushQueue(queue, endpoint) {
    if (!queue.length) return 0;
    const events = queue.splice(0, queue.length);
    try {
      await state.adapter.request({
        url: endpoint,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: { projectKey: state.config.projectKey, events },
      });
      return events.length;
    } catch (error) {
      queue.unshift(...events);
      throw error;
    }
  }

  function clearPresenceTimer() {
    if (!state.presenceTimer) return;
    state.adapter.clearInterval(state.presenceTimer);
    state.presenceTimer = null;
  }

  function removeListeners() {
    state.listeners.forEach(({ type, handler }) => {
      state.document?.removeEventListener?.(type, handler, true);
    });
    state.listeners = [];
  }

  function schedulePresence() {
    if (!state.config || !state.document || state.presenceTimer) return;
    state.presenceTimer = state.adapter.setInterval(async () => {
      enqueuePresence('heartbeat');
      try {
        await flush();
      } catch (error) {
        // Keep queued records for the next explicit flush or heartbeat.
      }
    }, state.config.heartbeatIntervalMs);
  }

  function addListener(type, handler) {
    state.document?.addEventListener?.(type, handler, true);
    state.listeners.push({ type, handler });
  }

  function installDomAutoCapture() {
    if (!state.document || state.config.autoCapture === false) return;
    addListener('click', (event) => {
      markActivity();
      enqueue('click', { targetName: targetNameFor(event.target, 'click') });
    });
    addListener('input', (event) => {
      markActivity();
      enqueue('input', {
        targetName: targetNameFor(event.target, 'input'),
        properties: sanitizeFields({ field: targetNameFor(event.target, 'input') }, INPUT_FIELD_PATTERN),
      });
    });
    addListener('submit', (event) => {
      markActivity();
      enqueue('submit', { targetName: targetNameFor(event.target, 'submit') });
    });
  }

  async function flush() {
    assertStarted();
    const captureSent = await flushQueue(state.captureQueue, state.config.endpoint);
    const presenceSent = await flushQueue(state.presenceQueue, state.config.presenceEndpoint);
    return { ok: true, sent: captureSent + presenceSent, captureSent, presenceSent };
  }

  return {
    state,

    start(config = {}) {
      if (!config.projectKey) throw new Error('TraceMind.start requires projectKey.');
      clearPresenceTimer();
      removeListeners();
      state.config = {
        projectKey: safeString(config.projectKey, 160),
        extensionId: safeString(config.extensionId || state.adapter.runtimeId(), 200),
        extensionName: safeString(config.extensionName || state.adapter.manifest().name, 200),
        endpoint: safeString(config.endpoint, 500, DEFAULT_CAPTURE_ENDPOINT),
        presenceEndpoint: safeString(config.presenceEndpoint || deriveSiblingEndpoint(config.endpoint, '/api/presence', DEFAULT_PRESENCE_ENDPOINT), 500, DEFAULT_PRESENCE_ENDPOINT),
        feedbackEndpoint: safeString(config.feedbackEndpoint || deriveSiblingEndpoint(config.endpoint, '/api/user-feedback', DEFAULT_FEEDBACK_ENDPOINT), 500, DEFAULT_FEEDBACK_ENDPOINT),
        autoCapture: config.autoCapture !== false,
        runtimeContext: runtimeContextFor(config, state.document, state.location),
        heartbeatIntervalMs: safePositiveNumber(config.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS),
        idleTimeoutMs: safePositiveNumber(config.idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS),
      };
      state.anonymousId = `tm_anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      state.deviceId = `tm_dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      state.sessionId = `tm_sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      state.presenceId = `tm_pres_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      state.adapter.getStorage(storageKey(state.config.projectKey, 'anonymousId')).then((value) => {
        if (value) state.anonymousId = value;
      }).catch(() => {});
      state.adapter.getStorage(storageKey(state.config.projectKey, 'deviceId')).then((value) => {
        if (value) state.deviceId = value;
      }).catch(() => {});
      state.adapter.setStorage(storageKey(state.config.projectKey, 'anonymousId'), state.anonymousId).catch(() => {});
      state.adapter.setStorage(storageKey(state.config.projectKey, 'deviceId'), state.deviceId).catch(() => {});
      if (state.document && state.config.autoCapture && isExtensionOwnedPage(state.location)) {
        markActivity();
        installDomAutoCapture();
        enqueue('extension_ui_start', { path: locationPath(state.location) });
        enqueue('page_view', { path: locationPath(state.location), context: { runtimeContext: state.config.runtimeContext } });
        enqueuePresence('start', { path: locationPath(state.location) });
        schedulePresence();
      }
    },

    identify(userId, traits = {}) {
      assertStarted();
      state.userId = safeString(userId, 120);
      enqueue('custom', { eventName: 'identify', properties: sanitizeFields(traits) });
    },

    capture(type, payload = {}) {
      enqueue(safeString(type, 40, 'custom'), payload);
    },

    setAttribution(attribution = {}) {
      state.attribution = sanitizeAttribution(attribution);
    },

    trackTap(targetName, payload = {}) {
      markActivity();
      enqueue('click', { ...payload, targetName });
    },

    trackInput(targetName, payload = {}) {
      markActivity();
      enqueue('input', {
        ...payload,
        targetName,
        properties: sanitizeFields(payload.properties, INPUT_FIELD_PATTERN),
        context: sanitizeFields(payload.context, INPUT_FIELD_PATTERN),
      });
    },

    trackSubmit(targetName, payload = {}) {
      markActivity();
      enqueue('submit', { ...payload, targetName });
    },

    flush,

    async submitFeedback(payload = {}) {
      assertStarted();
      const input = safeObject(payload);
      await state.adapter.request({
        url: state.config.feedbackEndpoint,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: {
          projectKey: state.config.projectKey,
          platform: 'browser_extension',
          userId: safeString(input.userId || state.userId, 120),
          anonymousId: state.anonymousId,
          sessionId: state.sessionId,
          deviceId: state.deviceId,
          path: stripQueryPath(input.path || locationPath(state.location)),
          source: source(),
          deviceInfo: deviceInfo(),
          message: sanitizeFeedbackMessage(input.message),
        },
      });
      return { ok: true };
    },
  };
}

const TraceMind = createTraceMindClient();

module.exports = {
  TraceMind,
  createTraceMindClient,
  createBrowserExtensionAdapter,
  sanitizeFields,
  sanitizeAttribution,
  sanitizeFeedbackFields,
};
