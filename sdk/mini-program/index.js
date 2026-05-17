const SDK_VERSION = '0.1.0';
const DEFAULT_CAPTURE_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/capture';
const DEFAULT_PRESENCE_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/presence';
const DEFAULT_FEEDBACK_ENDPOINT = 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback';
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 60000;
const PROVIDERS = new Set(['wechat', 'alipay', 'douyin', 'dingtalk']);
const PROVIDER_GLOBALS = {
  wechat: 'wx',
  alipay: 'my',
  douyin: 'tt',
  dingtalk: 'dd',
};
const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|headers|cookies|authorization|token|secret|password|email|phone|inputvalue|enteredtext)/i;
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

function isPrimitiveValue(value) {
  return typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
    || typeof value === 'boolean';
}

function normalizeFieldKey(key) {
  return String(key).toLowerCase().replace(/[_\-\s.]+/g, '');
}

function normalizeProvider(provider) {
  const value = safeString(provider, 40).toLowerCase().replace(/-/g, '_');
  if (value === 'weixin' || value === 'wx') return 'wechat';
  if (value === 'tt' || value === 'bytedance') return 'douyin';
  if (value === 'ding' || value === 'dd') return 'dingtalk';
  return PROVIDERS.has(value) ? value : '';
}

function stripQueryPath(value, fallback = '') {
  const text = safeString(value, 500, fallback);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.pathname || '/';
    } catch (error) {
      return '';
    }
  }
  const withoutHash = text.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  if (!withoutQuery) return '';
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
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

