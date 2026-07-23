# Runtime Context And Delivery Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use red-green TDD for every behavior change.

**Goal:** Add evidence-based runtime context to Web Auto Capture and replace ambiguous delivery wall-clock recovery reporting with validated lifecycle/connectivity/runtime-attributed episodes.

**Architecture:** Introduce one shared server-side runtime-context contract module. The generated Web capture script owns runtime evidence and persisted per-endpoint delivery episodes. Ingestion sanitizes optional context, semantic extraction propagates it, MCP exposes safe projections and filters, and hourly/daily reports retain additive aggregates. Runtime/episode IDs remain internal. Existing SDK payloads and legacy delivery records remain compatible.

**Tech Stack:** Meteor, MongoDB, generated browser JavaScript, Svelte-adjacent setup guidance, Node `vm` Meteor Mocha tests.

**Approved design:** `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-07-23-runtime-context-and-delivery-recovery-design.md`

**Git boundary:** Do not create a commit, tag, branch, or deploy. The repository is already one commit ahead of `origin/main`; preserve that state and stage nothing unless the user later asks.

---

## Current And Target Behavior

Current:

- Web stores only `lastFailedFlushAt`.
- The server calls the later wall-clock difference `recoveryDurationMs`.
- Captured events have no lifecycle/connectivity evidence.
- Runtime replacement/restart cannot be distinguished.
- Long-term reports cannot preserve these dimensions.

Target:

- Web records an event-time `runtimeContext` snapshot.
- Failed delivery is represented by one persisted episode per endpoint.
- Episode durations satisfy an exact sum invariant and detect new-runtime recovery.
- The server validates and classifies episodes without guessing.
- MCP separates episode-backed recovery from legacy elapsed time.
- Event queries, summaries, and health rollups retain runtime-context dimensions.

## Runtime And Surface Matrix

| Runtime / Surface | Status |
| --- | --- |
| Web | change: full reference implementation |
| Hybrid WebView | change: inherits Web script |
| iOS | unchanged: contract only |
| macOS | unchanged: contract only |
| Android | unchanged: contract only |
| React Native | unchanged: contract only |
| Mini Program | unchanged: contract only |
| Browser Extension | unchanged: contract only |
| server Node/Python/HTTP | out of scope |
| MCP Node/Python | out of scope |
| Agent Skill runtime | out of scope |
| Capture/presence ingestion | change |
| Semantic pipeline | change |
| MCP tools/API | change |
| Hourly/daily health | change |
| Dashboard visible UI | unchanged |
| Public/local agent guidance | change |

---

### Task 1: Add The Shared Runtime Context Contract

**Files:**

