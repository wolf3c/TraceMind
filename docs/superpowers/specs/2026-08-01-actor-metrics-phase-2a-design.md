# Actor Metrics Phase 2A Explanation Layer Design

**Status:** Approved; not implemented

**Date:** 2026-08-01

## Goal

Make the deterministic `actorMetricsV2` contract from Phase 1 understandable in the Dashboard and MCP without changing metric computation, capture behavior, SDKs, storage, or public response structure.

Phase 2A is an explanation layer. It lets a developer answer:

- how many actor identifiers TraceMind observed;
- how many canonical user actors remain after safe identity merging;
- whether the difference comes from safe merges, operational runtimes, or unclassified actors;
- how many canonical actors were first observed in the selected report window;
- what traffic attribution counts mean and why `direct` does not prove a human visit.

It does not claim that any actor is a human, bot, registered account, or formal visit.

## Evidence And Product Result

The triggering evidence is direct target-user feedback on the AI分身术 project-health view: `12` active users, `10` new users, and `direct 10` visits looked implausibly large and could not be explained from the visible interface.

This is E1 evidence: a direct target-user problem plus code-confirmed label/contract mismatch. The number of affected projects, recurrence rate, and business loss remain unknown, so Phase 2A must not invent adoption or accuracy targets.

Repository evidence confirms the semantic gap:

- the Dashboard still labels legacy `activeUsers` and `newUsers` as users;
- Phase 1 already publishes deterministic `actorMetricsV2`, but the Dashboard does not render it;
- legacy `newUsers` means a first-seen actor identifier, not a registration;
- traffic attribution is deduplicated inside each hourly rollup by the first available `sessionId`, `presenceId`, `rawBehaviorId`, or record ID, then daily reports sum the hourly counts; the same identifier can therefore contribute again in another hour, so the result is neither a person count nor a strict 30-minute visit count;
- `direct` only means no usable attribution source was available.

The result is successful when a developer can explain the discrepancy without inspecting raw events and without TraceMind presenting an estimated or unverifiable “real user” number.

Stop after Phase 2A if the explanation is sufficient for the product decision. Escalate to a later evidence phase only when a concrete decision still cannot be answered; use an approved registration-completion event when the real need is registration truth rather than continuing to infer it from actors.

## Current Behavior

- `ProjectHealthPanel.svelte` renders `healthCurrent.activeUsers` as “Active users”.
- The side metric renders `healthCurrent.newUsers` as “new users”.
- The card trend, hourly sparkline, and retention values all use legacy v1 actor semantics.
- `health.current.actorMetricsV2` is already available through the daily-report Meteor publication and MCP `tracemind.project_health`.
- Historical or mixed reports expose `coverage: "partial"` or `coverage: "unavailable"` with all v2 count fields set to `null`.
- The traffic-source card renders attribution counts with the unit “visits”.
- The `active_users_dropped` attention rule and threshold use legacy `activeUsers` and describe the result as an active-user drop.

## Target Behavior

### Preserve The V1 Trend Axis

The existing card remains anchored to v1 because its main value, trend, hourly sparkline, and retention all share that contract:

- title: `Observed actors` / `观测 Actor`;
- main value: unchanged `healthCurrent.activeUsers`;
- trend: unchanged `health.trends.activeUsers`;
- sparkline: unchanged `health.hourlyComparison.metrics.activeUsers`;
- retention: unchanged v1 values, each visibly marked as a legacy actor metric.

Do not replace only the main value with `canonicalUserActors`. Doing so would silently combine a v2 current value with v1 trends and retention.

### Surface V2 As The Explanation

When `healthCurrent.actorMetricsV2.coverage === "complete"`:

- the card side metric shows `firstSeenCanonicalActors` as “first-seen canonical actors”;
- the expanded details show:
  - coverage;
  - `canonicalUserActors`;
  - `identifiedActors`;
  - `anonymousActors`;
  - `operationalActors`;
  - `unclassifiedActors`;
  - `firstSeenCanonicalActors`;
  - `identityMergeCount`;
  - `identityConflictCount`;
- the expanded details show this reconciliation using the returned values:

```text
observedActors
- identityMergeCount
- operationalActors
- unclassifiedActors
= canonicalUserActors
```

