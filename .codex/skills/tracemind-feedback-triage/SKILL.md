---
name: tracemind-feedback-triage
description: Use when reviewing, summarizing, clustering, or triaging TraceMind MCP customer feedback from MongoDB, especially reports stored in tracemind_feedback_reports. Produces a read-only feedback digest and recommended next actions; does not modify code, deploy, update database state, or contact customers unless the user separately asks.
---

# TraceMind Feedback Triage

Use this skill to organize TraceMind customer feedback submitted through MCP.

This skill is intentionally read-only by default. It exists to turn feedback reports into a concise triage brief for the human owner.

## Scope

In scope:

- Query `tracemind_feedback_reports`.
- Group related reports by product area, evidence, environment, and likely root cause.
- Classify each group as `bug`, `product_gap`, `docs_gap`, `instrumentation_gap`, `invalid`, or `needs_more_evidence`.
- Recommend priority and next action.
- Draft a customer-facing response only as text for human review.

Out of scope unless the user explicitly starts a separate task:

- Editing production code.
- Deploying TraceMind.
- Updating database status fields.
- Sending messages to customers.
- Creating public changelog entries.

If a report clearly indicates a bug, stop after the triage brief and ask the user which item to handle.

## Data Sources

Primary collection:

- `tracemind_feedback_reports`

Relevant report fields:

- `_id`, `projectId`, `projectName`, `submittedVia`
- `mcpTokenId`, `mcpTokenName`
- `type`, `title`, `summary`, `expected`, `actual`, `suggestion`
- `reproductionSteps`
- `evidence.startAt`, `evidence.endAt`, `evidence.paths`
- `evidence.eventIds`, `evidence.rawBehaviorIds`
- `evidence.actionKeys`, `evidence.targetHashes`
- `evidence.userIds`, `evidence.sessionIds`, `evidence.deviceIds`
- `evidence.examples`
- `environment.platform`, `environment.sourceType`, `environment.sourceKey`
- `createdAt`, `updatedAt`

Optional corroborating collections, read only when needed:

- `tracemind_semantic_events`
- `tracemind_raw_behaviors`
- `tracemind_presence_sessions`
- `tracemind_capture_delivery_reports`
- `tracemind_projects`

Do not expose MCP tokens, secrets, PII, raw prompts, raw user content, source diffs, request/response bodies, headers, cookies, authorization values, or full query URLs in the final brief.

## Query Workflow

1. Confirm the time window. If the user did not specify one, use the last 7 days.
2. Query feedback reports sorted by `createdAt` descending.
3. Treat reports with `status: "resolved"` as closed by default:
   - Do not include resolved reports in the main `Triage` table or recommended next-action list.
   - Count or briefly list resolved reports only in a separate resolved/background note.
   - Include resolved reports in the main analysis only when the user explicitly asks to review resolved feedback, audit prior fixes, or check regressions.
4. Keep queries narrow:
   - Filter by `createdAt`.
   - Add `projectId`, `projectName`, `type`, or `mcpTokenId` only when the user asks or the prior result is too broad.
   - Project only the fields needed for triage.
5. If using MongoDB MCP, prefer read-only `find` or aggregation calls.
6. If using `mongosh`, use `--quiet` and read-only commands unless the user explicitly authorizes a write.
7. If the feedback references event IDs, raw behavior IDs, paths, `actionKeys`, `targetHashes`, sessions, or devices, query the relevant evidence only enough to validate the report shape.
8. Summarize uncertainty explicitly. Do not claim a root cause when the evidence only supports a symptom.

## Triage Rules

Classify reports using the strongest supported category:

- `bug`: expected product behavior failed, regression is plausible, or evidence points to broken UI/API/SDK/MCP behavior.
- `product_gap`: behavior works as designed but the customer need is not covered.
- `docs_gap`: implementation likely works, but setup/usage guidance is unclear or missing.
- `instrumentation_gap`: TraceMind cannot currently observe the needed behavior, or evidence is incomplete because capture/setup is missing.
- `invalid`: duplicate, unactionable, contradicted by evidence, or outside TraceMind scope.
- `needs_more_evidence`: report is plausible but lacks enough time window, path, event, environment, or reproduction detail.

Priority:

- `P0`: production outage, data loss, security/privacy risk, or blocks all customers.
- `P1`: blocks a core setup, capture, MCP analysis, or dashboard workflow for one or more real customers.
- `P2`: important but has a workaround or affects a narrower workflow.
- `P3`: polish, copy, low-impact improvement, or speculative idea.

When several reports describe the same issue, merge them into one group and list all report IDs.

## Output Format

Return a concise brief with these sections:

```markdown
**Scope**
- Window:
- Filters:
- Reports reviewed:

**Executive Summary**
- Top issue:
- Customer impact:
- Recommended next step:

**Triage**
| Priority | Category | Issue | Evidence | Recommended action |
| --- | --- | --- | --- | --- |
| P1 | bug | ... | reports: ...; paths: ... | ... |

**Resolved / Background**
- ...

**Needs Confirmation**
- ...

**Customer Reply Drafts**
- For report/group ...: ...
```

Keep customer reply drafts short, factual, and non-committal unless a fix has already shipped. Use wording like "We found this is actionable and are investigating" rather than promising a release.

## Handoff

End with a direct prompt for the user, in the user's language, for example:

`请选择要处理的反馈编号；我会在你确认后进入单独的修复流程。`

Do not proceed into implementation, deployment, or customer notification from this skill alone.
