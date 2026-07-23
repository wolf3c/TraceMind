export const RUNTIME_CONTEXT_SCHEMA_VERSION = 1;
export const DELIVERY_RECOVERY_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const LIFECYCLE_STATES = ['foreground', 'background', 'unknown'];
const CONNECTIVITY_STATES = ['online', 'offline', 'unknown'];
const LIFECYCLE_EVIDENCE = ['document_visibility', 'app_lifecycle', 'runtime_default', 'unknown'];
const CONNECTIVITY_EVIDENCE = ['platform_connectivity', 'transport_success', 'transport_failure', 'unknown'];
const EVIDENCE_CONFIDENCE = ['high', 'medium', 'low', 'unknown'];
const DELIVERY_FAILURE_TRIGGERS = ['transport_failure', 'platform_offline'];
const DELIVERY_EVIDENCE_FLAGS = [
  'visibility_observed',
  'platform_online',
  'platform_offline',
  'transport_failed',
  'transport_succeeded',
  'page_hidden',
  'page_shown',
  'page_frozen',
  'page_resumed',
  'page_discarded',
  'new_runtime',
  'clock_anomaly',
];
const DELIVERY_DURATION_FIELDS = [
  'foregroundOnlineMs',
  'foregroundOfflineMs',
  'backgroundOnlineMs',
  'backgroundOfflineMs',
  'runtimeAbsentMs',
  'unknownMs',
];

export const RUNTIME_LIFECYCLE_STATES = new Set(LIFECYCLE_STATES);
export const RUNTIME_CONNECTIVITY_STATES = new Set(CONNECTIVITY_STATES);
export const RUNTIME_LIFECYCLE_EVIDENCE = new Set(LIFECYCLE_EVIDENCE);
export const RUNTIME_CONNECTIVITY_EVIDENCE = new Set(CONNECTIVITY_EVIDENCE);
export const RUNTIME_EVIDENCE_CONFIDENCE = new Set(EVIDENCE_CONFIDENCE);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(text) ? text : '';
}