The details include this explicit boundary:

> Canonical user actors are based only on deterministic identity relationships. They do not prove humans, bots, registrations, or account counts.

The legacy `newUsers` value remains available only as “legacy first-seen actors”.

### Coverage And Missing Data

| State | Visible behavior |
| --- | --- |
| `complete` | Show every v2 aggregate, the reconciliation, and the first-seen canonical side metric. |
| `partial` | Show no v2 count. Explain that some completed hours lack v2 evidence and show only explicitly labelled legacy values. |
| `unavailable` | Show no v2 count. Explain that the report has no usable v2 actor evidence and show only explicitly labelled legacy values. |
| missing field | Interpret as `unavailable`; do not create a fourth API state. |
| no completed hour today | Preserve the existing “No samples yet” behavior, which takes precedence over coverage messaging. |

Never pass a nullable v2 field to the number formatter. A `null` v2 count renders as unavailable, never as `0`.

### Traffic Attribution Copy

The traffic card becomes an attribution card without changing aggregation:

- `Traffic sources` becomes `Attribution sources`;
- the unit `visits` becomes an explicit `attribution count`;
- `first-touch attribution` remains;
- expanded help states that the count sums hourly attribution rollups, the same identifier can contribute in multiple hours, and the result is not people or formal visits;
- expanded help states that `direct` means no usable referrer, UTM, or deeplink source and does not prove a human visit.

Phase 2A does not add source-by-actor cross-tabs.

### Attention And MCP Wording

- Keep the `active_users_dropped` code, threshold, comparison window, and v1 calculation unchanged.
- Change only its user-facing message from an active-user drop to an observed-actor drop.
- Keep the MCP `project_health` schema and structured result unchanged.
- Add a concise tool-description clarification that `actorMetricsV2` is deterministic actor interpretation, not human or registration truth, and that traffic attribution counts are not strict visits.
- Update MCP and technical documentation to use the same meanings.
- Do not bump agent-guidance or SDK release metadata for this copy-only MCP tool-description change.

## Data Flow And Ownership

```text
existing hourly/daily report
  -> current.activeUsers / newUsers / v1 trends and retention
  -> current.actorMetricsV2 aggregate-only explanation
  -> existing Meteor daily-report publication
  -> healthCurrent in App.svelte
  -> ProjectHealthPanel presentation

existing report
  -> existing summarizeProjectHealthFromDailyReports()
  -> existing MCP project_health structuredContent
  -> clarified tool description and documentation
```

No new data is captured, persisted, joined, or backfilled.

## File And Responsibility Map

Expected implementation files:

- `imports/ui/ProjectHealthPanel.svelte`
  - coverage-aware actor explanation;
  - legacy labels;
  - attribution wording;
  - no new card or layout axis.
- `imports/ui/i18n/locales/zh.js`
  - exact Chinese copy for the new English fallback keys.
- `imports/api/project_health_summary.js`
  - observed-actor attention message only; logic and code stay unchanged.
- `server/capture_routes.js`
  - MCP `project_health` description clarification only.
- `tests/main.js`
  - focused message/tool-description/i18n/source-copy contracts.
- `docs/mcp_design.md`
  - Dashboard/MCP actor and attribution semantics.
- `docs/semantic_event_design.md`
  - correct the claim that a runtime-managed `sessionId` is a formal visit.
- `docs/mvp_technical_plan.md`
  - health-card information hierarchy and coverage behavior.
- `docs/agent_instrumentation_guidance.md`
  - Agent interpretation boundary for actor and attribution metrics.
- `docs/tracemind_product_plan_markdown.md`
  - mark Phase 2A explanation-layer adoption while leaving later evidence work deferred.
- `docs/implementation_progress.md`
  - append implementation evidence after completion without touching existing user-owned edits.

No change is expected in:

- `imports/ui/App.svelte`;
- `client/main.css`;
- hourly/daily aggregation;
- collections, indexes, migrations, or retention;
- capture ingestion or payload validation;
- any SDK or SDK manifest;
- public Agent Skill files or their guidance-version manifest;
- `docs/product_backlog.md`.

## Cross-Runtime Impact Matrix

