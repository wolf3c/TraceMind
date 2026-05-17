---
name: tracemind-instrumentation
version: 2026.05.17.7
description: Use when adding, reviewing, or validating TraceMind analytics instrumentation with the TraceMind MCP.
---

# TraceMind Instrumentation

Use this skill whenever you add, change, review, or validate TraceMind analytics instrumentation in a project.

## Required Workflow

1. If the project instruction file contains a TraceMind Project Binding, use the expected MCP server and call `tracemind.project_info`; continue only if the returned `projectId` matches the bound Project ID.
2. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` before choosing a server.
3. For product behavior analysis, use `tracemind.project_health` for daily health and `tracemind.recent_online` for real-time online status, then use `tracemind.summary` and `tracemind.query_events` for evidence drilldown.
4. Before writing analytics code, call `tracemind.agent_guidance` and check that this skill version is current.
5. Identify the target platform: `web`, `ios`, `macos`, `android`, `react_native`, `hybrid`, `mini_program`, `browser_extension`, `mcp_node`, `mcp_python`, `agent_skill`, `server_node`, `server_python`, or `server_http`.
6. Call `tracemind.capture_setup` with the matching `platform` before installing Auto Capture or adding manual custom events.
7. Use the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, `initSnippet`, `identifySnippet`, `manualCaptureExamples`, `supportedPropertyTypes`, and `manualCaptureWorkflow` to install, verify, and implement setup.
8. Search for an existing event with `tracemind.search_event_names` before adding manual `custom` events.
9. If an event looks relevant, call `tracemind.suggest_instrumentation` or inspect the returned event details before using it.
10. Use only approved TraceMind capture APIs or SDK helpers already present in the project.
11. After code changes, call `tracemind.validate_instrumentation_diff` with the current diff.
12. When a developer reports a product issue or idea, ask whether they want to submit feedback unless they explicitly requested submission.
13. Before calling `tracemind.submit_feedback`, collect a short sanitized summary and TraceMind evidence references such as event IDs, raw behavior IDs, paths, `actionKey`, `targetHash`, and time window.
14. Prefer evidence references over raw copied content; never submit PII, secrets, tokens, raw prompts, tool arguments/results, source diffs, request/response bodies, headers, cookies, authorization values, or full query URLs.

## Product Behavior Analysis Workflows

Use these workflows when a developer asks what is happening in their product:

- Daily health check: call `tracemind.project_info`, then `tracemind.project_health` for the selected day. Report whether the project is normal, what changed versus the previous day, and the first attention item to inspect.
- Recent online status: call `tracemind.project_info`, then `tracemind.recent_online` to inspect the last 30 minutes. Report online users, 5-minute buckets, top regions, active pages, and high-frequency events.
- Feature usage analysis: call `tracemind.project_health`, then `tracemind.summary` with relevant time, path, event, `actionKey`, `targetHash`, or traffic attribution filters. Use `tracemind.query_events` to show reviewable evidence.
- Anomaly or drop investigation: start with `tracemind.project_health`, identify the dropped metric or upload-health issue, then query affected events and paths. Use `tracemind.query_raw_behaviors` only when semantic evidence is not enough.
- Traffic source analysis: start with `tracemind.project_health`, then drill down with `tracemind.summary`, `tracemind.query_events`, or `tracemind.query_raw_behaviors` using `attributionSource`, `attributionMedium`, `attributionCampaign`, and `landingPath`.

Only call `tracemind.submit_feedback` after the developer confirms they want to submit an issue or idea.

## Traffic Attribution

Traffic attribution answers where product users came from. It is different from `sourceType/sourceKey`, which describes the capture runtime such as Web hostname, iOS bundle id, Android package name, Mini Program appId, browser extension id, MCP server, Agent Skill, or server app.

- Web: Auto Capture records first-touch attribution for the browser visit from whitelisted `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, referrer domain/type, landing path without query string, and boolean click markers such as `gclidPresent`. Manual custom events in the same visit inherit it automatically.
- iOS/macOS: when the app opens from universal links, custom URL schemes, handoff, or another app, call `TraceMind.recordOpenURL(url, sourceApplication: sourceApplication)` before relevant screen or custom events. Use `TraceMind.setAttribution(...)` only when you already have a sanitized custom source setting.
- Android: call `TraceMind.recordDeepLink(url = intent.data?.toString(), referrer = referrer?.toString(), sourcePackage = callingPackage)` from app links, custom schemes, or deeplink routing. Use `TraceMind.setAttribution(...)` only for sanitized custom source settings.
- React Native: call `TraceMind.recordDeepLink({ url, referrer, sourcePackage })` from `Linking.getInitialURL()` and URL subscriptions. Use `TraceMind.setAttribution({ source, medium, campaign, landingPath })` when a JS router owns the source setting.
- Mini Program: use `TraceMind.setAttribution({ source, medium, campaign, landingPath })` only with already-sanitized campaign, scene, QR, share, or channel metadata. Page paths must not include query strings.
- Browser Extension: use `TraceMind.setAttribution({ source, medium, campaign, landingPath })` only with already-sanitized extension workflow or campaign metadata. Do not use host-page URLs, tab URLs, browser history, bookmarks, cookies, or content script page content as attribution.
- Server apps: do not infer user traffic source automatically in v1. If a server-side business event must be analyzed by channel, pass only an already-sanitized `attribution` object from product traffic context.
- MCP and Agent Skill: their `sourceType/sourceKey` identifies runtime/tool origin, not product traffic acquisition. Use attribution filters to analyze product events, not to label MCP tool calls as marketing traffic.

