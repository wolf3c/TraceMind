# TraceMind MVP Technical Plan

## Goal

Ship a thin cross-platform TraceMind MVP that proves the core loop:

```text
email passwordless login -> project key -> one-line auto capture -> raw behavior storage
-> scheduled semantic event extraction -> filtered remote MCP data access
```

## Architecture

- Meteor Accounts owns passwordless email login. TraceMind server owns project keys, capture ingestion, semantic extraction, and MCP responses.
- Svelte client provides a landing page plus a small developer console.
- MongoDB stores all MVP data in simple collections under `imports/api/tracemind.js`.
- The event model keeps identity, session, device, platform, IP/geo, custom properties, and context fields stable so Web, iOS, Android, Mini Program, Browser Extension, MCP, Agent Skill, and ordinary server manual events can share one schema.
- Semantic extraction starts with deterministic rules in `imports/api/semantic.js`. LLM enrichment can be added later without changing capture ingestion.

## Modules

| Module | Files | Responsibility |
| --- | --- | --- |
| Landing + console | `imports/ui/App.svelte`, `client/main.css` | Explain product, handle passwordless login, show project key/platform setup snippets/recent events |
| Auth + projects | `server/tracemind_methods.js`, `server/tracemind_publications.js`, `imports/api/tracemind.js` | Configure passwordless email, map `Meteor.userId()` to developer record and project key, and publish owner-scoped console project metadata |
| Capture SDKs | `server/capture_routes.js`, `sdk/ios`, `sdk/android`, `sdk/react-native`, `sdk/mini-program`, `sdk/browser-extension`, `sdk/mcp-node`, `sdk/mcp-python`, `sdk/server-node`, `sdk/server-python` | Serve `/capture.js`, provide Web/Native/Mini Program/Browser Extension/MCP/server SDKs, and ingest `/api/capture` raw behavior with identity, device, source, IP/geo, custom fields |
| Semantic extraction + reports | `server/semantic_jobs.js`, `server/daily_reports.js`, `imports/api/semantic.js` | Periodically convert raw behavior into semantic events and maintain daily project health reports |
| Remote MCP | `server/capture_routes.js` | Serve `/mcp?mcpToken=...` or Bearer MCP tokens with event definitions, filtered semantic event queries, raw log queries, summaries, developer feedback submission, and a GET preview |
| Tests | `tests/main.js` | Cover email normalization, semantic extraction, summary logic, and login/project creation |

## MVP Boundaries

