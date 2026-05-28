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

## Product Usage Instrumentation

TraceMind can dogfood its own server-side manual capture to measure daily customer projects and accounts that send capture or presence data. The app uses the public `@tracemind/server-node` SDK in the same shape as a customer Node service. This is disabled unless both private settings or environment variables are present:

- `TRACEMIND_PRODUCT_USAGE_PROJECT_ID`: TraceMind's own internal project id, used to skip recursive self-capture.
- `TRACEMIND_PRODUCT_USAGE_PROJECT_KEY`: TraceMind's own public project key, used only for writing the internal `customer_project_capture_active` event.
- `TRACEMIND_PRODUCT_USAGE_ENDPOINT`: optional capture endpoint override; defaults to this app's `/api/capture`.

Keep these values in private Meteor settings or Galaxy environment variables. Do not commit MCP tokens, auth tokens, project keys, or private deployment settings.

When this marker is missing or unhealthy, `tracemind.summary` queries for `customer_project_capture_active` include a `productUsageInstrumentation` health object. Treat `authoritative: false` as a configuration or delivery problem, not as proof that no customer projects are active. Marker writes are claimed as `pending`, marked `sent` only after the internal capture flush succeeds, and retried after failures or stale pending attempts.

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
npm run check:sdk-registry-publication -- <version>
npm run deploy
```

If `check:deploy-git-publication` fails, do not deploy. It verifies `package.json.version`, the manifest `sourceRef`, clean `main`, `origin/main`, and the remote release tag so the Galaxy app cannot advertise SDK source that is missing or mismatched on GitHub.

The release tag also triggers the `SDK Publish` GitHub Actions workflow. That workflow publishes registry-backed SDKs to npm, PyPI, and Maven Central and does not run `npm run deploy`. `$deploy` remains the only path that runs the Meteor deploy command. If `check:sdk-registry-publication` fails, do not deploy; the app must not advertise registry install commands until every registry-backed SDK in `sdk/release_manifest.json` is visible in its package registry. Swift remains a local-source SDK in this flow.

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
