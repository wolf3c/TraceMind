---
name: tracemind-operations-metrics
description: Use when the user asks for TraceMind internal operations metrics, daily operating statistics, active customer/project counts, new customer counts, or retention of recently acquired customers. Uses only the TraceMind MCP server, never direct MongoDB/database access, and produces a privacy-safe aggregate report for questions such as yesterday's active projects/customers, yesterday's new customers, and retention of customers added in the past week.
---

# TraceMind Operations Metrics

Use this skill for TraceMind's internal operating-data statistics. It is read-only by default and answers aggregate business questions, especially:

- How many customer projects were active yesterday?
- How many customer accounts were active yesterday?
- How many customers were added yesterday?
- How well did customers added in the past week retain?

## Core Rules

- Confirm the TraceMind MCP binding before querying product behavior: use MCP server `tracemind-ywrtpb`, call `tracemind.project_info`, and continue only if `projectId` is `BJuZgMywBxYYWrTpB`.
- Use TraceMind MCP only. Do not read `.deploy/settings.json`, do not use `MONGO_URL`, do not run `mongosh`, and do not query MongoDB collections directly.
- Use Asia/Shanghai calendar days unless the user specifies another timezone.
- Keep reports aggregate-first. Do not print or write customer emails, tokens, project keys, MCP tokens, secrets, full URLs with query strings, raw prompts, raw user content, request/response bodies, headers, cookies, authorization values, or source diffs.
- If a drilldown table is needed, use stable internal IDs only: `customerAccountId`, `customerProjectId`, developer `_id`, and project `_id`.
- Store private operational reports only under `.codex/private/operations_metrics/YYYY-MM-DD.md` when the user asks for a saved report. Verify the path is ignored with `git check-ignore` before writing.
- Do not update tracked docs, product code, database state, or customer messages from this skill unless the user explicitly starts a separate task.

## Data Sources And Metric Definitions

### Active customer projects and accounts

Primary source:

- TraceMind MCP event `customer_project_capture_active` with `eventType: "custom"`.

Definition:

- `summary.totalEvents` for a day = active customer projects for that day.
- `summary.uniqueUsers` for a day = active customer accounts for that day.
- `properties.customerProjectId` = active project id.
- `properties.customerAccountId` or event `userId` = active customer account id.
- `properties.activitySource` may be `capture` or `presence`.

This event is emitted once per customer project per Asia/Shanghai day when `/api/capture` or `/api/presence` first accepts data. TraceMind's configured self project is skipped to avoid recursive product-usage pollution.

### New customers

Primary source:

- TraceMind MCP only, from an existing approved customer/signup custom event if one is available.

Definition:

- First call `tracemind.search_event_names` with signup/customer intent terms such as `customer`, `signup`, `account`, `developer`, and `created`.
- Reuse only an existing event that clearly means a new customer account was created or activated. Do not invent an event name.
- If no such MCP-visible event exists, report new-customer metrics as `MCP unavailable` and explain that TraceMind MCP does not currently expose a customer-account creation metric.
- Do not fall back to database reads.

### Retention of past-week new customers

Default cohort:

- Customers from the MCP-visible new-customer event in the previous 7 complete Asia/Shanghai days, excluding today unless the user asks for a live partial-day view.

Default retention windows:

- `D1`: active on the next calendar day after signup.
- `D3`: active on the third calendar day after signup.
- `D7`: active on the seventh calendar day after signup, when that day has elapsed.
- `7d_any`: active at least once from signup day through signup day plus 6 days.
- `yesterday_active`: for the cohort, active yesterday.

Report unavailable windows as `not_elapsed`, not as churn. If the new-customer event is not available through MCP, mark retention as `MCP unavailable`. If `customer_project_capture_active` is empty while raw capture or presence exists, call out an instrumentation/configuration issue before drawing retention conclusions.

### Product health reference

If the user asks why the dashboard differs, or asks for the same numbers shown in the product health UI, use `tracemind.project_health` instead of the customer operations metrics above.

- Dashboard active users, new users, and D2/D3/D7/D30 retention come from project health hourly/daily rollups.
- Customer operations active projects/accounts come from `customer_project_capture_active`.
- Do not mix these two meanings in one table unless the output explicitly labels both as separate metric families.

## Query Workflow

1. Resolve dates.
   - Use the environment date and Asia/Shanghai.
   - Compute `today`, `yesterday`, `last7Start`, and `last7End`.
   - Use ISO timestamps with explicit offsets or UTC equivalents in tool calls.
2. Confirm project binding.
   - Call `tracemind.project_info` on `tracemind-ywrtpb`.
   - Stop if the returned project id is not `BJuZgMywBxYYWrTpB`.
3. Query active usage.
   - Call `tracemind.summary` for `customer_project_capture_active` over yesterday.
   - If retention is requested and event drilldown is available through MCP, query matching behavior/event evidence over the cohort retention window and group by `customerAccountId` and `reportDate`.
4. Query new customers.
   - Call `tracemind.search_event_names` for a customer/signup/account creation event.
   - If an existing event is found, call `tracemind.summary` for yesterday and the previous 7 complete days.
   - If no event is found, set yesterday new customers and past-week cohort to `MCP unavailable`.
5. Drill down only through MCP.
   - Use `tracemind.summary`, `tracemind.project_health`, and MCP-provided event/raw-behavior query tools only.
   - Never join against database collections directly.
6. Compute retention.
   - Build one row per cohort date and one aggregate cohort summary.
   - Count a customer retained in a window if any active event has matching `customerAccountId` or event `userId` on that report date.
   - If a customer has multiple active projects, count them once for account retention and separately only when reporting project activation.
7. Return a concise report and list data gaps.

## Output Format

Use this compact structure:

```markdown
**口径**
- 时区：
- 窗口：
- 活跃口径：`customer_project_capture_active`
- 新增客户口径：MCP-visible customer/signup event, or `MCP unavailable`

**昨日概览**
| 指标 | 数值 | 说明 |
| --- | ---: | --- |
| 活跃项目 | ... | `summary.totalEvents` |
| 活跃客户 | ... | `summary.uniqueUsers` |
| 新增客户 | ... | MCP customer/signup event, if available |

**过去一周新增客户留存**
| Cohort | 新增客户 | D1 | D3 | D7 | 7d_any | 昨日活跃 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ... | ... | ... | ... | not_elapsed | ... | ... |

**判断**
- ...

**数据缺口 / 风险**
- ...
```

For small cohorts, include percentages and counts together, for example `2/5 (40%)`. For zero-size cohorts, use `0` and say retention is not applicable.

## Handoff

End with:

- Whether the numbers are complete or blocked by missing instrumentation/configuration.
- Which MCP event names or MCP tools were used.
- The saved private report path, if one was written.
- Suggested follow-up query only when it would materially change the operating decision.
