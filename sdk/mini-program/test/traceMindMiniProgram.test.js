const assert = require('node:assert/strict');
const test = require('node:test');
const { createMiniProgramAdapter, createTraceMindClient, TraceMind } = require('../index');

function createHost() {
  const calls = [];
  const timers = [];
  const storage = new Map();
  const host = {
    request(options) {
      calls.push({
        url: options.url,
        method: options.method,
        header: options.header,
        data: options.data,
      });
      options.success?.({ statusCode: 202, data: { ok: true } });
    },
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    getSystemInfoSync() {
      return { brand: 'WeChat', platform: 'devtools', model: 'iPhone 15', token: 'do-not-send' };
    },
    getCurrentPages() {
      return [{ route: 'pages/home/index', options: { invite: 'public', token: 'secret' } }];
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
  };
  return { calls, timers, storage, host };
}

test('normalizes provider adapters across mini program hosts', async () => {
  const { calls, host } = createHost();
  const adapter = createMiniProgramAdapter('wechat', host);

  await adapter.request({
    url: 'https://collector.example.com/api/capture',
    method: 'POST',
    data: { ok: true },
    header: { 'content-type': 'application/json' },
  });

  adapter.setStorage('tm:test', 'value');

  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].header['content-type'], 'application/json');
  assert.equal(adapter.getStorage('tm:test'), 'value');
  assert.equal(adapter.getSystemInfo().platform, 'devtools');
  assert.equal(adapter.getCurrentPages()[0].route, 'pages/home/index');
});

test('starts with mini_program source metadata and captures lifecycle events', async () => {
  const { calls, host } = createHost();
  const client = createTraceMindClient({
    adapter: createMiniProgramAdapter('wechat', host),
    now: () => 1770000000000,
  });

  client.start({
    projectKey: 'tm_proj_mini',
    provider: 'wechat',
    appId: 'wx123',
    appName: 'Example Mini Program',
    endpoint: 'https://collector.example.com/api/capture',
  });
  client.pageShow({ path: '/pages/pricing/index?token=secret', title: 'Pricing' });
  client.appHide();
  const result = await client.flush();

  const captureCall = calls.find((call) => call.url.endsWith('/api/capture'));
  const presenceCall = calls.find((call) => call.url.endsWith('/api/presence'));
  const events = captureCall.data.events;
  const presenceEvents = presenceCall.data.events;
  assert.equal(result.captureSent, 5);
  assert.equal(result.presenceSent, 3);
  assert.equal(events[0].platform, 'mini_program');
  assert.equal(events[0].source.type, 'mini_program');
  assert.equal(events[0].source.key, 'wx123');
  assert.equal(events[0].source.label, 'Example Mini Program');
  assert.equal(events[0].source.details.provider, 'wechat');
  assert.equal(events[0].source.details.sdkVersion, '0.1.0');
  assert.equal(events[0].path, '/pages/home/index');
  assert.equal(events.some((event) => event.type === 'app_show'), true);
  assert.equal(events.some((event) => event.type === 'page_view'), true);
  assert.equal(events.some((event) => event.type === 'presence'), false);
  assert.equal(presenceEvents.every((event) => event.platform === 'mini_program'), true);
  assert.equal(presenceEvents.every((event) => event.source.details.provider === 'wechat'), true);
  assert.equal(presenceEvents[0].path, '/pages/home/index');
  assert.equal(presenceEvents.some((event) => event.state === 'start'), true);
  assert.equal(presenceEvents.some((event) => event.state === 'background'), true);
  assert.equal(JSON.stringify(events).includes('token=secret'), false);
  assert.equal(JSON.stringify(presenceEvents).includes('token=secret'), false);
});

test('heartbeat timer flushes presence to the presence endpoint', async () => {
  const { calls, host, timers } = createHost();
  let now = 1770000000000;
  const client = createTraceMindClient({
    adapter: createMiniProgramAdapter('wechat', host),
    now: () => now,
  });

  client.start({
    projectKey: 'tm_proj_mini',
    provider: 'wechat',
    appId: 'wx123',
    endpoint: 'https://collector.example.com/api/capture',
  });
  assert.equal(timers[0].delay, 5000);

  now += 5000;
  await timers[0].callback();

  const captureCall = calls.find((call) => call.url.endsWith('/api/capture'));
  const presenceCall = calls.find((call) => call.url.endsWith('/api/presence'));
  const presenceEvents = presenceCall.data.events;
  assert.equal(captureCall.data.events.some((event) => event.type === 'presence'), false);
  assert.equal(presenceEvents.some((event) => event.state === 'start'), true);
  assert.equal(presenceEvents.some((event) => event.state === 'heartbeat'), true);
  assert.equal(presenceEvents.find((event) => event.state === 'heartbeat').activeDurationMs, 5000);
  assert.equal(timers[1].delay, 5000);
});