- Create: `/Users/wolf3c/Project/TraceMind/imports/api/runtime_context.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing pure behavior tests**

Add tests that assert:

1. `sanitizeRuntimeContext()` accepts only schema version 1, bounded runtime ID, non-negative integer sequence, allowlisted states/evidence/confidence, and drops unknown keys.
2. `publicRuntimeContext()` omits `runtimeInstanceId`.
3. `sanitizeDeliveryRecoveryEpisode()` accepts a valid episode only when duration buckets sum exactly to total and total is at most the seven-day retention window.
4. Invalid enums, negative duration, broken sum, invalid dates, future/earlier `lastObservedAt`, and oversized episodes return `null`.
5. `classifyDeliveryRecoveryEpisode()` follows the approved precedence.
6. `deliveryRecoveryEvidenceQuality()` returns `unknown`, `high`, `medium`, and `low` at the specified thresholds.
7. `summarizeRuntimeContexts()` counts observed/missing records and returns deterministic lifecycle/connectivity/confidence arrays.
8. `mergeRuntimeContextSummaries()` sums counts and recalculates coverage instead of averaging percentages.

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

```bash
TEST_GREP="runtime context contract" meteor test --once --driver-package meteortesting:mocha --port 3131
```

Expected: FAIL because `/imports/api/runtime_context` and its exports do not exist.

- [ ] **Step 3: Implement the independent contract module**

Export:

- `RUNTIME_CONTEXT_SCHEMA_VERSION`
- allowlisted state/evidence/confidence sets
- `DELIVERY_RECOVERY_MAX_DURATION_MS`
- `sanitizeRuntimeContext(value)`
- `publicRuntimeContext(value)`
- `sanitizeDeliveryRecoveryEpisode(value)`
- `classifyDeliveryRecoveryEpisode(episode)`
- `deliveryRecoveryEvidenceQuality(episode)`
- `summarizeRuntimeContexts(records)`
- `mergeRuntimeContextSummaries(summaries)`

Keep this module independent of Meteor and MongoDB so pure tests can execute without runtime state.

- [ ] **Step 4: Run the focused tests and confirm green**

Use the Step 2 command. Expected: PASS.

---

### Task 2: Propagate Runtime Context Through Event Ingestion And Analysis

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/semantic.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing ingestion/projection/query/summary tests**

Cover:

- capture ingestion stores sanitized runtime context and drops extra/internal-invalid fields;
- presence ingestion stores sanitized runtime context;
- `buildSemanticEvent()` copies runtime context;
- `publicRawBehavior()` and `publicSemanticEvent()` expose safe fields but omit runtime ID;
- `buildEventQuery()` and `buildRawBehaviorQuery()` map valid lifecycle/connectivity filters to nested fields;
- invalid filter enums throw a clear error;
- `summarizeSemanticEvents()` returns runtime-context coverage and distributions;
- old events without context count as missing.

- [ ] **Step 2: Confirm the focused tests fail**

Run:

```bash
TEST_GREP="runtime context (ingestion|projection|query|summary)" meteor test --once --driver-package meteortesting:mocha --port 3132
```

- [ ] **Step 3: Implement server persistence and propagation**

In `server/capture_routes.js`:

- sanitize `payload.runtimeContext` in `insertCaptureEvent()`;
- store it only when valid;
- sanitize/store it in `upsertPresenceEvent()`;
- do not fail ingestion when context is absent or malformed.

In `imports/api/semantic.js`:

- copy sanitized `behavior.runtimeContext` into the semantic base record;
- add `runtimeContext: summarizeRuntimeContexts(events)` to semantic summaries.

In `imports/api/tracemind.js`:

- add strict lifecycle/connectivity query filters;
- expose `publicRuntimeContext(...)` from public raw and semantic projections;
- never expose `runtimeInstanceId`.

- [ ] **Step 4: Confirm focused green**

Run the Step 2 command. Expected: PASS.

---

### Task 3: Add Web Runtime Context Snapshots

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing Web VM tests**

Create a reusable VM harness near existing generated-script tests and cover:

- initial visible/online snapshot is foreground/high lifecycle and online/low connectivity;
- hidden/visible transitions update lifecycle state and evidence;
- offline/online transitions use medium/low confidence;
- successful TraceMind fetch promotes connectivity to online/high;
- failed fetch while `navigator.onLine !== false` produces unknown/low connectivity rather than invented offline;
- each queued capture and presence record gets the snapshot at enqueue time;
- sequence increases monotonically;
- script hot replacement retains runtime ID and sequence;
- a new `window` creates a new runtime ID;
- bfcache `pageshow({ persisted: true })` in the same heap retains runtime ID;
- no runtime ID appears in `TraceMind.status()`.

- [ ] **Step 2: Confirm red**

Run:

```bash
TEST_GREP="web runtime context" meteor test --once --driver-package meteortesting:mocha --port 3133
```

- [ ] **Step 3: Implement the Web runtime context collector**

Inside `clientScript()`:

- create/reuse `window.__TraceMindPageContext` separately from `window.__TraceMindRuntime`;
- generate one random runtime ID per JavaScript execution environment;
- initialize lifecycle from Page Visibility;
- initialize connectivity from `navigator.onLine`;
- add `runtimeContextSnapshot()` that increments sequence;
- attach the authoritative snapshot in `enqueue()` after merging the caller payload;
- update state before existing presence/flush behavior in visibility, online, offline, pageshow, pagehide, freeze, and resume listeners;
- record only allowlisted evidence flags/state; do not collect URLs or content.

- [ ] **Step 4: Confirm green**

Run the Step 2 command. Expected: PASS.

---

### Task 4: Implement Persisted Per-Endpoint Delivery Episodes In Web

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing delivery-episode VM tests**

Cover:

- failed capture/presence/feedback delivery opens separate endpoint episodes;
- an offline-skipped flush opens an episode only for endpoint kinds with pending due records;
- lifecycle/connectivity transitions settle elapsed time into the correct bucket;
- duration buckets always sum to total;
- repeated failures keep the original episode start and ID;
- a persisted episode loaded under a new runtime puts only the unobserved gap in `runtimeAbsentMs`;
- script replacement in the same page does not mark new runtime;
- `document.wasDiscarded` adds the discard flag;
- acknowledged fetch clears the client episode;
- `sendBeacon() === true` removes queued records but does not clear the episode;
- failed or malformed clock intervals become `unknownMs`/`clock_anomaly`, never negative values;
- episodes older than seven days are discarded from attributed reporting.

- [ ] **Step 2: Confirm red**

Run:

```bash
TEST_GREP="web delivery recovery episode" meteor test --once --driver-package meteortesting:mocha --port 3134
```

- [ ] **Step 3: Implement episode state**

Inside `clientScript()`:

- persist a `recoveryEpisodes` map in the existing delivery-stats storage record;
- use endpoint keys `capture`, `presence`, and `user_feedback`;
- add helpers to open, load, settle, snapshot, and clear episodes;
- settle every open episode before runtime-state changes;
- make `deliveryReport(reason, records)` include only the matching endpoint episode snapshot;
- pass endpoint kind into failure handling;
- open episodes when offline causes a flush skip;
- clear only after acknowledged fetch;
- keep episodes after accepted beacon queueing;
- preserve all existing queue, retry, batching, and drop behavior.

- [ ] **Step 4: Confirm green**

Run the Step 2 command. Expected: PASS.

---

### Task 5: Validate, Deduplicate, Classify, And Query Recovery Episodes

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing server/MCP tests**

Cover:

- `deliveryReportDocument()` accepts a valid episode and derives `server_ack`, classification, and evidence quality;
- malformed episodes do not block capture ingestion and do not count as attributed recovery;
- duplicate `projectId + endpoint + episodeId` requests produce one detail record and one hourly increment;
- the partial unique index exists;
- `query_delivery_diagnostics` accepts `endpoint`;
- invalid endpoints fail clearly;
- buckets include endpoint, classification, and evidence quality;
- `recoveryDurationMs` includes only validated episode-backed samples;
- old `lastFailedFlushAt` reports move to `legacyElapsedDurationMs`;
- runtime/episode IDs are absent from MCP output;
- duration composition and new-runtime counts aggregate correctly;
- analysis truncation metadata remains correct.

- [ ] **Step 2: Confirm red**

Run:

```bash
TEST_GREP="delivery recovery attribution" meteor test --once --driver-package meteortesting:mocha --port 3135
```

- [ ] **Step 3: Implement report ingestion**

In `deliveryReportDocument()`:

- sanitize `stats.recoveryEpisode`;
- store internal episode ID/runtime IDs only in the detail document;
- derive classification, evidence quality, and server acknowledgement;
- retain `lastFailedFlushAt` only as legacy input.

In `recordDeliveryReport()`:

- upsert episode-backed detail using the dedupe key;
- increment hourly rollups only for the first accepted episode record;
- keep legacy behavior for reports without episode IDs;
- swallow duplicate-key races as observability duplicates, not request failures.

In `ensureTraceMindIndexes()`:

- add a partial unique index on `{ projectId, endpoint, deliveryEpisodeId }`.

- [ ] **Step 4: Implement MCP aggregation**

Update the tool schema and `readDeliveryDiagnostics()` to:

- accept/filter `endpoint`;
- project only fields needed for aggregation;
- group by endpoint/classification/evidence quality;
- aggregate attributed and legacy durations separately;
- return duration composition and coverage;
- omit internal IDs.

- [ ] **Step 5: Confirm green**

Run the Step 2 command. Expected: PASS.

---

### Task 6: Preserve Runtime And Delivery Meaning In Hourly/Daily Health

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Write failing rollup tests**

Cover:

- hourly health stores runtime-context counts and coverage;
- aggregating hourly reports sums counts and recalculates coverage;
- delivery hourly rollups store attributed episode counts, classifications, evidence quality, duration totals, and new-runtime count;
- daily aggregation merges nested count maps and duration composition additively;
- legacy hourly documents without new fields remain valid and produce zero-valued additions.

- [ ] **Step 2: Confirm red**

Run:

```bash
TEST_GREP="runtime context and recovery health rollups" meteor test --once --driver-package meteortesting:mocha --port 3136
```

- [ ] **Step 3: Implement event health aggregation**

In `summarizeWindow()`:

- include runtime-context summary in current health;
- include full additive runtime-context counts in `rollup`.

In `aggregateProjectHealthHourlyReports()`:

- merge hourly runtime-context summaries;
- expose recalculated coverage in daily `current`.

- [ ] **Step 4: Implement delivery health aggregation**

Extend `upsertDeliveryHourlyRollup()` and `summarizeCaptureDelivery()` with:

- attributed episode count;
- recovery classification/evidence-quality counts;
- new-runtime recovery count;
- duration composition totals;
- attributed recovery duration sample/exact-total/min/average/max.

Preserve the exact duration total in hourly health and derive daily averages from summed totals and sample counts. Do not average hourly averages.

- [ ] **Step 5: Confirm green**

Run the Step 2 command. Expected: PASS.

---

### Task 7: Update MCP Schemas, Release Markers, And Customer Guidance

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/release_metadata.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/agent_setup.js`
- Modify: `/Users/wolf3c/Project/TraceMind/.codex/skills/tracemind/SKILL.md`
- Modify: `/Users/wolf3c/Project/TraceMind/public/agents/tracemind/SKILL.md`
- Modify: `/Users/wolf3c/Project/TraceMind/public/agents/tracemind/AGENTS_SNIPPET.md`
- Modify: `/Users/wolf3c/Project/TraceMind/public/agents/tracemind/manifest.json`
- Modify: `/Users/wolf3c/Project/TraceMind/README.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/auto_capture_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/mcp_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/agent_instrumentation_guidance.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/implementation_progress.md`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Add failing contract/guidance tests**

