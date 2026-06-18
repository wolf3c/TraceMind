const assert = require('node:assert/strict');
const test = require('node:test');
const { createBrowserExtensionAdapter, createTraceMindClient, TraceMind } = require('../index');

function createChromeHost() {
  const storage = new Map();
  return {
    runtime: {
      id: 'chrome-extension-id',
      getManifest() {
        return { name: 'Chrome Extension', version: '1.2.3', manifest_version: 3 };
      },
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage.get(key) });
        },
        set(values, callback) {
          Object.entries(values).forEach(([key, value]) => storage.set(key, value));
          callback?.();
        },
      },
    },
  };
}

function createBrowserHost() {
  const storage = new Map([['existing', 'stored']]);
  return {
    runtime: {
      id: 'firefox-extension-id',
      getManifest() {
        return { name: 'Firefox Extension', version: '2.0.0', manifest_version: 3 };
      },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: storage.get(key) };
        },
        async set(values) {
          Object.entries(values).forEach(([key, value]) => storage.set(key, value));
        },
      },
    },
  };
}

function createEnvironment({ withDocument = true, userAgent = 'Mozilla/5.0 Chrome/124.0' } = {}) {
  const calls = [];
  const intervals = [];
  const listeners = {};
  const defaultView = {
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler);
    },
  };
  const document = withDocument ? {
    title: 'Extension Popup',
    visibilityState: 'visible',
    defaultView,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler);
    },
  } : undefined;
  return {
    calls,
    intervals,
    listeners,
    document,
    location: { pathname: '/popup.html', hash: '', href: 'chrome-extension://chrome-extension-id/popup.html?token=secret' },
    navigator: { userAgent },
    fetch: async (url, options) => {
      calls.push({ url, method: options.method, headers: options.headers, data: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    },
    setInterval(callback, delay) {
      intervals.push({ callback, delay, cleared: false });
      return intervals.length;
    },
    clearInterval(id) {
      if (intervals[id - 1]) intervals[id - 1].cleared = true;
    },
  };
}

test('normalizes chrome callback and browser promise extension APIs', async () => {
  const chromeAdapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    navigator: { userAgent: 'Mozilla/5.0 Chrome/124.0' },
  });
  assert.equal(chromeAdapter.runtimeId(), 'chrome-extension-id');
  assert.equal(chromeAdapter.manifest().name, 'Chrome Extension');
  assert.equal(chromeAdapter.browserName(), 'chrome');
  await chromeAdapter.setStorage('tm:test', 'value');
  assert.equal(await chromeAdapter.getStorage('tm:test'), 'value');

  const browserAdapter = createBrowserExtensionAdapter({
    browser: createBrowserHost(),
    navigator: { userAgent: 'Mozilla/5.0 Firefox/126.0' },
  });
  assert.equal(browserAdapter.runtimeId(), 'firefox-extension-id');
  assert.equal(browserAdapter.manifest().name, 'Firefox Extension');
  assert.equal(browserAdapter.browserName(), 'firefox');
  assert.equal(await browserAdapter.getStorage('existing'), 'stored');
});

