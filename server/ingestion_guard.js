import crypto from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import {
  IngestionGuardBaselines,
  IngestionGuardRollups,
  IngestionGuardStates,
} from '/imports/api/tracemind';

export const INGESTION_GUARD_WINDOW_MS = 10 * 60 * 1000;
const STORAGE_WATERMARK_INTERVAL_MS = 5 * 60 * 1000;
const BASELINE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const ROLLUP_FLUSH_INTERVAL_MS = 30 * 1000;
const DEFAULT_STORAGE_QUOTA_BYTES = 512 * 1024 * 1024;
const MODE_PRIORITY = { open: 0, shadow: 1, watch: 2, sampled: 3, fused: 4 };
const REASON_PRIORITY = {
  none: 0,
  volume_watch: 1,
  baseline_watch: 2,
  duplicate_storm: 3,
  storage_pressure: 4,
  storage_emergency: 5,
};

const DEFAULT_THRESHOLDS = Object.freeze({
  watchCount: 1000,
  watchBytes: 5 * 1024 * 1024,
  sampledCount: 2000,
  sampledBytes: 8 * 1024 * 1024,
  fusedCount: 5000,
  fusedBytes: 20 * 1024 * 1024,
  duplicateMinCount: 1000,
  duplicateMinBytes: 5 * 1024 * 1024,
  duplicateTopCount: 500,
  duplicateTopRatio: 0.8,
});

let testConfig = null;
let storageWatermarkRatio = 0;
let rollupFlushStarted = false;
let storageWatermarkStarted = false;
let baselineRefreshStarted = false;
let runtimeHydrated = false;
let runtimeHydrationPromise = null;
const windowMetrics = new Map();
const pendingRollups = new Map();
const pendingStates = new Map();
const baselineCache = new Map();
const runtimeStates = new Map();

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function modeFromEnvironment() {
  return String(
    process.env.TRACEMIND_INGESTION_GUARD_MODE
    || Meteor.settings?.ingestionGuard?.mode
    || 'shadow',
  ).toLowerCase();
}

function activeConfig() {
  const settings = Meteor.settings?.ingestionGuard || {};
  const mode = String(testConfig?.mode || settings.mode || modeFromEnvironment()).toLowerCase();
  return {
    mode: ['off', 'shadow', 'enforce'].includes(mode) ? mode : 'shadow',
    sampleRate: Math.max(0, Math.min(1, numeric(testConfig?.sampleRate ?? settings.sampleRate, 0.1))),
    storageQuotaBytes: Math.max(1, numeric(testConfig?.storageQuotaBytes ?? settings.storageQuotaBytes, DEFAULT_STORAGE_QUOTA_BYTES)),
    storageWatermarkRatio: Math.max(0, numeric(testConfig?.storageWatermarkRatio ?? storageWatermarkRatio, storageWatermarkRatio)),
    hashSecret: String(process.env.TRACEMIND_INGESTION_GUARD_HASH_SECRET || settings.hashSecret || 'tracemind-ingestion-guard-v1'),
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...(settings.thresholds || {}),
      ...(testConfig?.thresholds || {}),
    },
  };
}

function eventKeyParts(input = {}) {
  return {
    projectId: String(input.projectId || ''),
    projectKey: String(input.projectKey || ''),
    sourceType: String(input.sourceType || 'unknown').toLowerCase(),
    sourceKey: String(input.sourceKey || 'unknown').toLowerCase(),
    sourceLabel: String(input.sourceLabel || input.sourceKey || 'unknown'),
    eventName: String(input.eventName || input.type || 'unknown').toLowerCase(),
    eventType: String(input.eventType || input.type || 'custom').toLowerCase(),
  };
}

function eventKey(parts) {
  return [
    parts.projectId,
    parts.sourceType,
    parts.sourceKey,
    parts.eventName,
  ].join('\u001f');
}

