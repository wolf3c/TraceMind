---
name: deploy
description: Use when the user invokes `$deploy` or asks to release or deploy TraceMind. Ensures release work is on main, handles branch merge checks, updates the canonical package.json version, publishes the immutable SDK GitHub source tag, verifies visible/runtime references, runs release checks, deploys through the configured Meteor deploy command, and verifies the deployed app.
---

# TraceMind Deploy

Use this skill when preparing or deploying a TraceMind release. It owns the main-branch release gate, version bump, SDK GitHub source publication gate, SDK registry publication gate, pre-deploy checks, Meteor deploy command, Cloudflare Pages Web Auto Capture script publication, and post-deploy verification.

## Scope

The canonical app version is `package.json` field `version`. The current UI reads that value from `imports/ui/App.svelte` and renders it in the footer, so do not add another version constant unless the user explicitly changes the product contract.

This skill covers the TraceMind Meteor app deployment, release metadata consistency gates, the Cloudflare Pages `capture.js` static distribution, the immutable SDK GitHub source tag used by `capture_setup` local-source SDK installs, and the registry publication gate for npm, PyPI, and Maven Central SDK packages. Registry publishing itself is performed by the `SDK Publish` GitHub Actions workflow triggered by the release tag; this skill waits for and verifies that workflow before deploying. Out of scope unless requested: release notes, changelog writing, SwiftPM package publishing, and automatically changing TraceMind release metadata markers.

Release metadata markers live in `imports/api/release_metadata.js`. They are customer-visible runtime/guidance contract versions, not the app version. Do not bump them on every deploy:

- `CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID`: bump only when the deployed Web Auto Capture script should cause running older Web scripts to be marked stale and offered an update.
- `CURRENT_AGENT_GUIDANCE_VERSION`: bump only when public TraceMind Skill / AGENTS / MCP setup guidance changes and customer coding agents should detect stale local rules.

The deploy workflow must verify these markers are consistent everywhere they are surfaced. Do not rely on this skill text as the only guard; `npm run check:release-metadata` is the executable source of truth for consistency.

## Workflow

1. Check the Git release branch state before editing release files.
   - Run `git status --short` and `git branch --show-current`.
   - Check branches not merged into `main` with `git branch --no-merged main`.
   - If the current branch is not `main`, do not deploy from it directly. First get the release changes merged into `main`, then continue the version bump and deploy from `main`.
   - If exactly one non-`main` branch is unmerged and it is the current branch, merge it into `main` before continuing, preserving unrelated working-tree changes and reporting conflicts instead of resolving speculatively.
   - If multiple branches are not merged into `main`, stop and ask the user which branch or order to handle before merging or deploying.
   - If `main` does not exist or the branch state is ambiguous, stop and ask the user how to proceed.
2. Confirm the requested release version.
   - If the user provides a version, use it exactly after validating the format.
   - If no version is provided, propose the next version from `package.json` before editing.
   - For this repo, the expected app version format is `YYYY.M.D-N`, for example `2026.5.12-1`.
3. Inspect the current version sources:
   - `package.json`
   - `package-lock.json`, if present
   - UI/runtime references that import `package.json` or display the app version
   - `imports/api/release_metadata.js` only to understand whether customer-visible Web script or agent-guidance markers changed; do not treat those markers as app release versions.
   - docs only when they intentionally describe the current release version
4. Update only the canonical version fields required by the package manager:
   - Change `package.json.version`.
   - If `package-lock.json` exists and contains the root package version, update the root lockfile version too.
   - Do not update example versions such as SDK examples, sample payloads, or TraceMind Skill guidance versions unless the user specifically asks.
5. Verify references:
   - Search for the old version and confirm any remaining matches are intentional examples, historical docs, generated artifacts, or unrelated guidance versions.
   - Confirm `imports/ui/App.svelte` still reads from `package.json` instead of a duplicate constant.
6. Prepare the immutable SDK source release ref:
   - Compute the release tag as `tracemind-release-${version}`, for example `tracemind-release-2026.5.12-2`.
   - Run `npm run prepare:sdk-release-ref -- ${version}` so `sdk/release_manifest.json` and generated SDK hash constants point at the release tag instead of floating `main`.
   - Run `npm run test:sdk-release`.
   - If SDK runtime files changed and the manifest gate fails, fix the SDK manifest/hash mismatch before continuing.
7. Run pre-deploy checks:
   - `node -e "const p=require('./package.json'); console.log(p.version)"`
   - `npm run check:release-metadata`
   - `npm test` when release timing allows.
   - If `npm test` cannot run, state the blocker and the exact command left for the user.
