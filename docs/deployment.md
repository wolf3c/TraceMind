# TraceMind Deployment

## Target Shape

TraceMind runs as an independent Meteor application on Galaxy. It is not bundled into the yezi2 Meteor process.

- yezi2 remains on `https://super-tree.com`.
- TraceMind is served from `https://tracemind.sandbox.galaxycloud.app`.
- Web Auto Capture script distribution is served from Cloudflare Pages at `https://tracemind-capture.pages.dev/capture.js` in production.
- TraceMind keeps separate Meteor routes and runtime settings.
- TraceMind should use its own Mongo database, for example the `tracemind` database on the existing Mongo cluster.

Galaxy remains the API and app origin for `/api/capture`, `/api/presence`, `/api/user-feedback`, `/mcp`, and the dashboard. Galaxy `/capture.js` stays available for local development, old links, and emergency rollback, but the production `tracemind.capture_setup` snippet should point at Cloudflare Pages when `TRACEMIND_CAPTURE_SCRIPT_ORIGIN` is configured.

## Local Deploy Files

The deploy files live under `.deploy/`, which is intentionally ignored because it can contain credentials.

- `.deploy/settings.json` provides Meteor settings such as `private.MAIL_URL`.
- `.deploy/settings.json` can provide Galaxy runtime variables under `galaxy.meteor.com.env`, including `MONGO_URL`.
- `TRACEMIND_CAPTURE_SCRIPT_ORIGIN` should be set in the Galaxy runtime environment to `https://tracemind-capture.pages.dev` for production so MCP setup snippets and Web script auto-update URLs use Cloudflare Pages.
- `.deploy/mup.js` is legacy self-hosted deployment config. Use it only if TraceMind is moved back to a custom server/domain, and provide `TRACEMIND_DOMAIN` explicitly.

## OAuth Login Configuration

Google and GitHub login use Meteor `service-configuration`. Keep the real OAuth client secrets in private Meteor settings or Galaxy settings only.

```json
{
  "packages": {
    "service-configuration": {
      "google": {
        "clientId": "google-client-id",
        "secret": "google-client-secret",
        "loginStyle": "popup"
      },
      "github": {
        "clientId": "github-client-id",
        "secret": "github-client-secret",
        "loginStyle": "popup"
      }
    }
  }
}
```

Production callback URLs:

- `https://tracemind.sandbox.galaxycloud.app/_oauth/google`
- `https://tracemind.sandbox.galaxycloud.app/_oauth/github`

Local development callback URLs when running with `ROOT_URL=http://localhost:3000`:

- `http://localhost:3000/_oauth/google`
- `http://localhost:3000/_oauth/github`

Google OAuth clients can include both local and production redirect URIs, but each URI must match exactly. GitHub OAuth Apps accept one authorization callback URL, so use separate GitHub OAuth Apps for local development and production. GitHub login requests `user:email` only; do not add repo, org, code, or offline access scopes for dashboard login.

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
npm run check:release-metadata
npm run test:sdk-release
git add package.json package-lock.json sdk/release_manifest.json
git commit -m "Deploy TraceMind <version>"
git tag tracemind-release-<version>
git push origin main
git push origin tracemind-release-<version>
npm run check:deploy-git-publication -- <version>
npm run check:sdk-registry-publication -- <version>
npm run deploy
npm run build:capture-static
gh workflow run cloudflare-capture-publish.yml -f version=<version> -f commit_sha=<release-commit-sha>
# Wait for the Cloudflare Capture Publish workflow to finish successfully.
npm run check:capture-static-publication
```

If `check:release-metadata` fails, do not deploy. It verifies customer-visible release markers from `imports/api/release_metadata.js`, including Web Auto Capture `scriptReleaseId` and public agent guidance versions, so Dashboard/MCP/docs do not disagree with runtime code.

If `check:deploy-git-publication` fails, do not deploy. It verifies `package.json.version`, the manifest `sourceRef`, clean `main`, `origin/main`, and the remote release tag so the Galaxy app cannot advertise SDK source that is missing or mismatched on GitHub.

The release tag also triggers the `SDK Publish` GitHub Actions workflow. That workflow publishes registry-backed SDKs to npm, PyPI, and Maven Central and does not run `npm run deploy`. `$deploy` remains the only path that runs the Meteor deploy command. If `check:sdk-registry-publication` fails, do not deploy; the app must not advertise registry install commands until every registry-backed SDK in `sdk/release_manifest.json` is visible in its package registry. Swift remains a local-source SDK in this flow.

After a successful Galaxy deploy, publish the Web Auto Capture static script with the manual `Cloudflare Capture Publish` GitHub Actions workflow. It snapshots `https://tracemind.sandbox.galaxycloud.app/capture.js`, deploys the generated `capture.js`, `_headers`, and immutable `capture.<sha256>.js` files to the Cloudflare Pages project `tracemind-capture`, and verifies the public Cloudflare contract. Trigger it manually only after Galaxy is serving the release commit:

