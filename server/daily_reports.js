import crypto from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import {
  CaptureDeliveryReports,
  DAILY_REPORT_DRAFT_MIN_REFRESH_MS,
  DAILY_REPORT_TIMEZONE,
  Developers,
  HEALTH_RETENTION_DAYS,
  PresenceSessions,
  ProjectDailyReports,
  Projects,
  RawBehaviors,
  SemanticEvents,
  summarizeCaptureDelivery,
  summarizeProjectHealthForWindow,
  summarizeProjectHealthFromDailyReports,
} from '/imports/api/tracemind';

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const ACTOR_SET_VERSION = 1;
const FINAL_REPORT_INTERVAL_MS = 60 * 60 * 1000;

function parseReportDate(reportDate) {
  const match = String(reportDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function reportDateForDate(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return reportDateForDate(new Date());
  return new Date(date.getTime() + REPORT_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function reportDateBounds(reportDate) {
  const parsed = parseReportDate(reportDate);
  if (!parsed) throw new Meteor.Error('invalid-report-date', 'Report date must use YYYY-MM-DD.');
  const startMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day) - REPORT_TZ_OFFSET_MS;
  return {
    startAt: new Date(startMs),
    endAt: new Date(startMs + DAY_MS),
  };
}

function addReportDays(reportDate, days) {
  const { startAt } = reportDateBounds(reportDate);
  return reportDateForDate(new Date(startAt.getTime() + days * DAY_MS));
}

function actorIdForEvent(event = {}) {
  return event.userId || event.anonymousId || event.deviceId || event.deviceFingerprint || '';
}

function actorIdForPresence(session = {}) {
  return session.userId || session.anonymousId || session.deviceId || session.deviceFingerprint || '';
}

function actorHashSecret() {
  return String(
    Meteor.settings?.private?.ACTOR_HASH_SECRET
      || process.env.TRACEMIND_ACTOR_HASH_SECRET
      || 'tracemind-daily-report-actor-set-v1',
  );
}

function actorKey(projectId, actorId) {
  if (!actorId) return '';
  return crypto
    .createHmac('sha256', actorHashSecret())
    .update(`${projectId}\0${actorId}`)
    .digest('hex');
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function activeActorKeysFor(projectId, events = [], sessions = []) {
  return uniqueSorted([
    ...events.map((event) => actorKey(projectId, actorIdForEvent(event))),
    ...sessions.map((session) => actorKey(projectId, actorIdForPresence(session))),
  ]);
}

async function previousActorKeys(projectId, reportDate) {
  const reports = await ProjectDailyReports.find(
    { projectId, reportDate: { $lt: reportDate } },
    { fields: { activeActorKeys: 1 } },
  ).fetchAsync();
  return new Set(reports.flatMap((report) => report.activeActorKeys || []));
}

function intersect(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

async function loadDayEvents(projectId, startAt, endAt) {
  return SemanticEvents.find(
    { projectId, occurredAt: { $gte: startAt, $lt: endAt } },
    { sort: { occurredAt: -1 } },
  ).fetchAsync();
}

async function loadDayPresenceSessions(projectId, startAt, endAt) {
  return PresenceSessions.find(
    {
      projectId,
      startedAt: { $lt: endAt },
      $or: [
        { endedAt: { $gte: startAt } },
        { lastSeenAt: { $gte: startAt } },
        { endedAt: { $exists: false }, lastSeenAt: { $exists: false } },
      ],
    },
    { sort: { lastSeenAt: -1 } },
  ).fetchAsync();
}

async function loadDayDeliveryReports(projectId, startAt, endAt) {
  return CaptureDeliveryReports.find(
    { projectId, createdAt: { $gte: startAt, $lt: endAt } },
    { sort: { createdAt: -1 } },
  ).fetchAsync();
}

export async function computeProjectDailyReport(projectId, reportDateInput, { final = false, force = false, now = new Date() } = {}) {
  const reportDate = reportDateInput || reportDateForDate(now);
  const existing = await ProjectDailyReports.findOneAsync({ projectId, reportDate });
  if (existing?.status === 'final' && final && !force) return existing;

  const { startAt, endAt } = reportDateBounds(reportDate);
  const computedAt = new Date(now);
  const sourceEndAt = final ? endAt : new Date(Math.min(computedAt.getTime(), endAt.getTime()));
  const events = await loadDayEvents(projectId, startAt, sourceEndAt);
  const presenceSessions = await loadDayPresenceSessions(projectId, startAt, sourceEndAt);
  const deliveryReports = await loadDayDeliveryReports(projectId, startAt, sourceEndAt);
  const activeActorKeys = activeActorKeysFor(projectId, events, presenceSessions);
  const seenBefore = await previousActorKeys(projectId, reportDate);
  const newActorKeys = activeActorKeys.filter((key) => !seenBefore.has(key));
  const current = summarizeProjectHealthForWindow({
    events,
    presenceSessions,
    currentStart: startAt,
    currentEnd: sourceEndAt,
    previousStart: new Date(startAt.getTime() - DAY_MS),
    previousEnd: startAt,
    now: sourceEndAt,
    newUsers: newActorKeys.length,
  }).current;
  const report = {
    projectId,
    reportDate,
    timezone: DAILY_REPORT_TIMEZONE,
    status: final ? 'final' : 'draft',
    computedAt,
    sourceWindow: {
      startAt,
      endAt: sourceEndAt,
      fullEndAt: endAt,
    },
    actorSetVersion: ACTOR_SET_VERSION,
    activeActorKeys,
    newActorKeys,
    firstSeenActorKeys: newActorKeys,
    current: {
      ...current,
      newUsers: newActorKeys.length,
    },
    delivery: summarizeCaptureDelivery(deliveryReports),
    updatedAt: computedAt,
  };

  await ProjectDailyReports.updateAsync(
    { projectId, reportDate },
    {
      $set: report,
      $setOnInsert: { createdAt: computedAt },
    },
    { upsert: true },
  );

  return ProjectDailyReports.findOneAsync({ projectId, reportDate });
}

async function ensureReport(projectId, reportDate, { now = new Date(), final = true } = {}) {
  const existing = await ProjectDailyReports.findOneAsync({ projectId, reportDate });
  if (existing?.status === 'final') return existing;
  if (existing && !final) return existing;
  return computeProjectDailyReport(projectId, reportDate, { final, now });
}

async function resolveCurrentReport(projectId, reportDate, now) {
  const today = reportDateForDate(now);
  const existing = await ProjectDailyReports.findOneAsync({ projectId, reportDate });
  if (reportDate === today) {
    if (existing?.computedAt && now.getTime() - new Date(existing.computedAt).getTime() < DAILY_REPORT_DRAFT_MIN_REFRESH_MS) {
      return existing;
    }
    return computeProjectDailyReport(projectId, reportDate, { final: false, now, force: true });
  }
  return ensureReport(projectId, reportDate, { now, final: true });
}

async function retentionFor(projectId, reportDate, activeActorKeys, now) {
  const retention = {};

  for (const day of HEALTH_RETENTION_DAYS) {
    const cohortDate = addReportDays(reportDate, -day);
    const cohortReport = await ensureReport(projectId, cohortDate, { now, final: true });
    const cohortActors = cohortReport?.newActorKeys || [];
    const retainedUsers = intersect(cohortActors, activeActorKeys).length;
    retention[`d${day}`] = {
      sampleSize: cohortActors.length,
      retainedUsers,
      rate: cohortActors.length ? retainedUsers / cohortActors.length : null,
    };
  }

  return retention;
}

export async function resolveProjectDailyHealth(projectId, reportDateInput, { now = new Date() } = {}) {
  const reportDate = reportDateInput || reportDateForDate(now);
  const previousReportDate = addReportDays(reportDate, -1);
  await ensureReport(projectId, previousReportDate, { now, final: true });
  for (const day of HEALTH_RETENTION_DAYS) {
    await ensureReport(projectId, addReportDays(reportDate, -day), { now, final: true });
  }
  const report = await resolveCurrentReport(projectId, reportDate, now);
  const previousReport = await ProjectDailyReports.findOneAsync({ projectId, reportDate: previousReportDate });
  const retention = await retentionFor(projectId, reportDate, report?.activeActorKeys || [], now);
  const health = summarizeProjectHealthFromDailyReports({
    currentReport: report,
    previousReport,
    retention,
  });

  return { report, previousReport, health };
}

export async function ensureTraceMindIndexes() {
  await Promise.all([
    ProjectDailyReports.rawCollection().createIndex({ projectId: 1, reportDate: 1 }, { unique: true }),
    Projects.rawCollection().createIndex({ projectKey: 1 }, { unique: true, name: 'project_key_unique' }),
    Projects.rawCollection().createIndex(
      { 'mcpTokens.token': 1 },
      {
        unique: true,
        name: 'mcp_token_unique',
        partialFilterExpression: { 'mcpTokens.token': { $type: 'string' } },
      },
    ),
    Projects.rawCollection().createIndex({ developerId: 1, createdAt: 1 }, { name: 'developer_projects_created' }),
    Developers.rawCollection().createIndex({ userId: 1 }, { unique: true, sparse: true, name: 'developer_user_unique' }),
    Developers.rawCollection().createIndex({ email: 1 }, { unique: true, sparse: true, name: 'developer_email_unique' }),
    Developers.rawCollection().createIndex({ authToken: 1 }, { unique: true, sparse: true, name: 'developer_auth_token_unique' }),
    SemanticEvents.rawCollection().createIndex({ projectId: 1, occurredAt: -1 }),
    SemanticEvents.rawCollection().createIndex({ projectId: 1, eventName: 1, occurredAt: -1 }, { name: 'semantic_project_event_name_time' }),
    SemanticEvents.rawCollection().createIndex({ projectId: 1, eventType: 1, occurredAt: -1 }, { name: 'semantic_project_event_type_time' }),
    SemanticEvents.rawCollection().createIndex({ projectId: 1, actionKey: 1, occurredAt: -1 }, { name: 'semantic_project_action_time' }),
    SemanticEvents.rawCollection().createIndex({ projectId: 1, targetHash: 1, occurredAt: -1 }, { name: 'semantic_project_target_time' }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, presenceId: 1 }, { unique: true, name: 'presence_project_presence_unique' }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, startedAt: -1 }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, lastSeenAt: -1 }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, occurredAt: -1 }),
    RawBehaviors.rawCollection().createIndex({ semanticStatus: 1, createdAt: 1 }, { name: 'raw_semantic_queue' }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, actionKey: 1, occurredAt: -1 }, { name: 'raw_project_action_time' }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, targetHash: 1, occurredAt: -1 }, { name: 'raw_project_target_time' }),
    CaptureDeliveryReports.rawCollection().createIndex({ projectId: 1, createdAt: -1 }),
  ]);
}

export async function computeFinalReportsForYesterday(now = new Date()) {
  const reportDate = addReportDays(reportDateForDate(now), -1);
  const projects = await Projects.find({}, { fields: { _id: 1 } }).fetchAsync();
  for (const project of projects) {
    await computeProjectDailyReport(project._id, reportDate, { final: true, now });
  }
  return projects.length;
}

export function startDailyReportJob() {
  Meteor.setInterval(() => {
    computeFinalReportsForYesterday().catch((error) => {
      console.error('[TraceMind] daily report finalization failed', error);
    });
  }, FINAL_REPORT_INTERVAL_MS);
}
