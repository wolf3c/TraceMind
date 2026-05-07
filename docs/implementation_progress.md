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
- Added DAU, unique user, and unique device summary output.
- Added `/mcp` remote MCP endpoint with JSON-RPC `initialize`, `tools/list`, `tools/call`, and `ping`, plus a GET preview for manual debugging.
- Added independent multi-token MCP authorization so MCP access no longer reuses the public Auto Capture project key.
- Added MCP tools for event definitions, filtered semantic event queries, filtered raw behavior queries, and filtered summaries.
- Added concise technical design docs for auth, capture, semantic extraction, MCP, and the MVP architecture.
- Added Meteor Mocha coverage for normalization, semantic event building, summaries, and login/project creation.

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
