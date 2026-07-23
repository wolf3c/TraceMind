# Runtime Context And Delivery Recovery Attribution Design

**Status:** Approved for implementation

**Date:** 2026-07-23

## Goal

Make TraceMind Auto Capture evidence precise enough to distinguish:

- product use while the runtime is foregrounded or backgrounded;
- product use while platform connectivity is online, offline, or unknown;
- delivery recovery in the same runtime from recovery after a new runtime starts;
- observed transport failure from time that cannot be attributed safely.

The first release establishes a shared runtime-context contract, implements it in Web Auto Capture, propagates it through storage and MCP analysis, and preserves it in hourly/daily aggregates. Other SDK runtimes adopt the same contract in later releases rather than receiving separate incompatible interpretations.

## Current Behavior

- Web delivery state stores one shared `lastFailedFlushAt` timestamp.
- Every failed retry overwrites that timestamp.
- A later successful request reports the timestamp, and the server calculates `createdAt - lastFailedFlushAt`.
- The calculation has no lifecycle, connectivity, suspension, discard, or runtime-instance evidence.
- Web capture already observes `visibilitychange`, `online`, `pagehide`, and `beforeunload`, but those facts are not attached to captured events or delivery diagnostics.
- Native and host SDKs have platform-specific lifecycle hooks, but TraceMind has no shared runtime-context contract for them.
- Semantic events, raw-behavior queries, summaries, hourly health, and daily health cannot filter or aggregate by runtime state.

The current `recoveryDurationMs` is therefore only an unattributed wall-clock interval. It must not be presented as time the customer waited in the foreground.

## Target Behavior

1. Every new Web Auto Capture record carries a compact, privacy-safe runtime-context snapshot taken when the record is enqueued.
2. Runtime state is evidence-based. Missing or conflicting evidence produces `unknown`; TraceMind does not guess.
3. Delivery failures form persisted per-endpoint episodes. An episode accounts for elapsed time across explicit lifecycle/connectivity buckets and detects recovery in a new runtime.
4. Only a request received by the TraceMind server closes a delivery episode for analysis. `sendBeacon()` returning `true` does not by itself prove server acknowledgement.
5. The server validates SDK facts and applies deterministic classifications; it does not reconstruct unavailable client lifecycle history.
6. MCP event analysis can filter and summarize lifecycle/connectivity state.
7. MCP delivery diagnostics separate attributed recovery episodes from legacy unattributed elapsed intervals.
8. Hourly and daily reports retain runtime-context coverage and delivery classification aggregates after detail TTL expiry.
9. Existing SDK payloads remain valid. There is no historical backfill or required database migration.

## Product Semantics

### Runtime context

`runtimeContext` describes the evidence available at the instant an automatic record is created:

```js
{
  schemaVersion: 1,
  runtimeInstanceId: "internal-random-id",
  sequence: 42,
  lifecycleState: "foreground",       // foreground | background | unknown
  connectivityState: "online",        // online | offline | unknown
  lifecycleEvidence: "document_visibility",
  connectivityEvidence: "platform_connectivity",
  lifecycleConfidence: "high",        // high | medium | low | unknown
  connectivityConfidence: "low"
}
```

Allowed lifecycle evidence:

- `document_visibility`
- `app_lifecycle`
- `runtime_default`
- `unknown`

Allowed connectivity evidence:

- `platform_connectivity`
- `transport_success`
- `transport_failure`
- `unknown`

The runtime instance ID is random execution identity, not user or device identity. It is stored for internal episode correlation but omitted from public raw/semantic event responses and MCP delivery output.

### Web evidence rules

| Observation | State | Confidence |
| --- | --- | --- |
| `document.visibilityState === "visible"` | foreground | high |
| `document.visibilityState === "hidden"` | background | high |
| missing/unsupported visibility state | unknown | unknown |
| `navigator.onLine === false` or `offline` event | offline | medium |
| `navigator.onLine === true` or `online` event | online | low |
| acknowledged `fetch` response from the TraceMind endpoint | online | high |
| failed transport while platform reports online | unknown | low |
| failed transport while platform reports offline | offline | medium |

`navigator.onLine` is a hint, not proof of Internet reachability. A failed fetch does not prove the device is offline. A successful request to TraceMind is high-confidence endpoint reachability.

