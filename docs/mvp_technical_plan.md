# TraceMind MVP Technical Plan

## Goal

Ship a thin web-first TraceMind MVP that proves the core loop:

```text
email passwordless login -> project key -> one-line web auto capture -> raw behavior storage
-> scheduled semantic event extraction -> filtered remote MCP data access
```

## Architecture

- Meteor Accounts owns passwordless email login. TraceMind server owns project keys, capture ingestion, semantic extraction, and MCP responses.
- Svelte client provides a landing page plus a small developer console.
- MongoDB stores all MVP data in simple collections under `imports/api/tracemind.js`.
- The event model keeps identity, session, device, platform, IP/geo, custom properties, and context fields stable so Web, iOS, Android, and server events can share one schema.
- Semantic extraction starts with deterministic rules in `imports/api/semantic.js`. LLM enrichment can be added later without changing capture ingestion.

## Modules

| Module | Files | Responsibility |
| --- | --- | --- |
| Landing + console | `imports/ui/App.svelte`, `client/main.css` | Explain product, handle passwordless login, show project key/snippets/recent events |
| Auth + projects | `server/tracemind_methods.js`, `imports/api/tracemind.js` | Configure passwordless email, map `Meteor.userId()` to developer record and project key |
| Auto capture | `server/capture_routes.js` | Serve `/capture.js` and ingest `/api/capture` raw behavior with identity, device, source, IP/geo, custom fields |
| Semantic extraction | `server/semantic_jobs.js`, `imports/api/semantic.js` | Periodically convert raw behavior into semantic events |
| Remote MCP | `server/capture_routes.js` | Serve `/mcp?mcpToken=...` or Bearer MCP tokens with event definitions, filtered semantic event queries, raw log queries, summaries, and a GET preview |
| Tests | `tests/main.js` | Cover email normalization, semantic extraction, summary logic, and login/project creation |

## MVP Boundaries

- Human login uses `accounts-passwordless` and Mailgun-backed Meteor `email`.
- SDK capture uses a public project key. MCP access uses independent read-only `tm_mcp_*` tokens, separate from both project keys and Meteor Accounts browser sessions.
- Capture requests include cross-platform source fields. Project owners can block suspicious `sourceType + sourceKey` values after seeing them in the console; blocked events return ok but are not stored.
- Remote MCP uses a minimal Streamable HTTP JSON-RPC surface with `initialize`, `tools/list`, `tools/call`, and `ping`.
- Semantic understanding is deterministic in v1.0. It creates readable business-ish events from capture context, with no LLM dependency yet.
- DAU uses `userId || anonymousId`; device analysis uses `deviceId` first and `deviceFingerprint` as an auxiliary fallback.

## Run Commands

- `npm start` starts local development.
- `npm test` runs the Meteor Mocha suite once.
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
