# TraceMind MVP Implementation Progress

## 2026-06-11

### Completed

- Added local page-shell caching for repeat TraceMind Web console opens. The service worker caches only the anonymous shell, PWA assets, and same-origin static resources while keeping project data, MCP responses, capture APIs, presence, feedback, login-state content, and Meteor realtime connections online-only.

## 2026-06-05

### Completed

- Added installable PWA support for the TraceMind Web console with a Web App Manifest, app icons, Apple home-screen metadata, a conservative service worker baseline, and an explicit install entry that keeps dashboard data online-only.

## 2026-06-02

### Completed

- Updated the developer console setup panel so configuration details default collapsed while the Coding Agent install-prompt copy action remains visible as the primary setup path, with a mobile-first single-task layout.
- Added privacy-safe setup attempt tracking so successful install-prompt copies can be followed through natural MCP connection, `capture_setup`, first capture, and first manual event without changing the customer agent workflow.
- Added Google and GitHub OAuth login alongside the email verification-code fallback, with same-email account binding so existing developer projects are reused.

## 2026-06-01

### Completed

- Split Web Auto Capture script distribution from the Galaxy API origin: production `capture_setup` can return Cloudflare Pages `capture.js` while the script still posts capture, presence, and feedback traffic to Galaxy.
- Added static capture-script build and publication checks for Cloudflare Pages, including stable entry headers, immutable hash assets, release-id validation, CORS, ETag, and no-cookie checks.

## 2026-05-29

### Completed

- Optimized Web Auto Capture script delivery: `/capture.js` remains the stable customer snippet URL and directly serves a minified script with short caching plus an ETag, while content-hashed immutable assets remain available without becoming the default customer contract.

## 2026-05-28

### Completed

- Extended server `tracemind.capture_setup` output with `projectKeyUsage`, `configurationModes`, `preDeployChecks`, `postDeployVerification`, and `expectedCaptureQuery` so coding agents can verify service-side capture after deployment instead of treating a 0 query as customer inactivity.
- Clarified server project key handling across MCP output, console install prompts, public Skill/AGENTS guidance, README, and design docs: inline public `projectKey` is the default, optional `TRACEMIND_PROJECT_KEY` is only an engineering preference, and MCP tokens, Bearer tokens, or TraceMind internal dogfood config are never customer capture keys.
- Updated `tracemind.check_agent_setup` to warn when local Skill/AGENTS rules lack server deploy verification or projectKey/token separation guidance.

## 2026-05-25

### Completed

- Added privacy-safe Error Context Capture through the new `app_error` semantic event type. It records sanitized error summaries for behavior-context analysis and counts as a health failure signal without becoming a crash-reporting or session-replay system.
- Added Web automatic `window.error` / `unhandledrejection` summary capture plus `window.TraceMind.captureError(...)`; browser-extension owned pages get equivalent safe JS error summaries where the runtime exposes event listeners.
- Added manual `captureError` helpers across Swift iOS/macOS, Android, React Native, Mini Program, Browser Extension, Node server, and Python server SDKs. Server SDKs remain manual only and do not install request hooks, log hooks, DB hooks, or crash reporters.
- Added ingestion and MCP validation guards so `app_error` only accepts primitive summary fields and omits stack traces, raw logs, source code, request/response bodies, headers, cookies, authorization values, input values, raw prompts, secrets, screenshots, recordings, and full query URLs.
- Updated setup responses, README, semantic docs, and coding-agent guidance so agents treat `app_error` as an approved but privacy-limited product error context signal.

## 2026-05-06

### Completed

- Replaced Meteor tutorial UI with a TraceMind landing page and developer console.
- Replaced custom verification-code login with Meteor `accounts-passwordless`.
- Added Mailgun SMTP delivery through Meteor `email` when `MAIL_URL` is configured.
- Added project creation and public project keys for capture.
- Added one-line `/capture.js` auto capture script.
- Added `/api/capture` raw behavior ingestion.
- Added scheduled Raw Behavior -> Semantic Event extraction.
- Added user identity fields, anonymous IDs, session IDs, device IDs, lightweight device fingerprints, device info, IP, passive geo headers, and custom `properties` / `context` fields to the capture and semantic event model.
- Added cross-platform capture source fields, source statistics in the developer console, and project-level source blocking for suspicious public project-key writes.
- Added DAU, unique user, and unique device summary output.
- Added `/mcp` remote MCP endpoint with JSON-RPC `initialize`, `tools/list`, `tools/call`, and `ping`, plus a GET preview for manual debugging.
- Added independent multi-token MCP authorization so MCP access no longer reuses the public Auto Capture project key.
- Added MCP analysis tools for event definitions, filtered semantic event queries, filtered raw behavior queries, and filtered summaries, so AI coding agents can answer product usage questions from behavior evidence.
- Added concise technical design docs for auth, capture, semantic extraction, MCP, and the MVP architecture.
- Added Meteor Mocha coverage for normalization, semantic event building, summaries, and login/project creation.
- Added deployment config for running TraceMind as an independent app, now served from `https://tracemind.sandbox.galaxycloud.app`, plus deployment docs and commands.

