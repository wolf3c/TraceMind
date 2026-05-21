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

- Work only on files required for the current task. Do not modify, revert, reformat, stage, or otherwise clean up files changed by other people or unrelated work.
- Before editing production code for behavior changes or optimizations, state the current behavior, target behavior, affected modules, risks, verification plan, and concise implementation plan.
- For any behavior change, optimization, analytics change, SDK change, or public contract change, explicitly check every supported runtime before editing: Web, iOS, macOS, Android, React Native, Hybrid, Mini Program, Browser Extension, server SDKs, MCP, Agent Skill, and dashboard/API surfaces. If a runtime is intentionally out of scope, state that boundary and document why. The same product concept should behave consistently across supported environments unless the product requirements explicitly define a platform-specific difference.
- Keep changes minimal and aligned with existing product semantics. Avoid opportunistic refactors, broad cleanup, or expanding scope beyond the requested task.
- After finishing any task, provide one or more suggested git commit messages that accurately describe the completed change.
- If the user explicitly points out an agent mistake, update this file with the underlying lesson: summarize why the mistake happened, the deeper rule that should have prevented it, and how future agents should apply that rule.
- After any SDK runtime change under `sdk/`, run `npm run update:sdk-manifest` and `npm run test:sdk-release`. The manifest gate uses SDK content hashes, so do not rely on remembering to bump a version number by hand.
- For deploys that expose SDK `latestSdk.sourceRef`, `$deploy` must publish immutable GitHub source before Galaxy: run `npm run prepare:sdk-release-ref -- <version>`, commit the release state, create/push `tracemind-release-<version>`, push `origin main`, and pass `npm run check:deploy-git-publication -- <version>` before `npm run deploy`.

## Error Ledger

Add entries here when an agent mistake reveals a reusable rule for future work. Use this format:

- `YYYY-MM-DD`: What went wrong. Root cause. Future rule to prevent recurrence.
- `2026-05-07`: UI feedback was implemented too weakly and a duplicated MCP URL field stayed in the primary setup area after MCP token management was moved below Coding Agent setup. Root cause: screenshot annotations were mapped mechanically without rechecking the intended information hierarchy and visible success state. Future rule: for annotated UI fixes, verify each numbered note against the final hierarchy and make state changes visually obvious, especially copy actions that otherwise look inert.
- `2026-05-07`: Parallel-task guidance omitted git worktrees and focused only on file ownership inside one checkout. Root cause: concurrency was treated as a coordination problem without first considering filesystem isolation. Future rule: for multi-agent or truly parallel coding, evaluate worktrees first, then balance their dependency/build cost against task size and merge risk.
- `2026-05-09`: Presence work initially fixed the Web/server path but missed equivalent Native/RN behavior details, such as `setScreen` segment boundaries and iOS active-start behavior. Root cause: the task was treated as one implementation surface plus follow-up SDK edits instead of a cross-runtime product contract. Future rule: before implementing any optimization or behavior change, build a runtime matrix covering Web, iOS, Android, React Native, server SDKs, MCP/Agent Skill, dashboard/API, docs, and tests; either make behavior consistent across all applicable runtimes or explicitly mark a runtime out of scope with rationale.
- `2026-05-12`: The release skill was treated as a version-only helper and deployment started without first checking whether the work was on `main` or whether other branches were still unmerged. Root cause: the release workflow encoded package-version and Meteor deploy steps but missed the repository integration gate that controls what should be released. Future rule: `$deploy` must first inspect branch state, get release changes merged to `main`, and stop for user confirmation when multiple branches are unmerged before bumping versions or deploying.
- `2026-05-12`: A landing-page demo overemphasized the new feedback-loop advantage and pushed TraceMind's core Auto Capture, AI-readable evidence, and MCP analysis value too far down the page. Root cause: the differentiator was treated as the primary product definition instead of an enhancement layered on top of the core product promise. Future rule: when introducing a new advantage on a product page, preserve first-viewport clarity about what the product is and does, then show the new mechanism as a compounding extension.
- `2026-05-17`: The daily customer-acquisition skill allowed agents to send public social replies too eagerly after judging relevance themselves. Root cause: the skill treated plan scope as outbound authorization and did not separate candidate research from user approval. Future rule: for social outreach, first summarize each target post and proposed reply in a review table, then send only the rows explicitly approved by the user.
- `2026-05-20`: X outreach discovery searched only English keywords and undercounted Chinese AI coding / vibe coding product authors. Root cause: X was treated as an English-first channel while TraceMind's ICP and the user's operating context are bilingual. Future rule: for X acquisition searches, run both English and Chinese keyword sets before judging candidate quality or channel fit.
- `2026-05-20`: Chinese X outreach keywords overfit to the phrase `做了/做了一个`, missing interchangeable wording such as `实现了`, `完成了`, `搞定了`, `上线`, `发布`, `coding`, and `vibe`. Root cause: search terms were written as fixed example sentences instead of intent buckets. Future rule: for Chinese social search, combine tool names, build verbs, product nouns, launch/feedback terms, and diagnosis terms rather than relying on one colloquial verb.
- `2026-05-20`: Outreach reply drafts overfocused on diagnosing the other product before recommending TraceMind. Root cause: comments were optimized as analysis first, not as a concise recommendation message. Future rule: when evaluating or recommending TraceMind in public replies, use `praise -> TraceMind value -> link`.
- `2026-05-21`: V2EX outreach replies were still too long after the rule changed to `praise -> value -> link`. Root cause: the acquisition skill still allowed product-path diagnosis, low-friction consultation offers, and multiple value points inside one public comment. Future rule: public outreach comments must default to one short recommendation: specific praise, "TraceMind lets your coding AI understand user behavior", one AI-native value, then the promotion link; avoid multi-path analysis unless the user explicitly asks for a diagnostic reply.

## Optimization Workflow Requirements

For every optimization or behavior-changing improvement, do the design work before editing production code:

- First identify the current behavior, the target behavior, affected modules, risks, and verification plan.
- Include a cross-runtime impact matrix in the design step. For each supported runtime or surface, mark `change`, `no change`, or `out of scope`, and keep tests/docs aligned with that matrix.
- Write a concise implementation plan before making code changes.
- Reflect on whether the plan preserves existing product semantics and avoids unnecessary scope.
- Update all relevant documentation under `docs/` in the same change, including product, technical design, implementation progress, and user-facing usage docs when affected.
- Treat tests passing as insufficient by itself; confirm that docs, tests, and implementation all cover the requested optimization.

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

## Commit & Pull Request Guidelines

Use concise imperative commits such as `Add link publication test` or `Refine Svelte startup`. At handoff, include suggested commit message(s) even if you do not create the commit. Pull requests should include a short summary, testing performed, linked issue or task when available, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `node_modules/`, generated build output, or local secret files. Keep server-only credentials out of client code and expose data through publications or methods with explicit access checks.

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
