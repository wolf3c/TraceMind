---
name: version-updater
description: Use before each TraceMind release to set the project version consistently. Updates the canonical package.json version, verifies all visible/runtime references read from that source, and runs the lightweight checks needed before handoff.
---

# Version Updater

Use this skill when preparing a TraceMind release and the project version must be set before deployment or tagging.

## Scope

The canonical app version is `package.json` field `version`. The current UI reads that value from `imports/ui/App.svelte` and renders it in the footer, so do not add another version constant unless the user explicitly changes the product contract.

Out of scope unless requested: release notes, git tags, deploy commands, changelog writing, SDK package publishing, and changing TraceMind agent guidance versions such as `AGENT_GUIDANCE_VERSION`.

## Workflow

1. Confirm the requested release version.
   - If the user provides a version, use it exactly after validating the format.
   - If no version is provided, propose the next version from `package.json` before editing.
   - For this repo, the expected app version format is `YYYY.M.D-N`, for example `2026.5.12-1`.
2. Inspect the current version sources:
   - `package.json`
   - `package-lock.json`, if present
   - UI/runtime references that import `package.json` or display the app version
   - docs only when they intentionally describe the current release version
3. Update only the canonical version fields required by the package manager:
   - Change `package.json.version`.
   - If `package-lock.json` exists and contains the root package version, update the root lockfile version too.
   - Do not update example versions such as SDK examples, sample payloads, or TraceMind Skill guidance versions unless the user specifically asks.
4. Verify references:
   - Search for the old version and confirm any remaining matches are intentional examples, historical docs, generated artifacts, or unrelated guidance versions.
   - Confirm `imports/ui/App.svelte` still reads from `package.json` instead of a duplicate constant.
5. Run the minimal checks:
   - `node -e "const p=require('./package.json'); console.log(p.version)"`
   - `npm test` when release timing allows.
   - If `npm test` cannot run, state the blocker and the exact command left for the user.

## Version Selection Rules

- Same-day follow-up release: increment the suffix, for example `2026.5.12-1` to `2026.5.12-2`.
- New release day: use today's release date with suffix `-1`, for example `2026.5.13-1`.
- Do not zero-pad month or day for the app version unless the existing project convention changes.
- Do not infer semantic versioning for the Meteor app; this project currently uses date-based app versions.

## Handoff

Report:

- old version -> new version
- files changed
- verification commands run and their result
- any remaining old-version matches and why they were left untouched
- suggested commit message, for example `Set release version to 2026.5.12-2`