## 2026-05-07

### Completed

- Updated `imports/ui/App.svelte` to Svelte 5 runes for local state, derived dashboard values, and external subscription effects.
- Added `imports/ui/i18n` support for English and Chinese UI text, including locale normalization, persisted language selection, translated status messages, translated confirmation text, and a console language selector.
- Switched UI copy to English source-text translation keys so `en.js` can rely on fallback behavior while `zh.js` carries only Chinese overrides.
- Added `DESIGN.md` and refreshed the first viewport into a darker AI behavior cockpit with a live stream preview, signal metrics, and clearer semantic chips.
- Refined the landing-page positioning around the developer outcome: one script turns real user behavior into product signals that can be questioned from Codex, Claude Code, or Cursor through MCP.
- Replaced the placeholder `T` favicon and navigation mark with the Calm Glyph brand icon, combining a clean Mind glyph with a subtle behavior trace.
- Removed Flowbite-Svelte after evaluating its limited product fit and Meteor Rspack integration cost; repeated cards, form fields, selects, textareas, alerts, and badges now use local semantic markup and CSS primitives.
- Added Meteor Mocha coverage for i18n locale normalization, compact English fallback, required Chinese overrides, fallback translation, and interpolation.
- Added public coding-agent guidance resources under `/agents/tracemind/`, a dynamic console install prompt that injects the current MCP URL with skill fallback and global-MCP confirmation handling, and MCP tools for guidance version checks, event-name search, instrumentation suggestions, payload/diff validation, and privacy checks.
- Added explicit console authentication restore states so production refreshes show session/dashboard loading instead of briefly flashing the email login form, with retry handling for authenticated dashboard load failures.
- Kept login status feedback inline, dismissible, and transient for successful states so verification-code messages do not cover the login controls.
- Added current-project selection in the developer console so newly created projects are selected immediately and existing multi-project accounts can switch the displayed project key, capture script, MCP URL, source stats, and token controls.
- Tightened the authenticated setup console with shorter Chinese-first copy, adjacent copy buttons for the project key, capture script, and install prompt, token-scoped MCP URL copy actions, plus collapsed advanced areas for the full agent prompt and MCP token management.
- Localized the coding-agent setup prompt so Chinese UI produces Chinese install instructions while English and other locales produce English instructions.
- Split the multi-project console into account identity, current-project setup, and current-project events so behavior metrics, source stats, and recent events share the same selected-project scope.
- Added `tracemind.capture_setup` so coding agents can retrieve the current project's Web Auto Capture script through MCP before adding manual custom events.
- Added explicit project summary window metadata and pure console-state helpers so current-project counts stay full-scope while users, DAU, devices, and stale-response handling are easier to reason about and test.
- Moved project creation into the project selector, added a right-side project actions menu for rename/delete on desktop and mobile, and made project deletion a hard delete of the project plus raw and semantic event data.
- Added a 24-hour event total beside the detailed event stream so the recent rows remain scannable while the console still shows selected-project volume.

### Not Yet Included

- SSE streaming and OAuth-style MCP authorization discovery.
- LLM-based semantic enrichment.
- Multi-user project membership and team permissions.
- Production retention, quota, masking, and replay controls.
- Production-grade IP geo enrichment beyond proxy/CDN headers.

### Next Recommended Slice

Validate the MVP locally with:

```bash
npm test
npm start
```

Then add the capture snippet to a small test web page, generate several interactions, and verify that `/mcp?mcpToken=...` or a Bearer MCP token returns semantic events.

## 2026-05-08

### Completed

