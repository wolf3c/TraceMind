# TraceMind Deployment

## Target Shape

TraceMind runs as an independent Meteor application on the same server used by yezi2. It is not bundled into the yezi2 Meteor process.

- yezi2 remains on `https://super-tree.com`.
- TraceMind is served from `https://tracemind.super-tree.com`.
- The two apps share the server and MUP proxy layer, but keep separate Docker containers, Meteor bundles, and runtime routes.
- TraceMind should use its own Mongo database, for example the `tracemind` database on the existing Mongo cluster.

This preserves TraceMind's `/capture.js`, `/api/capture`, and `/mcp` endpoints without adding global routes to yezi2.

## Local Deploy Files

The deploy files live under `.deploy/`, which is intentionally ignored because it can contain credentials.

- `.deploy/mup.js` defines the MUP app name, server, Docker image, subdomain proxy, and runtime environment.
- `.deploy/settings.json` provides Meteor settings such as `private.MAIL_URL`.
- `.deploy/mup.js` reads `MONGO_URL` from `TRACEMIND_MONGO_URL` first, then from `.deploy/settings.json` at `galaxy.meteor.com.env.MONGO_URL`.

Override defaults with environment variables when needed:

- `TRACEMIND_DOMAIN`
- `TRACEMIND_DEPLOY_HOST`
- `TRACEMIND_DEPLOY_USER`
- `TRACEMIND_DEPLOY_PEM`
- `TRACEMIND_MONGO_URL`
- `TRACEMIND_MONGO_OPLOG_URL`
- `TRACEMIND_LETSENCRYPT_EMAIL`

## Deploy Commands

Create a DNS `A` record before deploying:

```text
tracemind.super-tree.com -> 139.129.28.227
```

Run the initial server setup once after DNS resolves to the yezi2 server:

```bash
npm run deploy:setup
```

Deploy or redeploy TraceMind:

```bash
npm run deploy
```

Tail production logs:

```bash
npm run deploy:logs
```

## Verification

After deployment, verify these URLs:

- `https://tracemind.super-tree.com/` loads the TraceMind console.
- `https://tracemind.super-tree.com/capture.js` returns JavaScript with `Content-Type: application/javascript`.
- `https://tracemind.super-tree.com/mcp?mcpToken=tm_mcp_xxx` returns the MCP preview for a valid token.
- A page using the capture snippet writes raw behavior records and semantic events.

Do not point yezi2's root domain at TraceMind. If yezi2 should use TraceMind capture in production, update yezi2's capture snippet only after this subdomain deployment is live.