`pagehide`, `pageshow`, `freeze`, `resume`, and `document.wasDiscarded` are retained as delivery episode evidence flags. They do not create invented foreground/offline durations.

### Runtime identity

- Web stores one runtime ID on `window`, outside `window.__TraceMindRuntime`.
- Capture-script hot replacement in the same page keeps that ID.
- A bfcache restore in the same JavaScript heap keeps that ID.
- Reload, process replacement, or a discarded page creates a new ID.
- The persisted delivery episode records its origin runtime ID. If a new runtime loads the episode, the unobserved gap since the previous runtime's last observation is counted only as `runtimeAbsentMs`, and `recoveredInNewRuntime` becomes `true`.

## Delivery Episode Contract

Delivery episodes are independent for `capture`, `presence`, and `user_feedback`.

An episode opens when an endpoint has pending records and:

- an actual request fails; or
- a flush is skipped because the platform explicitly reports offline.

An episode remains open through retries, backgrounding, script hot replacement, and browser restart. The client persists only safe enums, timestamps, counters, booleans, and opaque random IDs.

The episode snapshot sent on the next attempt is:

```js
{
  schemaVersion: 1,
  episodeId: "internal-random-id",
  originRuntimeInstanceId: "internal-random-id",
  currentRuntimeInstanceId: "internal-random-id",
  startedAt: "2026-07-23T01:00:00.000Z",
  lastObservedAt: "2026-07-23T01:03:00.000Z",
  totalDurationMs: 180000,
  foregroundOnlineMs: 30000,
  foregroundOfflineMs: 60000,
  backgroundOnlineMs: 0,
  backgroundOfflineMs: 30000,
  runtimeAbsentMs: 60000,
  unknownMs: 0,
  recoveredInNewRuntime: true,
  failureTrigger: "transport_failure",
  evidenceFlags: ["visibility_observed", "platform_offline", "new_runtime"]
}
```

Allowed failure triggers:

- `transport_failure`
- `platform_offline`

Allowed recovery trigger is server-owned:

- `server_ack`

Allowed evidence flags:

- `visibility_observed`
- `platform_online`
- `platform_offline`
- `transport_failed`
- `transport_succeeded`
- `page_hidden`
- `page_shown`
- `page_frozen`
- `page_resumed`
- `page_discarded`
- `new_runtime`
- `clock_anomaly`

### Duration invariants

For an accepted episode:

```text
totalDurationMs =
  foregroundOnlineMs +
  foregroundOfflineMs +
  backgroundOnlineMs +
  backgroundOfflineMs +
  runtimeAbsentMs +
  unknownMs
```

Additional rules:

- all values are finite non-negative integers;
- `lastObservedAt >= startedAt`;
- `totalDurationMs <= 7 days`;
- a same-runtime unobserved gap is `unknownMs` unless an explicit preceding background state was observed continuously;
- a cross-runtime gap is only `runtimeAbsentMs`;
- invalid clocks or broken invariants make the episode invalid; the server does not repair or reinterpret it.

### Acknowledgement and deduplication

The request body includes the current open episode snapshot. Arrival at the TraceMind server is the authoritative `server_ack` recovery boundary.

The client clears its episode after an acknowledged `fetch`. It does not clear it merely because `sendBeacon()` returned `true`. If the server received a request but the client missed the response, the episode may be sent again; the server deduplicates on:

```text
projectId + endpoint + episodeId
```

Deduplication must occur before hourly counters are incremented so retries do not inflate report or recovery counts.

## Server Validation And Classification

The server owns sanitization and classification. SDKs report observations and duration composition only.

Classification precedence:

1. `new_runtime_recovery` when `recoveredInNewRuntime` is true and `runtimeAbsentMs > 0`.
2. `offline` when foreground/background offline duration is at least 80% of total duration.
3. `background_suspended` when foreground/background background duration is at least 80% of total duration.
4. `foreground_network_failure` when `foregroundOnlineMs` is at least 80% of total duration and the failure trigger is `transport_failure`.
5. `mixed` when at least two known duration buckets are non-zero and no prior rule matches.
6. `unknown` otherwise.

Evidence quality:

