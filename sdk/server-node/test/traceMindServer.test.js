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
    attribution: {
      source: 'partner',
      medium: 'referral',
      campaign: 'launch',
      landingPath: '/invite?token=secret',
      referrerDomain: 'example.com',
      referrerType: 'external',
      gclidPresent: true,
      fullUrl: 'https://example.com/invite?token=secret',
      email: 'user@example.com',
    },
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
  assert.deepEqual(event.attribution, {
    source: 'partner',
    medium: 'referral',
    campaign: 'launch',
    landingPath: '/invite',
    referrerDomain: 'example.com',
    referrerType: 'external',
    gclidPresent: true,
  });
  assert.deepEqual(event.properties, { amount: 2900, success: true, currency: 'USD' });
  assert.deepEqual(event.context, { source: 'stripe_webhook' });
  assert.equal(JSON.stringify(event).includes('token=secret'), false);
  assert.equal(JSON.stringify(event).includes('user@example.com'), false);
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

test('captures sanitized app_error summaries without stacks or raw fields', async () => {
  const batches = [];
  const client = createTraceMindServerClient({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async (body) => batches.push(body),
  });
  const error = new Error('Database timeout for user@example.com');
  error.stack = 'raw stack must not be sent';
  error.cause = new TypeError('Pool exhausted with token=secret');

  client.captureError(error, {
    path: '/jobs?token=secret',
    component: 'InvoiceWorker',
    release: '2026.05.25',
    operation: 'invoice.sync',
    feature: 'billing',
    routeName: 'InvoiceJob',
    correlationId: 'corr_123',
    requestId: 'req_456',
    httpStatus: 503,
    handled: true,
    fatal: false,
    properties: {
      headers: 'do not send',
      requestBody: 'do not send',
      inputValue: 'do not send',
    },
    context: {
      source: 'job_runner',
      authorization: 'Bearer secret',
    },
  });
  await client.flush();

  const event = batches[0].events[0];
  assert.equal(event.type, 'app_error');
  assert.equal(event.eventName, 'app_error');
  assert.equal(event.path, '/jobs');
  assert.equal(event.properties.errorType, 'Error');
  assert.equal(event.properties.errorKind, 'runtime');
  assert.equal(event.properties.component, 'InvoiceWorker');
  assert.equal(event.properties.release, '2026.05.25');
  assert.equal(event.properties.handled, true);
  assert.equal(event.properties.fatal, false);
  assert.equal(event.properties.status, 'error');
  assert.match(event.properties.messageFingerprint, /^tm_error_[a-f0-9]{24}$/);
  assert.equal(event.properties.messagePreview, 'Database timeout for [email]');
  assert.match(event.properties.stackFingerprint, /^tm_stack_[a-f0-9]{24}$/);
  assert.match(event.properties.topFrameFingerprint, /^tm_frame_[a-f0-9]{24}$/);
  assert.equal(event.properties.causeType, 'TypeError');
  assert.match(event.properties.causeFingerprint, /^tm_cause_[a-f0-9]{24}$/);
  assert.equal(event.properties.operation, 'invoice.sync');
  assert.equal(event.properties.feature, 'billing');
  assert.equal(event.properties.routeName, 'InvoiceJob');
  assert.equal(event.properties.correlationId, 'corr_123');
  assert.equal(event.properties.requestId, 'req_456');
  assert.equal(event.properties.httpStatus, 503);
  assert.deepEqual(event.context, { source: 'job_runner' });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('user@example.com'), false);
  assert.equal(serialized.includes('raw stack'), false);
  assert.equal(serialized.includes('Bearer secret'), false);
  assert.equal(serialized.includes('token=secret'), false);
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

test('singleton TraceMindServer exposes captureError', async () => {
  const batches = [];
  TraceMindServer.start({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    transport: async (body) => batches.push(body),
  });

  TraceMindServer.captureError({ errorType: 'JobError', message: 'failed' });
  await TraceMindServer.flush();

  assert.equal(batches[0].events[0].type, 'app_error');
  assert.equal(batches[0].events[0].properties.errorType, 'JobError');
});

test('submits structured user feedback through the dedicated endpoint', async () => {
  const feedbackBodies = [];
  const client = createTraceMindServerClient({
    projectKey: 'tm_proj_server_node',
    sourceKey: 'billing-api',
    endpoint: 'https://tracemind.example.com/api/capture',
    feedbackTransport: async (body) => feedbackBodies.push(body),
  });

  await client.submitFeedback({
    userId: 'user_123',
    path: '/billing',
    message: {
      kind: 'issue',
      title: 'Invoice export failed',
      body: 'The export button did not finish.',
      contact: { email: 'buyer@example.com', consent: true },
      fields: {
        plan: 'pro',
        accessToken: 'do not send',
        returnUrl: 'Open https://example.com/callback?token=secret to debug',
      },
      attachments: [{ name: 'future.png' }],
    },
  });

  assert.equal(feedbackBodies.length, 1);
  assert.equal(feedbackBodies[0].projectKey, 'tm_proj_server_node');
  assert.equal(feedbackBodies[0].source.type, 'server_app');
  assert.equal(feedbackBodies[0].path, '/billing');
  assert.equal(feedbackBodies[0].message.kind, 'issue');
  assert.equal(feedbackBodies[0].message.contact.email, 'buyer@example.com');
  assert.deepEqual(feedbackBodies[0].message.fields, { plan: 'pro' });
  assert.deepEqual(feedbackBodies[0].message.attachments, []);
  assert.equal(JSON.stringify(feedbackBodies[0]).includes('do not send'), false);
  assert.equal(JSON.stringify(feedbackBodies[0]).includes('callback?token'), false);
});

test('uses default user feedback endpoint when capture endpoint cannot derive it', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  try {
    const client = createTraceMindServerClient({
      projectKey: 'tm_proj_server_node',
      endpoint: 'https://collector.example.com/ingest',
    });
    await client.submitFeedback({
      message: { body: 'Feedback from a custom collector.' },
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback');
});

test('derives user feedback endpoint only from capture endpoint paths', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  try {
    const derived = createTraceMindServerClient({
      projectKey: 'tm_proj_server_node',
      endpoint: 'https://collector.example.com/base/api/capture?debug=true',
    });
    const fallback = createTraceMindServerClient({
      projectKey: 'tm_proj_server_node',
      endpoint: 'https://collector.example.com/base/api/capture-v2',
    });
    await derived.submitFeedback({ message: { body: 'Derived endpoint.' } });
    await fallback.submitFeedback({ message: { body: 'Fallback endpoint.' } });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls[0].url, 'https://collector.example.com/base/api/user-feedback');
  assert.equal(calls[1].url, 'https://tracemind.sandbox.galaxycloud.app/api/user-feedback');
});