Never store `utm_term`, arbitrary `ref` params, full URLs with query strings, search keywords, raw click IDs, emails, tokens, prompts, or raw user content. Use MCP filters `attributionSource`, `attributionMedium`, `attributionCampaign`, and `landingPath` for source-related analysis.

## Auto Capture Setup Workflow

For product apps, first check whether TraceMind Auto Capture is already initialized. Do not add duplicate scripts, package dependencies, native modules, or `TraceMind.start(...)` calls.

- Web: call `tracemind.capture_setup` with no platform or `{ "platform": "web" }`; install the returned `captureSnippet` in the global document head or root layout.
- iOS: call `tracemind.capture_setup` with `{ "platform": "ios" }`; follow the returned local-source GitHub clone, `vendor/TraceMind` copy, and SwiftPM local path instructions, then initialize once from `App.swift`, `AppDelegate.swift`, or the startup file named by the app.
- macOS: call `tracemind.capture_setup` with `{ "platform": "macos" }`; use the same local-source Swift package instructions and initialize once from the macOS app bootstrap. Auto Capture records app/session start and window or screen changes; use `TraceMind.setScreen(...)` when the app has better semantic screen names.
- Android: call `tracemind.capture_setup` with `{ "platform": "android" }`; follow the returned local-source GitHub clone, `vendor/tracemind-android` copy, and Gradle `:tracemind` module instructions, then initialize once from `Application.onCreate()`.
- React Native: call `tracemind.capture_setup` with `{ "platform": "react_native" }`; install the returned local `@tracemind/react-native` file dependency and native bridge, then initialize once in `index.js`, `App.js`, `App.tsx`, or the app bootstrap module.
- Hybrid: call `tracemind.capture_setup` with `{ "platform": "hybrid" }`; install Web Auto Capture in the WebView document and use the returned local-source native SDK instructions for the shell. Do not create a new event platform: WebView events remain `web` and can carry `sourceDetails.framework` from `data-tracemind-framework`; native shell events remain `ios`, `macos`, or `android`.
- Mini Program: call `tracemind.capture_setup` with `{ "platform": "mini_program", "provider": "wechat" }` and set provider to `wechat`, `alipay`, `douyin`, or `dingtalk`. Follow the returned local `@tracemind/mini-program` file dependency command. Aliases such as `wechat_mini_program` are normalized to the same SDK. Events use `platform: "mini_program"` and `sourceType: "mini_program"` with `sourceDetails.provider`.
- Browser Extension: call `tracemind.capture_setup` with `{ "platform": "browser_extension" }`. Aliases such as `chrome_extension`, `edge_extension`, `firefox_extension`, and `web_extension` normalize to the same SDK. Use the returned local `@tracemind/browser-extension` file dependency in extension-owned popup, options, sidebar, and devtools pages; background or service worker contexts support manual capture only. Events use `platform: "browser_extension"` and `sourceType: "browser_extension"` with whitelisted `sourceDetails.browser`, `manifestVersion`, `runtimeContext`, `sdkVersion`, and `sdkContentHash`.
- MCP Node: call `tracemind.capture_setup` with `{ "platform": "mcp_node" }`; install the returned local `@tracemind/mcp-node` file dependency and initialize it around the MCP server object before serving tools.
- MCP Python: call `tracemind.capture_setup` with `{ "platform": "mcp_python" }`; copy the returned local `tracemind_mcp` package directory, add its vendor parent to `PYTHONPATH` or project packaging source path, and initialize it around the MCP server object before serving tools.
- Agent Skill: call `tracemind.capture_setup` with `{ "platform": "agent_skill" }`; only instrument executable host agent runtime hooks. A static Skill file cannot auto-capture by itself.
- Server Node/Python/HTTP: call `tracemind.capture_setup` with `{ "platform": "server_node" }`, `{ "platform": "server_python" }`, or `{ "platform": "server_http" }`; Node uses a local file dependency, Python uses a vendored package path, and HTTP uses no SDK package. Ordinary server applications use manual capture first and do not enable request Auto Capture in v1.
- The returned public project key is only for capture writes. Never use an MCP token in frontend or app code.
- Manual `custom` events are only for business outcomes that Auto Capture cannot infer reliably.