test('captures extension-owned UI events and sends presence separately', async () => {
  const env = createEnvironment();
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Example Extension' });
  client.trackTap('export_button', {
    path: '/popup.html?token=secret',
    properties: { success: true, accessToken: 'do-not-send' },
  });
  client.trackInput('search_box', {
    path: '/popup.html',
    properties: { field: 'query', value: 'do-not-send' },
  });
  await client.flush();

  const captureCall = env.calls.find((call) => call.url.endsWith('/api/capture'));
  const presenceCall = env.calls.find((call) => call.url.endsWith('/api/presence'));
  const events = captureCall.data.events;
  const presenceEvents = presenceCall.data.events;

  assert.equal(events[0].platform, 'browser_extension');
  assert.equal(events[0].source.type, 'browser_extension');
  assert.equal(events[0].source.key, 'chrome-extension-id');
  assert.equal(events[0].source.label, 'Example Extension');
  assert.deepEqual(events[0].source.details, {
    browser: 'chrome',
    manifestVersion: 3,
    runtimeContext: 'popup',
    sdkVersion: '0.1.0',
    sdkContentHash: events[0].source.details.sdkContentHash,
  });
  assert.match(events[0].source.details.sdkContentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(events.some((event) => event.type === 'extension_ui_start'), true);
  assert.equal(events.some((event) => event.type === 'page_view'), true);
  assert.equal(events.some((event) => event.type === 'click'), true);
  assert.equal(events.some((event) => event.type === 'input'), true);
  assert.equal(events.some((event) => event.type === 'presence'), false);
  assert.equal(presenceEvents.every((event) => event.platform === 'browser_extension'), true);
  assert.equal(presenceEvents.some((event) => event.state === 'start'), true);
  assert.equal(JSON.stringify(env.calls).includes('token=secret'), false);
  assert.equal(JSON.stringify(env.calls).includes('do-not-send'), false);
});

test('captures extension-owned JavaScript error summaries automatically', async () => {
  const env = createEnvironment();
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Example Extension' });
  const error = new Error('Checkout failed for token=secret at /callback?code=abc');
  error.stack = 'raw stack with /private/file.js';
  env.listeners.error[0]({ error, message: error.message });
  env.listeners.unhandledrejection[0]({
    reason: new TypeError('Promise rejected with password=secret'),
  });
  await client.flush();

  const captureCall = env.calls.find((call) => call.url.endsWith('/api/capture'));
  const errors = captureCall.data.events.filter((event) => event.type === 'app_error');
  assert.equal(errors.length, 2);
  assert.equal(errors[0].eventName, 'app_error');
  assert.equal(errors[0].path, '/popup.html');
  assert.equal(errors[0].properties.errorType, 'Error');
  assert.equal(errors[0].properties.handled, false);
  assert.equal(errors[0].properties.source, 'browser_extension');
  assert.match(errors[0].properties.messageFingerprint, /^tm_error_/);
  assert.equal(errors[0].properties.messagePreview, 'Checkout failed for [redacted] at [url]');
  assert.match(errors[0].properties.stackFingerprint, /^tm_stack_/);
  assert.match(errors[0].properties.topFrameFingerprint, /^tm_frame_/);
  assert.equal(errors[1].properties.errorKind, 'unhandledrejection');

  const serialized = JSON.stringify(errors);
  assert.equal(serialized.includes('raw stack'), false);
  assert.equal(serialized.includes('token=secret'), false);
  assert.equal(serialized.includes('password=secret'), false);
  assert.equal(serialized.includes('?code=abc'), false);
});

test('background runtime supports manual capture without DOM auto capture', async () => {
  const env = createEnvironment({ withDocument: false, userAgent: 'Mozilla/5.0 Edg/124.0' });
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: undefined,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Background Extension' });
  client.capture('custom', {
    eventName: 'export_completed',
    properties: { success: true, outputValue: 12 },
  });
  await client.flush();

  const captureCall = env.calls.find((call) => call.url.endsWith('/api/capture'));
  const events = captureCall.data.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, 'export_completed');
  assert.equal(events[0].source.details.browser, 'edge');
  assert.equal(events[0].source.details.runtimeContext, 'background');
  assert.deepEqual(events[0].properties, { success: true, outputValue: 12 });
  assert.equal(env.calls.some((call) => call.url.endsWith('/api/presence')), false);
  assert.equal(Object.keys(env.listeners).length, 0);
});

test('content script host pages do not enable DOM auto capture by default', async () => {
  const env = createEnvironment();
  env.location = {
    protocol: 'https:',
    pathname: '/account',
    hash: '',
    href: 'https://example.com/account?token=secret',
  };
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Content Script Extension' });
  client.capture('custom', {
    eventName: 'explicit_helper_event',
    properties: { success: true },
  });
  await client.flush();

  const captureCall = env.calls.find((call) => call.url.endsWith('/api/capture'));
  const events = captureCall.data.events;
  assert.equal(Object.keys(env.listeners).length, 0);
  assert.equal(env.intervals.length, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, 'explicit_helper_event');
  assert.equal(events[0].source.details.runtimeContext, 'content_script');
  assert.equal(JSON.stringify(env.calls).includes('token=secret'), false);
});