function windowStartFor(now = new Date()) {
  const time = new Date(now).getTime();
  return new Date(Math.floor(time / INGESTION_GUARD_WINDOW_MS) * INGESTION_GUARD_WINDOW_MS);
}

function windowMetricKey(parts, windowStartAt) {
  return `${eventKey(parts)}\u001f${windowStartAt.toISOString()}`;
}

function emptyMetrics(parts, windowStartAt) {
  return {
    ...parts,
    windowStartAt,
    windowEndAt: new Date(windowStartAt.getTime() + INGESTION_GUARD_WINDOW_MS),
    count: 0,
    bytes: 0,
    fingerprints: new Map(),
  };
}

function runtimeStateFromDocument(state = {}) {
  const parts = eventKeyParts(state);
  return {
    key: eventKey(parts),
    value: {
      mode: state.mode || 'open',
      reason: state.reason || 'none',
      recoveryStreak: Number(state.recoveryStreak || 0),
      lastWindowStartAt: state.lastWindowStartAt || state.activeWindowStartAt || null,
    },
  };
}

function metricFor(parts, windowStartAt) {
  const key = windowMetricKey(parts, windowStartAt);
  if (!windowMetrics.has(key)) {
    windowMetrics.set(key, emptyMetrics(parts, windowStartAt));
  }
  return windowMetrics.get(key);
}

function normalizeFingerprintText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/[^\s?]+(?:\?[^\s]*)?/g, '<url>')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '<uuid>')
    .replace(/\b(?:requestid|request_id|traceid|trace_id|correlationid|correlation_id)[:=\s-]*[a-z0-9._:-]+/g, '<request-id>')
    .replace(/\b[a-z0-9_-]{24,}\b/g, '<token>')
    .replace(/\b\d{4,}\b/g, '<num>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/:\d+:\d+/g, ':<line>')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFingerprintFields(value, depth = 0) {
  if (depth > 1 || value == null) return [];
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return [normalizeFingerprintText(value)];
  }
  if (Array.isArray(value)) return value.slice(0, 5).flatMap((item) => safeFingerprintFields(item, depth + 1));
  if (typeof value !== 'object') return [];
  return Object.keys(value)
    .sort()
    .slice(0, 20)
    .flatMap((key) => {
      if (/authorization|cookie|token|secret|password|body|prompt|content|raw/i.test(key)) return [];
      return [`${normalizeFingerprintText(key)}=${safeFingerprintFields(value[key], depth + 1).join('|')}`];
    });
}

export function ingestionGuardFingerprint(event = {}, { hashSecret } = activeConfig()) {
  const parts = eventKeyParts(event);
  const material = [
    parts.eventName,
    parts.sourceType,
    parts.sourceKey,
    normalizeFingerprintText(event.path || '/'),
    normalizeFingerprintText(event.status || ''),
    normalizeFingerprintText(event.type || event.eventType || ''),
    normalizeFingerprintText(event.actionKey || ''),
    normalizeFingerprintText(event.targetHash || ''),
    ...safeFingerprintFields(event.properties || {}),
    ...safeFingerprintFields(event.context || {}),
  ].filter(Boolean).join('|');

  return crypto.createHmac('sha256', hashSecret).update(material).digest('hex');
}

function estimateEventBytes(event = {}) {
  try {
    return Buffer.byteLength(JSON.stringify(event), 'utf8') + 200;
  } catch (error) {
    return 1024;
  }
}

function topFingerprint(metrics) {
  let hash = '';
  let count = 0;
  metrics.fingerprints.forEach((fingerprintCount, fingerprintHash) => {
    if (fingerprintCount > count) {
      hash = fingerprintHash;
      count = fingerprintCount;
    }
  });
  return {
    hash,
    count,
    ratio: metrics.count ? count / metrics.count : 0,
    uniqueCount: metrics.fingerprints.size,
  };
}

