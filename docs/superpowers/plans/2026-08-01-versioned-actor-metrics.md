# Versioned Actor Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, additive version-2 actor metrics to hourly/daily project health without changing any legacy metric, UI, SDK, alert, or retention behavior.

**Architecture:** Build compact HMAC-only category/alias evidence while hourly reports already have raw event/presence detail, reuse root `activeActorKeys` as the observed set, merge evidence across hourly reports inside the existing daily aggregation path, and publish only aggregate v2 counts through `current.actorMetricsV2`. Reuse existing report collections and actor hash secret; do not create a collection, migration, SDK contract, or bot classifier.

**Tech Stack:** Meteor, MongoDB report documents, Node `crypto`, JavaScript, Meteor Mocha with Node `assert`.

**Approved design:** `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-08-01-versioned-actor-metrics-design.md`

**Status:** Completed locally on 2026-08-01; not deployed.

## Global Constraints

- Preserve `actorSetVersion: 1`, `activeUsers`, `newUsers`, `sessionCount`, retention, trends, alerts, and Dashboard behavior exactly.
- V2 is additive and server-computed; no SDK, capture script, Svelte, dependency, collection, index, migration, deployment, or AI分身术 change.
- Alias only `anonymousId` carried with exactly one `userId`; never alias by device, fingerprint, IP, UA, path, attribution, or behavior.
- Normalize observed actor keys into a mutually exclusive partition with identified precedence; non-identified category conflicts become unclassified, self-aliases never merge, and ambiguous aliases remain conflicts.
- Public outputs expose aggregate counts only; HMAC keys and alias pairs remain private report fields.
- Do not duplicate observed actor keys inside `actorEvidenceV2`; use each recognized report's root `activeActorKeys` and a single client-anonymous membership `Set` during canonicalization.
- Preserve v1 through v2-only failures and enforce the 12 MiB preflight plus one document-too-large retry with unavailable v2.
- Existing user changes in `docs/implementation_progress.md` and `docs/product_backlog.md` must be preserved. Do not edit `docs/product_backlog.md`.

---

### Task 1: Add Hourly V2 Actor Evidence And Metrics

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`

**Interfaces:**

- Produces private hourly `actorEvidenceV2` with `version`, `coverage`, four normalized category arrays, and alias pairs; observed keys remain only at the report root.
- Produces public hourly `current.actorMetricsV2` with nullable aggregate counts.
- Keeps `activeActorKeys` and `current.activeUsers` unchanged.

- [x] **Step 1: Write the failing hourly classification/canonicalization test**

Add one integration test under the existing daily-report suite. Insert controlled semantic events and presence for:

```js
// safe merge
{ sourceType: 'web', anonymousId: 'anon-login' }
{ sourceType: 'web', anonymousId: 'anon-login', userId: 'user-login' }

// anonymous client
{ sourceType: 'web', anonymousId: 'anon-client' }

// operational, unclassified, and alias conflict
{ sourceType: 'server_app', anonymousId: 'runtime-only' }
{ sourceType: 'unknown', anonymousId: 'unknown-only' }
{ sourceType: 'web', anonymousId: 'anon-conflict' }
{ sourceType: 'web', anonymousId: 'anon-conflict', userId: 'user-a' }
{ sourceType: 'web', anonymousId: 'anon-conflict', userId: 'user-b' }
```

Compute the hour and assert the literal aggregate contract:

```js
assert.deepStrictEqual(report.current.actorMetricsV2, {
  version: 2,
  coverage: 'complete',
  observedActors: 8,
  canonicalUserActors: 5,
  identifiedActors: 3,
  anonymousActors: 2,
  operationalActors: 1,
  unclassifiedActors: 1,
  firstSeenCanonicalActors: null,
  identityMergeCount: 1,
  identityConflictCount: 1,
});
assert.strictEqual(report.current.activeUsers, 8);
assert.ok(!JSON.stringify(report.actorEvidenceV2).includes('anon-login'));
assert.ok(!JSON.stringify(report.actorEvidenceV2).includes('user-login'));
```

The production change this test catches is actor classification or alias canonicalization producing the wrong count, leaking raw identity, or mutating v1.

- [x] **Step 2: Run the focused test and verify RED**

```bash
TEST_GREP="builds deterministic v2 actor evidence" npm test -- --port 3141
```

Expected: FAIL because `current.actorMetricsV2` and `actorEvidenceV2` do not exist.

- [x] **Step 3: Implement the minimal hourly evidence builder**

In `server/daily_reports.js`:

- keep `ACTOR_SET_VERSION = 1`;
- add `ACTOR_METRICS_VERSION = 2` and exact client/operational source-type sets;
- reuse `actorKey(projectId, rawId)` for every private key;
- build HMAC-only identified, client-anonymous, operational, and unclassified sets;
- record HMAC `anonymousKey -> userKey` pairs only when a record carries both IDs;
- call one pure actor-evidence summarizer exported from `imports/api/tracemind.js`;
- canonicalize unique pairs, leave multi-user conflicts unmerged;
- attach private `actorEvidenceV2` and aggregate `current.actorMetricsV2` to the hourly report.

Keep canonicalization in that one summarizer so Task 2 can reuse it rather than duplicating the rules.

Do not change ingestion, actor hash inputs, session logic, legacy current fields, or public projections.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS with the v1 assertion unchanged.

---

### Task 2: Merge V2 Evidence Across Hours With Strict Coverage

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`