```bash
gh workflow run cloudflare-capture-publish.yml \
  -f version=<version> \
  -f commit_sha=<release-commit-sha>
```

Do not add a tag or push trigger to the Cloudflare capture workflow. Release tags are pushed before Galaxy deploy so the SDK publish workflow can run, and an automatic Cloudflare upload at that point could snapshot the previous Galaxy script. If GitHub Actions is unavailable, run a local Wrangler Direct Upload from `.codex/scratch/capture-static/<version>/` with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` loaded from a private, ignored environment file.

Locate production runtime logs:

```bash
npm run deploy:logs
```

This command prints the TraceMind Runtime Logs URL in the authenticated Galaxy Dashboard: [TraceMind Runtime Logs](https://my.galaxycloud.app/wolf3c/us-east-1/apps/9e6d8a40-b9bf-4857-ad8c-e7687b41c6fd/logs). It does not fetch or tail logs in the terminal; open the printed URL in an authenticated browser to use Galaxy's live view, time ranges, and filters. See the [Galaxy Runtime Logs documentation](https://help.galaxycloud.app/docs/dashboard/apps/logs) for the current dashboard behavior.

Use the Galaxy deployment page to inspect deployment progress and build/deploy logs when a deploy is active.

## Verification

After deployment, verify these URLs:

- `https://tracemind.sandbox.galaxycloud.app/` loads the TraceMind console.
- `https://tracemind-capture.pages.dev/capture.js` returns `200 OK` JavaScript directly, not a redirect, with `Content-Type: application/javascript`, `ETag`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=60, must-revalidate`, no `Set-Cookie`, a non-empty body, and the current `scriptReleaseId`.
- `https://tracemind-capture.pages.dev/capture.<sha256>.js` returns the same body with `Cache-Control: public, max-age=31536000, immutable`.
- `https://tracemind.sandbox.galaxycloud.app/capture.js` returns a fallback JavaScript body with the current `scriptReleaseId`; Galaxy response headers are not the production cache-header compliance target.
- `https://tracemind.sandbox.galaxycloud.app/site.webmanifest` returns valid JSON with `name` or `short_name`, `start_url: "/"`, `display: "standalone"`, `prefer_related_applications: false`, and PNG icons for 192x192 and 512x512 sizes.
- `https://tracemind.sandbox.galaxycloud.app/service-worker.js` returns JavaScript that installs and activates at root scope, caches the anonymous page shell plus PWA/static assets, and explicitly bypasses dashboard/API data, MCP, capture, presence, feedback, authenticated content, and Meteor realtime routes.
- `https://tracemind.sandbox.galaxycloud.app/pwa/icon-192.png`, `/pwa/icon-512.png`, `/pwa/icon-maskable-192.png`, `/pwa/icon-maskable-512.png`, and `/pwa/apple-touch-icon.png` return PNG image bodies.
- In Chrome or Edge DevTools, the Application panel shows the TraceMind manifest, service worker, and a `tracemind-page-shell-*` cache after a repeat page load; API/MCP/capture/presence/feedback and `/sockjs/` traffic should still appear as network requests. On desktop and mobile layouts, verify the optional install action stays in the global header and no install banner occupies the console content. On iOS/iPadOS, verify the Add to Home Screen guidance appears only after clicking the install action and uses the TraceMind title and icon.
- `https://tracemind.sandbox.galaxycloud.app/mcp?mcpToken=tm_mcp_xxx` returns the MCP preview for a valid token.
- A page using the capture snippet writes raw behavior records and semantic events.

Do not point yezi2's root domain at TraceMind. If yezi2 should use TraceMind capture in production, update yezi2's capture snippet only after this subdomain deployment is live.