test('captures sanitized extension app_error summaries manually', async () => {
  const env = createEnvironment();
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });
  const error = new Error('Popup failed for user@example.com');
  error.stack = 'raw stack';
  error.cause = new TypeError('Gateway token=secret');

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Error Extension' });
  client.captureError(error, {
    path: '/popup.html?token=secret',
    component: 'Popup',
    release: '2026.05.25',
    operation: 'popup.submit',
    feature: 'popup',
    routeName: 'Popup',
    correlationId: 'corr_123',
    requestId: 'req_456',
    httpStatus: 402,
    handled: true,
    fatal: false,
    properties: {
      requestBody: 'do not send',
      headers: 'do not send',
      inputValue: 'do not send',
    },
    context: {
      source: 'popup',
      authorization: 'Bearer secret',
    },
  });
  await client.flush();

  const captureCall = env.calls.find((call) => call.url.endsWith('/api/capture'));
  const event = captureCall.data.events.find((item) => item.type === 'app_error');
  assert.equal(event.eventName, 'app_error');
  assert.equal(event.path, '/popup.html');
  assert.equal(event.properties.errorType, 'Error');
  assert.equal(event.properties.errorKind, 'runtime');
  assert.equal(event.properties.component, 'Popup');
  assert.equal(event.properties.release, '2026.05.25');
  assert.equal(event.properties.handled, true);
  assert.equal(event.properties.status, 'error');
  assert.match(event.properties.messageFingerprint, /^tm_error_[a-f0-9]{24}$/);
  assert.equal(event.properties.messagePreview, 'Popup failed for [email]');
  assert.match(event.properties.stackFingerprint, /^tm_stack_[a-f0-9]{24}$/);
  assert.match(event.properties.topFrameFingerprint, /^tm_frame_[a-f0-9]{24}$/);
  assert.equal(event.properties.causeType, 'TypeError');
  assert.match(event.properties.causeFingerprint, /^tm_cause_[a-f0-9]{24}$/);
  assert.equal(event.properties.operation, 'popup.submit');
  assert.equal(event.properties.feature, 'popup');
  assert.equal(event.properties.routeName, 'Popup');
  assert.equal(event.properties.correlationId, 'corr_123');
  assert.equal(event.properties.requestId, 'req_456');
  assert.equal(event.properties.httpStatus, 402);
  assert.deepEqual(event.context, { source: 'popup' });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('user@example.com'), false);
  assert.equal(serialized.includes('raw stack'), false);
  assert.equal(serialized.includes('Bearer secret'), false);
  assert.equal(serialized.includes('token=secret'), false);
});

test('restart replaces extension-owned DOM listeners instead of duplicating them', () => {
  const env = createEnvironment();
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Restart Extension' });
  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Restart Extension' });

  assert.equal(env.listeners.click.length, 1);
  assert.equal(env.listeners.input.length, 1);
  assert.equal(env.listeners.submit.length, 1);
  assert.equal(env.intervals[0].cleared, true);
  assert.equal(env.intervals[1].cleared, false);
});

test('submits sanitized extension user feedback', async () => {
  const env = createEnvironment();
  const adapter = createBrowserExtensionAdapter({
    chrome: createChromeHost(),
    fetch: env.fetch,
    navigator: env.navigator,
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
  });
  const client = createTraceMindClient({
    adapter,
    document: env.document,
    location: env.location,
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_extension', extensionName: 'Feedback Extension' });
  await client.submitFeedback({
    userId: 'user_123',
    path: '/popup.html?token=secret',
    message: {
      kind: 'issue',
      title: 'Export failed',
      body: 'The export button did not finish.',
      contact: { email: 'buyer@example.com', consent: true },
      fields: {
        plan: 'pro',
        rawUserContent: 'do-not-send',
        returnUrl: 'https://example.com/callback?token=secret',
      },
    },
  });

  const feedbackCall = env.calls.find((call) => call.url.endsWith('/api/user-feedback'));
  assert.equal(feedbackCall.data.platform, 'browser_extension');
  assert.equal(feedbackCall.data.message.contact.email, 'buyer@example.com');
  assert.deepEqual(feedbackCall.data.message.fields, { plan: 'pro' });
  assert.equal(JSON.stringify(feedbackCall).includes('token=secret'), false);
  assert.equal(JSON.stringify(feedbackCall).includes('do-not-send'), false);
});

test('singleton TraceMind supports the public browser extension interface', () => {
  assert.equal(typeof TraceMind.start, 'function');
  assert.equal(typeof TraceMind.identify, 'function');
  assert.equal(typeof TraceMind.capture, 'function');
  assert.equal(typeof TraceMind.captureError, 'function');
  assert.equal(typeof TraceMind.submitFeedback, 'function');
  assert.equal(typeof TraceMind.trackTap, 'function');
  assert.equal(typeof TraceMind.trackInput, 'function');
  assert.equal(typeof TraceMind.trackSubmit, 'function');
  assert.equal(typeof TraceMind.setAttribution, 'function');
  assert.equal(typeof TraceMind.flush, 'function');
});
