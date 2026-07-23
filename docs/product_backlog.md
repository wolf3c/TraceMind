# TraceMind Product Backlog

> Last reviewed: 2026-07-23
>
> This is the source of truth for active product and release follow-up work. Completed implementation history remains in [`implementation_progress.md`](./implementation_progress.md).

## Status Definitions

- `待发布`: implementation is committed but not live.
- `待验证`: implementation is live but product/runtime evidence is incomplete.
- `待方案`: the problem is confirmed, but a product or contract decision is still required.
- `待实施`: the contract is clear and implementation has not started.
- `已闭环`: implementation, production evidence, and feedback/status follow-up are complete.

## Recommended Order

1. Close the release and production-verification loop for runtime-context recovery attribution.
2. Fix the P1 blocked-source boundary so local/server telemetry cannot pollute customer analysis.
3. Design proactive incident and recovery notifications.
4. Roll the shared runtime-context contract out to applicable SDK runtimes.
5. Add Dashboard visualization after production data proves the contract is useful and stable.

## Active Items

| ID | Priority | Status | Item | Evidence / Dependency | Next Review |
| --- | --- | --- | --- | --- | --- |
| TM-REL-001 | P2 | 待发布 | Release and verify runtime-context delivery recovery attribution | Feedback `Mfnoo3g4ayyLxyD9w`; local commit `549a7f0`; release/deploy pending | Release + 24 hours |
| TM-SRC-001 | P1 | 待方案 | Align blocked-source policy across Web and `server_app` ingestion and analysis | Feedback `SrvgpyG4bbPkGyHzR`; historical event-query semantics need a product decision | Before next feature work |
| TM-ALERT-001 | P2 | 待方案 | Add proactive important-incident and recovery notifications | Feedback `oSYMbGhavJYRp6KLp`; depends on incident lifecycle, thresholds, channels, and dedupe policy | After TM-SRC-001 |
| TM-RUNTIME-002 | P2 | 待实施 | Extend runtime context to applicable native/client SDKs | Shared contract exists; Web/Hybrid WebView is the reference implementation | After TM-REL-001 evidence review |
| TM-DASH-001 | P3 | 待方案 | Visualize recovery classification, evidence quality, and coverage in Dashboard | Depends on stable production data from TM-REL-001 | After production evidence is representative |

## Result Cards

### TM-REL-001 — Release runtime-context recovery attribution

- Problem evidence: legacy recovery duration is an unattributed wall-clock interval and cannot distinguish foreground, background, offline, unknown, or a new runtime.
- Target user and scenario: a customer or coding agent diagnosing why captured product behavior arrived late.
- Expected result: production diagnostics explain recovery using evidence-backed duration composition without exposing runtime or episode identifiers.
- Success criteria:
  - commit `549a7f0` and its release state are pushed through the guarded TraceMind release workflow;
  - Galaxy and the published Web capture script/guidance report release `2026.07.23.1`;
  - controlled production checks verify foreground, background, offline, and new-runtime recovery behavior;
  - `tracemind.query_delivery_diagnostics` returns attributed classifications, duration composition, evidence quality, and no internal runtime/episode IDs;
  - hourly and daily health preserve exact totals and derive averages from total duration and sample count;
  - feedback `Mfnoo3g4ayyLxyD9w` is marked resolved only after the evidence above passes.
- Minimum validation: deploy, run controlled Web/Hybrid checks, inspect MCP diagnostics and project health, then observe normal traffic for 24 hours.
- Owner: TraceMind owner.
- Failure action: keep the feedback open, classify the failing runtime/aggregation boundary, and roll back the Web release if capture delivery or privacy regresses.

### TM-SRC-001 — Align blocked-source boundaries

- Problem evidence: blocking `web:localhost` does not block `server_app` events, and current event/raw queries do not reapply project blocked-source policy.
- Target user and scenario: customers who need local, test, or unauthorized sources excluded from product-health and MCP analysis.
- Expected result: the block model has explicit ingestion and historical-analysis semantics across source types.
- Success criteria:
  - decide whether blocking affects only future ingestion or also hides historical evidence from MCP/health;
  - define how related Web and `server_app` sources are grouped without broad accidental blocking;
  - blocked sources cannot add new health/analysis evidence;
  - query behavior, project health, source management, documentation, and tests use the same policy;
  - feedback `SrvgpyG4bbPkGyHzR` is resolved only after production verification.
- Minimum validation: reproduce with a test source, apply the chosen policy, verify capture rejection and all relevant query/health surfaces.
- Owner: TraceMind owner.
- Failure action: do not use hostname-only or cross-source wildcard blocking until the false-positive risk is understood.

### TM-ALERT-001 — Proactive incident and recovery notifications

- Problem evidence: project health can create attention items, but TraceMind has no outbound incident lifecycle or recovery notification.
- Target user and scenario: a small product team that does not continuously watch the Dashboard or ask an agent for health.
- Expected result: important incidents and recoveries reach the configured destination once, with privacy-safe evidence and a clear lifecycle.
- Success criteria:
  - define incident trigger, severity, open/update/recovered states, cooldown, dedupe, and suppression;
  - choose initial notification channel and ownership model;
  - prevent transient noise and repeated recovery messages;
  - link each notification to privacy-safe project-health evidence;
  - feedback `oSYMbGhavJYRp6KLp` is resolved only after end-to-end delivery and recovery verification.
- Minimum validation: one controlled incident, one deduplicated ongoing state, and one recovery notification.
- Owner: TraceMind owner.
- Failure action: keep alerts opt-in and do not expand channels until false-positive and delivery evidence is acceptable.

### TM-RUNTIME-002 — Extend runtime context across client SDKs

- Problem evidence: phase 1 changes Web and Hybrid WebView only; iOS, macOS, Android, React Native, Mini Program, and Browser Extension still lack equivalent evidence.
- Target user and scenario: customers analyzing the same product across multiple client runtimes.
- Expected result: applicable runtimes emit the shared contract using platform-native lifecycle/connectivity evidence.
- Success criteria:
  - publish a per-runtime impact matrix and implement in small SDK releases;
  - preserve platform-specific evidence and confidence instead of forcing Web semantics;
  - add runtime-owned tests, SDK manifest updates, release checks, and public setup guidance;
  - keep server apps, MCP servers, and static Agent Skills outside foreground/background semantics.
- Minimum validation: start with one native runtime, verify production evidence, then expand platform by platform.
- Owner: TraceMind owner.
- Failure action: mark unsupported evidence as `unknown`; never infer foreground, background, or offline state.

### TM-DASH-001 — Visualize recovery evidence

- Problem evidence: phase 1 exposes the data through MCP and health contracts but makes no visible Dashboard change.
- Target user and scenario: a customer who wants to inspect delivery recovery without composing an MCP query.
- Expected result: the Dashboard makes attributed versus legacy recovery, classification, evidence quality, and coverage understandable.
- Success criteria:
  - show attributed and legacy wall-clock durations separately;
  - expose coverage and unknown evidence without presenting estimates as facts;
  - provide endpoint/runtime filtering only where the data contract supports it;
  - preserve the existing health hierarchy and avoid exposing internal IDs.
- Minimum validation: design against representative production data after TM-REL-001's observation window.
- Owner: TraceMind owner.
- Failure action: defer visualization if production sample volume or classification quality is not representative.

## Closed Items

Move an item here only after its implementation, production evidence, and linked feedback/status updates are complete. Record the release, verification window, and closing evidence.