## Native SDK Setup Details

Use `capture_setup` as the source of truth for current setup details instead of copying project keys or install snippets from static docs.

- Read `filesToEdit` before changing files. Typical iOS and macOS files are `Package.swift`, Xcode package settings, `App.swift`, `AppDelegate.swift`, and sometimes `SceneDelegate.swift`. Typical Android files are `settings.gradle`, app Gradle files, `AndroidManifest.xml`, and the custom `Application` class. Typical React Native files are `package.json`, `index.js`, `App.js` or `App.tsx`, plus native iOS/Android linking files when needed.
- Run every returned `idempotencyChecks` item before editing. If an equivalent dependency and `TraceMind.start(...)` already exist for the same project, report that setup is already present instead of adding another one.
- Place the returned `initSnippet` at the returned `initLocation`; keep it as the only business-code line needed for Auto Capture.
- For macOS, the first version uses AppKit application/window notifications. It provides stable window-level Auto Capture and keeps manual `TraceMind.capture(...)` and `TraceMind.setScreen(...)` available for richer app-specific semantics.
- For React Native, do not create a new platform value. Events remain `ios` or `android`; React Native is marked through `deviceInfo.framework` or `sourceDetails.framework`.
- For hybrid apps, use the returned WebView snippet with `data-tracemind-framework`, and use a narrow native-WebView bridge only for safe identity, route/source metadata, and deeplink handoff. After login, call `identify` in both layers with the same stable internal `userId`; never pass raw input values, cookies, tokens, page content, or full query URLs across the bridge.
- For Mini Programs, use the generic `@tracemind/mini-program` SDK rather than provider-specific duplicate SDKs. V1 automatically records app/session start, app show/hide, page view, page show/hide, route/page path, and presence heartbeat. Tap/input/submit signals require `TraceMind.trackTap`, `TraceMind.trackInput`, or `TraceMind.trackSubmit` from existing handlers; do not promise no-code capture or collect input values.
- For Browser Extensions, use the generic `@tracemind/browser-extension` SDK for Chrome, Edge, and Firefox WebExtensions. V1 automatically records extension-owned DOM pages such as popup, options, sidebar, and devtools page; background/service worker code only uses `capture`, `identify`, `submitFeedback`, and `flush`. Do not promise content script no-code capture of host pages.
- Native Auto Capture should follow the platform-specific `autoCapturedSignals` returned by `capture_setup`: iOS/Android/React Native include app/session start, screen/page view, tap/click, input changed without values, and submit signals; macOS v1 includes app/session start plus window or screen changes.
- Run the returned `verificationCommands` when they apply to the repository, then verify captured data with TraceMind MCP queries if the app can be launched.

