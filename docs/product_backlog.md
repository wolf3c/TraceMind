# TraceMind Product Backlog

> Last reviewed: 2026-08-12
>
> This is the source of truth for active product and release follow-up work. Completed implementation history remains in [`implementation_progress.md`](./implementation_progress.md).

## Status Definitions

- `待发布`: implementation is committed but not live.
- `待验证`: implementation is live but product/runtime evidence is incomplete.
- `待方案`: the problem is confirmed, but a product or contract decision is still required.
- `待实施`: the contract is clear and implementation has not started.
- `已闭环`: implementation, production evidence, and feedback/status follow-up are complete.

## Recommended Order

1. Publish and verify Web capture retry idempotency before closing feedback `ouLvFZr46JkPZ4a4T`.
2. Close the release and production-verification loop for runtime-context recovery attribution.
3. Design proactive incident and recovery notifications.
4. Roll the shared runtime-context contract out to applicable SDK runtimes.
5. Add Dashboard visualization after production data proves the contract is useful and stable.

## Active Items

| ID | Priority | Status | Item | Evidence / Dependency | Next Review |
| --- | --- | --- | --- | --- | --- |
| TM-REL-001 | P2 | 待验证 | Release and verify runtime-context delivery recovery attribution | Release `2026.7.23-1` deployed from `88f3e81`; first live `new_runtime_recovery` evidence received; 24-hour observation pending | 2026-07-24 after the observation window |
| ouLvFZr46JkPZ4a4T | P1 | 待发布 | Publish and verify Web capture retry idempotency | Local implementation and regression/full tests are complete; controlled production response-loss verification remains | After the next production release |
| TM-ALERT-001 | P2 | 待方案 | Add proactive important-incident and recovery notifications | Feedback `oSYMbGhavJYRp6KLp`; depends on incident lifecycle, thresholds, channels, and dedupe policy | Next product-planning review |
| TM-RUNTIME-002 | P2 | 待实施 | Extend runtime context to applicable native/client SDKs | Shared contract exists; Web/Hybrid WebView is the reference implementation | After TM-REL-001 evidence review |
| TM-DASH-001 | P3 | 待方案 | Visualize recovery classification, evidence quality, and coverage in Dashboard | Depends on stable production data from TM-REL-001 | After production evidence is representative |

## Result Cards

### `ouLvFZr46JkPZ4a4T` — Web capture retry idempotency

- Technical status: `待发布`; implemented and verified locally, not deployed.
- Problem evidence: Web queue records already have a stable local ID, but capture batches previously discarded it before transport, so a response lost after server persistence allowed the same `app_error` occurrence to be inserted again.
- Target user and scenario: a customer relying on Web or Hybrid WebView error counts and project health while intermittent transport failures trigger queue retries.
- Expected result: one client occurrence produces one Raw Behavior and one Semantic Event even when the same queue record is delivered more than once; distinct occurrences remain distinct.
- Success criteria:
  - the generated Web capture payload reuses the queue record ID as an internal `clientEventId` on every attempt;
  - the same `projectId + clientEventId` is acknowledged without a second Raw Behavior, while a different ID with the same error fingerprint is accepted;
  - another project may independently use the same client ID;
  - the field does not enter public MCP, Dashboard, Semantic Event, or business properties;
  - legacy clients without the field remain compatible, and delivery retry diagnostics remain available;
  - feedback `ouLvFZr46JkPZ4a4T` stays open until release and controlled production verification pass.
- Minimum validation: focused red/green Web and server tests, full repository tests, then one controlled response-loss retry against TraceMind's own project with exactly one resulting Raw/Semantic occurrence.
- Owner: TraceMind owner.
- Failure action: keep the feedback open and roll back the Web/server release if event loss, false deduplication, or privacy regression appears.

### TM-REL-001 — Release runtime-context recovery attribution

- Problem evidence: legacy recovery duration is an unattributed wall-clock interval and cannot distinguish foreground, background, offline, unknown, or a new runtime.
- Target user and scenario: a customer or coding agent diagnosing why captured product behavior arrived late.
- Expected result: production diagnostics explain recovery using evidence-backed duration composition without exposing runtime or episode identifiers.
- Release evidence (2026-07-23): Galaxy and Cloudflare published release `2026.7.23-1` / Web guidance `2026.07.23.1`; production diagnostics returned one high-quality `new_runtime_recovery` sample with 1,125 ms attributed as 502 ms foreground-online plus 623 ms runtime-absent, without runtime or episode identifiers.
- Remaining validation: controlled foreground, background, offline, and Hybrid checks; clearance of pre-release Web/SDK health snapshots; and 24 hours of normal-traffic observation.
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

### TM-SRC-001 — Align blocked-source boundaries（已闭环）

- Problem evidence: an exact blocked source could still write delivery diagnostics and hourly health, while related Web and `server_app` sources lacked an explicit independent-management contract.
- 2026-07-28 implementation decision: blocking matches only the exact `sourceType + sourceKey` and is forward-only. Related Web and `server_app` sources must be blocked separately; existing historical evidence remains queryable. New blocked-source capture, presence, user feedback, delivery diagnostics, and hourly health writes are all ignored. Mixed-source batches keep per-event business processing but omit indivisible batch-level delivery statistics instead of attributing them from the first event.
- Target user and scenario: customers who need local, test, or unauthorized sources excluded from product-health and MCP analysis.
- Expected result: the block model has explicit ingestion and historical-analysis semantics across source types.
- Closure evidence (2026-07-28): release `2026.7.28-1` deployed the implementation. Controlled `web:localhost` capture, presence, and user-feedback requests returned success while adding zero business, delivery-diagnostic, hourly-health, or ingestion-guard writes. A temporary exact `server_app` block independently produced zero writes; the temporary block was removed and left no test data. Feedback `MDCQuC9N4j9kyPDrJ` and `SrvgpyG4bbPkGyHzR` were then marked `resolved`.
- Success criteria:
  - production uses exact `sourceType + sourceKey` blocking without cross-source wildcard behavior;
  - blocked capture, presence, user feedback, delivery diagnostics, and hourly health no longer add new evidence;
  - historical evidence remains queryable and related Web/`server_app` sources remain independently manageable;
  - mixed-source batches process business records per event without attributing indivisible delivery statistics to the first source;
  - console copy, documentation, tests, and production behavior use the same policy;
  - feedback `MDCQuC9N4j9kyPDrJ` and `SrvgpyG4bbPkGyHzR` are resolved only after production verification.
- Minimum validation: deploy the committed server/UI change, block controlled Web and `server_app` sources separately, verify new business and delivery-health writes are absent, and confirm historical evidence remains queryable.
- Owner: TraceMind owner.
- Failure action: keep both feedback reports open and roll back the server/UI release if exact-source ingestion, delivery health, or historical query behavior regresses.

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

| ID | Priority | Closed | Release / Verification | Closing Evidence |
| --- | --- | --- | --- | --- |
| TM-SRC-001 | P1 | 2026-07-28 | `2026.7.28-1`; controlled production checks on 2026-07-28 | Exact blocked Web and `server_app` sources produced zero new business or observability writes; temporary configuration was removed; linked feedback reports were marked `resolved`. |
