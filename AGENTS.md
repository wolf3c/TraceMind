# Repository Guidelines

## Project Structure & Module Organization

TraceMind is a Meteor app with a Svelte client.

- `client/` contains browser entry files: `main.html`, `main.js`, and global CSS.
- `server/` contains Meteor server startup and publications.
- `imports/api/` holds shared data-layer modules such as Mongo collections.
- `imports/ui/` holds Svelte UI components; `App.svelte` is the current root component.
- `tests/` contains Meteor Mocha tests loaded through `tests/main.js`.
- `docs/` stores product and planning documentation.
- `rspack.config.js` configures Meteor Rspack and Svelte preprocessing.

Keep reusable code under `imports/` so Meteor imports it explicitly instead of relying on legacy file load order.

## Agent Workflow Guardrails

- For any behavior change, optimization, analytics change, SDK change, or public contract change, explicitly check every supported runtime before editing: Web, iOS, macOS, Android, React Native, Hybrid, Mini Program, Browser Extension, server SDKs, MCP, Agent Skill, and dashboard/API surfaces. If a runtime is intentionally out of scope, state that boundary and document why. The same product concept should behave consistently across supported environments unless the product requirements explicitly define a platform-specific difference.
- After finishing any task, provide one or more suggested git commit messages that accurately describe the completed change.
- After any SDK runtime change under `sdk/`, run `npm run update:sdk-manifest` and `npm run test:sdk-release`. The manifest gate uses SDK content hashes, so do not rely on remembering to bump a version number by hand.
- For deploys that expose SDK `latestSdk.sourceRef`, `$deploy` must publish immutable GitHub source before Galaxy: run `npm run prepare:sdk-release-ref -- <version>`, commit the release state, create/push `tracemind-release-<version>`, push `origin main`, and pass `npm run check:deploy-git-publication -- <version>` before `npm run deploy`.

## Browser Workflow

- After frontend or visible UI changes, verify the relevant local route with `@Browser` when the URL is known or easy to start. Keep the browser in the background unless the user asks to watch or open it.
- If `@Browser` is unavailable, say so before falling back to another browser or shell-based approach.

## Product Update Copywriting

- Product Update summaries must be concise and customer-value-led: in one short sentence, say what changed and what customer benefit it creates.
- Do not make the summary implementation-first, privacy-first, or caveat-first unless that is the actual customer-facing feature. Put privacy boundaries, platform nuances, and technical details in the detail bullets.
- For cross-runtime capabilities, avoid examples that make one runtime look like the only supported surface. Say `各终端` / `across runtimes`, or name the full relevant runtime set when precision is necessary.
- When privacy is relevant, start the detail bullet with `隐私安全` / `Privacy-safe`, then state what is retained and what is not collected. Keep that boundary out of the summary unless privacy is the main value proposition.

## TraceMind Working Principles

- For annotated UI work, map every note back to the final information hierarchy, make success states visibly obvious, and preserve existing layout axes, spacing, and metric hierarchy unless the request explicitly changes them.
- For cross-runtime behavior, treat the product contract as shared across Web, native, server SDKs, MCP, Agent Skill, dashboard/API, docs, and tests. Build the runtime matrix before editing, then either align behavior across applicable surfaces or mark a surface out of scope with rationale.
- For release and deploy work, use the `$deploy` skill as the workflow owner: inspect branch state before version changes, release from `main`, publish immutable SDK source refs before Galaxy, verify public guidance and live runtime behavior after deploy, and report Git state explicitly.
- For TraceMind product-usage analytics and dogfooding, model insights as approved TraceMind capture events first, call `capture_setup`, use the public customer SDK/API shape, and query through MCP analysis tools. Add bespoke aggregate APIs only when event-based analysis cannot answer the question.
- Keep private operations private: customer usage reviews, win-back lists, unpublished social plans, candidate lists, and outreach drafts belong under ignored `.codex/private/` paths or the current approval chat, never under `docs/`, `.deploy/`, source code, skills, or other tracked files.
- For acquisition and social outreach, separate research from outbound authorization. Summarize each target and proposed reply in a review table, wait for explicit row-level approval, search both English and Chinese intent terms where relevant, and respect platform rules before drafting promotion.
- Public outreach copy should be short and recommendation-led: specific praise, TraceMind's value for AI-coded products, one AI-native benefit, then the link when appropriate. Do not turn public replies into product-path diagnosis unless the user explicitly asks for that.
- For social/product copy, keep TraceMind's core promise visible first: Auto Capture, AI-readable behavior evidence, MCP analysis, and change verification. Product Update summaries should be customer-value-first; put privacy, platform nuance, and technical detail in bullets.
- Use the right browser surface for the job: `@Browser` for local and unauthenticated verification, `@Chrome` for logged-in or account-gated platforms such as X/Twitter, Gmail, 小红书, and 即刻.
- When a user invokes a project skill, first honor that skill's intended deliverable. If a referenced plan appears to belong to another workflow, stop and clarify instead of silently substituting a different workflow.