function classifyPriority(event = {}) {
  const eventType = String(event.eventType || event.type || '').toLowerCase();
  const eventName = String(event.eventName || '').toLowerCase();
  if (eventType === 'app_error' || /feedback|payment|invoice_paid|checkout_crashed/.test(eventName)) return 'p0';
  if (/heartbeat|delivery|diagnostic|debug|log|trace|status|queue|slack_message_delivery/.test(eventName)) return 'p2';
  return 'p1';
}

function baselineFor(parts) {
  return baselineCache.get(eventKey(parts));
}

function exceedsBaseline(metrics, baseline, multiplier) {
  if (!baseline || Number(baseline.windowCount || 0) < 24) return false;
  const p99Count = Number(baseline.p99CountPerWindow || 0);
  const p99Bytes = Number(baseline.p99BytesPerWindow || 0);
  return (p99Count > 0 && metrics.count > p99Count * multiplier)
    || (p99Bytes > 0 && metrics.bytes > p99Bytes * multiplier);
}

function thresholdsForStorage(config) {
  const thresholds = { ...config.thresholds };
  if (config.storageWatermarkRatio >= 0.8) {
    thresholds.duplicateMinCount = Math.max(1, Math.floor(Number(thresholds.duplicateMinCount || 1) * 0.5));
    thresholds.duplicateMinBytes = Math.max(1, Math.floor(Number(thresholds.duplicateMinBytes || 1) * 0.5));
    thresholds.duplicateTopCount = Math.max(1, Math.floor(Number(thresholds.duplicateTopCount || 1) * 0.5));
  }
  return thresholds;
}

function decideWouldMode({ event, metrics, duplicate, config }) {
  const thresholds = config.thresholds;
  const priority = classifyPriority(event);
  const storageRatio = config.storageWatermarkRatio;
  const volumeWatch = metrics.count >= thresholds.watchCount || metrics.bytes >= thresholds.watchBytes;
  const sampledVolume = metrics.count >= thresholds.sampledCount || metrics.bytes >= thresholds.sampledBytes;
  const fusedVolume = metrics.count >= thresholds.fusedCount || metrics.bytes >= thresholds.fusedBytes;
  const baseline = baselineFor(metrics);
  const baselineSampled = exceedsBaseline(metrics, baseline, 10);
  const baselineFused = exceedsBaseline(metrics, baseline, 20);

  if (storageRatio >= 0.95 && !['p0', 'p1'].includes(priority)) {
    return { mode: 'fused', reason: 'storage_emergency' };
  }
  if (storageRatio >= 0.9 && duplicate.isStorm) {
    return { mode: 'fused', reason: 'storage_pressure' };
  }
  if (duplicate.isStorm && (fusedVolume || baselineFused)) {
    return { mode: 'fused', reason: 'duplicate_storm' };
  }
  if (duplicate.isStorm && (sampledVolume || baselineSampled)) {
    return { mode: 'sampled', reason: 'duplicate_storm' };
  }
  if (volumeWatch || baselineSampled || storageRatio >= 0.7) {
    if (baselineSampled) return { mode: 'watch', reason: 'baseline_watch' };
    if (storageRatio >= 0.7) return { mode: 'watch', reason: 'storage_pressure' };
    return { mode: 'watch', reason: 'volume_watch' };
  }
  return { mode: 'open', reason: 'none' };
}

function recoveryCleanWindow(metrics, duplicate, thresholds) {
  return !duplicate.isStorm
    && metrics.count < Number(thresholds.sampledCount || 0) * 0.5
    && metrics.bytes < Number(thresholds.sampledBytes || 0) * 0.5;
}

function recoveryWindowTarget(windowStartAt, recoveryStreak) {
  const remaining = Math.max(1, 3 - Number(recoveryStreak || 0));
  return new Date(windowStartAt.getTime() + remaining * INGESTION_GUARD_WINDOW_MS);
}