**Interfaces:**

- Consumes hourly `report.actorEvidenceV2` from Task 1.
- Produces aggregate `actorEvidenceV2` and `current.actorMetricsV2` from `aggregateProjectHealthHourlyReports(reports)`.
- Returns `partial` or `unavailable` with null counts when evidence is incomplete.

- [x] **Step 1: Write failing aggregate tests**

Add literal hourly fixtures where hour one contains anonymous key `anon-hash` and hour two contains user key `user-hash` plus the alias pair. Assert that complete aggregation returns one canonical user actor and one identity merge while legacy `activeUsers` remains two.

Add one old hourly fixture without `actorEvidenceV2` and assert:

```js
assert.strictEqual(result.current.actorMetricsV2.coverage, 'partial');
assert.strictEqual(result.current.actorMetricsV2.canonicalUserActors, null);
assert.strictEqual(result.current.activeUsers, 2);
```

Add an all-legacy fixture and assert `coverage === 'unavailable'` with null v2 counts.

The production change these tests catch is per-hour summation double-counting actors or presenting incomplete evidence as a complete metric.

- [x] **Step 2: Run focused aggregate tests and verify RED**

```bash
TEST_GREP="aggregates v2 actor evidence" npm test -- --port 3142
```

Expected: FAIL because hourly aggregation does not understand `actorEvidenceV2`.

- [x] **Step 3: Implement minimal evidence aggregation**

In `imports/api/tracemind.js`:

- merge private actor-key sets and alias pairs across reports;
- recompute canonicalization after merging all hours;
- set coverage from the count of included v2 reports;
- return all v2 counts only for complete coverage;
- return version/coverage with null counts for partial/unavailable coverage;
- include private aggregate evidence in the internal return value so daily reporting can calculate first-seen semantics;
- leave all existing aggregation and fallback code unchanged.

- [x] **Step 4: Run focused aggregate tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

---

### Task 3: Add Daily First-Seen Canonical Semantics And Safe Projection

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/project_health_summary.js` only if the existing spread does not preserve `actorMetricsV2`

**Interfaces:**

- Consumes aggregate v2 evidence plus historical v1 `activeActorKeys`.
- Produces daily `current.actorMetricsV2.firstSeenCanonicalActors`.
- Project-health summaries expose `current.actorMetricsV2` but never private evidence.

- [x] **Step 1: Write the failing returning-anonymous identity test**

Create a previous-day report from an anonymous Web actor. On the selected day, emit one pre-login event with the same anonymous ID, one later event with that anonymous ID plus a new user ID, and one genuinely new anonymous Web actor.

Assert:

```js
assert.strictEqual(report.current.newUsers, 2); // legacy remains actor-based
assert.strictEqual(report.current.actorMetricsV2.firstSeenCanonicalActors, 1);
assert.strictEqual(report.current.actorMetricsV2.identityMergeCount, 1);
```

Pass the daily report through `summarizeProjectHealthFromDailyReports()` and assert the aggregate v2 object is present while serialized output contains neither `actorEvidenceV2` nor the raw fixture IDs.

The production change this test catches is treating a returning anonymous actor as a new canonical actor after login, changing legacy `newUsers`, or leaking private evidence.

- [x] **Step 2: Run the focused daily test and verify RED**

```bash
TEST_GREP="keeps returning anonymous identity out of v2 first seen" npm test -- --port 3143
```

Expected: FAIL because daily first-seen canonical semantics are missing.

- [x] **Step 3: Implement the minimal daily calculation**

In `server/daily_reports.js`:

- use the existing `previousActorKeys()` result;
- reuse the existing actor-evidence summarizer with the historical key set so alias canonicalization remains single-sourced;
- treat a canonical group as returning when any member actor key exists in the historical v1 set;
- set first-seen only for complete v2 coverage;
- store aggregate private evidence at the daily-report root and aggregate counts under `current`;
- keep `newActorKeys`, `current.newUsers`, retention, previous, trends, and alerts untouched.

Confirm `summarizeProjectHealthFromDailyReports()` already preserves additive `current` fields through object spread; change it only if the failing test proves otherwise.

- [x] **Step 4: Run the focused daily test and verify GREEN**

Run the Step 2 command. Expected: PASS.

---

### Task 4: Document The Additive Contract And Verify The Whole Change

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/docs/mcp_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/semantic_event_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/implementation_progress.md`
- Review: every agent-owned file from Tasks 1-3