- `unknown`: total duration is zero or all duration is unknown;
- `high`: unknown duration is at most 10% and no clock anomaly exists;
- `medium`: unknown duration is at most 30% and no clock anomaly exists;
- `low`: some attributable duration exists but the thresholds above are not met.

Classification and evidence quality are derived fields. Clients cannot override them.

## Event Storage And Public Projection

### Raw behavior

The server sanitizes `runtimeContext` through a strict whitelist and stores it on each accepted raw behavior. Extra fields, invalid enums, invalid IDs, nested data, and non-finite values are dropped.

### Semantic event

`buildSemanticEvent()` copies the sanitized runtime context from its raw behavior.

### Public MCP/API response

Public raw and semantic records expose:

```js
{
  schemaVersion,
  sequence,
  lifecycleState,
  connectivityState,
  lifecycleEvidence,
  connectivityEvidence,
  lifecycleConfidence,
  connectivityConfidence
}
```

They omit `runtimeInstanceId`.

Presence sessions may store the sanitized context for internal health evidence, but this phase does not add a public presence-query contract.

## MCP Analysis Contract

### Event and raw-behavior filters

`tracemind.query_events`, `tracemind.query_raw_behaviors`, and `tracemind.summary` add:

- `lifecycleState`
- `connectivityState`

Only supported enum values are accepted. Invalid values fail clearly rather than silently widening the query.

### Event summary

`summarizeSemanticEvents()` adds:

```js
runtimeContext: {
  totalEvents,
  observedEvents,
  missingEvents,
  coverageRate,
  lifecycleCounts: [{ state, count }],
  connectivityCounts: [{ state, count }],
  lifecycleConfidenceCounts: [{ confidence, count }],
  connectivityConfidenceCounts: [{ confidence, count }]
}
```

The summary remains sample-scoped when the enclosing MCP tool is sample-scoped.

### Delivery diagnostics

`tracemind.query_delivery_diagnostics` adds optional `endpoint` filtering and groups by endpoint as well as the existing hour/source/reason dimensions.

`recoveryDurationMs` becomes authoritative only for validated episode-backed samples. It includes:

- `sampleCount`
- `min`
- `average`
- `max`

New fields:

```js
{
  attributedEpisodeCount,
  recoveryClassificationCounts,
  evidenceQualityCounts,
  recoveredInNewRuntimeCount,
  durationCompositionMs: {
    foregroundOnline,
    foregroundOffline,
    backgroundOnline,
    backgroundOffline,
    runtimeAbsent,
    unknown
  },
  legacyElapsedDurationMs: {
    semantics: "unattributed_wall_clock_elapsed",
    sampleCount,
    min,
    average,
    max
  },
  attributionCoverage
}
```

Legacy reports with only `lastFailedFlushAt` are not mixed into attributed `recoveryDurationMs`. Their old wall-clock interval is retained under the explicitly named `legacyElapsedDurationMs`.

Neither runtime IDs nor episode IDs are returned by MCP.

## Long-Term Aggregation

Hourly and daily health retain:

- runtime-context event count and missing-context count;
- lifecycle state counts;
- connectivity state counts;
- confidence counts;
- delivery episode counts by classification and evidence quality;
- attributed recovery duration sample count, exact total, minimum, derived average, and maximum;
- delivery duration composition totals;
- recovery-in-new-runtime count.

Counts and duration totals are additive. Daily recovery averages are recalculated from the summed exact duration and sample count; hourly averages are never averaged together. Coverage is recalculated from summed counts, not averaged across hours.

Detailed raw behaviors, semantic events, presence sessions, and delivery reports keep their existing TTL windows. No historical records are rewritten.

## Cross-Runtime Impact Matrix