## SDK Upgrade Governance

TraceMind customers may rely entirely on a coding agent. Do not assume they understand SDK package versions.

- For SDK platforms, `tracemind.capture_setup` returns `latestSdk`, `installedSdkManifest`, `installedVersionDetection`, `upgradePolicy`, `upgradeCommands`, and `verificationCommands`.
- When `distributionMode` is `local_source`, write the returned `installedSdkManifest` to the vendored SDK path as `.tracemind-sdk.json`. Future agents use that file plus `latestSdk.contentHash` to decide whether an upgrade is needed.
- Fetch the SDK source from the returned `latestSdk.sourceRef` exactly. Release builds use immutable `tracemind-release-<version>` tags so customer agents do not install from floating `main`.
- Treat `contentHash` as the source of truth. `displayVersion` is only human-readable; an unchanged version string does not prove the SDK is current.
- SDK runtimes report safe source metadata as `sourceDetails.sdkVersion` and `sourceDetails.sdkContentHash`. `tracemind.project_health` may return `sdkUpgradeFindings` when an app reports an older hash or no SDK hash.
- If TraceMind reports an SDK update, copy the update prompt to the customer coding agent. The agent should call `tracemind.project_health`, read `.tracemind-sdk.json`, call `tracemind.capture_setup({ platform })`, update the vendored SDK, run `verificationCommands`, and report the result.
- For TraceMind repository work, any SDK runtime change must run `npm run update:sdk-manifest` and `npm run test:sdk-release`. Before a release deploy, run `npm run prepare:sdk-release-ref -- <version>` and publish the matching release tag before Galaxy deploy. The release gate is authoritative; do not rely on memory or manual version bump discipline.

## Platform Loading And Network Restrictions

If setup looks correct but no data appears, check platform restrictions before changing event code.

- Web: check CSP `script-src` allows the TraceMind script origin and `connect-src` allows `/api/capture`; also check `capture.js` JavaScript MIME type with `nosniff`, stale SRI, CORP, and COEP rules. Fix by adjusting the app response headers to allow the TraceMind script and capture endpoint.
- iOS/macOS: check `Info.plist` `NSAppTransportSecurity` / ATS policy, HTTPS/TLS certificate validity, certificate pinning allowlists, MDM policy, and enterprise proxy rules. Fix by using the HTTPS production endpoint and allowing the TraceMind domain in the app or certificate policy when required.
- Android: check `android.permission.INTERNET`, cleartext traffic policy, `network_security_config`, certificate pinning, proxy, and custom CA rules. Fix by declaring network permission and using HTTPS in production instead of relying on cleartext exceptions.
- React Native: check both iOS and Android network rules, then confirm the native module is linked, pods/Gradle dependencies are installed, and native initialization runs before the first product screen.
- Hybrid: check Web CSP/connect-src plus native ATS/Android network rules, then confirm the WebView enables JavaScript and DOM storage/localStorage and the bridge sends only sanitized identity, route/source, and deeplink metadata.
- Mini Program: check the provider request domain allowlist, confirm the host API (`wx.request`, `my.request`, `tt.request`, or `dd.request`) and storage APIs are available, and verify App/Page lifecycle wrappers run in the target provider dev tool.
- Browser Extension: check `host_permissions` or extension permissions allow the TraceMind endpoint, extension CSP permits `connect-src`, `fetch` works in the target context, and background service worker lifecycle does not assume persistent DOM listeners.
- Server Node/Python/HTTP: check egress firewall, VPC, security group, DNS, proxy, TLS CA bundle, HTTP client timeout/retry behavior, and `Content-Type: application/json`. Fix by allowing outbound HTTPS to the TraceMind capture endpoint and configuring the server HTTP client.
- MCP/Agent Skill runtime: use the server checks, then confirm capture code runs in executable MCP or host runtime hooks, not only in a static `SKILL.md` document.

