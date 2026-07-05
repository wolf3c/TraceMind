# TraceMind Ingestion Guard Design

## Goal

Prevent repeated or near-identical abnormal events from filling MongoDB while preserving normal high-volume business instrumentation.

Except for storage emergency protection, write-affecting guard decisions require both:

```text
abnormal volume + concentrated repeated or similar content
```

High `count`, high bytes, or a historical-baseline spike without content concentration can only enter `watch`. It must not sample or fuse raw behavior writes.

## Runtime Matrix

| Surface | Status | Notes |
| --- | --- | --- |
| Web capture | change | `/api/capture` responses include guard fields. SDK behavior is unchanged. |
| iOS, macOS, Android, React Native, Hybrid, Mini Program, Browser Extension | no change | These runtimes keep posting the same capture payloads. Server-side ingestion applies the guard uniformly. |
| Server SDKs, MCP SDKs, Agent Skill | no change | No SDK update is required. Their server-side capture writes share the same guard path. |
| Dashboard/API | change | Project summary includes current guard states and recent 10-minute rollups. |
| Semantic extraction | no change | Dropped-to-rollup events are not written to raw behaviors, so no semantic event is produced for those dropped details. |

## Event Key And Window

The guard runs before raw behavior insertion in `server/capture_routes.js`, after project-key resolution and source-block checks.

Blocked sources return accepted API responses but do not enter guard statistics.

When enforce mode drops an event to rollup, the capture response flushes guard rollups and states before returning success. If that flush fails, the capture request fails so SDK retry paths can preserve the dropped-count accounting.

Each decision is scoped by:

```text
projectId + sourceType + sourceKey + eventName
```

Windows are 10 minutes, bucketed by server receive time.

## Modes

| Mode | Meaning | Raw write behavior |
| --- | --- | --- |
| `open` | Normal | Write all accepted events. |
| `watch` | Volume, baseline, or storage risk without duplicate concentration | Write all accepted events. |
| `sampled` | Abnormal volume plus duplicate concentration | Keep deterministic samples and roll up the rest. |
| `fused` | Extreme duplicate storm or pressure condition | Do not write raw or semantic details; write rollups only. |

`TRACEMIND_INGESTION_GUARD_MODE=shadow` is the default. Shadow records `wouldSampleCount` and `wouldDropCount` without limiting raw writes.

## Fingerprinting

The first version uses normalized HMAC fingerprints. It does not persist original text.

Fingerprint material is built from safe event-level fields such as event name, source, path, status, action key, target hash, and primitive `properties` or `context` values. Sensitive keys such as authorization, cookie, token, secret, password, body, prompt, content, and raw are skipped.

Normalization removes or replaces URLs and query strings, UUIDs, request or trace ids, long token-like strings, long numeric ids, smaller numbers, line numbers, and repeated whitespace. Rollups store only the fingerprint hash, counts, and duplicate score.

## Thresholds

Default 10-minute thresholds:

| Purpose | Default |
| --- | --- |
| Watch | `count >= 1,000` or `bytes >= 5 MB` |
| Sampled | duplicate storm plus `count >= 2,000` or `bytes >= 8 MB` |
| Fused | duplicate storm plus `count >= 5,000` or `bytes >= 20 MB` |
| Duplicate storm | `topFingerprintRatio >= 0.8`, `topFingerprintCount >= 500`, and total `count >= 1,000` or `bytes >= 5 MB` |

Historical baselines are computed from guard rollups, not raw behaviors. A background job refreshes p95 and p99 metrics every 15 minutes. If a key has fewer than 24 historical windows, only absolute thresholds apply.

Persisted sampled/fused states and historical baselines are hydrated during server startup and lazily before the first guard decision. This prevents a restart from reopening an active fused key or ignoring an existing baseline until the next background refresh.

## Storage Watermark

A background job reads `dbStats` every 5 minutes and tracks database usage against the configured quota.

| Watermark | Action |
| --- | --- |
| `<70%` | No action |
| `70%-80%` | Watch only |
| `80%-90%` | Lower duplicate-count thresholds, but still require duplicate concentration before limiting |
| `90%-95%` | Duplicate storm keys go directly to `fused` |
| `>=95%` | Storage emergency can override the duplicate requirement for lower-priority diagnostic, delivery, heartbeat, queue, and status-like events |

Storage emergency preserves critical `P0/P1` events as much as possible. It exits after the watermark falls below 85%.

## Recovery

`sampled` and `fused` modes do not clear immediately. A key must have 3 consecutive clean 10-minute windows where:

- duplicate storm is no longer true
- count and bytes are below 50% of the sampled thresholds

Recovery steps down from `fused` to `sampled`, then from `sampled` to `open`.

## Collections

The guard owns three collections:

- `tracemind_ingestion_guard_rollups`
- `tracemind_ingestion_guard_states`
- `tracemind_ingestion_guard_baselines`

Indexes are created by `ensureTraceMindIndexes()`:

- rollups unique `{ projectId, sourceType, sourceKey, eventName, windowStartAt }`
- rollups `{ projectId, windowStartAt: -1 }`
- rollups `{ windowStartAt: -1 }`
- states unique `{ projectId, sourceType, sourceKey, eventName }`
- baselines unique `{ projectId, sourceType, sourceKey, eventName }`

## Verification

Relevant checks:

```bash
MOCHA_GREP="ingestion guard" npm test
npx svelte-check
npm test
```
