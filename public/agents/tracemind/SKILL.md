---
name: tracemind-instrumentation
version: 2026.05.09.1
description: Use when adding, reviewing, or validating TraceMind analytics instrumentation with the TraceMind MCP.
---

# TraceMind Instrumentation

Use this skill whenever you add, change, review, or validate TraceMind analytics instrumentation in a project.

## Required Workflow

1. If the project instruction file contains a TraceMind Project Binding, use the expected MCP server and call `tracemind.project_info`; continue only if the returned `projectId` matches the bound Project ID.
2. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` before choosing a server.
3. Before writing analytics code, call `tracemind.agent_guidance` and check that this skill version is current.
4. Identify the target platform: `web`, `ios`, `android`, `react_native`, `mcp_node`, `mcp_python`, `agent_skill`, `server_node`, `server_python`, or `server_http`.
5. Call `tracemind.capture_setup` with the matching `platform` before installing Auto Capture or adding manual custom events.
6. Use the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, `initSnippet`, `identifySnippet`, `manualCaptureExamples`, `supportedPropertyTypes`, and `manualCaptureWorkflow` to install, verify, and implement setup.
7. Search for an existing event with `tracemind.search_event_names` before adding manual `custom` events.
8. If an event looks relevant, call `tracemind.suggest_instrumentation` or inspect the returned event details before using it.
9. Use only approved TraceMind capture APIs or SDK helpers already present in the project.
10. After code changes, call `tracemind.validate_instrumentation_diff` with the current diff.

## Auto Capture Setup Workflow

For product apps, first check whether TraceMind Auto Capture is already initialized. Do not add duplicate scripts, package dependencies, native modules, or `TraceMind.start(...)` calls.

- Web: call `tracemind.capture_setup` with no platform or `{ "platform": "web" }`; install the returned `captureSnippet` in the global document head or root layout.
- iOS: call `tracemind.capture_setup` with `{ "platform": "ios" }`; add the Swift package and initialize once from `App.swift`, `AppDelegate.swift`, or the startup file named by the app.
- Android: call `tracemind.capture_setup` with `{ "platform": "android" }`; add the Gradle module/dependency and initialize once from `Application.onCreate()`.
- React Native: call `tracemind.capture_setup` with `{ "platform": "react_native" }`; install the JS package and native bridge, then initialize once in `index.js`, `App.js`, `App.tsx`, or the app bootstrap module.
- MCP Node: call `tracemind.capture_setup` with `{ "platform": "mcp_node" }`; install the Node MCP SDK and initialize it around the MCP server object before serving tools.
- MCP Python: call `tracemind.capture_setup` with `{ "platform": "mcp_python" }`; install the Python MCP SDK and initialize it around the MCP server object before serving tools.
- Agent Skill: call `tracemind.capture_setup` with `{ "platform": "agent_skill" }`; only instrument executable host agent runtime hooks. A static Skill file cannot auto-capture by itself.
- Server Node/Python/HTTP: call `tracemind.capture_setup` with `{ "platform": "server_node" }`, `{ "platform": "server_python" }`, or `{ "platform": "server_http" }`; ordinary server applications use manual capture first and do not enable request Auto Capture in v1.
- The returned public project key is only for capture writes. Never use an MCP token in frontend or app code.
- Manual `custom` events are only for business outcomes that Auto Capture cannot infer reliably.

## Native SDK Setup Details

Use `capture_setup` as the source of truth for current setup details instead of copying project keys or install snippets from static docs.

- Read `filesToEdit` before changing files. Typical iOS files are `Package.swift`, Xcode package settings, `App.swift`, `AppDelegate.swift`, and sometimes `SceneDelegate.swift`. Typical Android files are `settings.gradle`, app Gradle files, `AndroidManifest.xml`, and the custom `Application` class. Typical React Native files are `package.json`, `index.js`, `App.js` or `App.tsx`, plus native iOS/Android linking files when needed.
- Run every returned `idempotencyChecks` item before editing. If an equivalent dependency and `TraceMind.start(...)` already exist for the same project, report that setup is already present instead of adding another one.
- Place the returned `initSnippet` at the returned `initLocation`; keep it as the only business-code line needed for Auto Capture.
- For React Native, do not create a new platform value. Events remain `ios` or `android`; React Native is marked through `deviceInfo.framework` or `sourceDetails.framework`.
- Native Auto Capture should cover app/session start, screen/page view, tap/click, input changed without values, and submit signals.
- Run the returned `verificationCommands` when they apply to the repository, then verify captured data with TraceMind MCP queries if the app can be launched.

## Platform Loading And Network Restrictions

If setup looks correct but no data appears, check platform restrictions before changing event code.

- Web: check CSP `script-src` allows the TraceMind script origin and `connect-src` allows `/api/capture`; also check `capture.js` JavaScript MIME type with `nosniff`, stale SRI, CORP, and COEP rules. Fix by adjusting the app response headers to allow the TraceMind script and capture endpoint.
- iOS: check `Info.plist` `NSAppTransportSecurity` / ATS policy, HTTPS/TLS certificate validity, certificate pinning allowlists, MDM policy, and enterprise proxy rules. Fix by using the HTTPS production endpoint and allowing the TraceMind domain in the app or certificate policy when required.
- Android: check `android.permission.INTERNET`, cleartext traffic policy, `network_security_config`, certificate pinning, proxy, and custom CA rules. Fix by declaring network permission and using HTTPS in production instead of relying on cleartext exceptions.
- React Native: check both iOS and Android network rules, then confirm the native module is linked, pods/Gradle dependencies are installed, and native initialization runs before the first product screen.
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

Manual capture follows the same mental model on Web, iOS, Android, React Native, MCP servers, ordinary server applications, and executable Agent Skill runtimes: initialize TraceMind once, optionally identify the actor with a stable internal user ID, then capture approved business outcomes with the platform SDK.

- Use the returned `identifySnippet` after login when the app has a stable internal `userId`. Traits are optional and must use only `string`, `number`, or `boolean` values.
- Use `manualCaptureExamples` only after `tracemind.search_event_names` finds an approved event name or the user approves a draft event proposal.
- Put stable business facts in `properties`; put route, source, experiment, or UI context in `context`.
- Native and React Native SDKs omit nulls, nested objects, arrays, PII-like keys, credential values, raw prompts/content, input values, and full query URLs.
- Manual events are for outcomes such as purchase completed, subscription changed, invite sent, or onboarding completed. Do not use manual capture for raw input values or screen contents.

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
