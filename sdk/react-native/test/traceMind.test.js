const assert = require('node:assert/strict');
const test = require('node:test');
const { createTraceMindClient } = require('../index');

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

  assert.deepEqual(calls, [['start', {
    projectKey: 'tm_proj_rn',
    endpoint: undefined,
    deviceInfo: { framework: 'react_native' },
  }]]);
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
      rawPrompt: 'do not send me',
    },
  });

  assert.equal(calls[0][1], 'custom');
  assert.equal(calls[0][2].eventName, 'plan_selected');
  assert.deepEqual(calls[0][2].properties, { plan: 'pro' });
  assert.deepEqual(calls[0][2].deviceInfo, { framework: 'react_native' });
});