function applyRecoveryState({ parts, windowStartAt, would, metrics, duplicate, config }) {
  const key = eventKey(parts);
  const previous = runtimeStates.get(key) || {
    mode: 'open',
    reason: 'none',
    recoveryStreak: 0,
    lastWindowStartAt: null,
  };
  const previousMode = previous.mode || 'open';
  const previousReason = previous.reason || 'none';
  const previousWindowTime = previous.lastWindowStartAt ? new Date(previous.lastWindowStartAt).getTime() : null;
  const currentWindowTime = windowStartAt.getTime();
  const newWindow = previousWindowTime == null || previousWindowTime !== currentWindowTime;
  const emergencyExited = previousReason === 'storage_emergency' && config.storageWatermarkRatio < 0.85;
  const canRecover = recoveryCleanWindow(metrics, duplicate, config.thresholds);
  let recoveryStreak = Number(previous.recoveryStreak || 0);
  let effective = { ...would };
  let recoverAfterWindowStartAt = null;

  if (emergencyExited) {
    recoveryStreak = 0;
  } else if (previousMode === 'fused') {
    if (would.mode === 'fused') {
      recoveryStreak = 0;
    } else {
      if (newWindow) {
        const elapsedWindows = previousWindowTime == null
          ? 1
          : Math.max(1, Math.floor((currentWindowTime - previousWindowTime) / INGESTION_GUARD_WINDOW_MS));
        recoveryStreak = canRecover ? recoveryStreak + elapsedWindows : 0;
      }
      if (recoveryStreak >= 3) {
        effective = { mode: 'sampled', reason: previousReason };
        recoveryStreak = 0;
      } else {
        effective = { mode: 'fused', reason: previousReason };
        recoverAfterWindowStartAt = recoveryWindowTarget(windowStartAt, recoveryStreak);
      }
    }
  } else if (previousMode === 'sampled') {
    if (would.mode === 'fused') {
      recoveryStreak = 0;
    } else if (would.mode === 'sampled') {
      recoveryStreak = 0;
    } else {
      if (newWindow) {
        const elapsedWindows = previousWindowTime == null
          ? 1
          : Math.max(1, Math.floor((currentWindowTime - previousWindowTime) / INGESTION_GUARD_WINDOW_MS));
        recoveryStreak = canRecover ? recoveryStreak + elapsedWindows : 0;
      }
      if (recoveryStreak >= 3) {
        recoveryStreak = 0;
      } else {
        effective = { mode: 'sampled', reason: previousReason };
        recoverAfterWindowStartAt = recoveryWindowTarget(windowStartAt, recoveryStreak);
      }
    }
  } else if (would.mode === 'fused' || would.mode === 'sampled') {
    recoveryStreak = 0;
  }

  const shouldKeepState = effective.mode !== 'open' || previousMode !== 'open';
  if (shouldKeepState) {
    runtimeStates.set(key, {
      mode: effective.mode,
      reason: effective.reason,
      recoveryStreak,
      lastWindowStartAt: windowStartAt,
    });
  } else {
    runtimeStates.delete(key);
  }

  return {
    effective,
    previousMode,
    recoverAfterWindowStartAt,
    recoveryStreak,
    lastWindowStartAt: windowStartAt,
  };
}

function sampleAccepts(parts, fingerprintHash, count, sampleRate) {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  const hash = crypto
    .createHash('sha256')
    .update(`${eventKey(parts)}:${fingerprintHash}:${count}`)
    .digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return bucket < sampleRate;
}

function strongerMode(left, right) {
  return MODE_PRIORITY[right] > MODE_PRIORITY[left] ? right : left;
}

function strongerReason(left, right) {
  return REASON_PRIORITY[right] > REASON_PRIORITY[left] ? right : left;
}

function pendingKey(parts, windowStartAt) {
  return windowMetricKey(parts, windowStartAt);
}