- Aligned the developer console UI more closely with `DESIGN.md`: compacted the hero status treatment, moved MCP readiness into the live-data panel, added a selected-project console header, and changed recent project events from a loose text list into dense behavior-evidence rows with event type, time, path, source, and actor metadata.
- Extended `tracemind.capture_setup` with platform-specific setup output for Web, iOS, macOS, Android, and React Native while keeping Web as the default.
- Expanded TraceMind coding-agent guidance so native setup uses structured MCP fields for install commands, files to edit, initialization location, idempotency checks, verification commands, source model, and privacy constraints.
- Added `/api/capture` batch ingestion for SDK queues using `{ projectKey, events: [...] }`, with per-event source normalization and source blocking.
- Added initial native SDK packages under `sdk/ios`, `sdk/android`, and `sdk/react-native`, including one-line `TraceMind.start(...)` entrypoints, target hashing, sensitive-field filtering, local queueing, and batch flush paths.
- Added native manual capture parity with Web: `TraceMind.identify(...)`, primitive string/number/boolean properties and context, user identity persistence, and React Native bridge forwarding.
- Added independent user presence sessions for Web, iOS, macOS, Android, and React Native: `/api/presence`, `tracemind_presence_sessions`, 5-second foreground heartbeat, route/screen/window/background segment boundaries, and dashboard/MCP online-duration summaries without polluting raw or semantic events.
- Simplified the developer console setup panel so environment-specific install and usage instructions live in documentation, while the console keeps only the project key, setup docs link, and Coding Agent entrypoint.
- Updated Auto Capture, semantic event, MCP, README, and coding-agent documentation for cross-platform capture and native manual capture guidance.
- Extended TraceMind setup planning to third-party MCP server and Agent Skill instrumentation with new `mcp_node`, `mcp_python`, and `agent_skill` setup surfaces, safe MCP runtime event types, and SDK test coverage for MCP tool/resource/prompt metadata capture.
- Added ordinary server application manual capture planning with `server_node`, `server_python`, and `server_http` setup surfaces, `server_app` source identity, and SDK coverage for safe primitive business events without request Auto Capture.
- Simplified the second landing section from a four-step checklist into two product capabilities: one-script Auto Capture and AI-driven analysis/instrumentation, removing routine login steps from the mobile feature surface.

### Not Yet Included

- Automatic network hook, crash reporting, session replay, screenshots, or native view snapshots.
- Published package manager distribution for SwiftPM, Gradle, or npm.
- Generic server request Auto Capture, request/response logging, HTTP hooks, database hooks, crash reporting, and log capture.
- Device-lab integration smoke tests against real iOS/macOS/Android/React Native sample apps.

## 2026-05-09

### Completed

- Reworked the selected-project analytics area into a developer-facing project health overview with selected-date daily report comparisons.
- Added health summary aggregation for active users, new users, cohort retention, active sessions, strict active duration, event totals, top regions/devices/pages/events, and high-confidence attention items.
- Moved raw behavior and semantic event counts out of the primary cards so the console emphasizes project operating state instead of TraceMind pipeline internals.
- Added stable Auto Capture target identity and action aggregation: Web now resolves interactive ancestors, prefers existing engineering identifiers, emits `targetIdentity`, `identityConfidence`, `actionKey`, and keeps raw `target` details for investigation.
- Completed core Web signal coverage for product analysis: debounced input edits, change events, submit intent, `replaceState`, `hashchange`, and query-free event paths.
- Added manual capture compatibility fields (`relatedActionKey`, `relatedTargetHash`, `correlationId`) so business-result events can be correlated with auto-captured actions without overriding manual `eventName`.
- Aligned native SDK payloads with the Web action model and improved capture targets: iOS now hooks `UIControl` actions, macOS records AppKit app/window screen changes, Android resolves the touched view instead of relying only on focus, and React Native preserves native platform behavior while marking framework metadata.

## 2026-05-11

### Completed

- Added a reliable Web Auto Capture queue backed by `localStorage`, with batched flushes, retry backoff, queue caps, oldest-record dropping, manual `TraceMind.flush()`, and non-sensitive `TraceMind.status()` diagnostics.
- Moved Web presence onto the same reliable queue and coalesced pending heartbeat records by `presenceId` so offline heartbeats do not crowd out behavior events.
- Added batch presence ingestion and `tracemind_capture_delivery_reports` so capture/presence batches can report accepted, ignored, retry, drop, coalescing, and queue-depth diagnostics without creating semantic events.
- Added a compact delivery health summary to the selected-project dashboard/API and updated Web setup documentation for the queue and cross-network troubleshooting path.
- Cleaned up dashboard health-detail Top 3 rows so long user IDs, paths, and event names render as separate ranked entries instead of a dense joined string.
- Added health-summary bounce-page analysis that reports `topBouncePages` for the selected date and previous day, using session-level presence plus route/interaction evidence and showing the Top 3 in the average-active-time details.
- Added strict active-duration accounting on presence records. Web now stops strict active time on `window.blur` and only accrues when visible, focused, and inside a 60-second interaction window; iOS/Android/RN use the same foreground + recent tap/text/screen contract. Dashboard health active-time metrics now use `activeDurationMs`; foreground presence `durationMs` remains available for online/session summaries.

