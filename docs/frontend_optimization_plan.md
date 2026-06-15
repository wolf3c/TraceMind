# Frontend Optimization Plan

## Current Behavior

- `imports/ui/App.svelte` renders the landing page and developer console with local HTML controls and custom CSS.
- The component still uses legacy Svelte reactive declarations and `on:event` listeners.
- `imports/ui/i18n/` exists but is not used by the UI, and its locale dictionaries are empty.
- The UI does not depend on a third-party component kit.

## Target Behavior

- Use local UI primitives and CSS classes for repeated cards, labels, inputs, textareas, selects, and alerts.
- Keep the existing TraceMind product flow intact: email code login, project creation, capture snippet display, source blocking, MCP token management, dashboard refresh, and logout.
- Add English and Chinese UI support through `imports/ui/i18n`, with a language selector and locale persistence.
- Convert `App.svelte` to Svelte 5 runes for local state, derived values, and effects, and use standard event handler props such as `onclick`.

## Affected Modules

- `imports/ui/App.svelte`
- `imports/ui/i18n/i18n.js`
- `imports/ui/i18n/locales/en.js`
- `imports/ui/i18n/locales/zh.js`
- `client/main.css`
- `client/main.html`
- `public/favicon.svg`
- `tests/main.js`
- `README.md`
- `docs/implementation_progress.md`
- `tsconfig.json`
- `package.json` and `package-lock.json` if UI dependencies change.

## Risks

- Local UI primitives must preserve form semantics, focus states, and responsive layout without relying on component-library defaults.
- Svelte 5 conversion can break reactivity if derived dashboard fields or Tracker cleanup are moved incorrectly.
- i18n can regress operator-facing status messages if keys are missing or interpolation is wrong.
- UI cleanup should not remove existing console capabilities or change server method contracts.

## Verification Plan

- Add failing Meteor Mocha coverage for locale normalization, fallback translation, interpolation, and required UI message keys before editing production i18n code.
- Run `npm test` after implementation.
- Run `npx svelte-check --compiler-warnings error` for Svelte diagnostics.
- Start the app with `npm start` and verify the local page loads if dependency installation and the local Meteor environment allow it.
- Check the page in Chrome DevTools for successful render, expected localized copy, and no new blocking console errors.

## 2026-05-07 Visual Polish Pass

### Current Behavior

- The UI briefly used Flowbite form/card primitives, but the visual result still read close to the previous custom layout.
- English locale entries duplicate their keys and values; the fallback behavior in `translateMessage()` is underused.
- The hero panel explains the product but does not show enough of the product's data-control surface.

### Target Behavior

- Use English source strings directly as translation keys so `imports/ui/i18n/locales/en.js` can stay compact.
- Use `DESIGN.md` as the local semantic design reference for a more product-specific AI behavior cockpit style.
- Add compact semantic chips and visible state labels, while keeping the existing product workflows unchanged.
- Improve first-screen hierarchy with a product-console preview, denser metrics, stronger contrast, and clearer setup flow.

### Risks

- Replacing symbolic i18n keys with English source keys touches many UI strings and status messages.
- Visual polish must not break login, project creation, MCP token management, source blocking, or dashboard refresh flows.
- Component-library additions must avoid package barrel imports that can pull incompatible modules into Meteor Rspack; prefer local primitives when the UI pattern is simple.

### Verification Plan

- Update i18n tests first so they fail against the old duplicated English dictionary contract.
- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Verify `npm start` returns HTTP 200 and inspect the rendered page in the browser.

## 2026-05-07 Flowbite Removal Pass

### Current Behavior

- `imports/ui/App.svelte` imports Flowbite-Svelte components for cards, labels, inputs, selects, textareas, and alerts.
- The TraceMind visual identity is already implemented through local design tokens and CSS, while Flowbite contributes only shallow form and card wrappers.
- One attempted Flowbite component import exposed a Meteor Rspack package-resolution incompatibility.

### Target Behavior

- Remove `flowbite` and `flowbite-svelte` dependencies.
- Replace Flowbite-Svelte usage with semantic native elements and existing local classes.
- Preserve the login, project creation, capture snippet, source management, MCP token, dashboard refresh, locale selection, and status-message flows.
- Keep `DESIGN.md` as the source of UI direction instead of using a generic component-library look.

### Risks

- Native replacements can accidentally change binding behavior, readonly fields, or accessible labels.
- Card and alert spacing may shift if library defaults were carrying hidden layout.
- Package lock cleanup must remove Flowbite transitive packages without unrelated dependency churn.

### Verification Plan

- Search for all remaining Flowbite references after editing.
- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Start the app and verify HTTP 200 plus a browser render smoke check.