## Optimization Workflow Requirements

In addition to the global pre-edit requirements, every optimization or behavior-changing improvement must include TraceMind-specific design work before editing production code:

- Include a cross-runtime impact matrix in the design step. For each supported runtime or surface, mark `change`, `no change`, or `out of scope`, and keep tests/docs aligned with that matrix.
- Update all relevant documentation under `docs/` in the same change, including product, technical design, implementation progress, and user-facing usage docs when affected.

## Build, Test, and Development Commands

- `npm start` runs `meteor run` for local development.
- `npm test` runs the Mocha test suite once with `meteortesting:mocha`.
- `npm run test-app` runs full-app tests in watch mode with `TEST_WATCH=1`.
- `npm run visualize` starts a production bundle analysis with `bundle-visualizer`.
- `npx svelte-check` can be used for Svelte diagnostics; add an npm script if it becomes part of the regular workflow.

## Coding Style & Naming Conventions

Use modern JavaScript modules and Svelte 5 component syntax. Match the existing style: two-space indentation in Svelte/HTML/CSS, semicolons in JavaScript, and explicit imports from `meteor/*` packages. Name Svelte components in `PascalCase.svelte`; name shared API modules descriptively, for example `imports/api/links.js`. Use single-purpose functions for server methods, publications, and collection helpers.

## Testing Guidelines

Tests use Node `assert` with Meteor Mocha. Add new tests in `tests/main.js` or split larger suites into imported files under `tests/`. Use behavior-focused names such as `it("publishes seeded links", ...)`. Run `npm test` before handing off changes. For client/server-specific assertions, guard with `Meteor.isClient` or `Meteor.isServer` as shown in the existing tests.

For cross-runtime behavior, add or update tests at the layer that owns each runtime: Meteor tests for server/Web script behavior, Swift tests for iOS SDK behavior, Android SDK tests for Android behavior, React Native tests for JS/native bridge behavior, and server SDK/MCP tests when those surfaces are affected. Do not use one passing platform as evidence that the product behavior is correct everywhere.

## Security & Configuration Tips

Keep server-only credentials out of client code and expose data through publications or methods with explicit access checks.

## TraceMind Instrumentation Rules

## TraceMind Project Binding

- Project name: TraceMind
- Project ID: BJuZgMywBxYYWrTpB
- Expected MCP server: tracemind-ywrtpb