function mergePendingRollup(parts, windowStartAt, update) {
  const key = pendingKey(parts, windowStartAt);
  const existing = pendingRollups.get(key) || {
    filter: {
      projectId: parts.projectId,
      sourceType: parts.sourceType,
      sourceKey: parts.sourceKey,
      eventName: parts.eventName,
      windowStartAt,
    },
    setOnInsert: {
      projectId: parts.projectId,
      projectKey: parts.projectKey,
      sourceType: parts.sourceType,
      sourceKey: parts.sourceKey,
      eventName: parts.eventName,
      eventType: parts.eventType,
      windowStartAt,
      windowEndAt: new Date(windowStartAt.getTime() + INGESTION_GUARD_WINDOW_MS),
      createdAt: new Date(),
    },
    set: {
      sourceLabel: parts.sourceLabel,
      mode: 'open',
      reason: 'none',
      topFingerprintHash: '',
      topFingerprintCount: 0,
      uniqueFingerprintCount: 0,
      duplicateScore: 0,
      updatedAt: new Date(),
    },
    inc: {
      acceptedCount: 0,
      sampledCount: 0,
      droppedCount: 0,
      acceptedBytes: 0,
      droppedBytes: 0,
      wouldSampleCount: 0,
      wouldDropCount: 0,
    },
  };

  existing.set.mode = strongerMode(existing.set.mode, update.mode);
  existing.set.reason = strongerReason(existing.set.reason, update.reason);
  existing.set.topFingerprintHash = update.topFingerprintHash;
  existing.set.topFingerprintCount = update.topFingerprintCount;
  existing.set.uniqueFingerprintCount = update.uniqueFingerprintCount;
  existing.set.duplicateScore = update.duplicateScore;
  existing.set.updatedAt = new Date();
  Object.keys(existing.inc).forEach((keyName) => {
    existing.inc[keyName] += Number(update.inc[keyName] || 0);
  });

  pendingRollups.set(key, existing);
}

function queueState(parts, decision) {
  const key = eventKey(parts);
  pendingStates.set(key, {
    filter: {
      projectId: parts.projectId,
      sourceType: parts.sourceType,
      sourceKey: parts.sourceKey,
      eventName: parts.eventName,
    },
    doc: {
      projectId: parts.projectId,
      projectKey: parts.projectKey,
      sourceType: parts.sourceType,
      sourceKey: parts.sourceKey,
      sourceLabel: parts.sourceLabel,
      eventName: parts.eventName,
      eventType: parts.eventType,
      mode: decision.mode,
      reason: decision.reason,
      sampleRate: decision.sampleRate,
      activeWindowStartAt: decision.windowStartAt,
      recoverAfterWindowStartAt: decision.recoverAfterWindowStartAt || null,
      recoveryStreak: decision.recoveryStreak || 0,
      lastWindowStartAt: decision.lastWindowStartAt,
      duplicateScore: decision.duplicateScore,
      updatedAt: new Date(),
    },
  });
}

function pendingRollupSnapshotKey(rollup) {
  return windowMetricKey(rollup.filter, rollup.filter.windowStartAt);
}

function requeueRollupSnapshot(rollup) {
  const key = pendingRollupSnapshotKey(rollup);
  const existing = pendingRollups.get(key);
  if (!existing) {
    pendingRollups.set(key, rollup);
    return;
  }

  existing.set.mode = strongerMode(existing.set.mode, rollup.set.mode);
  existing.set.reason = strongerReason(existing.set.reason, rollup.set.reason);
  existing.set.topFingerprintHash = rollup.set.topFingerprintHash;
  existing.set.topFingerprintCount = rollup.set.topFingerprintCount;
  existing.set.uniqueFingerprintCount = rollup.set.uniqueFingerprintCount;
  existing.set.duplicateScore = rollup.set.duplicateScore;
  existing.set.updatedAt = new Date(Math.max(
    new Date(existing.set.updatedAt || 0).getTime(),
    new Date(rollup.set.updatedAt || 0).getTime(),
  ));
  Object.keys(existing.inc).forEach((keyName) => {
    existing.inc[keyName] += Number(rollup.inc[keyName] || 0);
  });
}

