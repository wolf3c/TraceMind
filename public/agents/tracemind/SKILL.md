---
name: tracemind-instrumentation
version: 2026.05.07.1
description: Use when adding, reviewing, or validating TraceMind analytics instrumentation with the TraceMind MCP.
---

# TraceMind Instrumentation

Use this skill whenever you add, change, review, or validate TraceMind analytics instrumentation in a project.

## Required Workflow

1. Before writing analytics code, call `tracemind.agent_guidance` and check that this skill version is current.
2. For web apps, call `tracemind.capture_setup` and verify Web Auto Capture is installed before adding manual custom events.
3. Search for an existing event with `tracemind.search_event_names`.
4. If an event looks relevant, call `tracemind.suggest_instrumentation` or inspect the returned event details before using it.
5. Use only approved TraceMind capture APIs or SDK helpers already present in the project.
6. After code changes, call `tracemind.validate_instrumentation_diff` with the current diff.

## Web Auto Capture Setup

For web apps, check whether the app already loads TraceMind Auto Capture before adding manual events.

- Look for a script that loads `/capture.js` and includes `data-tracemind-token`.
- If it is missing, call `tracemind.capture_setup` and install the returned `captureSnippet` in the app HTML head, root layout, or equivalent global document entry.
- `data-tracemind-token` must use the returned public Auto Capture project key.
- Never use an MCP token in frontend code.
- Manual `custom` events are only for business outcomes that Auto Capture cannot infer reliably.

## Event Rules

- Reuse an existing event when the business meaning matches.
- Do not invent event names without first searching existing events.
- If no event matches, create a draft custom event proposal and ask the user for review.
- Prefer stable business identifiers such as internal `userId`, `projectId`, `plan`, or `feature`.
- Use `eventType: "custom"` for manual business events that automatic capture cannot infer reliably.

## Privacy Rules

Never send PII, secrets, raw user content, raw prompts, access tokens, API keys, passwords, phone numbers, emails, or full URLs with query strings.

Use `tracemind.privacy_check` when a field name or sample value might be sensitive.

## Update Rule

Before TraceMind instrumentation work, compare this version with `tracemind.agent_guidance`. If a newer version exists, tell the user what will be updated and ask for confirmation before changing local skill or instruction files. Do not silently overwrite user-edited files.
