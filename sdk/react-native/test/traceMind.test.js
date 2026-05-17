const assert = require('node:assert/strict');
const test = require('node:test');
const { createTraceMindClient } = require('../index');

function assertReactNativeDeviceInfo(deviceInfo) {
  assert.equal(deviceInfo.framework, 'react_native');
  assert.equal(deviceInfo.sdkVersion, '0.1.0');
  assert.match(deviceInfo.sdkContentHash, /^sha256:[a-f0-9]{64}$/);
}

test('starts native TraceMind with a one-line project key config', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      start(config) {
        calls.push(['start', config]);
      },
    },
    platform: 'ios',
  });

  client.start({ projectKey: 'tm_proj_rn' });

  assert.equal(calls[0][0], 'start');
  assert.equal(calls[0][1].projectKey, 'tm_proj_rn');
  assert.equal(calls[0][1].endpoint, undefined);
  assertReactNativeDeviceInfo(calls[0][1].deviceInfo);
});

test('sends custom events through the native SDK without raw user content', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      capture(type, payload) {
        calls.push(['capture', type, payload]);
      },
    },
    platform: 'android',
  });

  client.capture('custom', {
    eventName: 'plan_selected',
    properties: {
      plan: 'pro',
      amount: 29,
      ratio: 1.5,
      trial: true,
      rawPrompt: 'do not send me',
      ['raw' + '_prompt']: 'do not send me',
      'raw-user-content': 'do not send me',
      entered_text: 'do not send me',
      ['user' + '_phone']: 'do not send me',
      notANumber: NaN,
      positiveInfinity: Infinity,
      negativeInfinity: -Infinity,
      nested: { unsafe: true },
    },
    context: {
      source: 'pricing',
      retry: false,
      ['return' + 'Url']: 'https://example.com/checkout' + '?debug=true',
    },
  });

  assert.equal(calls[0][1], 'custom');
  assert.equal(calls[0][2].eventName, 'plan_selected');
  assert.deepEqual(calls[0][2].properties, { plan: 'pro', amount: 29, ratio: 1.5, trial: true });
  assert.deepEqual(calls[0][2].context, { source: 'pricing', retry: false });
  assertReactNativeDeviceInfo(calls[0][2].deviceInfo);
});

test('passes action correlation fields through to the native SDK', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      capture(type, payload) {
        calls.push(['capture', type, payload]);
      },
    },
    platform: 'android',
  });

  client.capture('custom', {
    eventName: 'project_created',
    relatedActionKey: 'android:ProjectScreen:submit:target:resourceId:create_project',
    relatedTargetHash: 'tm_target_create_project',
    correlationId: 'corr_123',
    properties: { success: true },
  });

  assert.equal(calls[0][2].relatedActionKey, 'android:ProjectScreen:submit:target:resourceId:create_project');
  assert.equal(calls[0][2].relatedTargetHash, 'tm_target_create_project');
  assert.equal(calls[0][2].correlationId, 'corr_123');
  assertReactNativeDeviceInfo(calls[0][2].deviceInfo);
});

test('passes sanitized traffic attribution controls through to the native SDK', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      setAttribution(attribution) {
        calls.push(['setAttribution', attribution]);
      },
      recordDeepLink(payload) {
        calls.push(['recordDeepLink', payload]);
      },
    },
    platform: 'android',
  });

  client.setAttribution({
    source: 'partner',
    medium: 'deeplink',
    campaign: 'launch',
    landingPath: '/invite?secret=true',
    referrerDomain: 'com.twitter.android',
    referrerType: 'external',
    gclidPresent: true,
    fullUrl: 'https://example.com/invite?token=secret',
    email: 'user@example.com',
  });
  client.recordDeepLink({
    url: 'myapp://invite?utm_source=partner&utm_medium=deeplink&utm_campaign=launch&fbclid=secret',
    referrer: 'android-app://com.twitter.android',
    sourcePackage: 'com.twitter.android',
  });

  assert.deepEqual(calls[0], ['setAttribution', {
    source: 'partner',
    medium: 'deeplink',
    campaign: 'launch',
    landingPath: '/invite',
    referrerDomain: 'com.twitter.android',
    referrerType: 'external',
    gclidPresent: true,
  }]);
  assert.deepEqual(calls[1], ['recordDeepLink', {
    url: 'myapp://invite?utm_source=partner&utm_medium=deeplink&utm_campaign=launch&fbclid=secret',
    referrer: 'android-app://com.twitter.android',
    sourcePackage: 'com.twitter.android',
  }]);
  assert.equal(JSON.stringify(calls).includes('token=secret'), false);
  assert.equal(JSON.stringify(calls).includes('user@example.com'), false);
});

test('identifies users through the native SDK with sanitized primitive traits', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      identify(userId, traits) {
        calls.push(['identify', userId, traits]);
      },
    },
    platform: 'ios',
  });

  client.identify('user_123', {
    plan: 'pro',
    seats: 3,
    ratio: 1.5,
    trial: false,
    ['em' + 'ail']: 'redacted-contact',
    ['raw' + '_prompt']: 'do not send',
    'raw-user-content': 'do not send',
    entered_text: 'do not send',
    notANumber: NaN,
    positiveInfinity: Infinity,
    nested: { unsafe: true },
  });

  assert.deepEqual(calls, [['identify', 'user_123', {
    plan: 'pro',
    seats: 3,
    ratio: 1.5,
    trial: false,
  }]]);
});

test('updates the native presence screen when available', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      setScreen(screen) {
        calls.push(['setScreen', screen]);
      },
    },
    platform: 'ios',
  });

  client.setScreen('Checkout');

  assert.deepEqual(calls, [['setScreen', 'Checkout']]);
});

test('submits user feedback through the native SDK bridge', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      submitFeedback(payload) {
        calls.push(['submitFeedback', payload]);
      },
    },
    platform: 'ios',
  });

  client.submitFeedback({
    message: {
      kind: 'issue',
      title: 'Upgrade failed',
      body: 'The upgrade button did not finish.',
      contact: { email: 'user@example.com', consent: true },
      fields: {
        plan: 'pro',
        accessToken: 'do not send',
        returnUrl: 'Open https://example.com/callback?token=secret to debug',
      },
      attachments: [{ name: 'future.png' }],
    },
  });

  assert.equal(calls[0][0], 'submitFeedback');
  assert.equal(calls[0][1].message.kind, 'issue');
  assert.equal(calls[0][1].message.contact.email, 'user@example.com');
  assert.deepEqual(calls[0][1].message.fields, { plan: 'pro' });
  assert.deepEqual(calls[0][1].message.attachments, []);
  assertReactNativeDeviceInfo(calls[0][1].deviceInfo);
  assert.equal(JSON.stringify(calls[0][1]).includes('do not send'), false);
  assert.equal(JSON.stringify(calls[0][1]).includes('callback?token'), false);
});

test('keeps React Native as a native SDK proxy without its own platform value', () => {
  const calls = [];
  const client = createTraceMindClient({
    nativeModule: {
      start(config) {
        calls.push(config);
      },
    },
    platform: 'android',
  });

  client.start({ projectKey: 'tm_proj_rn' });

  assert.equal(client.platform, 'android');
  assert.equal(client.presence, undefined);
  assert.equal(calls[0].platform, undefined);
  assertReactNativeDeviceInfo(calls[0].deviceInfo);
});
