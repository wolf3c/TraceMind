import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { buildSemanticEvent, summarizeSemanticEvents } from '../imports/api/semantic';
import {
  Developers,
  Projects,
  SemanticEvents,
  buildEventQuery,
  normalizeEmail,
} from '../imports/api/tracemind';

describe('TraceMind', function () {
  it('normalizes developer emails', function () {
    assert.strictEqual(normalizeEmail('  Founder@Example.COM  '), 'founder@example.com');
  });

  it('turns click behavior into a semantic event', function () {
    const event = buildSemanticEvent({
      _id: 'raw-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      type: 'click',
      path: '/pricing',
      targetText: 'Start trial',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.title, '点击了 "Start trial"');
    assert.strictEqual(event.meaning, '用户在 /pricing 点击了 "Start trial"。');
    assert.strictEqual(event.rawBehaviorId, 'raw-1');
  });

  it('keeps identity, device, geo, and custom fields on semantic events', function () {
    const event = buildSemanticEvent({
      _id: 'raw-identity',
      projectId: 'project-1',
      sessionId: 'session-1',
      anonymousId: 'anon-1',
      userId: 'user-1',
      deviceId: 'device-1',
      deviceFingerprint: 'fp-1',
      platform: 'web',
      deviceInfo: { browser: 'Chrome', os: 'macOS' },
      ip: '203.0.113.10',
      geo: { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' },
      type: 'custom',
      eventName: 'plan_selected',
      path: '/pricing',
      properties: { plan: 'pro', amount: 29 },
      context: { source: 'manual' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.userId, 'user-1');
    assert.strictEqual(event.anonymousId, 'anon-1');
    assert.strictEqual(event.deviceId, 'device-1');
    assert.strictEqual(event.deviceFingerprint, 'fp-1');
    assert.strictEqual(event.platform, 'web');
    assert.deepStrictEqual(event.deviceInfo, { browser: 'Chrome', os: 'macOS' });
    assert.deepStrictEqual(event.geo, { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' });
    assert.strictEqual(event.eventName, 'plan_selected');
    assert.deepStrictEqual(event.properties, { plan: 'pro', amount: 29 });
    assert.deepStrictEqual(event.context, { source: 'manual' });
  });

  it('summarizes semantic event counts and paths', function () {
    const summary = summarizeSemanticEvents([
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { eventType: 'page_view', path: '/', anonymousId: 'anon-1', deviceFingerprint: 'fp-1', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ]);

    assert.deepStrictEqual(summary.topEvents[0], { eventType: 'click', count: 2 });
    assert.deepStrictEqual(summary.topPaths[0], { path: '/pricing', count: 2 });
    assert.strictEqual(summary.uniqueUsers, 2);
    assert.strictEqual(summary.uniqueDevices, 2);
    assert.deepStrictEqual(summary.dailyActiveUsers[0], { date: '2026-05-06', count: 2 });
  });

  if (Meteor.isServer) {
    before(async function () {
      await import('../server/tracemind_methods');
    });

    it('creates TraceMind developer data from a Meteor Accounts user', async function () {
      const email = `founder-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      const result = await dashboardMethod.apply({ userId }, []);

      const developer = await Developers.findOneAsync({ userId });
      const project = await Projects.findOneAsync({ developerId: developer._id });

      assert.strictEqual(result.developer.email, email);
      assert.ok(result.developer.authToken.startsWith('tm_dev_'));
      assert.strictEqual(result.projects.length, 1);
      assert.strictEqual(result.summary.totalEvents, 0);
      assert.ok(result.projects[0].projectKey.startsWith('tm_proj_'));
      assert.strictEqual(project._id, result.projects[0]._id);
    });

    it('requires a Meteor Accounts session for the dashboard', async function () {
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      await assert.rejects(
        () => dashboardMethod.apply({}, []),
        /Login is required/,
      );
    });

    it('queries semantic events by time, event name, and user id', async function () {
      const projectId = `project-query-${Date.now()}`;
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_started',
        userId: 'user-a',
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_finished',
        userId: 'user-b',
        occurredAt: new Date('2026-05-02T10:00:00.000Z'),
        createdAt: new Date(),
      });

      const events = await SemanticEvents.find(
        buildEventQuery(projectId, {
          eventName: 'checkout_started',
          userId: 'user-a',
          startAt: '2026-05-01T00:00:00.000Z',
          endAt: '2026-05-01T23:59:59.999Z',
        }),
      ).fetchAsync();

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].eventName, 'checkout_started');
      assert.strictEqual(events[0].userId, 'user-a');
    });
  }
});