Assert:

- MCP schemas expose lifecycle/connectivity and endpoint filters;
- tool descriptions say event context is evidence-based and delivery recovery is episode-attributed;
- guidance directs agents to use classification/evidence quality and never interpret legacy elapsed time as foreground wait;
- public/local guidance versions agree;
- release metadata expects the new Web script marker.

- [ ] **Step 2: Confirm red**

Run:

```bash
TEST_GREP="runtime context guidance contract" meteor test --once --driver-package meteortesting:mocha --port 3137
```

- [ ] **Step 3: Update customer-facing contracts**

- bump Web capture release and agent guidance to `2026.07.23.1`;
- document the shared contract and phased runtime rollout;
- document exact MCP request/response fields;
- document legacy/attributed duration separation;
- document privacy and confidence semantics;
- update the generated setup guidance so customer coding agents use the new filters and evidence fields correctly;
- keep Product Update wording customer-value-first.

- [ ] **Step 4: Confirm green and metadata alignment**

Run:

```bash
TEST_GREP="runtime context guidance contract" meteor test --once --driver-package meteortesting:mocha --port 3137
npm run check:release-metadata
```

Expected: both pass.

---

### Task 8: Review And Full Verification

**Files:**

- Review every file changed by Tasks 1-7.

- [ ] **Step 1: Review the agent-owned diff**

