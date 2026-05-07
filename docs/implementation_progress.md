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
- Added local MUP deployment config for running TraceMind as an independent app at `https://tracemind.super-tree.com` on the same server as yezi2, plus deployment docs and npm deploy commands.

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
- Added public coding-agent guidance resources under `/agents/tracemind/`, a dynamic console install prompt that injects the current MCP URL, and MCP tools for guidance version checks, event-name search, instrumentation suggestions, payload/diff validation, and privacy checks.
- Added explicit console authentication restore states so production refreshes show session/dashboard loading instead of briefly flashing the email login form, with retry handling for authenticated dashboard load failures.

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