**Interfaces:**

- Documents exact v1/v2 meaning, coverage, privacy, runtime boundaries, and deferred work.
- Does not change product copy or visible UI.

- [x] **Step 1: Update only relevant documentation**

Document:

- legacy `newUsers` remains first-seen actor count;
- v2 is deterministic actor interpretation, not human or registration truth;
- complete/partial/unavailable coverage behavior;
- HMAC-only internal evidence and aggregate-only public projection;
- no SDK changes and the exact cross-runtime source normalization;
- bot scoring, visits, registration, retention, alerts, and UI switching are deferred.

In `docs/implementation_progress.md`, append a separate 2026-08-01 section without changing the existing user-owned 2026-07-28 edits. Do not edit `docs/product_backlog.md`.

- [x] **Step 2: Review the agent-owned diff**

Verify:

- only approved files changed;
- the two pre-existing dirty documentation changes remain byte-for-byte present;
- no raw identity appears in persisted/public examples;
- no SDK, capture-script, Svelte, i18n, dependency, collection, index, retention, alert, or session code changed;
- every legacy assertion remains intact.

- [x] **Step 3: Run static verification**

```bash
git diff --check
git status --short
```

- [x] **Step 4: Run the complete test suite**

```bash
npm test
```

Expected: exit 0 with zero failures.

- [x] **Step 5: Apply conditional release gates**

```bash
git diff --name-only -- sdk/
```

Expected: no output, so `npm run update:sdk-manifest` and `npm run test:sdk-release` are not required. If any SDK file appears, stop because scope was violated.

- [x] **Step 6: Validate public boundaries locally**

No external MCP mutation or validation is part of this final local fix wave. Validate the public/private boundary through the materialized MCP-health and Meteor-publication tests.

- [x] **Step 7: Final implementation handoff without deploy**

Report exact files, red-green evidence, full verification output, unchanged runtime/UI boundaries, existing user-owned dirty files, and suggested commit message `feat: add versioned actor metrics to project health`.

---

### Final Safeguard Regression Wave

- Historical daily reports without `current.actorMetricsV2` receive explicit unavailable metrics from the pure health summary and MCP; raw legacy publication absence means unavailable and is not backfilled.
- Mixed-source and same-value anonymous/user fixtures assert the category partition invariant, identified precedence, zero self merge, and preserved multi-target conflict semantics.
- A 600-pair pure fixture verifies deterministic canonical counts without timing assertions or per-alias array scans.
- Aggregate fixtures omit duplicated `actorEvidenceV2.observedActorKeys`; recognized hourly root `activeActorKeys` supply observed membership.
- Hours carrying only unavailable fallback evidence do not contribute root actor keys or categories to v2 aggregation; all-unavailable input stays empty and unavailable.
- A tiny-limit pure fixture proves all v1 report fields survive the unavailable fallback, while write-boundary tests cover one BSON-too-large retry and unrelated-error propagation.
- The required TDD gate is `TEST_GREP="v2 actor metrics safeguards" npm test -- --port 3145`; this repository currently runs the full suite even when `TEST_GREP` is present.