function requeueStateSnapshot(state) {
  const key = eventKey(state.filter);
  const existing = pendingStates.get(key);
  if (!existing || new Date(existing.doc.updatedAt || 0) < new Date(state.doc.updatedAt || 0)) {
    pendingStates.set(key, state);
  }
}

export async function flushIngestionGuardRollups() {
  const rollups = [...pendingRollups.values()];
  const states = [...pendingStates.values()];
  pendingRollups.clear();
  pendingStates.clear();

  const tasks = [
    ...rollups.map((rollup) => IngestionGuardRollups.rawCollection().updateOne(
      rollup.filter,
      {
        $setOnInsert: rollup.setOnInsert,
        $set: rollup.set,
        $inc: rollup.inc,
      },
      { upsert: true },
    )),
    ...states.map((state) => IngestionGuardStates.rawCollection().updateOne(
      state.filter,
      {
        $setOnInsert: {
          projectId: state.doc.projectId,
          projectKey: state.doc.projectKey,
          sourceType: state.doc.sourceType,
          sourceKey: state.doc.sourceKey,
          eventName: state.doc.eventName,
          eventType: state.doc.eventType,
          createdAt: new Date(),
        },
        $set: {
          sourceLabel: state.doc.sourceLabel,
          mode: state.doc.mode,
          reason: state.doc.reason,
          sampleRate: state.doc.sampleRate,
          activeWindowStartAt: state.doc.activeWindowStartAt,
          recoverAfterWindowStartAt: state.doc.recoverAfterWindowStartAt,
          recoveryStreak: state.doc.recoveryStreak,
          lastWindowStartAt: state.doc.lastWindowStartAt,
          duplicateScore: state.doc.duplicateScore,
          updatedAt: state.doc.updatedAt,
        },
      },
      { upsert: true },
    )),
  ];
  const snapshots = [...rollups, ...states];
  const results = await Promise.allSettled(tasks);
  const failures = [];

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failures.push(result.reason);
      const snapshot = snapshots[index];
      if (index < rollups.length) requeueRollupSnapshot(snapshot);
      else requeueStateSnapshot(snapshot);
    }
  });

  if (failures.length) {
    throw failures[0];
  }
}

export async function hydrateIngestionGuardRuntime({ force = false } = {}) {
  if (runtimeHydrated && !force) return;
  if (runtimeHydrationPromise && !force) {
    await runtimeHydrationPromise;
    return;
  }

  runtimeHydrationPromise = (async () => {
    if (force) {
      runtimeStates.clear();
      baselineCache.clear();
    }
    const [states, baselines] = await Promise.all([
      IngestionGuardStates.find({ mode: { $in: ['sampled', 'fused'] } }).fetchAsync(),
      IngestionGuardBaselines.find({}).fetchAsync(),
    ]);

    states.forEach((state) => {
      const { key, value } = runtimeStateFromDocument(state);
      runtimeStates.set(key, value);
    });
    baselines.forEach((baseline) => {
      baselineCache.set(eventKey(eventKeyParts(baseline)), baseline);
    });
    runtimeHydrated = true;
  })();

  try {
    await runtimeHydrationPromise;
  } finally {
    runtimeHydrationPromise = null;
  }
}

export async function hydrateIngestionGuardForTest() {
  await hydrateIngestionGuardRuntime({ force: true });
}

