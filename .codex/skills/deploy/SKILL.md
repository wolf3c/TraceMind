---
name: deploy
description: Use when the user invokes `$deploy` or asks to release or deploy TraceMind. Ensures release work is on main, handles branch merge checks, updates the canonical package.json version, publishes the immutable SDK GitHub source tag, verifies visible/runtime references, runs release checks, deploys through the configured Meteor deploy command, and verifies the deployed app.
---

# TraceMind Deploy

Use this skill when preparing or deploying a TraceMind release. It owns the main-branch release gate, version bump, SDK GitHub source publication gate, pre-deploy checks, Meteor deploy command, and post-deploy verification.

## Scope

The canonical app version is `package.json` field `version`. The current UI reads that value from `imports/ui/App.svelte` and renders it in the footer, so do not add another version constant unless the user explicitly changes the product contract.

This skill covers the TraceMind Meteor app deployment and the immutable SDK GitHub source tag used by `capture_setup` local-source SDK installs. It does not publish SDK registry packages. Out of scope unless requested: release notes, changelog writing, npm/PyPI/Maven/SPM package publishing, and changing TraceMind agent guidance versions such as `AGENT_GUIDANCE_VERSION`.

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
   - `npm test` when release timing allows.
   - If `npm test` cannot run, state the blocker and the exact command left for the user.
8. Commit and publish the release source before deploying:
   - Commit the version, manifest, and any release workflow changes before creating the tag.
   - Create the release tag on the release commit: `git tag tracemind-release-${version}`. If the tag already exists and does not point to `HEAD`, stop instead of reusing it.
   - Push `main` first: `git push origin main`.
   - Push the release tag: `git push origin tracemind-release-${version}`.
   - Run `npm run check:deploy-git-publication -- ${version}`. It must confirm `package.json.version` equals `${version}`, the current branch is `main`, the worktree is clean, `sdk/release_manifest.json` uses `tracemind-release-${version}`, `origin/main` equals `HEAD`, and the remote tag points to `HEAD`.
   - If push or remote verification fails, stop and do not deploy. A deployed Galaxy app must not advertise a `latestSdk.sourceRef` that is missing or mismatched on GitHub.
9. Deploy when the user asks for deployment or the request clearly says this is a deployment release:
   - Prefer the repository script: `npm run deploy`.
   - In this repo the deploy script is the canonical command and currently expands to `meteor deploy tracemind.sandbox.galaxycloud.app --settings .deploy/settings.json`.
   - If the user explicitly specifies another Meteor app target, run that exact command form, for example `meteor deploy TraceMind --settings .deploy/settings.json`.
   - Do not print or commit `.deploy/settings.json`; it is intentionally private.
   - If deploy fails because of missing Galaxy/runtime environment, inspect or request logs and report the exact missing variable. `MONGO_URL` must be available in the Galaxy runtime environment before the app can start.
10. Verify the deployed app after a successful deploy:
   - `npm run deploy:logs` when logs are needed to confirm startup health.
   - `curl -I https://tracemind.sandbox.galaxycloud.app/`
   - `curl -I https://tracemind.sandbox.galaxycloud.app/capture.js`
   - Confirm `/capture.js` serves JavaScript and the app URL responds successfully.
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
- files changed
- verification commands run and their result
- deploy command run and whether it succeeded, if deployment was requested
- deployed URL checks and log findings, if deployment was requested
- any remaining old-version matches and why they were left untouched
- suggested commit message, for example `Deploy TraceMind 2026.5.12-2`