Check:

- no unrelated files changed;
- every field is allowlisted;
- no runtime/episode ID reaches public MCP responses;
- no full URL, raw error, body, header, token, content, prompt, or input value is collected;
- observability failure cannot block normal ingestion;
- old payloads and old reports remain compatible;
- every duration path preserves the sum invariant;
- no SDK file changed accidentally.

- [ ] **Step 2: Run static diff checks**

```bash
git diff --check
git status --short --branch
npm run check:release-metadata
```

- [ ] **Step 3: Run the full suite**

```bash
npm test -- --port 3138
```

Expected: SDK/deploy gates and all Meteor tests pass.

- [ ] **Step 4: Apply the SDK manifest rule only if needed**

If `git diff --name-only -- sdk/` is non-empty:

```bash
npm run update:sdk-manifest
npm run test:sdk-release
```

If no `sdk/` file changed, report that these extra commands were not required; the full `npm test` release gate remains authoritative for this phase.

- [ ] **Step 5: Validate instrumentation/privacy through TraceMind**

- confirm `tracemind-ywrtpb` still binds project `BJuZgMywBxYYWrTpB`;
- submit the sanitized Git diff to `tracemind.validate_instrumentation_diff`;
- run `tracemind.privacy_check` on the new public runtime/recovery field examples;
- fix any blocking finding within scope and rerun focused/full verification.

- [ ] **Step 6: Inspect the generated script contract**

Generate/read `clientScript()` and verify:

- release ID is `2026.07.23.1`;
- runtime context and recovery episode fields are present;
- forbidden content/header/body/token fields are absent from the new contract;
- `window.TraceMind.status()` does not expose runtime/episode IDs.

- [ ] **Step 7: Final handoff**

Report:

- exact changed files;
- focused red/green evidence;
- full verification result;
- cross-runtime boundaries;
- remaining phased SDK work;
- branch is still `main`, one pre-existing commit ahead of `origin/main`, with no new commit or deploy;
- suggested commit message, without creating the commit.