8. Confirm production TTL indexes match the code retention policy before publishing:
   - Read the expected data retention policy from `DATA_RETENTION_POLICY` in `imports/api/tracemind.js`. Do not copy a second hard-coded retention policy into this skill.
   - Prefer using the MongoDB MCP, when available, to build a database-wide TTL index inventory in one pass: list all non-system collections, inspect each collection's indexes, and keep only indexes with `expireAfterSeconds`.
   - If MongoDB MCP is unavailable, use an equivalent read-only `mongosh` inventory command that lists collections and filters `getIndexes()` results by `expireAfterSeconds`.
   - Compare the complete TTL inventory with the code policy. Do not check only the expected collections one by one, because that can miss extra TTL indexes on long-retained collections.
   - Use read-only index inspection only. Do not create, modify, or delete TTL indexes from this deploy workflow.
   - Do not print or commit `MONGO_URL`, database credentials, Atlas connection strings, or any secret-bearing command output.
   - Confirm that every `DATA_RETENTION_POLICY.detailWindows` entry with a finite `retentionDays` has a matching TTL index on its `collectionName`, `dateField`, and `expireAfterSeconds = retentionDays * 24 * 60 * 60`.
   - Confirm that every `DATA_RETENTION_POLICY.retainedSummaries` entry with `retentionDays: null` does not have a product-retention TTL index on its `collectionName`.
   - Confirm that the TTL inventory has no extra product-retention TTL indexes outside `DATA_RETENTION_POLICY.detailWindows`.
   - If the database TTL indexes match the code policy, report the TTL inventory summary by collection, index key, and TTL seconds.
   - If any TTL index is missing, extra, or mismatched, stop before commit/tag/deploy and ask the user whether to update the database manually or adjust the code policy. Do not continue with a release that would make Dashboard/MCP retention guidance disagree with production storage behavior.
9. Commit and publish the release source before deploying:
   - Commit the version, manifest, and any release workflow changes before creating the tag.
   - Create the release tag on the release commit: `git tag tracemind-release-${version}`. If the tag already exists and does not point to `HEAD`, stop instead of reusing it.
   - Push `main` first: `git push origin main`.
   - Push the release tag: `git push origin tracemind-release-${version}`.
   - Run `npm run check:deploy-git-publication -- ${version}`. It must confirm `package.json.version` equals `${version}`, the current branch is `main`, the worktree is clean, `sdk/release_manifest.json` uses `tracemind-release-${version}`, `origin/main` equals `HEAD`, and the remote tag points to `HEAD`.
   - If push or remote verification fails, stop and do not deploy. A deployed Galaxy app must not advertise a `latestSdk.sourceRef` that is missing or mismatched on GitHub.
10. Wait for SDK registry publication before deploying:
   - The release tag push triggers the `SDK Publish` GitHub Actions workflow.
   - Wait for that workflow to finish. It publishes registry-backed SDKs to npm, PyPI, and Maven Central, verifies package installation/probes, and does not run `npm run deploy` or any Meteor deploy command.
   - Run `npm run check:sdk-registry-publication -- ${version}`. It must confirm the `SDK Publish` workflow succeeded and that every registry-backed SDK in `sdk/release_manifest.json` is visible in its package registry.
   - Swift remains `local_source` in this release flow and is intentionally skipped by the registry gate.
   - If the registry publication check fails, stop and do not deploy. A deployed Galaxy app must not advertise registry install commands for packages that are missing or failed to publish.
11. Deploy when the user asks for deployment or the request clearly says this is a deployment release:
   - Prefer the repository script: `npm run deploy`.
   - In this repo the deploy script is the canonical command and currently expands to `meteor deploy tracemind.sandbox.galaxycloud.app --settings .deploy/settings.json`.
   - Confirm the Galaxy runtime environment includes `TRACEMIND_CAPTURE_SCRIPT_ORIGIN=https://tracemind-capture.pages.dev` before deploying a release whose production `capture_setup` should return Cloudflare script URLs.
   - If the user explicitly specifies another Meteor app target, run that exact command form, for example `meteor deploy TraceMind --settings .deploy/settings.json`.
   - Do not print or commit `.deploy/settings.json`; it is intentionally private.
   - If deploy fails because of missing Galaxy/runtime environment, inspect or request logs and report the exact missing variable. `MONGO_URL` must be available in the Galaxy runtime environment before the app can start.
   - Do not deploy from GitHub Actions. `$deploy` is the only release path that may run the Meteor deploy command, so a tag push cannot cause a duplicate deploy.
