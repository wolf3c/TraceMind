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
- Keep changes minimal and aligned with existing product semantics. Avoid opportunistic refactors, broad cleanup, or expanding scope beyond the requested task.
- After finishing any task, provide one or more suggested git commit messages that accurately describe the completed change.
- If the user explicitly points out an agent mistake, update this file with the underlying lesson: summarize why the mistake happened, the deeper rule that should have prevented it, and how future agents should apply that rule.

## Error Ledger

Add entries here when an agent mistake reveals a reusable rule for future work. Use this format:

- `YYYY-MM-DD`: What went wrong. Root cause. Future rule to prevent recurrence.
- `2026-05-07`: UI feedback was implemented too weakly and a duplicated MCP URL field stayed in the primary setup area after MCP token management was moved below Coding Agent setup. Root cause: screenshot annotations were mapped mechanically without rechecking the intended information hierarchy and visible success state. Future rule: for annotated UI fixes, verify each numbered note against the final hierarchy and make state changes visually obvious, especially copy actions that otherwise look inert.
- `2026-05-07`: Parallel-task guidance omitted git worktrees and focused only on file ownership inside one checkout. Root cause: concurrency was treated as a coordination problem without first considering filesystem isolation. Future rule: for multi-agent or truly parallel coding, evaluate worktrees first, then balance their dependency/build cost against task size and merge risk.

## Optimization Workflow Requirements

For every optimization or behavior-changing improvement, do the design work before editing production code:

- First identify the current behavior, the target behavior, affected modules, risks, and verification plan.
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

## Commit & Pull Request Guidelines

Use concise imperative commits such as `Add link publication test` or `Refine Svelte startup`. At handoff, include suggested commit message(s) even if you do not create the commit. Pull requests should include a short summary, testing performed, linked issue or task when available, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `node_modules/`, generated build output, or local secret files. Keep server-only credentials out of client code and expose data through publications or methods with explicit access checks.

## TraceMind Instrumentation Rules

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` or inspect MCP tool descriptions to confirm the project.
4. Verify TraceMind Auto Capture before manual custom events by calling `tracemind.capture_setup`; Web uses the returned `captureSnippet`, while iOS, Android, and React Native pass the matching `platform` and follow the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, and one-line `initSnippet`. The public project key is only for capture writes.
5. Search for an existing event before creating a new event.
6. Use only approved event names and properties returned or validated by the MCP.
7. Do not invent event names.
8. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
9. Never send PII, emails, phone numbers, secrets, access tokens, raw prompts, raw user content, or full URLs with query strings.
10. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.

For native SDK setup, do not duplicate existing dependencies or `TraceMind.start(...)` calls. iOS initializes from `App.swift` or `AppDelegate`, Android initializes from `Application.onCreate()`, and React Native initializes from the app bootstrap while keeping event `platform` as `ios` or `android` and marking `react_native` in framework metadata.

Skill reference: `/agents/tracemind/SKILL.md`