- Human login uses `accounts-passwordless` and Mailgun-backed Meteor `email`.
- SDK capture uses a public project key. MCP access uses independent `tm_mcp_*` tokens, separate from both project keys and Meteor Accounts browser sessions. MCP tokens read behavior evidence and can write developer feedback reports through `tracemind.submit_feedback`; feedback writes are deduplicated and rate limited per project/token, and other analysis tools remain read-only.
- User online duration uses a separate presence store. Web, iOS, macOS, Android, React Native, Mini Program, and Browser Extension extension-owned pages write `/api/presence` heartbeat updates into `tracemind_presence_sessions`; these records do not create raw behaviors or semantic events. Dashboard health active-time metrics use strict `activeDurationMs`, not foreground `durationMs`: Web and Browser Extension pages require visible + focused + a 60-second interaction window, while iOS/macOS/Android/RN/Mini Program require foreground app state plus recent tap/text/screen activity.
- Capture requests include cross-platform source fields. Project owners can block suspicious `sourceType + sourceKey` values after seeing them in the console; blocked events return ok but are not stored.
- `/api/capture` accepts both single-event payloads and SDK batch payloads in `{ projectKey, events: [...] }` form.
- Native SDK v1 targets stable Auto Capture basics: app/screen view, macOS window/screen changes, click/tap, input changed, submit, local queue, and batch flush. Automatic network hook, crash reporting, session replay, screenshots, and native snapshots are out of scope.
- MCP SDK v1 targets safe tool/resource/prompt metadata and optional Agent Skill lifecycle hooks. Raw prompts, arguments, results, resource content, source code, diffs, secrets, tokens, and full query URLs are out of scope.
- Browser Extension SDK v1 targets extension-owned popup/options/sidebar/devtools pages plus background/service worker manual capture. Content script host-page no-code capture, host page DOM/content, tab full URLs, browser history, bookmarks, cookies, screenshots, tokens, and input values are out of scope.
- Ordinary server app v1 targets manual business outcome capture only through `server_node`, `server_python`, or `server_http`; request Auto Capture, logs, request/response bodies, headers, cookies, database hooks, crash reporting, and global HTTP hooks are out of scope.
- Remote MCP uses a minimal Streamable HTTP JSON-RPC surface with `initialize`, `tools/list`, `tools/call`, and `ping`.
- Semantic understanding is deterministic in v1.0. It creates readable business-ish events from capture context, with no LLM dependency yet.
- DAU uses `userId || anonymousId`; device analysis uses `deviceId` first and `deviceFingerprint` as an auxiliary fallback.
- The selected-project console health overview reads Asia/Shanghai daily reports generated from hourly rollups instead of scanning all historical events on refresh. The dashboard subscribes to safe `tracemind_project_daily_reports` fields and uses Minimongo as the date-switch cache. Today is refreshed lazily as a draft report from completed hours and compared with yesterday's same completed-hour span, while historical dates read already-materialized final reports from pub/sub. Reports store hashed actor and session sets internally and persist only public health metrics for the client.
- Today's selected-project dashboard also has a separate delayed recent-online card. It calls `tracemind.project.recentOnline` after the main cards render, scans only the last 30 minutes of presence sessions and semantic events, and returns unique online users, six 5-minute buckets, region Top 3, active-duration page Top 3, and event Top 3. This path is intentionally outside daily reports so it cannot slow date switching or project setup metadata.
- The authenticated console also reads the developer profile and owned project metadata through Meteor pub/sub so the current account, project selector, project key, MCP token controls, and blocked-source state reuse Minimongo after the first subscription. Write operations remain Meteor methods, and `tracemind.dashboard.bootstrap` only ensures the developer/default project exists.

## Deployment Shape

TraceMind is deployed as a separate Meteor app on Galaxy, served from `https://tracemind.sandbox.galaxycloud.app`. It keeps its own Meteor routes, runtime settings, and Mongo database. The yezi2 root app remains on `https://super-tree.com`.

This deployment shape keeps `/capture.js`, `/api/capture`, and `/mcp` owned by TraceMind and avoids mixing TraceMind's background semantic extraction job or passwordless email templates into the yezi2 Meteor process. See `docs/deployment.md` for the operational commands and verification checklist.

## Run Commands

- `npm start` starts local development.
- `npm test` runs the Meteor Mocha suite once.
- `npm run test:sdk:ios` runs the Swift SDK tests.
- `npm run test:sdk:react-native` runs the React Native wrapper tests.
- `npm run test:sdk:mini-program` runs the Mini Program SDK tests.
- `npm run test:sdk:browser-extension` runs the Browser Extension SDK tests.
- `npm run test:sdk:mcp-node` runs the Node MCP SDK tests.
- `npm run test:sdk:mcp-python` runs the Python MCP SDK tests.
- `npm run test:sdk:server-node` runs the Node server manual capture SDK tests.
- `npm run test:sdk:server-python` runs the Python server manual capture SDK tests.
- Install snippet after login:

```html
<script src="http://localhost:3000/capture.js" data-tracemind-token="PROJECT_KEY" async></script>
```

## Future LLM Settings

If LLM semantic enrichment is enabled later, put model settings in a local Meteor settings file and start with:

```bash
meteor run --settings settings.json
```

The intended settings shape is:

```json
{
  "private": {
    "llm": {
      "baseURL": "https://api3.wlai.vip/v1",
      "apiKey": "local-secret",
      "model": "gpt-5.4-nano"
    }
  }
}
```