12. Publish the Web Auto Capture static script to Cloudflare Pages after a successful Galaxy deploy:
   - Run `npm run build:capture-static`. The default source is `https://tracemind.sandbox.galaxycloud.app/capture.js`, and the default output is `.codex/scratch/capture-static/${version}/`.
   - Confirm the generated `capture.js` contains the current `scriptReleaseId`, posts to Galaxy `/api/capture`, `/api/presence`, and `/api/user-feedback`, and uses the Cloudflare script origin for auto-update fallback.
   - Use the Cloudflare API plugin to ensure Pages project `tracemind-capture` exists. If it does not exist, create it with production branch `main` and no Git source binding.
   - Upload a Direct Upload deployment for the generated output, including `manifest`, `_headers`, `capture.js`, and `capture.<sha256>.js`. Include the current release commit SHA and commit message as deployment metadata.
   - Query the Cloudflare Pages deployment until its stage is `success`. If the deployment fails or remains pending beyond the tool timeout, stop before declaring the release healthy.
   - Run `npm run check:capture-static-publication` after Cloudflare deploy. It must verify the Cloudflare `/capture.js` status, JavaScript content type, `ETag`, CORS `*`, `Cache-Control: public, max-age=60, must-revalidate`, no `Set-Cookie`, non-empty body, current `scriptReleaseId`, and matching immutable `capture.<sha256>.js`.
13. Verify the deployed app after a successful deploy:
   - `npm run deploy:logs` when logs are needed to confirm startup health.
   - `curl -I https://tracemind.sandbox.galaxycloud.app/`
   - `curl -I https://tracemind-capture.pages.dev/capture.js`
   - `curl -I https://tracemind.sandbox.galaxycloud.app/capture.js`
   - Confirm the app URL responds successfully.
   - Confirm Cloudflare `/capture.js` is the canonical production customer script URL and returns `200 OK` JavaScript directly, not a redirect to `/capture.<hash>.js`.
   - Confirm Cloudflare `/capture.js` headers include `Content-Type: application/javascript`, `ETag`, `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=60, must-revalidate`.
   - Confirm deployed Cloudflare `/capture.js` contains the `scriptReleaseId` from `imports/api/release_metadata.js`. If the deployed script reports an older release id, inspect Galaxy deploy output, the static build source, and Cloudflare deployment status before declaring the release healthy.
   - Run `curl -L -s https://tracemind-capture.pages.dev/capture.js | wc -c` and report the script byte size. If it is empty, HTML, or unexpectedly much larger than the pre-deploy local smoke size, inspect deploy logs and Cloudflare output before declaring the release healthy.
   - Confirm Galaxy `/capture.js` still returns a fallback JavaScript body with the current `scriptReleaseId`, but do not require its `Cache-Control` header to match the production Cloudflare contract.
   - Do not require customer snippets or deploy verification to use `/capture.<hash>.js`; the hash path is an optional immutable asset, while Cloudflare `/capture.js` remains the compatibility contract.
   - If MCP behavior changed or needs release confidence, verify `/mcp` with a valid MCP token without exposing the token in the final response.

## Version Selection Rules

- Same-day follow-up release: increment the suffix, for example `2026.5.12-1` to `2026.5.12-2`.
- New release day: use today's release date with suffix `-1`, for example `2026.5.13-1`.
- Do not zero-pad month or day for the app version unless the existing project convention changes.
- Do not infer semantic versioning for the Meteor app; this project currently uses date-based app versions.

## Handoff

Report:

- old version -> new version
- branch state checked, any merges performed, and whether deployment ran from `main`
- SDK source release tag, push status, and `check:deploy-git-publication` result
- production TTL index check result compared against `DATA_RETENTION_POLICY`, including checked collections and TTL seconds
- release metadata check result, including `CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID` and `CURRENT_AGENT_GUIDANCE_VERSION`
- SDK registry publication workflow status and `check:sdk-registry-publication` result
- files changed
- verification commands run and their result
- deploy command run and whether it succeeded, if deployment was requested
- Cloudflare Pages project/deployment result, generated static script hash, and `check:capture-static-publication` result
- deployed app URL check, Cloudflare `/capture.js` status/header/byte-size check, Galaxy fallback `/capture.js` body check, and log findings, if deployment was requested
- deployed Cloudflare `/capture.js` scriptReleaseId check, if deployment was requested
- any remaining old-version matches and why they were left untouched
- suggested commit message, for example `Deploy TraceMind 2026.5.12-2`