## 2026-05-12

### Completed

- Added `tracemind_feedback_reports` and the `tracemind.submit_feedback` MCP tool so coding agents can submit sanitized developer issues or ideas with TraceMind evidence references after developer confirmation.
- Kept feedback separate from `/api/capture`, raw behaviors, and semantic events; MCP analysis tools remain read-only while feedback submission is the single MCP write path.
- Added MCP feedback deduplication and per-token rate limits so repeated agent submissions do not inflate the feedback table or operational signal.
- Updated MCP, Skill, agent snippet, token, and product wording to describe MCP as behavior evidence access plus controlled feedback submission.
- Added terminal user feedback capture through SDK `submitFeedback`, `/api/user-feedback`, and the independent `tracemind_user_feedback_reports` collection. Reports keep structured `message` objects with consented contact/custom fields, attach recent behavior evidence references automatically, and remain separate from raw/semantic analytics events.
- Added `tracemind.query_user_feedback` and `tracemind.update_user_feedback` so coding agents can list, inspect, status-mark, note, resolve, link, or de-duplicate user feedback without editing the original user message.
- Added `tracemind_project_daily_reports` for selected-project health. The dashboard now reads Asia/Shanghai daily reports, uses a one-minute draft refresh floor for today, and compares the selected date with the previous day instead of scanning all historical semantic events and presence sessions on every refresh.
- Moved selected-project health date switching onto Meteor pub/sub. The Web dashboard now subscribes to sanitized daily report documents and derives the health cards from Minimongo, while today's report refresh is queued lazily and historical dates no longer trigger synchronous report backfills from the click path.
- Stored hashed daily actor sets inside reports so D2/D3/D7/D30 retention can be computed by report intersections without exposing raw actor ids in the report payload.
- Added daily report finalization and query indexes for project/date and project/time-window reads across semantic events, presence sessions, raw behaviors, and delivery reports.
- Expanded startup index creation for the current hot paths: project key capture writes, MCP token lookup, developer ownership, presence upserts, pending semantic extraction, MCP feedback dedupe/rate-limit checks, and common event/raw drilldowns by event name, event type, action key, and target hash. The index set stays focused on existing query paths to avoid unnecessary write overhead.
- Split the dashboard event stream from selected-project health loading. The event stream now starts collapsed, loads the selected day on demand in 20-event pages, and uses a "load more" control instead of bundling recent events into the health summary response.
- Moved developer profile and project setup metadata to owner-scoped Meteor pub/sub. The console now reuses Minimongo for account/project switching, project keys, MCP token controls, and blocked-source state, while mutation paths remain server methods.

## 2026-05-14

### Completed

- Collapsed the authenticated project setup panel by default so returning developers see the selected project's health data sooner.
- Kept the collapsed setup header intentionally minimal: the project switcher, a specific setup-details toggle, and a project-count hint only for multi-project accounts are the only visible setup controls until the developer opens the panel.

## 2026-05-15

### Completed

- Added a today-only recent-online health card that lazily loads after the main project health cards, using a separate `tracemind.project.recentOnline` method so daily reports and setup metadata remain on the fast path.
- The card reports unique online users in the last 30 minutes, 5-minute online-user buckets, and expandable Top 3 details for region distribution, longest active-duration pages, and frequent events.
- Kept the recent-online count grounded in presence actors (`userId`, `anonymousId`, `deviceId`, or `deviceFingerprint`) rather than session ids, matching the existing dashboard active-user semantics.

## 2026-05-17

### Completed

