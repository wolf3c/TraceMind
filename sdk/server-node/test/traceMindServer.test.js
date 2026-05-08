const assert = require('node:assert/strict');
const test = require('node:test');
const { createTraceMindServerClient, TraceMindServer } = require('../index');

test('captures server custom events with primitive properties and server_app source', async () => {
  const batches = [];
  const client = createTraceMindServerClient({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async (body) => batches.push(body),
  });

  client.capture('custom', {
    eventName: 'invoice_paid',
    userId: 'user_123',
    properties: {
      amount: 2900,
      success: true,
      currency: 'USD',
    },
    context: {
      source: 'stripe_webhook',
    },
  });
  await client.flush();

  const event = batches[0].events[0];
  assert.equal(event.platform, 'server');
  assert.equal(event.source.type, 'server_app');
  assert.equal(event.source.key, 'billing-api');
  assert.equal(event.type, 'custom');
  assert.equal(event.eventName, 'invoice_paid');
  assert.equal(event.userId, 'user_123');
  assert.deepEqual(event.properties, { amount: 2900, success: true, currency: 'USD' });
  assert.deepEqual(event.context, { source: 'stripe_webhook' });
});

test('filters sensitive server fields and non-finite numbers', async () => {
  const batches = [];
  const client = createTraceMindServerClient({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async (body) => batches.push(body),
  });

  client.capture('custom', {
    eventName: 'invoice_paid',
    sourceDetails: {
      framework: 'express',
      environment: 'production',
      language: 'override',
      requestBody: 'do not store',
      headers: { authorization: 'do not store' },
      'headers.authorization': 'do not store',
    },
    properties: {
      amount: 2900,
      raw_request_body: 'do not store',
      'request.body': 'do not store',
      rawResponseBody: 'do not store',
      'response.body': 'do not store',
      headers: 'do not store',
      'headers.authorization': 'do not store',
      cookies: 'do not store',
      'cookies.session': 'do not store',
      authorization: 'do not store',
      access_token: 'do not store',
      userEmail: 'user@example.com',
      callbackUrl: 'https://example.com/callback?token=secret',
      infinite: Infinity,
      nested: { value: true },
    },
    context: {
      source: 'stripe_webhook',
      'request.body': 'do not store',
      'headers.authorization': 'do not store',
    },
  });
  await client.flush();

  const event = batches[0].events[0];
  assert.deepEqual(event.properties, { amount: 2900 });
  assert.deepEqual(event.context, { source: 'stripe_webhook' });
  assert.equal(event.source.details.language, 'javascript');
  assert.equal(event.source.details.framework, 'express');
  assert.equal(event.source.details.environment, 'production');
  assert.equal(JSON.stringify(event).includes('do not store'), false);
  assert.equal(JSON.stringify(event).includes('user@example.com'), false);
});

test('requeues failed flushes without affecting capture callers', async () => {
  let attempts = 0;
  const client = createTraceMindServerClient({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return { ok: true };
    },
  });

  assert.doesNotThrow(() => client.capture('custom', { eventName: 'invoice_paid' }));
  await assert.rejects(() => client.flush(), /offline/);
  assert.equal(client.state.queue.length, 1);
  await client.flush();
  assert.equal(client.state.queue.length, 0);
});

test('singleton TraceMindServer starts and flushes', async () => {
  const batches = [];
  TraceMindServer.start({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async (body) => batches.push(body),
  });

  TraceMindServer.capture('custom', { eventName: 'invoice_paid' });
  await TraceMindServer.flush();

  assert.equal(batches[0].events[0].source.type, 'server_app');
});