## Instrumenting MCP Servers

For third-party MCP servers, TraceMind Auto Capture records safe MCP runtime metadata rather than DOM or native UI behavior. Use `capture_setup` as the source of truth:

- Node MCP servers use `{ "platform": "mcp_node" }` and initialize with `TraceMindMCP.start(server, { projectKey, sourceKey })`.
- Python MCP servers use `{ "platform": "mcp_python" }` and initialize with `TraceMindMCP.start(server, project_key=..., source_key=...)`.
- Keep `platform` as `server`; MCP source identity is represented as `sourceType: "mcp_server"` and a stable `sourceKey` such as the package or server name.
- Auto Capture should record MCP server/session start, tool call completed, resource read completed, and prompt request completed.
- Tool/resource/prompt events may include names, status, duration, error type, URI scheme, target hash, and result-size buckets. They must not include raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs.
- If the MCP server can identify the actor, use the SDK `identityResolver(request)` / `identity_resolver(request)` hook to return stable internal IDs only.
- Manual MCP `custom` events are for stable business outcomes such as `document_indexed`, `repository_synced`, or `deployment_created`; search and validate event names before coding.

## Instrumenting Agent Skills

A static Skill file is guidance, not executable runtime, so a static Skill file cannot auto-capture by itself.

- Use `{ "platform": "agent_skill" }` to get guidance for host runtime lifecycle hooks.
- Only add Skill Auto Capture when the host agent runtime exposes executable started/completed/failed hooks.
- Record Skill lifecycle with `sourceType: "agent_skill"` and a stable source key such as the Skill name or host runtime Skill ID.
- If no lifecycle hook exists, keep the Skill as a tutorial and add manual capture in the MCP server or agent runtime that actually executes the work.
- Never store raw user prompts, raw tool inputs/outputs, generated code, diffs, secrets, or token values from Skill workflows.

## Instrumenting Server Applications

For v1, ordinary server applications use manual capture first and do not enable request Auto Capture. Do not add generic request Auto Capture, global HTTP hooks, database hooks, crash reporting, or log capture unless TraceMind MCP guidance explicitly returns that setup in a future version.

- Use `{ "platform": "server_node" }` for Node backends and initialize `TraceMindServer.start({ projectKey, sourceKey })` once at server startup.
- Use `{ "platform": "server_python" }` for Python backends and initialize `TraceMindServer.start(project_key=..., source_key=...)` once at server startup.
- Use `{ "platform": "server_http" }` when no first-party SDK exists; call `/api/capture` directly with the returned safe payload template.
- Keep `platform` as `server`; server app source identity is represented as `sourceType: "server_app"` and a stable `sourceKey` such as `billing-api` or `worker-service`.
- Add manual `custom` events only for stable business outcomes such as payment succeeded, invoice paid, workspace created, job completed, sync completed, or webhook handled.
- Before coding, call `tracemind.search_event_names`, then `tracemind.validate_event_payload`; after changes, call `tracemind.validate_instrumentation_diff`.
- Pass a stable internal `userId` on each event when available. Do not use email, phone number, or other PII as identity.
- Never capture request bodies, response bodies, headers, cookies, authorization values, raw logs, raw prompts/content, secrets, tokens, SQL, source code, diffs, or full query URLs.

## Manual Capture And Identify

Manual capture follows the same mental model on Web, iOS, macOS, Android, React Native, hybrid apps, Mini Programs, Browser Extensions, MCP servers, ordinary server applications, and executable Agent Skill runtimes: initialize TraceMind once, optionally identify the actor with a stable internal user ID, then capture approved business outcomes with the platform SDK.