## 2026-05-07 Landing Positioning Pass

### Current Behavior

- The hero headline emphasized avoiding complex tracking work, which sounded too internal and implementation-focused for first-time developers.
- The hero lede listed low-level capture categories before explaining the product value.
- The workflow presented MCP as a setup goal instead of the analysis path that lets developers ask product questions from AI coding tools.

### Target Behavior

- Lead with the developer outcome: one script helps developers see how users actually use the product.
- Summarize captured behavior as analyzable product signals instead of listing every raw event category in the hero.
- Present remote MCP as the AI-analysis entrypoint for Codex, Claude Code, Cursor, and similar tools, while preserving that analysis tools are read-only and feedback submission is the only write path.

### Verification Plan

- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Inspect the Chinese landing page copy and verify the setup flow says `1 分钟接入流程`.

## 2026-05-07 Auth Restore State Pass

### Current Behavior

- The console section uses `dashboard === null` for both signed-out and dashboard-not-loaded states.
- After a production refresh, Meteor Accounts restores the session asynchronously, then the client calls `tracemind.dashboard`.
- During that gap, authenticated developers can briefly see the email verification login form.

### Target Behavior

- Resolve console rendering through explicit states: ready, restoring session, loading dashboard, dashboard error, and signed out.
- Show the login form only after Meteor confirms there is no logged-in user.
- Keep dashboard load failures inside an authenticated error panel with retry and logout controls.

### Risks

- Dashboard refresh requests must not race with logout or a later request.
- Automatic dashboard load failures should not be hidden by falling back to the login form.
- Existing login, project creation, source blocking, MCP token, refresh, and logout flows must keep their current method contracts.

### Verification Plan

- Add Meteor Mocha coverage for the console-state resolver before implementation.
- Run `npm test`.
- Run `npx svelte-check --compiler-warnings error`.
- Manually refresh an authenticated production-like session and verify the login form does not flash before the console loads.

## 2026-05-07 Multi-project Scope Pass

### Current Behavior

- The account panel mixes account identity with all-project behavior metrics.
- The selected project controls the setup panel, but recent semantic events still come from all projects.
- Project creation is shown as a standalone form instead of an action near project selection.

### Target Behavior

- Keep account identity separate from behavior analytics.
- Put project selection and compact project creation at the top of the setup panel.
- Drive metrics, source stats, and recent events from `tracemind.project.summary(projectId)` for the selected project.

### Verification Plan

- Add Meteor Mocha coverage proving project summaries do not include sibling project data.
- Run `meteor test --once --driver-package meteortesting:mocha --port <free-port>`.
- Run `npx svelte-check`.

## 2026-05-07 Project Summary Follow-up Pass

### Current Behavior

- New project creation can trigger duplicate current-project summary loads.
- Project summary full counts and recent-window user metrics are displayed together without explicit window metadata.
- Project selection and stale-response checks live directly inside `App.svelte`.

### Target Behavior

- Let dashboard loading skip automatic project summary loading when a caller will explicitly load one.
- Return `summaryWindow` from project summary methods to document the recent-event sample used for users, DAU, devices, sources, and recent events.
- Extract selected-project fallback and stale-response predicates into pure helpers with Meteor Mocha coverage.

### Verification Plan

- Add tests for `summaryWindow` and UI helper predicates before implementation.
- Run `meteor test --once --driver-package meteortesting:mocha --port <free-port>`.
- Run `npx svelte-check`.

## 2026-05-08 DESIGN.md Console Alignment Pass

### Current Behavior

- The page already uses TraceMind's deep green, warm canvas, signal teal, and amber palette.
- The hero still reads like a marketing page because status badges compete with the product-console preview.
- The authenticated console shows project setup, MCP token management, source statistics, metrics, and recent events, but the hierarchy is uneven.
- Recent project events render as a long text list, which makes behavior evidence hard to scan.

### Target Behavior

- Keep the existing product semantics and server method contracts unchanged.
- Align the first viewport with `DESIGN.md`: a compact hero, clear live-data panel, and visible MCP readiness inside the product preview.
- Make the selected project the console anchor, with compact signal chips for the dominant event type and path.
- Render recent events as dense operator evidence rows with event type, meaning, time, path, source, and actor fields when available.
- Show the selected project's selected-date event total beside the detailed event stream so the loaded evidence has volume context.
- Limit the visible recent-event list in the console so the page remains scannable while preserving the backend sample.

### Risks

- Svelte runes-derived values must update correctly when a user switches projects or a summary response arrives.
- Long event paths, anonymous IDs, source keys, or localized strings must not overflow on mobile.
- UI polish must not change project selection, project creation, copy actions, MCP token management, source blocking, or dashboard refresh behavior.