function sanitizeSystemInfo(info) {
  const input = safeObject(info);
  return sanitizeFields({
    brand: input.brand,
    model: input.model,
    platform: input.platform,
    system: input.system,
    version: input.version,
    SDKVersion: input.SDKVersion,
    environment: input.environment,
  });
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
  const input = safeObject(message);
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

function getGlobalHost(provider) {
  const globalName = PROVIDER_GLOBALS[provider];
  if (!globalName || typeof globalThis === 'undefined') return null;
  return globalThis[globalName] || null;
}

function createMiniProgramAdapter(provider, host) {
  const normalizedProvider = normalizeProvider(provider);
  const resolvedHost = host || getGlobalHost(normalizedProvider);

  return {
    provider: normalizedProvider,
    request({ url, method = 'POST', data, header = {} }) {
      return new Promise((resolve, reject) => {
        if (!resolvedHost?.request) {
          reject(new Error(`TraceMind mini program adapter is missing ${PROVIDER_GLOBALS[normalizedProvider] || 'host'}.request.`));
          return;
        }
        resolvedHost.request({
          url,
          method,
          data,
          header,
          success: resolve,
          fail: reject,
        });
      });
    },
    getStorage(key) {
      try {
        return resolvedHost?.getStorageSync ? resolvedHost.getStorageSync(key) : undefined;
      } catch (error) {
        return undefined;
      }
    },
    setStorage(key, value) {
      try {
        resolvedHost?.setStorageSync?.(key, value);
      } catch (error) {
        // Ignore storage failures; captures still use the in-memory queue.
      }
    },
    getSystemInfo() {
      try {
        return resolvedHost?.getSystemInfoSync ? resolvedHost.getSystemInfoSync() : {};
      } catch (error) {
        return {};
      }
    },
    getCurrentPages() {
      try {
        if (resolvedHost?.getCurrentPages) return resolvedHost.getCurrentPages();
        if (typeof globalThis !== 'undefined' && typeof globalThis.getCurrentPages === 'function') {
          return globalThis.getCurrentPages();
        }
        return [];
      } catch (error) {
        return [];
      }
    },
    setTimeout(callback, delay) {
      return resolvedHost?.setTimeout ? resolvedHost.setTimeout(callback, delay) : setTimeout(callback, delay);
    },
    clearTimeout(id) {
      if (resolvedHost?.clearTimeout) {
        resolvedHost.clearTimeout(id);
      } else {
        clearTimeout(id);
      }
    },
  };
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function storageKey(projectKey, key) {
  return `tracemind:${projectKey}:${key}`;
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
    // Fall through to default endpoint.
  }
  return fallback;
}

function deriveFeedbackEndpoint(endpoint) {
  return deriveSiblingEndpoint(endpoint, '/api/user-feedback', DEFAULT_FEEDBACK_ENDPOINT);
}

function derivePresenceEndpoint(endpoint) {
  return deriveSiblingEndpoint(endpoint, '/api/presence', DEFAULT_PRESENCE_ENDPOINT);
}

function stableHash(value) {
  const text = safeString(value, 500);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return `tm_target_${(hash >>> 0).toString(36)}`;
}

function createTraceMindClient({ adapter, now } = {}) {
  const captureQueue = [];
  const presenceQueue = [];
  const state = {
    config: null,
    adapter,
    queue: captureQueue,
    captureQueue,
    presenceQueue,
    attribution: {},
    userId: '',
    anonymousId: '',
    sessionId: '',
    deviceId: '',
    presenceId: '',
    isForeground: false,
    heartbeatTimer: null,
    activeDurationMs: 0,
    lastActivityAt: 0,
    lastActiveTickAt: 0,
  };
  const getNow = typeof now === 'function' ? now : () => Date.now();

  function assertStarted() {
    if (!state.config) throw new Error('TraceMind.start must be called before capture.');
  }

  function activeAdapter(provider) {
    if (state.adapter) return state.adapter;
    state.adapter = createMiniProgramAdapter(provider);
    return state.adapter;
  }

  function source() {
    const { provider, appId, appName, sourceKey } = state.config;
    const key = safeString(appId || sourceKey || provider, 200, provider);
    return {
      type: 'mini_program',
      key,
      appId: safeString(appId, 120),
      label: safeString(appName || key, 200, key),
      details: {
        provider,
        sdkVersion: SDK_VERSION,
      },
    };
  }

  function deviceInfo() {
    return {
      provider: state.config.provider,
      ...sanitizeSystemInfo(state.adapter?.getSystemInfo?.() || {}),
      framework: 'mini_program',
    };
  }

  function currentPath(fallback = '') {
    const pages = state.adapter?.getCurrentPages?.() || [];
    const page = pages[pages.length - 1] || {};
    return stripQueryPath(page.route || page.__route__ || page.path || fallback || '/');
  }

  function eventPayload(type, payload = {}) {
    const input = safeObject(payload);
    const path = stripQueryPath(input.path || input.route || currentPath('/'));
    const targetName = safeString(input.targetName || input.target || '', 160);
    const event = {
      projectKey: state.config.projectKey,
      platform: 'mini_program',
      type,
      occurredAt: new Date(getNow()).toISOString(),
      anonymousId: state.anonymousId,
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      ...(state.userId ? { userId: state.userId } : {}),
      ...(input.userId ? { userId: safeString(input.userId, 120) } : {}),
      ...(input.eventName ? { eventName: safeString(input.eventName, 120) } : {}),
      ...(path ? { path } : {}),
      source: source(),
      deviceInfo: deviceInfo(),
      properties: sanitizeFields(input.properties),
      context: sanitizeFields(input.context),
      ...(Object.keys(state.attribution).length ? { attribution: state.attribution } : {}),
    };
    if (targetName) {
      event.target = {
        type: 'mini_program_element',
        name: targetName,
        path,
      };
      event.targetHash = stableHash(`${type}:${path}:${targetName}`);
      event.actionKey = `mini_program:${path}:${type}:${event.targetHash}`;
    }
    return event;
  }

  function enqueue(type, payload = {}) {
    assertStarted();
    state.captureQueue.push(eventPayload(type, payload));
  }

  function markActivity() {
    const nowMs = getNow();
    state.lastActivityAt = nowMs;
    if (!state.lastActiveTickAt) state.lastActiveTickAt = nowMs;
  }

  function updateActiveDuration(nowMs = getNow()) {
    if (!state.config || !state.isForeground || !state.lastActivityAt) {
      state.lastActiveTickAt = 0;
      return;
    }
    if (nowMs - state.lastActivityAt > state.config.idleTimeoutMs) {
      state.lastActiveTickAt = 0;
      return;
    }
    if (state.lastActiveTickAt) {
      state.activeDurationMs += Math.max(0, nowMs - state.lastActiveTickAt);
    }
    state.lastActiveTickAt = nowMs;
  }

  function currentActiveState(nowMs = getNow()) {
    if (!state.config || !state.isForeground || !state.lastActivityAt) return 'inactive';
    return nowMs - state.lastActivityAt <= state.config.idleTimeoutMs ? 'active' : 'inactive';
  }

  function presencePayload(stateName, payload = {}) {
    const input = safeObject(payload);
    const presenceState = ['start', 'heartbeat', 'end', 'background', 'foreground'].includes(stateName)
      ? stateName
      : 'heartbeat';
    const nowMs = getNow();
    updateActiveDuration(nowMs);
    const path = stripQueryPath(input.path || input.route || currentPath('/'));
    return {
      projectKey: state.config.projectKey,
      platform: 'mini_program',
      state: presenceState,
      presenceId: state.presenceId,
      occurredAt: new Date(nowMs).toISOString(),
      anonymousId: state.anonymousId,
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      ...(state.userId ? { userId: state.userId } : {}),
      ...(path ? { path } : {}),
      source: source(),
      deviceInfo: deviceInfo(),
      activeState: ['background', 'end'].includes(presenceState) ? 'inactive' : currentActiveState(nowMs),
      activeDurationMs: Math.round(state.activeDurationMs),
      idleTimeoutMs: state.config.idleTimeoutMs,
      heartbeatIntervalMs: state.config.heartbeatIntervalMs,
      ...(state.lastActivityAt ? { lastActiveAt: new Date(state.lastActivityAt).toISOString() } : {}),
      ...(Object.keys(state.attribution).length ? { attribution: state.attribution } : {}),
    };
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

  function clearHeartbeat() {
    if (!state.heartbeatTimer) return;
    state.adapter?.clearTimeout?.(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  function scheduleHeartbeat() {
    if (!state.config || !state.isForeground || state.heartbeatTimer) return;
    state.heartbeatTimer = state.adapter.setTimeout(async () => {
      state.heartbeatTimer = null;
      if (!state.config || !state.isForeground) return;
      enqueuePresence('heartbeat', { path: currentPath('/') });
      try {
        await flush();
      } catch (error) {
        // Keep queued events for the next explicit flush or heartbeat retry.
      }
      scheduleHeartbeat();
    }, state.config.heartbeatIntervalMs);
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
      const provider = normalizeProvider(config.provider);
      if (!config.projectKey) throw new Error('TraceMind.start requires projectKey.');
      if (!provider) throw new Error('TraceMind.start requires provider: wechat, alipay, douyin, or dingtalk.');
      clearHeartbeat();
      state.config = {
        projectKey: safeString(config.projectKey, 160),
        provider,
        appId: safeString(config.appId, 120),
        appName: safeString(config.appName, 200),
        sourceKey: safeString(config.sourceKey, 200),
        endpoint: safeString(config.endpoint, 500, DEFAULT_CAPTURE_ENDPOINT),
        presenceEndpoint: safeString(config.presenceEndpoint || derivePresenceEndpoint(config.endpoint), 500, DEFAULT_PRESENCE_ENDPOINT),
        heartbeatIntervalMs: safePositiveNumber(config.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS),
        idleTimeoutMs: safePositiveNumber(config.idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS),
      };
      state.adapter = activeAdapter(provider);
      state.anonymousId = state.adapter.getStorage(storageKey(state.config.projectKey, 'anonymousId')) || randomId('anon');
      state.deviceId = state.adapter.getStorage(storageKey(state.config.projectKey, 'deviceId')) || randomId('device');
      state.sessionId = randomId('session');
      state.presenceId = randomId('pres');
      state.isForeground = true;
      state.activeDurationMs = 0;
      markActivity();
      state.adapter.setStorage(storageKey(state.config.projectKey, 'anonymousId'), state.anonymousId);
      state.adapter.setStorage(storageKey(state.config.projectKey, 'deviceId'), state.deviceId);
      enqueue('app_start', { path: currentPath('/') });
      enqueue('app_show', { path: currentPath('/') });
      enqueuePresence('start', { path: currentPath('/') });
      scheduleHeartbeat();
    },

    identify(userId, traits = {}) {
      assertStarted();
      state.userId = safeString(userId, 120);
      enqueue('custom', {
        eventName: 'identify',
        properties: sanitizeFields(traits),
      });
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

    appShow(payload = {}) {
      state.isForeground = true;
      markActivity();
      enqueue('app_show', payload);
      enqueuePresence('foreground', payload);
      scheduleHeartbeat();
    },

    appHide(payload = {}) {
      enqueue('app_hide', payload);
      enqueuePresence('background', payload);
      state.isForeground = false;
      state.lastActiveTickAt = 0;
      clearHeartbeat();
    },

    pageShow(payload = {}) {
      markActivity();
      enqueue('page_view', payload);
      enqueue('page_show', payload);
      enqueuePresence('heartbeat', payload);
    },

    pageHide(payload = {}) {
      enqueue('page_hide', payload);
      enqueuePresence('heartbeat', payload);
    },

    wrapApp(appOptions = {}) {
      const original = safeObject(appOptions);
      return {
        ...original,
        onLaunch(...args) {
          enqueue('app_start', { context: { source: 'onLaunch' } });
          return original.onLaunch?.apply(this, args);
        },
        onShow(...args) {
          state.isForeground = true;
          markActivity();
          enqueue('app_show', { context: { source: 'onShow' } });
          enqueuePresence('foreground', { context: { source: 'onShow' } });
          scheduleHeartbeat();
          return original.onShow?.apply(this, args);
        },
        onHide(...args) {
          enqueue('app_hide', { context: { source: 'onHide' } });
          enqueuePresence('background', { context: { source: 'onHide' } });
          state.isForeground = false;
          state.lastActiveTickAt = 0;
          clearHeartbeat();
          return original.onHide?.apply(this, args);
        },
      };
    },

    wrapPage(pageOptions = {}) {
      const original = safeObject(pageOptions);
      return {
        ...original,
        onShow(...args) {
          markActivity();
          enqueue('page_view', { path: currentPath('/') });
          enqueue('page_show', { path: currentPath('/') });
          enqueuePresence('heartbeat', { path: currentPath('/') });
          return original.onShow?.apply(this, args);
        },
        onHide(...args) {
          enqueue('page_hide', { path: currentPath('/') });
          enqueuePresence('heartbeat', { path: currentPath('/') });
          return original.onHide?.apply(this, args);
        },
      };
    },

    flush,

    async submitFeedback(payload = {}) {
      assertStarted();
      const input = safeObject(payload);
      const body = {
        projectKey: state.config.projectKey,
        platform: 'mini_program',
        userId: safeString(input.userId || state.userId, 120),
        anonymousId: state.anonymousId,
        sessionId: state.sessionId,
        deviceId: state.deviceId,
        path: stripQueryPath(input.path || currentPath('/')),
        source: source(),
        deviceInfo: deviceInfo(),
        message: sanitizeFeedbackMessage(input.message),
      };
      await state.adapter.request({
        url: deriveFeedbackEndpoint(state.config.endpoint),
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: body,
      });
      return { ok: true };
    },
  };
}

const TraceMind = createTraceMindClient();

module.exports = {
  TraceMind,
  createTraceMindClient,
  createMiniProgramAdapter,
  normalizeProvider,
  sanitizeAttribution,
  sanitizeFields,
  sanitizeFeedbackFields,
};
