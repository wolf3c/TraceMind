import crypto from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import {
  CaptureDeliveryReports,
  DAILY_REPORT_DRAFT_MIN_REFRESH_MS,
  DAILY_REPORT_TIMEZONE,
  Developers,
  FeedbackReports,
  HEALTH_RETENTION_DAYS,
  HEALTH_ROLLUP_HOUR_MS,
  PresenceSessions,
  ProjectDailyReports,
  ProjectHourlyReports,
  ProductUsageMarkers,
  Projects,
  RawBehaviors,
  SemanticEvents,
  UserFeedbackReports,
  aggregateProjectHealthHourlyReports,
  buildProjectHealthHourlyComparison,
  summarizeCaptureDelivery,
  summarizeProjectHealthRollupForWindow,
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

function sessionIdForPresence(session = {}) {
  return session.sessionId || session.presenceId || '';
}

function sessionKeysFor(projectId, sessions = []) {
  return uniqueSorted(sessions.map((session) => actorKey(projectId, sessionIdForPresence(session))));
}

function hourStartForDate(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return hourStartForDate(new Date());
  return new Date(Math.floor(date.getTime() / HEALTH_ROLLUP_HOUR_MS) * HEALTH_ROLLUP_HOUR_MS);
}

function hourKeyForDate(value = new Date()) {
  return hourStartForDate(value).toISOString();
}

function completedReportEnd(startAt, endAt, { final = false, now = new Date() } = {}) {
  if (final) return endAt;
  const completedHour = hourStartForDate(now);
  return new Date(Math.min(Math.max(startAt.getTime(), completedHour.getTime()), endAt.getTime()));
}

function hourStartsBetween(startAt, endAt) {
  const starts = [];
  for (let time = startAt.getTime(); time < endAt.getTime(); time += HEALTH_ROLLUP_HOUR_MS) {
    starts.push(new Date(time));
  }
  return starts;
}

function reportPercentChange(current, previous) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function trendsFor(current = {}, previous = {}) {
  return {
    activeUsers: reportPercentChange(current.activeUsers, previous.activeUsers),
    sessions: reportPercentChange(current.sessionCount, previous.sessionCount),
    averageActiveDuration: reportPercentChange(current.averageActiveDurationMs, previous.averageActiveDurationMs),
    events: reportPercentChange(current.eventCount, previous.eventCount),
  };
}

function emptyRetention() {
  return Object.fromEntries(
    HEALTH_RETENTION_DAYS.map((day) => [`d${day}`, { sampleSize: 0, retainedUsers: 0, rate: null }]),
  );
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

async function retentionForExistingReports(projectId, reportDate, activeActorKeys = []) {
  const cohortDates = HEALTH_RETENTION_DAYS.map((day) => addReportDays(reportDate, -day));
  const cohortReports = await ProjectDailyReports.find(
    { projectId, reportDate: { $in: cohortDates } },
    { fields: { reportDate: 1, newActorKeys: 1 } },
  ).fetchAsync();
  const reportsByDate = new Map(cohortReports.map((report) => [report.reportDate, report]));

  return Object.fromEntries(
    HEALTH_RETENTION_DAYS.map((day) => {
      const cohortActors = reportsByDate.get(addReportDays(reportDate, -day))?.newActorKeys || [];
      const retainedUsers = intersect(cohortActors, activeActorKeys).length;
      return [`d${day}`, {
        sampleSize: cohortActors.length,
        retainedUsers,
        rate: cohortActors.length ? retainedUsers / cohortActors.length : null,
      }];
    }),
  );
}

export async function computeProjectHourlyReport(projectId, hourStartInput, { force = false, now = new Date() } = {}) {
  const hourStartAt = hourStartForDate(hourStartInput);
  const hourEndAt = new Date(hourStartAt.getTime() + HEALTH_ROLLUP_HOUR_MS);
  const hourKey = hourKeyForDate(hourStartAt);
  const existing = await ProjectHourlyReports.findOneAsync({ projectId, hourKey });
  if (existing && !force) return existing;

  const computedAt = new Date(now);
  const events = await loadDayEvents(projectId, hourStartAt, hourEndAt);
  const presenceSessions = await loadDayPresenceSessions(projectId, hourStartAt, hourEndAt);
  const deliveryReports = await loadDayDeliveryReports(projectId, hourStartAt, hourEndAt);
  const activeActorKeys = activeActorKeysFor(projectId, events, presenceSessions);
  const sessionKeys = sessionKeysFor(projectId, presenceSessions);
  const summary = summarizeProjectHealthRollupForWindow({
    events,
    presenceSessions,
    currentStart: hourStartAt,
    currentEnd: hourEndAt,
    now: hourEndAt,
  });
  const { rollup, ...current } = summary;
  current.activeUsers = activeActorKeys.length;
  current.sessionCount = sessionKeys.length;

  const report = {
    projectId,
    hourKey,
    hourStartAt,
    hourEndAt,
    timezone: DAILY_REPORT_TIMEZONE,
    status: 'final',
    computedAt,
    sourceWindow: {
      startAt: hourStartAt,
      endAt: hourEndAt,
    },
    actorSetVersion: ACTOR_SET_VERSION,
    activeActorKeys,
    sessionKeys,
    current,
    rollup,
    delivery: summarizeCaptureDelivery(deliveryReports),
    updatedAt: computedAt,
  };

  await ProjectHourlyReports.updateAsync(
    { projectId, hourKey },
    {
      $set: report,
      $setOnInsert: { createdAt: computedAt },
    },
    { upsert: true },
  );

  return ProjectHourlyReports.findOneAsync({ projectId, hourKey });
}

async function ensureHourlyReports(projectId, startAt, endAt, { force = false, now = new Date() } = {}) {
  return Promise.all(
    hourStartsBetween(startAt, endAt).map((hourStartAt) => (
      computeProjectHourlyReport(projectId, hourStartAt, { force, now })
    )),
  );
}

export async function computeProjectDailyReport(projectId, reportDateInput, { final = false, force = false, now = new Date() } = {}) {
  const reportDate = reportDateInput || reportDateForDate(now);
  const previousReportDate = addReportDays(reportDate, -1);
  const existing = await ProjectDailyReports.findOneAsync({ projectId, reportDate });
  if (existing?.status === 'final' && final && !force) return existing;

  const { startAt, endAt } = reportDateBounds(reportDate);
  const computedAt = new Date(now);
  const sourceEndAt = completedReportEnd(startAt, endAt, { final, now: computedAt });
  const comparisonDurationMs = Math.max(0, sourceEndAt.getTime() - startAt.getTime());
  const previousStartAt = new Date(startAt.getTime() - DAY_MS);
  const previousEndAt = new Date(previousStartAt.getTime() + comparisonDurationMs);
  const [currentHourlyReports, previousHourlyReports, deliveryReports] = await Promise.all([
    ensureHourlyReports(projectId, startAt, sourceEndAt, { force: true, now: computedAt }),
    ensureHourlyReports(projectId, previousStartAt, previousEndAt, { force, now: computedAt }),
    loadDayDeliveryReports(projectId, startAt, sourceEndAt),
  ]);
  const currentAggregate = aggregateProjectHealthHourlyReports(currentHourlyReports);
  const previousAggregate = aggregateProjectHealthHourlyReports(previousHourlyReports);
  const activeActorKeys = currentAggregate.activeActorKeys;
  const seenBefore = await previousActorKeys(projectId, reportDate);
  const newActorKeys = activeActorKeys.filter((key) => !seenBefore.has(key));
  const retention = await retentionForExistingReports(projectId, reportDate, activeActorKeys);
  const current = {
    ...currentAggregate.current,
    newUsers: newActorKeys.length,
    retention,
  };
  const previous = previousAggregate.current;
  const trends = trendsFor(current, previous);
  const currentHourCount = currentHourlyReports.length;
  const previousHourCount = previousHourlyReports.length;
  const comparisonMode = sourceEndAt.getTime() < endAt.getTime() ? 'completed_hours' : 'full_day';
  const report = {
    projectId,
    reportDate,
    previousReportDate,
    timezone: DAILY_REPORT_TIMEZONE,
    status: final ? 'final' : 'draft',
    computedAt,
    sourceWindow: {
      startAt,
      endAt: sourceEndAt,
      fullEndAt: endAt,
    },
    comparisonWindow: {
      granularity: 'hour_rollup',
      mode: comparisonMode,
      currentStartAt: startAt,
      currentEndAt: sourceEndAt,
      previousStartAt,
      previousEndAt,
      currentHourCount,
      previousHourCount,
    },
    actorSetVersion: ACTOR_SET_VERSION,
    activeActorKeys,
    sessionKeys: currentAggregate.sessionKeys,
    newActorKeys,
    firstSeenActorKeys: newActorKeys,
    current,
    previous,
    trends,
    hourlyComparison: buildProjectHealthHourlyComparison(currentHourlyReports, previousHourlyReports, {
      comparisonMode,
    }),
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

export async function resolveProjectDailyHealth(projectId, reportDateInput, { now = new Date() } = {}) {
  const reportDate = reportDateInput || reportDateForDate(now);
  const previousReportDate = addReportDays(reportDate, -1);
  const report = await ProjectDailyReports.findOneAsync({ projectId, reportDate });
  const previousReport = await ProjectDailyReports.findOneAsync({ projectId, reportDate: previousReportDate });
  const retention = report?.current?.retention || emptyRetention();
  const health = summarizeProjectHealthFromDailyReports({
    currentReport: report,
    previousReport,
    retention,
  });

  return { report, previousReport, health };
}

export function queueProjectDailyHealthRefresh(projectId, reportDateInput, { now = new Date() } = {}) {
  const reportDate = reportDateInput || reportDateForDate(now);
  const today = reportDateForDate(now);
  if (reportDate !== today) return false;

  Meteor.defer(() => {
    resolveCurrentReport(projectId, reportDate, new Date()).catch((error) => {
      console.error('[TraceMind] daily report draft refresh failed', error);
    });
  });

  return true;
}

export async function ensureTraceMindIndexes() {
  await Promise.all([
    ProjectDailyReports.rawCollection().createIndex({ projectId: 1, reportDate: 1 }, { unique: true }),
    ProjectHourlyReports.rawCollection().createIndex({ projectId: 1, hourKey: 1 }, { unique: true, name: 'project_hour_unique' }),
    ProjectHourlyReports.rawCollection().createIndex({ projectId: 1, hourStartAt: 1 }),
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
    SemanticEvents.rawCollection().createIndex({ projectId: 1, 'attribution.source': 1, occurredAt: -1 }, { name: 'semantic_project_attribution_source_time' }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, presenceId: 1 }, { unique: true, name: 'presence_project_presence_unique' }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, startedAt: -1 }),
    PresenceSessions.rawCollection().createIndex({ projectId: 1, lastSeenAt: -1 }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, occurredAt: -1 }),
    RawBehaviors.rawCollection().createIndex({ semanticStatus: 1, createdAt: 1 }, { name: 'raw_semantic_queue' }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, actionKey: 1, occurredAt: -1 }, { name: 'raw_project_action_time' }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, targetHash: 1, occurredAt: -1 }, { name: 'raw_project_target_time' }),
    RawBehaviors.rawCollection().createIndex({ projectId: 1, 'attribution.source': 1, occurredAt: -1 }, { name: 'raw_project_attribution_source_time' }),
    CaptureDeliveryReports.rawCollection().createIndex({ projectId: 1, createdAt: -1 }),
    FeedbackReports.rawCollection().createIndex(
      { projectId: 1, mcpTokenId: 1, feedbackFingerprint: 1, createdAt: -1 },
      { name: 'feedback_project_token_fingerprint_time' },
    ),
    FeedbackReports.rawCollection().createIndex(
      { projectId: 1, mcpTokenId: 1, createdAt: -1 },
      { name: 'feedback_project_token_time' },
    ),
    UserFeedbackReports.rawCollection().createIndex(
      { projectId: 1, status: 1, createdAt: -1 },
      { name: 'user_feedback_project_status_time' },
    ),
    UserFeedbackReports.rawCollection().createIndex(
      { projectId: 1, 'message.kind': 1, createdAt: -1 },
      { name: 'user_feedback_project_kind_time' },
    ),
    UserFeedbackReports.rawCollection().createIndex(
      { projectId: 1, actorKey: 1, createdAt: -1 },
      { name: 'user_feedback_project_actor_time' },
    ),
    UserFeedbackReports.rawCollection().createIndex(
      { projectId: 1, actorKey: 1, feedbackFingerprint: 1, createdAt: -1 },
      { name: 'user_feedback_project_fingerprint_time' },
    ),
    UserFeedbackReports.rawCollection().createIndex(
      { projectId: 1, rateKeys: 1, createdAt: -1 },
      { name: 'user_feedback_project_rate_keys_time' },
    ),
    ProductUsageMarkers.rawCollection().createIndex(
      { projectId: 1, reportDate: 1 },
      { unique: true, name: 'product_usage_project_day_unique' },
    ),
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
