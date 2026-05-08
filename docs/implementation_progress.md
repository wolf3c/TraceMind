# TraceMind MVP Implementation Progress

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
- Added read-only MCP analysis tools for event definitions, filtered semantic event queries, filtered raw behavior queries, and filtered summaries, so AI coding agents can answer product usage questions from behavior evidence.
- Added concise technical design docs for auth, capture, semantic extraction, MCP, and the MVP architecture.
- Added Meteor Mocha coverage for normalization, semantic event building, summaries, and login/project creation.
- Added deployment config for running TraceMind as an independent app, now served from `https://tracemind.sandbox.galaxycloud.app`, plus deployment docs and commands.

## 2026-05-07

### Completed

- Updated `imports/ui/App.svelte` to Svelte 5 runes for local state, derived dashboard values, and external subscription effects.
- Added `imports/ui/i18n` support for English and Chinese UI text, including locale normalization, persisted language selection, translated status messages, translated confirmation text, and a console language selector.
- Switched UI copy to English source-text translation keys so `en.js` can rely on fallback behavior while `zh.js` carries only Chinese overrides.
- Added `DESIGN.md` and refreshed the first viewport into a darker AI behavior cockpit with a live stream preview, signal metrics, and clearer semantic chips.
- Refined the landing-page positioning around the developer outcome: one script turns real user behavior into product signals that can be questioned from Codex, Claude Code, or Cursor through read-only MCP.
- Replaced the placeholder `T` favicon and navigation mark with the Calm Glyph brand icon, combining a clean Mind glyph with a subtle behavior trace.
- Removed Flowbite-Svelte after evaluating its limited product fit and Meteor Rspack integration cost; repeated cards, form fields, selects, textareas, alerts, and badges now use local semantic markup and CSS primitives.
- Added Meteor Mocha coverage for i18n locale normalization, compact English fallback, required Chinese overrides, fallback translation, and interpolation.
- Added public coding-agent guidance resources under `/agents/tracemind/`, a dynamic console install prompt that injects the current MCP URL with skill fallback and global-MCP confirmation handling, and MCP tools for guidance version checks, event-name search, instrumentation suggestions, payload/diff validation, and privacy checks.
- Added explicit console authentication restore states so production refreshes show session/dashboard loading instead of briefly flashing the email login form, with retry handling for authenticated dashboard load failures.
- Added current-project selection in the developer console so newly created projects are selected immediately and existing multi-project accounts can switch the displayed project key, capture script, MCP URL, source stats, and token controls.
- Tightened the authenticated setup console with shorter Chinese-first copy, adjacent copy buttons for the project key, capture script, and install prompt, token-scoped MCP URL copy actions, plus collapsed advanced areas for the full agent prompt and MCP token management.
- Localized the coding-agent setup prompt so Chinese UI produces Chinese install instructions while English and other locales produce English instructions.
- Split the multi-project console into account identity, current-project setup, and current-project events so behavior metrics, source stats, and recent events share the same selected-project scope.
- Added `tracemind.capture_setup` so coding agents can retrieve the current project's Web Auto Capture script through MCP before adding manual custom events.
- Added explicit project summary window metadata and pure console-state helpers so current-project counts stay full-scope while users, DAU, devices, and stale-response handling are easier to reason about and test.

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

- Extended `tracemind.capture_setup` with platform-specific setup output for Web, iOS, Android, and React Native while keeping Web as the default.
- Expanded TraceMind coding-agent guidance so native setup uses structured MCP fields for install commands, files to edit, initialization location, idempotency checks, verification commands, source model, and privacy constraints.
- Added `/api/capture` batch ingestion for SDK queues using `{ projectKey, events: [...] }`, with per-event source normalization and source blocking.
- Added initial native SDK packages under `sdk/ios`, `sdk/android`, and `sdk/react-native`, including one-line `TraceMind.start(...)` entrypoints, target hashing, sensitive-field filtering, local queueing, and batch flush paths.
- Added native manual capture parity with Web: `TraceMind.identify(...)`, primitive string/number/boolean properties and context, user identity persistence, and React Native bridge forwarding.
- Updated the developer console setup panel to switch between Web, iOS, Android, and React Native setup snippets without exposing MCP tokens.
- Updated Auto Capture, semantic event, MCP, README, and coding-agent documentation for cross-platform capture and native manual capture guidance.

### Not Yet Included

- Automatic network hook, crash reporting, session replay, screenshots, or native view snapshots.
- Published package manager distribution for SwiftPM, Gradle, or npm.
- Device-lab integration smoke tests against real iOS/Android/React Native sample apps.