| Runtime / Surface | Phase 1 | Rationale |
| --- | --- | --- |
| Web | change | Reference implementation for runtime context and delivery episodes. |
| Hybrid | change | WebView inherits the Web script; native shell remains unchanged. |
| iOS | no change | Shared contract documented; native implementation is a later SDK release. |
| macOS | no change | Shared contract documented; native implementation is a later SDK release. |
| Android | no change | Shared contract documented; native implementation is a later SDK release. |
| React Native | no change | Shared contract documented; bridge/native implementation is later. |
| Mini Program | no change | Shared contract documented; provider lifecycle implementation is later. |
| Browser Extension | no change | Shared contract documented; extension page/background implementation is later. |
| server Node/Python/HTTP | out of scope | Ordinary server apps have no foreground/background lifecycle; future context may use server-specific evidence. |
| MCP Node/Python | out of scope | MCP server lifecycle is not foreground/background product usage. |
| Agent Skill | out of scope | Static Skill files are not runtimes. |
| Capture ingestion API | change | Sanitize/store optional runtime context and delivery episodes. |
| Semantic pipeline | change | Propagate optional runtime context. |
| MCP analysis tools | change | Add filters, summaries, and attributed delivery diagnostics. |
| Hourly/daily health | change | Preserve context and recovery aggregates beyond detail TTL. |
| Dashboard UI | no visible change | Data contract changes only in phase 1. |
| Public guidance/docs | change | Explain semantics, privacy boundary, rollout, and version detection. |

## Compatibility And Migration

- `runtimeContext` and delivery episodes are optional additive fields.
- Existing SDKs and old Web runtimes continue to ingest successfully.
- Old records appear as missing context and contribute to coverage denominators.
- Existing `lastFailedFlushAt` is accepted only for legacy elapsed reporting.
- No backfill is attempted.
- No persistent data migration is required.
- One additive partial unique index supports delivery episode deduplication.
- Capture queue size, retry backoff, batching, drop policy, and existing manual event APIs do not change.

## Privacy And Security

Runtime context contains only allowlisted enums, bounded counters, timestamps, booleans, and opaque random IDs.

It must never include:

- URL query strings or full URLs;
- page content, target text, form values, or raw user content;
- prompts, tool arguments/results, source code, or diffs;
- request/response bodies, headers, cookies, or authorization data;
- raw errors, stack traces, credentials, tokens, or contact information.

Runtime and episode IDs are not stable customer/user identifiers and are not exposed in MCP delivery output.

## Error Handling

- Unsupported runtime-context enums are omitted and resolve to missing/unknown context.
- Invalid query filter enums return explicit MCP errors.
- Malformed delivery episodes are ignored for attributed recovery, while the surrounding capture request continues.
- Delivery observability must never block accepted user behavior ingestion.
- Duplicate episodes must not throw a request-level error or double-count rollups.
- Storage failure falls back to in-memory operation and marks the existing safe delivery error; it does not collect additional sensitive diagnostics.

## Verification Strategy

### TDD

1. Add failing pure contract tests for sanitization, public redaction, summary aggregation, delivery invariants, classification, and additive rollup merging.
2. Add failing VM tests for Web runtime snapshots, state transitions, script replacement, bfcache/new runtime behavior, offline skips, transport failures, beacon acknowledgement semantics, and duration accounting.
3. Add failing ingestion/MCP tests for persistence, query filters, delivery deduplication, legacy separation, endpoint filters, and hourly/daily aggregation.
4. Implement the smallest code required to make each focused test pass.

### Required checks

- Focused Meteor tests for each red/green cycle.
- `git diff --check`.
- `npm run check:release-metadata`.
- `npm test`.
- `npm run update:sdk-manifest` and `npm run test:sdk-release` only if a file under `sdk/` changes; phase 1 is designed not to change `sdk/`.
- TraceMind MCP instrumentation diff validation after implementation.
- Generated Web script inspection for the new release marker and privacy-safe field names.

## Success Criteria

- An attributed recovery episode always satisfies the duration sum invariant.
- New-runtime recovery can never be reported as foreground-online wait time.
- Offline, background, foreground-network, mixed, and unknown classifications are deterministic.
- Legacy wall-clock samples are clearly separated from attributed recovery samples.
- Public responses never expose runtime or episode IDs.
- New event records can be filtered and summarized by lifecycle/connectivity evidence.
- Hourly/daily reports preserve the new aggregate meaning after detailed records expire.
- Old SDK payloads still ingest without changes.
- All focused and full verification checks pass.

## Out Of Scope

- Native, React Native, Mini Program, Browser Extension, server SDK, MCP SDK, or Agent Skill runtime implementation.
- Dashboard visualization changes.
- Proactive incident notification or alert lifecycle.
- Historical data backfill.
- Changing capture queue limits, batching, retry backoff, or drop policy.
- Deployment, release tagging, publication, or database status updates.