export async function evaluateIngestionGuard(event = {}, { now = new Date() } = {}) {
  const config = activeConfig();
  if (config.mode === 'off') {
    return {
      mode: 'open',
      decision: 'accept',
      reason: 'none',
      sampleRate: 1,
      windowStartAt: windowStartFor(now),
      duplicateScore: 0,
    };
  }
  await hydrateIngestionGuardRuntime();

  const parts = eventKeyParts(event);
  const windowStartAt = windowStartFor(now);
  const metrics = metricFor(parts, windowStartAt);
  const fingerprintHash = ingestionGuardFingerprint(event, config);
  const bytes = estimateEventBytes(event);
  const thresholds = thresholdsForStorage(config);
  const decisionConfig = { ...config, thresholds };

  metrics.count += 1;
  metrics.bytes += bytes;
  metrics.fingerprints.set(fingerprintHash, (metrics.fingerprints.get(fingerprintHash) || 0) + 1);

  const top = topFingerprint(metrics);
  const duplicate = {
    top,
    isStorm: top.ratio >= thresholds.duplicateTopRatio
      && top.count >= thresholds.duplicateTopCount
      && (metrics.count >= thresholds.duplicateMinCount || metrics.bytes >= thresholds.duplicateMinBytes),
  };
  const baseWould = decideWouldMode({ event, metrics, duplicate, config: decisionConfig });
  const recovery = applyRecoveryState({
    parts,
    windowStartAt,
    would: baseWould,
    metrics,
    duplicate,
    config: decisionConfig,
  });
  const effective = recovery.effective;
  const sampleRate = effective.mode === 'sampled' ? config.sampleRate : 1;
  const sampleAccepted = effective.mode !== 'sampled' || sampleAccepts(parts, fingerprintHash, metrics.count, sampleRate);
  const shadow = config.mode === 'shadow';
  let decision = 'accept';
  let actualMode = effective.mode;
  let actualReason = effective.reason;

  if (shadow) {
    actualMode = effective.mode === 'open' ? 'open' : 'shadow';
    actualReason = effective.reason;
  } else if (effective.mode === 'fused') {
    decision = 'drop_to_rollup';
  } else if (effective.mode === 'sampled' && !sampleAccepted) {
    decision = 'drop_to_rollup';
  } else if (effective.mode === 'sampled') {
    decision = 'sample_accept';
  }

  const accepted = decision === 'accept' || decision === 'sample_accept';
  const sampledAccepted = decision === 'sample_accept';
  const wouldDrop = shadow && (effective.mode === 'fused' || (effective.mode === 'sampled' && !sampleAccepted));
  const rollupMode = shadow ? effective.mode : actualMode;
  mergePendingRollup(parts, windowStartAt, {
    mode: rollupMode,
    reason: effective.reason,
    topFingerprintHash: top.hash,
    topFingerprintCount: top.count,
    uniqueFingerprintCount: top.uniqueCount,
    duplicateScore: top.ratio,
    inc: {
      acceptedCount: accepted ? 1 : 0,
      sampledCount: sampledAccepted ? 1 : 0,
      droppedCount: accepted ? 0 : 1,
      acceptedBytes: accepted ? bytes : 0,
      droppedBytes: accepted ? 0 : bytes,
      wouldSampleCount: shadow && effective.mode === 'sampled' ? 1 : 0,
      wouldDropCount: wouldDrop ? 1 : 0,
    },
  });

  if (rollupMode !== 'open' || recovery.previousMode !== 'open') {
    queueState(parts, {
      mode: rollupMode,
      reason: effective.reason,
      sampleRate,
      windowStartAt,
      recoverAfterWindowStartAt: recovery.recoverAfterWindowStartAt,
      recoveryStreak: recovery.recoveryStreak,
      lastWindowStartAt: recovery.lastWindowStartAt,
      duplicateScore: top.ratio,
    });
  }

  return {
    mode: actualMode,
    decision,
    reason: actualReason,
    sampleRate,
    windowStartAt,
    duplicateScore: top.ratio,
    wouldMode: effective.mode,
    wouldReason: effective.reason,
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export async function refreshIngestionGuardBaselines({ now = new Date() } = {}) {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await IngestionGuardRollups.find({ windowStartAt: { $gte: since, $lt: now } }).fetchAsync();
  const groups = new Map();
  rows.forEach((row) => {
    const parts = eventKeyParts(row);
    const key = eventKey(parts);
    const group = groups.get(key) || { parts, counts: [], bytes: [], duplicateScores: [] };
    group.counts.push(Number(row.acceptedCount || 0) + Number(row.droppedCount || 0));
    group.bytes.push(Number(row.acceptedBytes || 0) + Number(row.droppedBytes || 0));
    group.duplicateScores.push(Number(row.duplicateScore || 0));
    groups.set(key, group);
  });

  await Promise.all([...groups.values()].map(async (group) => {
    const doc = {
      projectId: group.parts.projectId,
      projectKey: group.parts.projectKey,
      sourceType: group.parts.sourceType,
      sourceKey: group.parts.sourceKey,
      eventName: group.parts.eventName,
      eventType: group.parts.eventType,
      windowCount: group.counts.length,
      p95CountPerWindow: percentile(group.counts, 95),
      p99CountPerWindow: percentile(group.counts, 99),
      p95BytesPerWindow: percentile(group.bytes, 95),
      p99BytesPerWindow: percentile(group.bytes, 99),
      p95DuplicateScore: percentile(group.duplicateScores, 95),
      p99DuplicateScore: percentile(group.duplicateScores, 99),
      updatedAt: now,
    };
    baselineCache.set(eventKey(group.parts), doc);
    await IngestionGuardBaselines.rawCollection().updateOne(
      {
        projectId: doc.projectId,
        sourceType: doc.sourceType,
        sourceKey: doc.sourceKey,
        eventName: doc.eventName,
      },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }));

  return groups.size;
}

export async function refreshIngestionGuardStorageWatermark() {
  const config = activeConfig();
  const stats = await IngestionGuardRollups.rawDatabase().command({ dbStats: 1 });
  const usedBytes = Number(stats.dataSize || 0) + Number(stats.indexSize || 0);
  storageWatermarkRatio = Math.max(0, usedBytes / config.storageQuotaBytes);
  return storageWatermarkRatio;
}

export function startIngestionGuardJobs() {
  hydrateIngestionGuardRuntime().catch((error) => {
    console.error('[TraceMind] ingestion guard runtime hydrate failed', error);
  });
  if (!rollupFlushStarted) {
    rollupFlushStarted = true;
    Meteor.setInterval(() => {
      flushIngestionGuardRollups().catch((error) => {
        console.error('[TraceMind] ingestion guard rollup flush failed', error);
      });
    }, ROLLUP_FLUSH_INTERVAL_MS);
  }
  if (!storageWatermarkStarted) {
    storageWatermarkStarted = true;
    refreshIngestionGuardStorageWatermark().catch(() => {});
    Meteor.setInterval(() => {
      refreshIngestionGuardStorageWatermark().catch((error) => {
        console.error('[TraceMind] ingestion guard storage refresh failed', error);
      });
    }, STORAGE_WATERMARK_INTERVAL_MS);
  }
  if (!baselineRefreshStarted) {
    baselineRefreshStarted = true;
    refreshIngestionGuardBaselines().catch(() => {});
    Meteor.setInterval(() => {
      refreshIngestionGuardBaselines().catch((error) => {
        console.error('[TraceMind] ingestion guard baseline refresh failed', error);
      });
    }, BASELINE_REFRESH_INTERVAL_MS);
  }
}

export async function drainIngestionGuardForTest() {
  await flushIngestionGuardRollups();
  await flushIngestionGuardRollups();
}

export function configureIngestionGuardForTest(overrides = {}) {
  testConfig = overrides;
}

export function resetIngestionGuardForTest() {
  testConfig = null;
  storageWatermarkRatio = 0;
  windowMetrics.clear();
  pendingRollups.clear();
  pendingStates.clear();
  baselineCache.clear();
  runtimeStates.clear();
  runtimeHydrated = true;
  runtimeHydrationPromise = null;
}