function enumValue(value, allowed) {
  const text = typeof value === 'string' ? value : '';
  return allowed.includes(text) ? text : '';
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoDate(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function lifecycleEvidenceIsConsistent(state, evidence, confidence) {
  if (evidence === 'document_visibility') {
    return ['foreground', 'background'].includes(state) && confidence === 'high';
  }
  if (evidence === 'app_lifecycle') {
    return ['foreground', 'background'].includes(state) && ['high', 'medium'].includes(confidence);
  }
  if (evidence === 'runtime_default') {
    return confidence === 'low';
  }
  return state === 'unknown' && confidence === 'unknown';
}

function connectivityEvidenceIsConsistent(state, evidence, confidence) {
  if (evidence === 'platform_connectivity') {
    return (state === 'online' && confidence === 'low')
      || (state === 'offline' && confidence === 'medium');
  }
  if (evidence === 'transport_success') {
    return state === 'online' && confidence === 'high';
  }
  if (evidence === 'transport_failure') {
    return state === 'unknown' && confidence === 'low';
  }
  return state === 'unknown' && confidence === 'unknown';
}

export function sanitizeRuntimeContext(value) {
  if (!plainObject(value) || value.schemaVersion !== RUNTIME_CONTEXT_SCHEMA_VERSION) return null;

  const runtimeInstanceId = boundedId(value.runtimeInstanceId);
  const sequence = nonNegativeInteger(value.sequence);
  const lifecycleState = enumValue(value.lifecycleState, LIFECYCLE_STATES);
  const connectivityState = enumValue(value.connectivityState, CONNECTIVITY_STATES);
  const lifecycleEvidence = enumValue(value.lifecycleEvidence, LIFECYCLE_EVIDENCE);
  const connectivityEvidence = enumValue(value.connectivityEvidence, CONNECTIVITY_EVIDENCE);
  const lifecycleConfidence = enumValue(value.lifecycleConfidence, EVIDENCE_CONFIDENCE);
  const connectivityConfidence = enumValue(value.connectivityConfidence, EVIDENCE_CONFIDENCE);

  if (
    !runtimeInstanceId
    || sequence === null
    || !lifecycleState
    || !connectivityState
    || !lifecycleEvidence
    || !connectivityEvidence
    || !lifecycleConfidence
    || !connectivityConfidence
    || !lifecycleEvidenceIsConsistent(lifecycleState, lifecycleEvidence, lifecycleConfidence)
    || !connectivityEvidenceIsConsistent(connectivityState, connectivityEvidence, connectivityConfidence)
  ) {
    return null;
  }

  return {
    schemaVersion: RUNTIME_CONTEXT_SCHEMA_VERSION,
    runtimeInstanceId,
    sequence,
    lifecycleState,
    connectivityState,
    lifecycleEvidence,
    connectivityEvidence,
    lifecycleConfidence,
    connectivityConfidence,
  };
}

export function publicRuntimeContext(value) {
  const context = sanitizeRuntimeContext(value);
  if (!context) return null;
  const { runtimeInstanceId: _runtimeInstanceId, ...publicContext } = context;
  return publicContext;
}

export function sanitizeDeliveryRecoveryEpisode(value) {
  if (!plainObject(value) || value.schemaVersion !== RUNTIME_CONTEXT_SCHEMA_VERSION) return null;

  const episodeId = boundedId(value.episodeId);
  const originRuntimeInstanceId = boundedId(value.originRuntimeInstanceId);
  const currentRuntimeInstanceId = boundedId(value.currentRuntimeInstanceId);
  const startedAt = isoDate(value.startedAt);
  const lastObservedAt = isoDate(value.lastObservedAt);
  const totalDurationMs = nonNegativeInteger(value.totalDurationMs);
  const failureTrigger = enumValue(value.failureTrigger, DELIVERY_FAILURE_TRIGGERS);
  const recoveredInNewRuntime = typeof value.recoveredInNewRuntime === 'boolean'
    ? value.recoveredInNewRuntime
    : null;
  const evidenceFlags = Array.isArray(value.evidenceFlags)
    ? [...new Set(value.evidenceFlags)]
    : [];
  const durations = Object.fromEntries(
    DELIVERY_DURATION_FIELDS.map((field) => [field, nonNegativeInteger(value[field])]),
  );

  if (
    !episodeId
    || !originRuntimeInstanceId
    || !currentRuntimeInstanceId
    || !startedAt
    || !lastObservedAt
    || totalDurationMs === null
    || totalDurationMs > DELIVERY_RECOVERY_MAX_DURATION_MS
    || !failureTrigger
    || recoveredInNewRuntime === null
    || Object.values(durations).some((duration) => duration === null)
    || evidenceFlags.some((flag) => !DELIVERY_EVIDENCE_FLAGS.includes(flag))
  ) {
    return null;
  }

  const startedTime = new Date(startedAt).getTime();
  const lastObservedTime = new Date(lastObservedAt).getTime();
  if (lastObservedTime < startedTime || lastObservedTime > Date.now()) return null;

  const composedDurationMs = Object.values(durations).reduce((sum, duration) => sum + duration, 0);
  if (composedDurationMs !== totalDurationMs || lastObservedTime - startedTime !== totalDurationMs) return null;

  const runtimeChanged = originRuntimeInstanceId !== currentRuntimeInstanceId;
  const hasNewRuntimeFlag = evidenceFlags.includes('new_runtime');
  if (
    recoveredInNewRuntime !== runtimeChanged
    || (runtimeChanged && (durations.runtimeAbsentMs <= 0 || !hasNewRuntimeFlag))
    || (!runtimeChanged && (durations.runtimeAbsentMs !== 0 || hasNewRuntimeFlag))
  ) {
    return null;
  }

  return {
    schemaVersion: RUNTIME_CONTEXT_SCHEMA_VERSION,
    episodeId,
    originRuntimeInstanceId,
    currentRuntimeInstanceId,
    startedAt,
    lastObservedAt,
    totalDurationMs,
    ...durations,
    recoveredInNewRuntime,
    failureTrigger,
    evidenceFlags,
  };
}

function recoveryEpisode(value) {
  return sanitizeDeliveryRecoveryEpisode(value);
}

function durationShare(duration, total) {
  return total > 0 ? duration / total : 0;
}

export function classifyDeliveryRecoveryEpisode(value) {
  const episode = recoveryEpisode(value);
  if (!episode || episode.totalDurationMs <= 0) return 'unknown';

  if (episode.recoveredInNewRuntime && episode.runtimeAbsentMs > 0) {
    return 'new_runtime_recovery';
  }

  const offlineDuration = episode.foregroundOfflineMs + episode.backgroundOfflineMs;
  if (durationShare(offlineDuration, episode.totalDurationMs) >= 0.8) return 'offline';

  const backgroundDuration = episode.backgroundOnlineMs + episode.backgroundOfflineMs;
  if (durationShare(backgroundDuration, episode.totalDurationMs) >= 0.8) return 'background_suspended';

  if (
    episode.failureTrigger === 'transport_failure'
    && durationShare(episode.foregroundOnlineMs, episode.totalDurationMs) >= 0.8
  ) {
    return 'foreground_network_failure';
  }

  const knownDurationCount = DELIVERY_DURATION_FIELDS
    .filter((field) => field !== 'unknownMs')
    .filter((field) => episode[field] > 0)
    .length;
  if (knownDurationCount >= 2) return 'mixed';
  return 'unknown';
}

export function deliveryRecoveryEvidenceQuality(value) {
  const episode = recoveryEpisode(value);
  if (!episode || episode.totalDurationMs <= 0 || episode.unknownMs >= episode.totalDurationMs) return 'unknown';
  if (episode.evidenceFlags.includes('clock_anomaly')) return 'low';

  const unknownShare = durationShare(episode.unknownMs, episode.totalDurationMs);
  if (unknownShare <= 0.1) return 'high';
  if (unknownShare <= 0.3) return 'medium';
  return 'low';
}

function countEntries(counts, order, key) {
  return order
    .filter((label) => Number(counts.get(label) || 0) > 0)
    .map((label) => ({ [key]: label, count: counts.get(label) }));
}

function addCountEntries(target, entries, key) {
  (entries || []).forEach((entry) => {
    const label = enumValue(entry?.[key], [...target.allowed]);
    const count = nonNegativeInteger(entry?.count);
    if (!label || count === null || count === 0) return;
    target.counts.set(label, (target.counts.get(label) || 0) + count);
  });
}

function buildRuntimeContextSummary({
  totalEvents,
  observedEvents,
  lifecycleCounts,
  connectivityCounts,
  lifecycleConfidenceCounts,
  connectivityConfidenceCounts,
}) {
  const safeTotal = Math.max(0, Number(totalEvents) || 0);
  const safeObserved = Math.min(safeTotal, Math.max(0, Number(observedEvents) || 0));
  return {
    totalEvents: safeTotal,
    observedEvents: safeObserved,
    missingEvents: safeTotal - safeObserved,
    coverageRate: safeTotal ? safeObserved / safeTotal : 0,
    lifecycleCounts: countEntries(lifecycleCounts, LIFECYCLE_STATES, 'state'),
    connectivityCounts: countEntries(connectivityCounts, CONNECTIVITY_STATES, 'state'),
    lifecycleConfidenceCounts: countEntries(lifecycleConfidenceCounts, EVIDENCE_CONFIDENCE, 'confidence'),
    connectivityConfidenceCounts: countEntries(connectivityConfidenceCounts, EVIDENCE_CONFIDENCE, 'confidence'),
  };
}

export function summarizeRuntimeContexts(records = []) {
  const lifecycleCounts = new Map();
  const connectivityCounts = new Map();
  const lifecycleConfidenceCounts = new Map();
  const connectivityConfidenceCounts = new Map();
  let observedEvents = 0;

  records.forEach((record) => {
    const context = sanitizeRuntimeContext(record?.runtimeContext || record);
    if (!context) return;
    observedEvents += 1;
    lifecycleCounts.set(context.lifecycleState, (lifecycleCounts.get(context.lifecycleState) || 0) + 1);
    connectivityCounts.set(context.connectivityState, (connectivityCounts.get(context.connectivityState) || 0) + 1);
    lifecycleConfidenceCounts.set(
      context.lifecycleConfidence,
      (lifecycleConfidenceCounts.get(context.lifecycleConfidence) || 0) + 1,
    );
    connectivityConfidenceCounts.set(
      context.connectivityConfidence,
      (connectivityConfidenceCounts.get(context.connectivityConfidence) || 0) + 1,
    );
  });

  return buildRuntimeContextSummary({
    totalEvents: records.length,
    observedEvents,
    lifecycleCounts,
    connectivityCounts,
    lifecycleConfidenceCounts,
    connectivityConfidenceCounts,
  });
}

export function mergeRuntimeContextSummaries(summaries = []) {
  const lifecycle = { allowed: new Set(LIFECYCLE_STATES), counts: new Map() };
  const connectivity = { allowed: new Set(CONNECTIVITY_STATES), counts: new Map() };
  const lifecycleConfidence = { allowed: new Set(EVIDENCE_CONFIDENCE), counts: new Map() };
  const connectivityConfidence = { allowed: new Set(EVIDENCE_CONFIDENCE), counts: new Map() };
  let totalEvents = 0;
  let observedEvents = 0;

  summaries.forEach((summary) => {
    totalEvents += Math.max(0, Number(summary?.totalEvents) || 0);
    observedEvents += Math.max(0, Number(summary?.observedEvents) || 0);
    addCountEntries(lifecycle, summary?.lifecycleCounts, 'state');
    addCountEntries(connectivity, summary?.connectivityCounts, 'state');
    addCountEntries(lifecycleConfidence, summary?.lifecycleConfidenceCounts, 'confidence');
    addCountEntries(connectivityConfidence, summary?.connectivityConfidenceCounts, 'confidence');
  });

  return buildRuntimeContextSummary({
    totalEvents,
    observedEvents,
    lifecycleCounts: lifecycle.counts,
    connectivityCounts: connectivity.counts,
    lifecycleConfidenceCounts: lifecycleConfidence.counts,
    connectivityConfidenceCounts: connectivityConfidence.counts,
  });
}