- Use the returned `identifySnippet` after login when the app has a stable internal `userId`. Traits are optional and must use only `string`, `number`, or `boolean` values.
- Use `manualCaptureExamples` only after `tracemind.search_event_names` finds an approved event name or the user approves a draft event proposal.
- Put stable business facts in `properties`; put route, source, experiment, or UI context in `context`.
- Put traffic acquisition context in the SDK attribution helper or `attribution` object, not only in `context.source`, when the event should be queryable by source/campaign/landing-page MCP filters.
- Native, React Native, Mini Program, and Browser Extension SDKs omit nulls, nested objects, arrays, PII-like keys, credential values, raw prompts/content, input values, and full query URLs.
- Manual events are for outcomes such as purchase completed, subscription changed, invite sent, or onboarding completed. Do not use manual capture for raw input values or screen contents.

## Developer Feedback Submission

TraceMind MCP can submit developer feedback separately from analytics events. Use this when the developer has found a product issue or idea and wants TraceMind to store the report for later handling.

- Use `tracemind.submit_feedback`; do not send feedback through `/api/capture` or manual `custom` events.
- Ask the developer before submitting unless they explicitly asked you to submit the feedback.
- Include `type` (`issue` or `idea`), `title`, and a sanitized `summary`.
- Add optional `expected`, `actual`, `suggestion`, and short `reproductionSteps` when they clarify the report.
- Prefer evidence references: event IDs, raw behavior IDs, paths, `actionKey`, `targetHash`, time window, session IDs, device IDs, and short sanitized examples.
- Do not include PII, personal contact fields, secrets, token values, raw prompts, raw user content, source code, diffs, request/response bodies, headers, cookies, authorization values, tool arguments/results, resource content, or full query URLs.

## End-User Feedback Capture

TraceMind also supports terminal user feedback from the customer app. This is separate from developer feedback.

- Use SDK `submitFeedback` for user feedback upload: Web `window.TraceMind.submitFeedback({ message })`, iOS/macOS `TraceMind.submitFeedback(message:)`, Android `TraceMind.submitFeedback(message)`, React Native `TraceMind.submitFeedback({ message })`, Mini Program `TraceMind.submitFeedback({ message })`, Browser Extension `TraceMind.submitFeedback({ message })`, or server SDK `TraceMindServer.submitFeedback(...)`.
- Do not send terminal user feedback through `/api/capture`, `capture("custom")`, or `tracemind.submit_feedback`.
- Feedback `message` is structured and may include `kind`, `title`, `body`, consented `contact`, and primitive custom `fields`; attachments remain empty in v1.
- Contact fields are allowed only when the end user explicitly submits them in the feedback payload. Auto Capture still must not collect input values, emails, phones, prompts, tokens, source diffs, request/response bodies, or full query URLs.
- Use `tracemind.query_user_feedback` to read feedback by status, kind, path/screen, platform, user/session, keyword, or contact presence.
- Use `tracemind.update_user_feedback` to update only status, note, resolution, linkedIssueUrl, or duplicateOf. Do not modify the original user message.
- v1 does not include public feedback boards, voting, roadmap, changelog, screenshots, recordings, or attachment upload.

## Event Rules

- Reuse an existing event when the business meaning matches.
- Do not invent event names without first searching existing events.
- If no event matches, create a draft custom event proposal and ask the user for review.
- Prefer stable business identifiers such as internal `userId`, `projectId`, `plan`, or `feature`.
- Use `eventType: "custom"` for manual business events that automatic capture cannot infer reliably.

## Privacy Rules

Never send PII, secrets, raw user content, raw prompts, access tokens, API keys, passwords, phone numbers, emails, or full URLs with query strings.

Use `tracemind.privacy_check` when a field name or sample value might be sensitive.

## Update Rule

Before TraceMind instrumentation work, compare this version with `tracemind.agent_guidance`. If a newer version exists, tell the user what will be updated and ask for confirmation before changing local skill or instruction files. Do not silently overwrite user-edited files.