| Runtime / Surface | Phase 2A |
| --- | --- |
| Web | no runtime or payload change |
| iOS | no SDK or payload change |
| macOS | no SDK or payload change |
| Android | no SDK or payload change |
| React Native | no bridge, SDK, or payload change |
| Hybrid | no WebView/native behavior change |
| Mini Program | no SDK or payload change |
| Browser Extension | no SDK or payload change |
| server Node/Python/HTTP | no SDK or event change |
| MCP Node/Python runtime | no runtime capture change |
| Agent Skill runtime | no lifecycle change |
| hourly/daily reports | no computation or storage change |
| Meteor publication/API structure | no field or schema change |
| Dashboard | labels, coverage states, and v2 details change |
| MCP `project_health` | structure unchanged; tool description and docs clarify meaning |
| docs/tests | change |

## Compatibility And Failure Semantics

- Legacy fields remain present and retain their exact values.
- Old reports need no backfill and render as unavailable v2 with explicit legacy labels.
- Partial reports never show apparently precise v2 counts.
- A missing or malformed v2 field must not block the rest of the project-health card.
- Private `actorEvidenceV2`, actor HMAC keys, alias pairs, and conflict keys remain outside the UI, publication projection, and MCP response.
- No feature flag is needed: `coverage` is the natural display gate.
- No destructive migration or rollback is needed.

## Verification Strategy

Use red-green tests where a stable server or source-copy contract exists:

1. attention copy keeps the same code and threshold while saying “observed actor”;
2. MCP tool description carries the interpretation boundary without a schema change;
3. required Chinese message keys exist;
4. `ProjectHealthPanel.svelte` no longer uses the old user/visit labels.

There is no existing Svelte rendering test harness. Do not add a dependency or extract a display abstraction solely for tests. Verify the coverage branches through Svelte diagnostics plus the real rendered interface.

Required final checks:

- focused Meteor red-green commands;
- `git diff --check`;
- `npx svelte-check`;
- `npm test`;
- browser verification for Chinese and English, desktop and mobile, and complete/unavailable states;
- MCP/Dashboard value comparison for one complete report;
- no diff under `sdk/`, report aggregation, collection definitions, or public Agent Skill release artifacts.

## Rollout And Rollback

- Keep the already committed Phase 1 change and Phase 2A implementation in separate commits.
- Phase 1 and Phase 2A may ship in the same release.
- Reports generated before Phase 1 remain visibly legacy/unavailable.
- Mixed days remain partial until a complete v2 report window is available.
- Verify the first complete report against MCP and the Dashboard; continue observing subsequent reports without inventing a pass-rate target.
- If presentation is wrong, revert only Phase 2A and keep additive Phase 1 evidence.
- If the entire release is rolled back, no cleanup or data deletion is required.

## Success Criteria

- The project-health interface contains no “new users” label for legacy `newUsers`.
- The actor card never associates a v2 value with a v1 trend, sparkline, or retention label.
- Complete coverage shows all aggregate v2 fields and a correct reconciliation.
- Partial, unavailable, and missing v2 data never render `null` as `0`.
- Legacy first-seen and retention values are explicitly labelled.
- Traffic attribution is not called a visit, and `direct` is explained.
- Dashboard and MCP return and explain the same actor values.
- Existing report, API, SDK, capture, and privacy contracts are unchanged.

## Simplicity Review

Phase 2A deliberately adds no:

- card, page, tab, or metric switcher;
- feature flag;
- endpoint, response field, collection, index, or migration;
- SDK or capture field;
- human/bot score;
- visit/session algorithm;
- registration event;
- v2 trend, retention, or alert rule;
- actor/source cross-table;
- historical backfill.

The smallest correct design is to keep the v1 trend axis honest and use v2 only to explain its composition.

## Out Of Scope

- Human or bot probability scoring.
- Known-bot UA lists, IP/ASN reputation, webdriver collection, or probe filtering.
- Thirty-minute visit calculation or SDK session lifecycle changes.
- Registration-completion events or verified-account metrics.
- V2 trends, retention, or attention thresholds.
- Permanent identity graphs or cross-project joins.
- Source-by-actor classification.
- Historical backfill.
- Deployment, production data mutation, or feedback-status updates.
