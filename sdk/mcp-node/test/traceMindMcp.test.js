const assert = require('node:assert/strict');
const test = require('node:test');
const { createTraceMindMcpClient } = require('../index');

test('wraps MCP tools and records success without raw args or result content', async () => {
  const batches = [];
  const client = createTraceMindMcpClient({
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    endpoint: 'https://tracemind.example/api/capture',
    transport: async (body) => {
      batches.push(body);
      return { ok: true };
    },
    now: () => new Date('2026-05-08T01:00:00.000Z'),
  });

  const wrapped = client.wrapTool('sync_docs', async (request) => ({
    ok: true,
    text: `indexed ${request.arguments.rawPrompt}`,
  }));

  const result = await wrapped({
    userId: 'user_123',
    arguments: {
      rawPrompt: 'do not store',
      token: 'secret',
    },
  });
  await client.flush();

  assert.deepEqual(result, { ok: true, text: 'indexed do not store' });
  assert.equal(batches.length, 1);
  const event = batches[0].events[0];
  assert.equal(event.type, 'tool_call');
  assert.equal(event.eventName, 'mcp_tool_call');
  assert.equal(event.platform, 'server');
  assert.equal(event.source.type, 'mcp_server');
  assert.equal(event.source.key, 'docs-mcp');
  assert.equal(event.userId, 'user_123');
  assert.equal(event.target.type, 'mcp_tool');
  assert.equal(event.target.name, 'sync_docs');
  assert.equal(event.properties.toolName, 'sync_docs');
  assert.equal(event.properties.status, 'success');
  assert.equal(typeof event.properties.durationMs, 'number');
  assert.equal(event.properties.resultSizeBucket, 'small');
  assert.equal(JSON.stringify(event).includes('rawPrompt'), false);
  assert.equal(JSON.stringify(event).includes('do not store'), false);
  assert.match(event.targetHash, /^tm_target_/);
});

test('start patches simple MCP server registration methods', async () => {
  const batches = [];
  const registrations = [];
  const server = {
    tool(name, handler) {
      registrations.push({ name, handler });
    },
  };

  const client = require('../index').TraceMindMCP.start(server, {
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    transport: async (body) => batches.push(body),
  });

  server.tool('sync_docs', async () => ({ ok: true }));
  assert.equal(registrations[0].name, 'sync_docs');

  await registrations[0].handler({});
  await client.flush();

  assert.equal(batches[0].events[0].type, 'tool_call');
  assert.equal(batches[0].events[0].properties.toolName, 'sync_docs');
});

test('wraps MCP tools and preserves handler errors while recording error metadata', async () => {
  const batches = [];
  const client = createTraceMindMcpClient({
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    transport: async (body) => batches.push(body),
  });

  const wrapped = client.wrapTool('sync_docs', async () => {
    throw new TypeError('boom');
  });

  await assert.rejects(() => wrapped({}), /boom/);
  await client.flush();

  const event = batches[0].events[0];
  assert.equal(event.properties.status, 'error');
  assert.equal(event.properties.errorType, 'TypeError');
  assert.equal(JSON.stringify(event).includes('boom'), false);
});

test('default transport rejects and keeps queued events when fetch is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    const client = createTraceMindMcpClient({
      projectKey: 'tm_proj_mcp_node',
      sourceKey: 'docs-mcp',
    });

    const wrapped = client.wrapTool('sync_docs', async () => ({ ok: true }));
    await wrapped({});

    await assert.rejects(
      () => client.flush(),
      /default transport requires global fetch/,
    );
    assert.equal(client.state.queue.length, 1);
    assert.equal(client.state.queue[0].eventName, 'mcp_tool_call');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('captures manual custom events with sanitized primitive properties and context', async () => {
  const batches = [];
  const client = createTraceMindMcpClient({
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    transport: async (body) => batches.push(body),
  });

  client.capture('custom', {
    eventName: 'document_indexed',
    userId: 'user_123',
    properties: {
      documentCount: 12,
      success: true,
      ratio: 1.5,
      raw_args: 'do not store',
      rawResult: 'do not store',
      resource_content: 'do not store',
      email: 'contact@example.com',
      infinite: Infinity,
      nested: { value: true },
    },
    context: {
      toolName: 'sync_docs',
      retry: false,
      returnUrl: 'https://example.com/callback?token=secret',
    },
  });
  await client.flush();

  const event = batches[0].events[0];
  assert.equal(event.type, 'custom');
  assert.equal(event.eventName, 'document_indexed');
  assert.deepEqual(event.properties, { documentCount: 12, success: true, ratio: 1.5 });
  assert.deepEqual(event.context, { toolName: 'sync_docs', retry: false });
});

test('wraps resource and prompt handlers with safe metadata', async () => {
  const batches = [];
  const client = createTraceMindMcpClient({
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    transport: async (body) => batches.push(body),
  });

  const resource = client.wrapResource('docs', 'file:///tmp/private.txt?token=secret', async () => 'secret content');
  const prompt = client.wrapPrompt('summarize', async () => ({ messages: [{ role: 'user', content: 'private prompt' }] }));

  await resource({});
  await prompt({});
  await client.flush();

  const [resourceEvent, promptEvent] = batches[0].events;
  assert.equal(resourceEvent.type, 'resource_read');
  assert.equal(resourceEvent.eventName, 'mcp_resource_read');
  assert.equal(resourceEvent.properties.uriScheme, 'file');
  assert.equal(JSON.stringify(resourceEvent).includes('/tmp/private.txt'), false);
  assert.equal(JSON.stringify(resourceEvent).includes('secret content'), false);
  assert.equal(promptEvent.type, 'prompt_request');
  assert.equal(promptEvent.eventName, 'mcp_prompt_request');
  assert.equal(promptEvent.properties.promptName, 'summarize');
  assert.equal(JSON.stringify(promptEvent).includes('private prompt'), false);
});

test('records optional agent skill lifecycle events', async () => {
  const batches = [];
  const client = createTraceMindMcpClient({
    projectKey: 'tm_proj_mcp_node',
    sourceKey: 'docs-mcp',
    transport: async (body) => batches.push(body),
  });

  client.captureSkillLifecycle({
    skillName: 'docs-indexer',
    version: '1.2.0',
    phase: 'completed',
    success: true,
  });
  await client.flush();

  const event = batches[0].events[0];
  assert.equal(event.type, 'skill_lifecycle');
  assert.equal(event.eventName, 'agent_skill_lifecycle');
  assert.equal(event.source.type, 'agent_skill');
  assert.equal(event.source.key, 'docs-indexer');
  assert.deepEqual(event.target, { type: 'agent_skill', name: 'docs-indexer', version: '1.2.0' });
  assert.equal(event.properties.phase, 'completed');
  assert.equal(event.properties.success, true);
});
