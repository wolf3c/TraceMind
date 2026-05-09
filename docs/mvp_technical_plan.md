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
- The event model keeps identity, session, device, platform, IP/geo, custom properties, and context fields stable so Web, iOS, Android, MCP, Agent Skill, and ordinary server manual events can share one schema.
- Semantic extraction starts with deterministic rules in `imports/api/semantic.js`. LLM enrichment can be added later without changing capture ingestion.

## Modules

| Module | Files | Responsibility |
| --- | --- | --- |
| Landing + console | `imports/ui/App.svelte`, `client/main.css` | Explain product, handle passwordless login, show project key/platform setup snippets/recent events |
| Auth + projects | `server/tracemind_methods.js`, `imports/api/tracemind.js` | Configure passwordless email, map `Meteor.userId()` to developer record and project key |
| Capture SDKs | `server/capture_routes.js`, `sdk/ios`, `sdk/android`, `sdk/react-native`, `sdk/mcp-node`, `sdk/mcp-python`, `sdk/server-node`, `sdk/server-python` | Serve `/capture.js`, provide Web/Native/MCP/server SDKs, and ingest `/api/capture` raw behavior with identity, device, source, IP/geo, custom fields |
| Semantic extraction | `server/semantic_jobs.js`, `imports/api/semantic.js` | Periodically convert raw behavior into semantic events |
| Remote MCP | `server/capture_routes.js` | Serve `/mcp?mcpToken=...` or Bearer MCP tokens with event definitions, filtered semantic event queries, raw log queries, summaries, and a GET preview |
| Tests | `tests/main.js` | Cover email normalization, semantic extraction, summary logic, and login/project creation |

## MVP Boundaries

- Human login uses `accounts-passwordless` and Mailgun-backed Meteor `email`.
- SDK capture uses a public project key. MCP access uses independent read-only `tm_mcp_*` tokens, separate from both project keys and Meteor Accounts browser sessions.
- User online duration uses a separate presence store. Web, iOS, Android, and React Native write `/api/presence` heartbeat updates into `tracemind_presence_sessions`; these records do not create raw behaviors or semantic events.
- Capture requests include cross-platform source fields. Project owners can block suspicious `sourceType + sourceKey` values after seeing them in the console; blocked events return ok but are not stored.
- `/api/capture` accepts both single-event payloads and SDK batch payloads in `{ projectKey, events: [...] }` form.
- Native SDK v1 targets stable Auto Capture basics: app/screen view, click/tap, input changed, submit, local queue, and batch flush. Automatic network hook, crash reporting, session replay, screenshots, and native snapshots are out of scope.
- MCP SDK v1 targets safe tool/resource/prompt metadata and optional Agent Skill lifecycle hooks. Raw prompts, arguments, results, resource content, source code, diffs, secrets, tokens, and full query URLs are out of scope.
- Ordinary server app v1 targets manual business outcome capture only through `server_node`, `server_python`, or `server_http`; request Auto Capture, logs, request/response bodies, headers, cookies, database hooks, crash reporting, and global HTTP hooks are out of scope.
- Remote MCP uses a minimal Streamable HTTP JSON-RPC surface with `initialize`, `tools/list`, `tools/call`, and `ping`.
- Semantic understanding is deterministic in v1.0. It creates readable business-ish events from capture context, with no LLM dependency yet.
- DAU uses `userId || anonymousId`; device analysis uses `deviceId` first and `deviceFingerprint` as an auxiliary fallback.
- The selected-project console health overview uses a rolling 24h window compared with the previous 24h. It reports active users, active sessions, average active time per user, total user behavior events, new-user cohort retention, top distributions, and high-confidence attention items. Raw behavior and semantic event counts remain diagnostics, not the primary developer health cards.

## Deployment Shape

TraceMind is deployed as a separate Meteor app on Galaxy, served from `https://tracemind.sandbox.galaxycloud.app`. It keeps its own Meteor routes, runtime settings, and Mongo database. The yezi2 root app remains on `https://super-tree.com`.

This deployment shape keeps `/capture.js`, `/api/capture`, and `/mcp` owned by TraceMind and avoids mixing TraceMind's background semantic extraction job or passwordless email templates into the yezi2 Meteor process. See `docs/deployment.md` for the operational commands and verification checklist.

## Run Commands

- `npm start` starts local development.
- `npm test` runs the Meteor Mocha suite once.
- `npm run test:sdk:ios` runs the Swift SDK tests.
- `npm run test:sdk:react-native` runs the React Native wrapper tests.
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