### Verification Plan

- Run Svelte autofixer against `App.svelte`.
- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test` if the local Meteor environment is available.
- Start the app and visually verify desktop and mobile hierarchy, event rows, copy states, and disclosure panels.

## 2026-05-26 Project Health Loading Pass

### Current Behavior

- The project health cards can render from the `ProjectDailyReports` publication, but the console still starts `tracemind.project.summary` on project selection.
- That summary method also gathers source samples and legacy project-detail metadata, so the health refresh button and event stream area can show "Loading project events..." even after the health cards are already visible.
- The detailed event stream is paginated and user-triggered, but its collapsed entry is still gated by the unrelated summary loading state.

### Target Behavior

- Let project health render and refresh from daily report publication state without waiting for project summary samples.
- Replace the manual health refresh with an automatic update status: today's report reuses the queued refresh path while the Dashboard is open and visible, while historical reports remain read-only snapshots.
- Keep the detailed event stream lazy: load page data only when the user opens it.
- Load capture source summaries when setup details are expanded, with a specific source loading/error state and parallelized summary reads.
- 2026-06-15 partial progress: source block and unblock actions now merge the returned project `blockedSources` into the current source summary locally, so the row state updates without waiting for a full `tracemind.project.summary` reload. Dedicated source-summary loading remains a separate follow-up.
- 2026-06-15 partial progress: the selected-project health header no longer exposes a manual refresh button. Today's health auto-refreshes through the existing daily report queue every 5 minutes while visible, and the recent-online card refreshes every 60 seconds.

### Runtime Matrix

- Web/dashboard: change.
- iOS, macOS, Android, React Native, Hybrid, Mini Program, Browser Extension, server SDKs, MCP, Agent Skill, and capture/API surfaces: no change, because this only changes console loading orchestration.

### Verification Plan

- Add project-console state coverage for summary-on-setup loading.
- Run `meteor test --once --driver-package meteortesting:mocha --port <free-port>`.
- Run `npx svelte-check --compiler-warnings error`.
- Start the app and verify the health panel shows refresh and event-stream controls without waiting for `tracemind.project.summary`.

## 2026-05-14 Collapsed Project Setup Pass

### Current Behavior

- The authenticated console shows the current-project setup panel expanded by default.
- Returning developers see project key, Coding Agent setup, MCP token controls, and source statistics before the project health data.

### Target Behavior

- Collapse project setup by default for signed-in users with an existing project.
- Keep the collapsed header limited to the current project switcher, an expand/collapse control, and a project-count hint only when there is more than one project.
- Preserve the existing setup details, project creation, rename/delete actions, copy actions, MCP token management, and source blocking after expansion.

### Verification Plan

- Run Svelte diagnostics after the markup change.
- Run the existing test suite to catch regressions in project/account helper logic.
- Visually check desktop and mobile widths so the compact project switcher and expand control do not crowd out the health overview.

## 2026-05-08 Product Feature Section Simplification

### Current Behavior

- The second landing section presents TraceMind as a four-step setup flow.
- It includes routine account setup details such as email login, which makes the mobile page long and weakens the product differentiators.
- Numbered steps make one-line setup, automatic capture, semantic events, and AI analysis look like equal procedural steps instead of core advantages.

### Target Behavior

- Present this section as two core capabilities: one-script Auto Capture and AI-driven analysis/instrumentation.
- Keep the script example visible because one-line code is a product advantage.
- Remove routine login/setup details from the feature grid and keep mobile copy compact.

### Verification Plan

- Run `npx svelte-check --compiler-warnings error`.
- Inspect the Chinese mobile layout and confirm the section shows only two concise feature cards.

## 2026-05-12 Homepage First-Viewport Positioning Pass

### Current Behavior

- The public hero says one line of code helps developers see product usage, but the differentiation from ordinary analytics is not immediate.
- The right-side live-data panel has useful density, but it does not clearly show the product path from raw behavior to semantic evidence to MCP agent analysis.
- The background chart competes with the product preview instead of supporting it.

### Target Behavior

- Lead with the AI Coding Agent outcome: TraceMind lets AI agents understand real user behavior.
- Make the hero preview a three-step evidence flow: Capture, Understand, and Ask.
- Keep the primary conversion as setup, with a short proof line for one-minute setup, public `projectKey` capture writes, and independent MCP token authorization.
- Keep dashboard, API, MCP, SDK, and Agent Skill behavior unchanged.

### Verification Plan

- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test` or the same Meteor Mocha command on an alternate port if 3000 is occupied.
- Start the app and inspect the public hero on desktop, 860px, and 560px widths for readable copy, no overflow, clear CTA hierarchy, and no untranslated Chinese keys.