- Added privacy-safe first-touch traffic attribution for new Web visits, limited to whitelisted UTM fields, referrer domain/type, landing path, and boolean ad-click markers.
- Extended attribution production beyond Web: iOS/macOS can call `TraceMind.recordOpenURL(...)` or `TraceMind.setAttribution(...)`, Android can call `TraceMind.recordDeepLink(...)` or `TraceMind.setAttribution(...)`, React Native forwards both helpers to the native SDKs, and server SDKs accept already-sanitized manual attribution without inferring request traffic source automatically.
- Stored sanitized attribution on raw behaviors, semantic events, and presence sessions, with dashboard health summaries and MCP/API filters for traffic source, medium, campaign, and landing path.
- Updated `tracemind.capture_setup`, public Skill guidance, agent snippets, and manifest so customer coding agents can both set source attribution during manual instrumentation and analyze source-related changes through MCP filters.
- Clarified that capture source governance (`sourceType + sourceKey`) tracks apps and SDKs writing to a project key, while traffic attribution tracks where users arrived from.
- Documented that old events cannot be reliably backfilled because full inbound query/referrer/deeplink context was intentionally not stored.
- Added the generic `sdk/mini-program` runtime and `tracemind.capture_setup({ platform: "mini_program", provider })` so WeChat, Alipay, Douyin, and DingTalk mini programs share one SDK while preserving `sourceDetails.provider`.
- Added the generic `sdk/browser-extension` runtime and `tracemind.capture_setup({ platform: "browser_extension" })` so Chrome, Edge, and Firefox extensions share one SDK while preserving safe `sourceDetails.browser`, `manifestVersion`, `runtimeContext`, and `sdkVersion` metadata.
- Updated `tracemind.capture_setup`, README, MCP design, public Skill, AGENTS snippet, and agent setup prompts so SDK platforms use explicit `distributionMode: "local_source"` install guidance with GitHub clone, `vendor/` copy, local file dependency, SwiftPM local path, Gradle module, or PYTHONPATH instructions instead of implying registry-published packages.
- Added SDK release governance for vibe-coding customers: `sdk/release_manifest.json`, `npm run update:sdk-manifest`, `npm run test:sdk-release`, CI gating, `.tracemind-sdk.json` vendored install manifests, runtime `sourceDetails.sdkVersion/sdkContentHash`, and `project_health` SDK upgrade findings.
- Added the deploy-time SDK GitHub source publication gate: release manifests point at immutable `tracemind-release-<version>` tags, `$deploy` must push `origin main` plus the release tag before Galaxy deployment, and `npm run check:deploy-git-publication -- <version>` verifies the remote refs match `HEAD`.

## 2026-05-20

### Completed

- Added registry-first SDK release metadata so npm, PyPI, and Maven Central backed SDKs can return package-manager install commands from `tracemind.capture_setup`, while Swift remains local source.
- Added the `SDK Publish` tag workflow and `npm run check:sdk-registry-publication -- <version>` gate so `$deploy` waits for registry publication before the single Meteor deploy step.
- Added npm/PyPI/Android publication metadata and package staging support for release-tag driven SDK publishing without committing registry credentials.

## 2026-05-21

### Completed

- Added TraceMind self-instrumentation for product usage with the public `@tracemind/server-node` SDK: the server records one internal `customer_project_capture_active` custom event per customer project per Asia/Shanghai day when `/api/capture` or `/api/presence` first accepts data.
- Kept the metric queryable through existing MCP analysis tools: `summary.totalEvents` counts active customer projects and `summary.uniqueUsers` counts active customer accounts for the internal event.
- Added a `tracemind_product_usage_markers` de-duplication collection so capture and presence can both trigger the metric without double-counting the same project/day, while skipping TraceMind's own internal project to avoid recursive pollution.
- Added product usage instrumentation health to `tracemind.summary` for `customer_project_capture_active`, so agents can distinguish missing config or failed internal marker delivery from true zero customer activity.
- Changed product usage markers to move through `pending`, `sent`, and `failed` states; markers are only `sent` after the internal capture flush succeeds, and failed or stale pending markers can retry on later same-day activity.
- Added hourly health rollups under `tracemind_project_hourly_reports` and now builds selected-project daily health from completed hours. Today's health compares completed hours with yesterday's matching hours, while historical dates still aggregate full days.
- Published the new health window metadata through Dashboard and MCP (`granularity: "hour_rollup"`, `comparisonMode`, and hour counts) so agents and the UI do not treat a partial day as comparable with yesterday's full day.
- Added sanitized hourly comparison series to project health and rendered compact in-card trends for active users, active sessions, average active time, and total events, with hover/click detail for the selected hour and yesterday's matching hour.
- Added a full-site Web feedback widget that submits terminal user feedback through `window.TraceMind.submitFeedback` and the dedicated `/api/user-feedback` pipeline, keeping it separate from capture events and MCP developer feedback.

## 2026-06-04

### Completed

- Added a completed-hour draft refresh job that checks projects with recent behavior, presence, semantic events, or delivery diagnostics every 5 minutes and updates today's `tracemind_project_daily_reports` draft from hourly rollups.
- Changed today's manual project-health refresh to reuse the completed-hour draft path with per-project/date queue deduplication, so repeated clicks do not trigger redundant full-day hourly recomputation.
- Kept final daily reports on the full recompute path while today's draft reports reuse older materialized hours and only force-refresh the most recent two completed hours.

## 2026-06-01

### Completed

- Added Web Auto Capture script release detection with `sourceDetails.scriptReleaseId`, `/api/capture` and `/api/presence` auto-update responses, `captureScriptFindings` in project health, Dashboard warnings, MCP `capture_setup` upgrade prompts, and agent setup freshness checks for stale Web script guidance.