Before using any TraceMind MCP tool in this repository, use MCP server `tracemind-ywrtpb`, call `tracemind.project_info`, and continue only if the returned `projectId` equals `BJuZgMywBxYYWrTpB`. If it does not match, stop and ask the user to configure the correct TraceMind MCP server. Unless the user explicitly confirms a project switch, do not use another `tracemind-*` MCP server for this repository.

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` or inspect MCP tool descriptions to confirm the project.
4. Verify TraceMind setup before manual custom events by calling `tracemind.capture_setup`; Web uses the returned `captureSnippet`, while iOS, macOS, Android, React Native, Hybrid, Mini Program, Browser Extension, MCP Node, MCP Python, Agent Skill, and server application targets pass the matching `platform` (`ios`, `macos`, `android`, `react_native`, `hybrid`, `mini_program`, `browser_extension`, `mcp_node`, `mcp_python`, `agent_skill`, `server_node`, `server_python`, or `server_http`) and follow the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, one-line `initSnippet`, `latestSdk`, `installedVersionDetection`, `upgradeCommands`, and `verificationCommands`. If setup returns `distributionMode: "local_source"`, write the returned `installedSdkManifest` as `.tracemind-sdk.json` in the vendored SDK path so future coding agents can detect upgrades by content hash. The public project key is only for capture writes.
5. Search for an existing event before creating a new event.
6. Use only approved event names and properties returned or validated by the MCP.
7. Do not invent event names.
8. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
9. For manual capture, follow the returned `manualCaptureWorkflow`, use `identifySnippet` after login when a stable internal `userId` exists, and keep `properties`/`context` values to supported primitives: string, number, and boolean.
10. Never send PII, personal contact fields, secrets, credential values, raw prompts, raw user content, input values, or full URLs with query strings.
11. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.
12. When the developer finds a product issue or idea, ask whether they want to submit feedback unless they explicitly requested submission; if yes, call `tracemind.submit_feedback` with a sanitized summary and evidence references.

For product app and MCP targets, verify Auto Capture before manual custom events. Ordinary server applications are the exception in v1: use manual capture only.

For native SDK setup, do not duplicate existing dependencies or `TraceMind.start(...)` calls. iOS/macOS initialize from `App.swift` or `AppDelegate`, Android initializes from `Application.onCreate()`, and React Native initializes from the app bootstrap while keeping event `platform` as `ios` or `android` and marking `react_native` in framework metadata. Hybrid uses WebView Web Auto Capture plus the matching native SDK; Mini Program uses `mini_program` with provider `wechat`, `alipay`, `douyin`, or `dingtalk`; Browser Extension uses `browser_extension` for Chrome, Edge, and Firefox extension-owned pages.

For SDK upgrades, treat `latestSdk.contentHash`, `.tracemind-sdk.json`, and reported `sourceDetails.sdkContentHash` as the source of truth. `displayVersion` is only human-readable, and `latestSdk.sourceRef` must be fetched exactly because release builds point at immutable `tracemind-release-<version>` tags. `tracemind.project_health` may return `sdkUpgradeFindings`; if it does, have the customer coding agent call `capture_setup`, update the vendored SDK, run returned verification commands, and report completion.

Manual native events are for stable business outcomes that Auto Capture cannot infer. The SDKs sanitize and omit nulls, nested objects, arrays, PII-like keys, credential values, raw prompts/content, input values, and full query URLs.

For third-party MCP servers, use `mcp_node` or `mcp_python`. Auto Capture records safe server metadata for tool calls, resource reads, and prompt requests with `platform: "server"` and `sourceType: "mcp_server"`. Do not capture raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs.

For Agent Skills, use `agent_skill`. A static Skill file cannot auto-capture by itself; only instrument executable host agent runtime lifecycle hooks, or keep the Skill as a tutorial and place manual capture in the MCP server/runtime that performs the work.

For ordinary server applications, use `server_node`, `server_python`, or `server_http`. The first version is manual capture only, not request Auto Capture. Add events only for stable server-side business outcomes such as payment succeeded, invoice paid, workspace created, job completed, or sync completed. Use `platform: "server"` and `sourceType: "server_app"`, and never capture request bodies, response bodies, headers, cookies, authorization values, raw logs, secrets, tokens, prompts, or full query URLs.

For developer feedback, use `tracemind.submit_feedback`; do not send feedback through `/api/capture` or manual `custom` events. Prefer event IDs, raw behavior IDs, paths, `actionKey`, `targetHash`, session/device IDs, time windows, and short sanitized examples over raw copied content. Never submit PII, secrets, tokens, raw prompts, raw user content, source code, diffs, request/response bodies, headers, cookies, authorization values, tool arguments/results, resource content, or full query URLs.

Skill reference: `/agents/tracemind/SKILL.md`
