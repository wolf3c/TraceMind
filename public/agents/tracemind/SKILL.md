---
name: tracemind-instrumentation
version: 2026.05.08.3
description: Use when adding, reviewing, or validating TraceMind analytics instrumentation with the TraceMind MCP.
---

# TraceMind Instrumentation

Use this skill whenever you add, change, review, or validate TraceMind analytics instrumentation in a project.

## Required Workflow

1. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` before choosing a server.
2. Before writing analytics code, call `tracemind.agent_guidance` and check that this skill version is current.
3. Identify the app platform: `web`, `ios`, `android`, or `react_native`.
4. Call `tracemind.capture_setup` with the matching `platform` before installing Auto Capture or adding manual custom events.
5. Use the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, `initSnippet`, `identifySnippet`, `manualCaptureExamples`, `supportedPropertyTypes`, and `manualCaptureWorkflow` to install, verify, and implement setup.
6. Search for an existing event with `tracemind.search_event_names` before adding manual `custom` events.
7. If an event looks relevant, call `tracemind.suggest_instrumentation` or inspect the returned event details before using it.
8. Use only approved TraceMind capture APIs or SDK helpers already present in the project.
9. After code changes, call `tracemind.validate_instrumentation_diff` with the current diff.

## Auto Capture Setup Workflow

For product apps, first check whether TraceMind Auto Capture is already initialized. Do not add duplicate scripts, package dependencies, native modules, or `TraceMind.start(...)` calls.

- Web: call `tracemind.capture_setup` with no platform or `{ "platform": "web" }`; install the returned `captureSnippet` in the global document head or root layout.
- iOS: call `tracemind.capture_setup` with `{ "platform": "ios" }`; add the Swift package and initialize once from `App.swift`, `AppDelegate.swift`, or the startup file named by the app.
- Android: call `tracemind.capture_setup` with `{ "platform": "android" }`; add the Gradle module/dependency and initialize once from `Application.onCreate()`.
- React Native: call `tracemind.capture_setup` with `{ "platform": "react_native" }`; install the JS package and native bridge, then initialize once in `index.js`, `App.js`, `App.tsx`, or the app bootstrap module.
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

## Manual Capture And Identify

Manual capture follows the same mental model on Web, iOS, Android, and React Native: initialize TraceMind once, optionally identify the logged-in user, then capture approved business outcomes with `TraceMind.capture("custom", ...)` or `window.TraceMind.capture("custom", ...)`.

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