test('wrap helpers preserve original lifecycle this binding', () => {
  const { host } = createHost();
  const client = createTraceMindClient({
    adapter: createMiniProgramAdapter('wechat', host),
    now: () => 1770000000000,
  });
  client.start({ projectKey: 'tm_proj_mini', provider: 'wechat', appId: 'wx123' });

  const appContext = { name: 'app-context' };
  const pageContext = { name: 'page-context' };
  let appThisName = '';
  let pageThisName = '';

  const wrappedApp = client.wrapApp({
    onShow() {
      appThisName = this.name;
    },
  });
  const wrappedPage = client.wrapPage({
    onShow() {
      pageThisName = this.name;
    },
  });

  wrappedApp.onShow.call(appContext);
  wrappedPage.onShow.call(pageContext);

  assert.equal(appThisName, 'app-context');
  assert.equal(pageThisName, 'page-context');
});

test('sanitizes manual capture, identify, feedback, and helper interaction payloads', async () => {
  const { calls, host } = createHost();
  const client = createTraceMindClient({
    adapter: createMiniProgramAdapter('alipay', host),
    now: () => 1770000000000,
  });

  client.start({ projectKey: 'tm_proj_mini', provider: 'alipay', appId: 'ali123' });
  client.identify('user_123', {
    plan: 'pro',
    seats: 3,
    email: 'user@example.com',
    rawPrompt: 'do not send',
  });
  client.setAttribution({
    source: 'partner',
    medium: 'mini_program',
    campaign: 'launch',
    landingPath: '/pages/invite/index?token=secret',
    fullUrl: 'https://example.com/invite?token=secret',
  });
  client.trackTap('checkout_button', {
    path: '/pages/pricing/index?debug=true',
    properties: {
      plan: 'pro',
      amount: 29,
      token: 'do-not-send',
    },
  });
  client.trackInput('phone_input', {
    path: '/pages/pricing/index',
    value: 'should not be captured',
    properties: { field: 'phone', inputValue: 'do-not-send' },
  });
  client.trackSubmit('checkout_form', {
    path: 'https://example.com/pages/pricing/index?token=secret',
    properties: { success: true },
  });
  client.capture('custom', {
    eventName: 'order_created',
    properties: {
      amount: 29,
      orderValue: 29,
      success: true,
      returnUrl: 'https://example.com/callback?token=secret',
      nested: { unsafe: true },
    },
    context: {
      source: 'checkout',
      rawUserContent: 'do not send',
    },
  });
  await client.flush();
  await client.submitFeedback({
    userId: 'user_123',
    path: '/pages/pricing/index?token=secret',
    message: {
      kind: 'issue',
      title: 'Checkout failed',
      body: 'The checkout button did not finish.',
      contact: { email: 'buyer@example.com', consent: true },
      fields: {
        plan: 'pro',
        accessToken: 'do not send',
        returnUrl: 'https://example.com/callback?token=secret',
      },
      attachments: [{ name: 'future.png' }],
    },
  });

  const captureCall = calls.find((call) => call.url.endsWith('/api/capture'));
  const feedbackCall = calls.find((call) => call.url.endsWith('/api/user-feedback'));
  const events = captureCall.data.events;
  assert.equal(events.some((event) => event.type === 'click'), true);
  assert.equal(events.some((event) => event.type === 'input'), true);
  assert.equal(events.some((event) => event.type === 'submit'), true);
  assert.equal(events.some((event) => event.eventName === 'order_created'), true);
  assert.deepEqual(events.find((event) => event.type === 'click').properties, { plan: 'pro', amount: 29 });
  assert.deepEqual(events.find((event) => event.type === 'input').properties, { field: 'phone' });
  assert.equal(events.find((event) => event.type === 'submit').path, '/pages/pricing/index');
  assert.deepEqual(events.find((event) => event.eventName === 'order_created').properties, { amount: 29, orderValue: 29, success: true });
  assert.deepEqual(events.find((event) => event.type === 'click').attribution, {
    source: 'partner',
    medium: 'mini_program',
    campaign: 'launch',
    landingPath: '/pages/invite/index',
  });
  assert.equal(feedbackCall.data.message.contact.email, 'buyer@example.com');
  assert.deepEqual(feedbackCall.data.message.fields, { plan: 'pro' });
  assert.deepEqual(feedbackCall.data.message.attachments, []);
  assert.equal(JSON.stringify(calls).includes('do not send'), false);
  assert.equal(JSON.stringify(calls).includes('token=secret'), false);
  assert.equal(JSON.stringify(calls).includes('should not be captured'), false);
});

test('singleton TraceMind supports the public interface', () => {
  assert.equal(typeof TraceMind.start, 'function');
  assert.equal(typeof TraceMind.identify, 'function');
  assert.equal(typeof TraceMind.capture, 'function');
  assert.equal(typeof TraceMind.submitFeedback, 'function');
  assert.equal(typeof TraceMind.trackTap, 'function');
  assert.equal(typeof TraceMind.trackInput, 'function');
  assert.equal(typeof TraceMind.trackSubmit, 'function');
  assert.equal(typeof TraceMind.setAttribution, 'function');
});
