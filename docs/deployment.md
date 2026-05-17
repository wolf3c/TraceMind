# TraceMind Deployment

## Target Shape

TraceMind runs as an independent Meteor application on Galaxy. It is not bundled into the yezi2 Meteor process.

- yezi2 remains on `https://super-tree.com`.
- TraceMind is served from `https://tracemind.sandbox.galaxycloud.app`.
- TraceMind keeps separate Meteor routes and runtime settings.
- TraceMind should use its own Mongo database, for example the `tracemind` database on the existing Mongo cluster.

This preserves TraceMind's `/capture.js`, `/api/capture`, and `/mcp` endpoints without adding global routes to yezi2.

## Local Deploy Files

The deploy files live under `.deploy/`, which is intentionally ignored because it can contain credentials.

- `.deploy/settings.json` provides Meteor settings such as `private.MAIL_URL`.
- `.deploy/settings.json` can provide Galaxy runtime variables under `galaxy.meteor.com.env`, including `MONGO_URL`.
- `.deploy/mup.js` is legacy self-hosted deployment config. Use it only if TraceMind is moved back to a custom server/domain, and provide `TRACEMIND_DOMAIN` explicitly.

## Deploy Commands

Deploy or redeploy TraceMind:

```bash
npm run deploy
```

When the release exposes SDK `latestSdk.sourceRef`, deploy from `main` only after publishing the matching GitHub source tag:

```bash
npm run prepare:sdk-release-ref -- <version>
npm run test:sdk-release
git add package.json package-lock.json sdk/release_manifest.json
git commit -m "Deploy TraceMind <version>"
git tag tracemind-release-<version>
git push origin main
git push origin tracemind-release-<version>
npm run check:deploy-git-publication -- <version>
npm run deploy
```

If `check:deploy-git-publication` fails, do not deploy. It verifies `package.json.version`, the manifest `sourceRef`, clean `main`, `origin/main`, and the remote release tag so the Galaxy app cannot advertise SDK source that is missing or mismatched on GitHub.

Tail production logs:

```bash
npm run deploy:logs
```

Use the Galaxy deployment page to inspect deployment progress when a deploy is active.

## Verification

After deployment, verify these URLs:

- `https://tracemind.sandbox.galaxycloud.app/` loads the TraceMind console.
- `https://tracemind.sandbox.galaxycloud.app/capture.js` returns JavaScript with `Content-Type: application/javascript`.
- `https://tracemind.sandbox.galaxycloud.app/mcp?mcpToken=tm_mcp_xxx` returns the MCP preview for a valid token.
- A page using the capture snippet writes raw behavior records and semantic events.

Do not point yezi2's root domain at TraceMind. If yezi2 should use TraceMind capture in production, update yezi2's capture snippet only after this subdomain deployment is live.
