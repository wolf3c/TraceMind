# Actor Metrics Phase 2A Explanation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 1 actor metrics understandable in the Dashboard and MCP without changing any metric computation, response schema, SDK, capture payload, or storage contract.

**Architecture:** Keep the existing v1 observed-actor value, trend, hourly sparkline, and retention on one honest axis. Use the already-published `health.current.actorMetricsV2` only as a coverage-gated explanation in the existing card, and correct attribution/attention/MCP wording without adding data or endpoints.

**Tech Stack:** Meteor, Svelte 5, JavaScript, existing i18n source-text fallback, Meteor Mocha with Node `assert`, Codex Browser.

**Approved design:** `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-08-01-actor-metrics-phase-2a-design.md`

## Global Constraints

- Keep the existing card main value on `healthCurrent.activeUsers`, its trend on `health.trends.activeUsers`, its sparkline on `health.hourlyComparison.metrics.activeUsers`, and its retention on the existing v1 contract.
- Never present `canonicalUserActors` or `firstSeenCanonicalActors` as humans, bots, registrations, account counts, or formal visits.
- Show v2 counts only when `healthCurrent.actorMetricsV2.coverage === "complete"`; `partial`, `unavailable`, missing, and malformed v2 data must never format `null` as `0`.
- Preserve `activeUsers`, `newUsers`, `sessionCount`, retention, trends, attention thresholds/codes, report aggregation, publication fields, and MCP structured response values.
- Do not add a card, page, tab, switcher, feature flag, endpoint, field, collection, index, migration, dependency, SDK field, capture field, backfill, classifier, visit algorithm, registration event, v2 trend, v2 retention, or actor/source cross-table.
- Do not expose `actorEvidenceV2`, HMAC actor keys, alias pairs, or conflict keys.
- Do not modify `imports/ui/App.svelte`, `client/main.css`, SDK files, SDK manifests, public Agent Skill release artifacts, or `docs/product_backlog.md`.
- Preserve the existing user-owned changes in `docs/implementation_progress.md` and `docs/product_backlog.md`. Stage only Phase 2A files if commits are explicitly authorized.
- Do not create a commit unless the user explicitly authorizes commits during execution. Conditional commit steps below are skipped otherwise.

---

### Task 1: Correct Attention And MCP Interpretation Wording

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/project_health_summary.js:112-139`
- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js:457-460`

**Interfaces:**

- Consumes unchanged v1 `activeUsers` attention inputs and the existing MCP tool registry.
- Produces the same `active_users_dropped` code and trigger, with an observed-actor message.
- Produces the same `tracemind.project_health` input/output schema, with a clarified description only.

- [ ] **Step 1: Import the pure attention helper in the test suite**

Add this import after the existing TraceMind API imports in `tests/main.js`:

```js
import { attentionItemsForHealth } from '../imports/api/project_health_summary';
```

- [ ] **Step 2: Write the failing attention and MCP description tests**

Add this server-only suite near the existing MCP project-health tests:

```js
describe('Actor metrics explanation copy', function () {
  if (!Meteor.isServer) return;

  it('keeps the legacy active-user drop rule but names it an observed-actor drop', function () {
    const items = attentionItemsForHealth(
      {
        activeUsers: 1,
        sessionCount: 3,
        eventCount: 0,
        failureEventCount: 0,
        lastEventAt: null,
        topEvents: [],
      },
      {
        activeUsers: 4,
        sessionCount: 3,
        eventCount: 0,
        failureEventCount: 0,
        lastEventAt: null,
        topEvents: [],
      },
      new Date('2026-08-01T08:00:00.000Z'),
      { comparisonWindow: 'day' },
    );

    const item = items.find((candidate) => candidate.code === 'active_users_dropped');
    assert.ok(item);
    assert.strictEqual(item.severity, 'medium');
    assert.ok(item.message.includes('观测 Actor'));
    assert.ok(!item.message.includes('活跃用户'));
  });

  it('describes actor and attribution boundaries on project_health without changing its schema', async function () {
    const { mcpTools } = await import('../server/capture_routes');
    const tool = mcpTools({ _id: 'actor-copy-project', name: 'Actor Copy Project' })
      .find((candidate) => candidate.name === 'tracemind.project_health');

    assert.ok(tool);
    assert.ok(tool.description.includes('actorMetricsV2'));
    assert.ok(tool.description.includes('不证明真人或注册'));
    assert.ok(tool.description.includes('按小时口径汇总'));
    assert.ok(tool.description.includes('不等于人数或正式访问'));
    assert.strictEqual(tool.inputSchema.required, undefined);
    assert.strictEqual(tool.inputSchema.properties.reportDate.type, 'string');
  });
});
```

The production behavior caught here is semantic drift in the alert or MCP description. The schema assertions prevent a copy-only task from changing the contract.

- [ ] **Step 3: Run the tests and verify RED**

```bash
TEST_GREP="Actor metrics explanation copy" npm test -- --port 3146
```

Expected: FAIL because the alert still says `活跃用户` and the MCP description lacks the two interpretation boundaries. This repository may still run the complete suite when `TEST_GREP` is set; zero unrelated failures are required.

- [ ] **Step 4: Change only the attention message**

In `attentionItemsForHealth()` keep the condition and result metadata unchanged. Replace only the message:

```js
if (previous.activeUsers >= 3 && activeUsersChange <= -0.4) {
  items.push({
    code: 'active_users_dropped',
    severity: 'medium',
    message: `${labels.currentWindow}观测 Actor 较${labels.previousWindow}下降 ${formatPercentForMessage(activeUsersChange)}。`,
  });
}
```

Do not rename the code or use `actorMetricsV2` in the trigger.

- [ ] **Step 5: Clarify only the MCP tool description**

Append this meaning to the existing Chinese `tracemind.project_health` description in `mcpTools(project)`:

```text
actorMetricsV2 只解释确定性 Actor 分类与安全合并，不证明真人或注册；流量归因计数按小时口径汇总，同一标识跨小时可能重复，不等于人数或正式访问。
```

Do not change `inputSchema`, `structuredContent`, `textResult`, `AGENT_GUIDANCE_VERSION`, or public Agent Skill files.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the Step 3 command again.

Expected: PASS, with the same attention code/severity and unchanged MCP input schema.

- [ ] **Step 7: Keep the task unstaged for the final review**

Do not create a task-local commit. Leave these changes unstaged so the final reviewer can inspect the complete code-and-documentation result before any separately authorized commit.

---

### Task 2: Render The Coverage-Gated Actor Explanation

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/ProjectHealthPanel.svelte:28-65`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/ProjectHealthPanel.svelte:192-319`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/i18n/locales/zh.js:343-365`

**Interfaces:**

- Consumes `healthCurrent.activeUsers`, `healthCurrent.newUsers`, `healthCurrent.actorMetricsV2`, existing trends, hourly metrics, retention, and traffic attribution arrays.
- Produces presentation-only derived state inside `ProjectHealthPanel.svelte`.
- Keeps every prop and parent interface unchanged.

- [ ] **Step 1: Add the exact new English fallback keys to the i18n contract test**

Append these keys to `requiredKeys` in the existing `UI i18n` suite:

```js
'Observed actors',
'{{count}} first-seen canonical actors',
'Legacy · {{count}} first-seen actors',
'Actor metric coverage',
'Actor reconciliation',
'Complete coverage',
'Partial coverage',
'Unavailable',
'Canonical user actors',
'Identified actors',
'Anonymous client actors',
'Operational actors',
'Unclassified actors',
'First-seen canonical actors',
'Safe identity merges',
'Identity conflicts',
'Legacy first-seen actors',
'Legacy actor metric',
'Canonical user actors use deterministic identity relationships only; they do not prove humans, bots, registrations, or account counts.',
'Some completed hours lack v2 actor evidence; v2 counts are hidden and only legacy values are shown.',
'This report has no usable v2 actor evidence; only legacy observed actors are shown.',
'{{observed}} observed - {{merges}} merges - {{operational}} operational - {{unclassified}} unclassified = {{canonical}} canonical user actors',
'Attribution sources',
'Attribution count: {{count}}',
'Attribution count meaning',
'direct meaning',
'Attribution counts sum hourly rollups deduplicated by existing attribution keys; the same identifier can contribute in multiple hours. They are not people or formal visits.',
'direct means no usable referrer, UTM, or deeplink source; it does not prove a human visit.',
```

- [ ] **Step 2: Add a failing source-copy contract test**

Inside the server-only portion of the `UI i18n` suite, add a test that locates the repository the same way as the existing `Auth status alert` source test:

```js
it('uses actor and attribution labels in the project health panel', async function () {
  if (!Meteor.isServer) return;

  const { access, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  let sourceRoot = '';
  const candidateRoots = [
    process.env.TRACEMIND_SOURCE_ROOT,
    process.env.INIT_CWD,
    process.env.PWD,
    process.cwd(),
  ].filter(Boolean);

  for (const candidateRoot of candidateRoots) {
    let currentRoot = candidateRoot;
    for (let depth = 0; depth < 8; depth += 1) {
      try {
        await access(path.join(currentRoot, 'imports/ui/ProjectHealthPanel.svelte'));
        sourceRoot = currentRoot;
        break;
      } catch {
        const parent = path.dirname(currentRoot);
        if (parent === currentRoot) break;
        currentRoot = parent;
      }
    }
    if (sourceRoot) break;
  }

  assert.ok(sourceRoot, 'Could not find TraceMind source root.');
  const source = await readFile(
    path.join(sourceRoot, 'imports/ui/ProjectHealthPanel.svelte'),
    'utf8',
  );

  assert.ok(source.includes('$t("Observed actors")'));
  assert.ok(source.includes('$t("Actor metric coverage")'));
  assert.ok(source.includes('$t("Canonical user actors")'));
  assert.ok(source.includes('$t("Attribution sources")'));
  assert.ok(source.includes('$t("Attribution count: {{count}}")'));
  assert.ok(source.includes('actorMetricsCoverage === "complete"'));
  assert.ok(source.includes('value === null || value === undefined ? "—"'));
  assert.ok(!source.includes('$t("Active users")'));
  assert.ok(!source.includes('$t("new users")'));
  assert.ok(!source.includes('$t("New users")'));
  assert.ok(!source.includes('$t("Traffic sources")'));
  assert.ok(!source.includes('$t("visits")'));
});
```

This is a deliberate source-copy contract because the repository has no Svelte rendering test harness. Do not add a UI test dependency or a production helper solely to make this test possible.

- [ ] **Step 3: Run the UI copy tests and verify RED**

```bash
TEST_GREP="UI i18n|uses actor and attribution labels" npm test -- --port 3147
```

Expected: FAIL because the translations and new component labels do not exist.

- [ ] **Step 4: Add the minimal coverage-derived state**

After the existing `$derived` values in `ProjectHealthPanel.svelte`, add:

```svelte
let actorMetricsV2 = $derived(healthCurrent?.actorMetricsV2 || {});
let actorMetricsCoverage = $derived(actorMetricsV2?.coverage || "unavailable");
let actorMetricsComplete = $derived(actorMetricsCoverage === "complete");

function nullableActorMetric(value) {
  return value === null || value === undefined ? "—" : formatNumber(value);
}

function actorCoverageLabel() {
  if (actorMetricsCoverage === "complete") return $t("Complete coverage");
  if (actorMetricsCoverage === "partial") return $t("Partial coverage");
  return $t("Unavailable");
}

function actorCoverageDescription() {
  if (actorMetricsCoverage === "partial") {
    return $t("Some completed hours lack v2 actor evidence; v2 counts are hidden and only legacy values are shown.");
  }
  return $t("This report has no usable v2 actor evidence; only legacy observed actors are shown.");
}

function actorFirstSeenSummary() {
  if (actorMetricsComplete) {
    return $t("{{count}} first-seen canonical actors", {
      count: nullableActorMetric(actorMetricsV2.firstSeenCanonicalActors),
    });
  }
  return $t("Legacy · {{count}} first-seen actors", {
    count: formatNumber(healthCurrent.newUsers),
  });
}

function actorReconciliationText() {
  return $t(
    "{{observed}} observed - {{merges}} merges - {{operational}} operational - {{unclassified}} unclassified = {{canonical}} canonical user actors",
    {
      observed: nullableActorMetric(actorMetricsV2.observedActors),
      merges: nullableActorMetric(actorMetricsV2.identityMergeCount),
      operational: nullableActorMetric(actorMetricsV2.operationalActors),
      unclassified: nullableActorMetric(actorMetricsV2.unclassifiedActors),
      canonical: nullableActorMetric(actorMetricsV2.canonicalUserActors),
    },
  );
}
```

Do not derive a replacement for `healthCurrent.activeUsers`, `health.trends.activeUsers`, `hourlyMetrics.activeUsers`, or retention.

- [ ] **Step 5: Replace only the existing actor-card markup**

Keep the card as `hourly-trend-card`. Its summary must retain the current main value, trend, and sparkline:

```svelte
<details class="health-card hourly-trend-card">
  <summary>
    <span>{$t("Observed actors")}</span>
    <div class="health-metric-row">
      <strong>{healthSamplesPending ? $t("No samples yet") : formatNumber(healthCurrent.activeUsers)}</strong>
      <span class="health-metric-side">
        <em>{healthSamplesPending ? $t("Current hour is excluded") : actorFirstSeenSummary()}</em>
        <span
          class={`trend-inline ${metricTrendClass(health?.trends?.activeUsers)}`}
          title={trendDescription(health?.trends?.activeUsers)}
          aria-label={trendDescription(health?.trends?.activeUsers)}
        >
          {trendText(health?.trends?.activeUsers)}
        </span>
      </span>
    </div>
    {#if !healthSamplesPending}
      <HourlyTrendSparkline points={hourlyMetrics.activeUsers} formatValue={formatNumber} />
    {/if}
  </summary>
  <dl class="health-detail-list">
    {#if healthSamplesPending}
      <div><dt>{$t("Actor metric coverage")}</dt><dd>{$t("No samples yet")}</dd></div>
    {:else}
      <div><dt>{$t("Actor metric coverage")}</dt><dd>{actorCoverageLabel()}</dd></div>
      {#if actorMetricsComplete}
        <div class="health-detail-row-stacked">
          <dt>{$t("Actor reconciliation")}</dt>
          <dd>{actorReconciliationText()}</dd>
        </div>
        <div><dt>{$t("Canonical user actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.canonicalUserActors)}</dd></div>
        <div><dt>{$t("Identified actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.identifiedActors)}</dd></div>
        <div><dt>{$t("Anonymous client actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.anonymousActors)}</dd></div>
        <div><dt>{$t("Operational actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.operationalActors)}</dd></div>
        <div><dt>{$t("Unclassified actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.unclassifiedActors)}</dd></div>
        <div><dt>{$t("First-seen canonical actors")}</dt><dd>{nullableActorMetric(actorMetricsV2.firstSeenCanonicalActors)}</dd></div>
        <div><dt>{$t("Safe identity merges")}</dt><dd>{nullableActorMetric(actorMetricsV2.identityMergeCount)}</dd></div>
        <div><dt>{$t("Identity conflicts")}</dt><dd>{nullableActorMetric(actorMetricsV2.identityConflictCount)}</dd></div>
        <div class="health-detail-row-stacked">
          <dt>{$t("Canonical user actors")}</dt>
          <dd>{$t("Canonical user actors use deterministic identity relationships only; they do not prove humans, bots, registrations, or account counts.")}</dd>
        </div>
      {:else}
        <div class="health-detail-row-stacked">
          <dt>{actorCoverageLabel()}</dt>
          <dd>{actorCoverageDescription()}</dd>
        </div>
      {/if}
      <div><dt>{$t("Legacy first-seen actors")}</dt><dd>{formatNumber(healthCurrent.newUsers)}</dd></div>
      <div><dt>{$t("D2 retention")} · {$t("Legacy actor metric")}</dt><dd>{retentionText(healthCurrent.retention?.d2)}</dd></div>
      <div><dt>{$t("D3 retention")} · {$t("Legacy actor metric")}</dt><dd>{retentionText(healthCurrent.retention?.d3)}</dd></div>
      <div><dt>{$t("D7 retention")} · {$t("Legacy actor metric")}</dt><dd>{retentionText(healthCurrent.retention?.d7)}</dd></div>
      <div><dt>{$t("D30 retention")} · {$t("Legacy actor metric")}</dt><dd>{retentionText(healthCurrent.retention?.d30)}</dd></div>
      <div><dt>{$t("User regions")}</dt><dd>{topCountText(healthCurrent.userRegions?.[0])}</dd></div>
      <div><dt>{$t("User devices")}</dt><dd>{topCountText(healthCurrent.deviceDistribution?.[0])}</dd></div>
    {/if}
  </dl>
</details>
```

Keep the exact existing layout classes. Do not add a card, toggle, info-popover state, or CSS.

- [ ] **Step 6: Correct the attribution card units and explanation**

In the existing attribution card:

```svelte
<span>{$t("Attribution sources")}</span>
```

Replace the summary count unit with:

```svelte
$t("Attribution count: {{count}}", {
  count: formatNumber(healthCurrent.trafficSources[0].count),
})
```

At the top of the expanded `health-detail-list`, add:

```svelte
<div class="health-detail-row-stacked">
  <dt>{$t("Attribution count meaning")}</dt>
  <dd>{$t("Attribution counts sum hourly rollups deduplicated by existing attribution keys; the same identifier can contribute in multiple hours. They are not people or formal visits.")}</dd>
</div>
<div class="health-detail-row-stacked">
  <dt>{$t("direct meaning")}</dt>
  <dd>{$t("direct means no usable referrer, UTM, or deeplink source; it does not prove a human visit.")}</dd>
</div>
```

Do not change `trafficSources`, `trafficMediums`, `trafficCampaigns`, `trafficLandingPaths`, or their aggregation.

- [ ] **Step 7: Add the exact Chinese translations**

Add these entries to `imports/ui/i18n/locales/zh.js`:

```js
"Observed actors": "观测 Actor",
"{{count}} first-seen canonical actors": "{{count}} 个首次观测归一 Actor",
"Legacy · {{count}} first-seen actors": "旧口径 · {{count}} 个首次观测 Actor",
"Actor metric coverage": "Actor 指标覆盖",
"Actor reconciliation": "Actor 数量对账",
"Complete coverage": "覆盖完整",
"Partial coverage": "覆盖不完整",
"Unavailable": "不可用",
"Canonical user actors": "归一用户 Actor",
"Identified actors": "已识别 Actor",
"Anonymous client actors": "匿名客户端 Actor",
"Operational actors": "运行时 Actor",
"Unclassified actors": "未分类 Actor",
"First-seen canonical actors": "首次观测归一 Actor",
"Safe identity merges": "身份安全合并",
"Identity conflicts": "身份冲突",
"Legacy first-seen actors": "旧口径首次观测 Actor",
"Legacy actor metric": "旧 Actor 口径",
"Canonical user actors use deterministic identity relationships only; they do not prove humans, bots, registrations, or account counts.": "归一用户 Actor 仅基于确定性身份关系计算，不代表已验证真人、机器人、注册用户或账号数。",
"Some completed hours lack v2 actor evidence; v2 counts are hidden and only legacy values are shown.": "部分已结束小时缺少 v2 Actor 证据；为避免误导，不展示 v2 数量，仅保留明确标注的旧口径。",
"This report has no usable v2 actor evidence; only legacy observed actors are shown.": "该报告没有可用的 v2 Actor 证据；仅展示旧口径观测 Actor。",
"{{observed}} observed - {{merges}} merges - {{operational}} operational - {{unclassified}} unclassified = {{canonical}} canonical user actors": "{{observed}} 个观测 Actor - {{merges}} 次合并 - {{operational}} 个运行时 Actor - {{unclassified}} 个未分类 Actor = {{canonical}} 个归一用户 Actor",
"Attribution sources": "归因来源",
"Attribution count: {{count}}": "归因计数：{{count}}",
"Attribution count meaning": "归因计数含义",
"direct meaning": "direct 含义",
"Attribution counts sum hourly rollups deduplicated by existing attribution keys; the same identifier can contribute in multiple hours. They are not people or formal visits.": "归因计数由各小时按现有归因键去重后的结果汇总；同一标识跨小时可能重复，不代表人数或正式访问次数。",
"direct means no usable referrer, UTM, or deeplink source; it does not prove a human visit.": "direct 表示没有可用的 referrer、UTM 或 deeplink 来源，不代表一次真人访问。",
```

Keep `en.js` empty so English continues to use source-text fallback. Do not delete old translation keys because other surfaces may still consume them.

- [ ] **Step 8: Run the UI contract tests and Svelte diagnostics**

```bash
TEST_GREP="UI i18n|uses actor and attribution labels" npm test -- --port 3147
npx svelte-check
```

Expected: both commands exit `0`. Svelte diagnostics must not report a nullable-value or template error.

- [ ] **Step 9: Keep the task unstaged for the final review**

Do not create a task-local commit. Leave the complete UI, copy, and test diff available for one final boundary review.

---

### Task 3: Align Product, MCP, And Metric Documentation

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/docs/mcp_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/semantic_event_design.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/mvp_technical_plan.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/agent_instrumentation_guidance.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/tracemind_product_plan_markdown.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/implementation_progress.md`
- Modify after implementation: `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-08-01-actor-metrics-phase-2a-design.md`
- Do not modify: `/Users/wolf3c/Project/TraceMind/docs/product_backlog.md`

**Interfaces:**

- Documents the exact existing v1/v2 fields and the new presentation semantics.
- Does not introduce a new runtime, API, SDK, capture, retention, or release promise.

- [ ] **Step 1: Update MCP project-health semantics**

In `docs/mcp_design.md`:

- change Dashboard descriptions from active/new users to observed actors and first-seen actor semantics;
- state that the visible trend, hourly line, and retention remain v1;
- state that v2 counts appear only for complete coverage;
- include the reconciliation formula from the approved design;
- state that traffic attribution counts sum hourly rollups whose records are deduplicated only within each hour, so one identifier may contribute in multiple hours and the result is not people or strict visits;
- define `direct` as missing usable referrer/UTM/deeplink attribution;
- keep the existing JSON schema and aggregate-only privacy boundary unchanged.

- [ ] **Step 2: Correct session and visit documentation**

Replace the inaccurate `sessionId` sentence in `docs/semantic_event_design.md` with this meaning:

```text
`sessionId` 是由 SDK/runtime 管理的关联标识，用于串联相关行为；不同 runtime 的生命周期并不一致，不能直接解释为 30 分钟访问或正式 visit。Phase 2A 只修正文案，不改变 session 生命周期。
```

Do not change SDK behavior or introduce a visit definition.

- [ ] **Step 3: Update the Dashboard technical plan**

In `docs/mvp_technical_plan.md`, document:

- the actor card stays on the v1 observed-actor trend axis;
- complete v2 evidence is an expanded explanation;
- partial/unavailable states hide all v2 counts;
- legacy first-seen/retention values remain labelled;
- no new card, API, or UI switcher exists.

- [ ] **Step 4: Align Agent interpretation guidance**

Add this boundary to the `project_health` workflow in `docs/agent_instrumentation_guidance.md`:

```text
读取 `health.current.actorMetricsV2` 时，只有 `coverage: complete` 才解释聚合数量；`canonicalUserActors` 和 `firstSeenCanonicalActors` 是确定性 Actor 口径，不证明真人或注册。`trafficSources` 按小时归因口径汇总，同一标识跨小时可能重复，不是人数或正式访问，`direct` 仅表示缺少可用归因来源。
```

Do not edit public Agent Skill files or bump `guidanceVersion`.

- [ ] **Step 5: Mark the roadmap boundary**

In `docs/tracemind_product_plan_markdown.md`:

- record that Phase 2A exposes the deterministic explanation layer in Dashboard/MCP;
- keep human/bot scoring, 30-minute visits, registration truth, v2 trends, v2 retention, and v2 alert triggers deferred;
- call it `Actor Metrics Phase 2A` to avoid collision with the product roadmap's existing global Phase 2.

- [ ] **Step 6: Append implementation evidence without touching user work**

After implementation and verification, append a separate 2026-08-01 entry to `docs/implementation_progress.md` that states:

- the Dashboard now calls v1 counts observed actors;
- complete v2 breakdown and coverage states are visible;
- legacy first-seen/retention values are labelled;
- attribution counts are no longer called visits;
- MCP schema, aggregation, SDKs, and capture are unchanged;
- verification commands and outcomes.

Before and after editing, preserve the existing user-owned hunks. Do not edit `docs/product_backlog.md`.

- [ ] **Step 7: Update the design status**

After all implementation checks pass, change only:

```markdown
**Status:** Implemented locally; not deployed
```

in the approved Phase 2A design spec.

- [ ] **Step 8: Review documentation for unsupported claims**

Run:

```bash
rg -n "新用户|new users|strict visit|正式访问|真人|注册" docs/mcp_design.md docs/semantic_event_design.md docs/mvp_technical_plan.md docs/agent_instrumentation_guidance.md docs/tracemind_product_plan_markdown.md
```

Review every match. Expected: any remaining use is an explicit warning, legacy-field explanation, or deferred capability—not a claim that TraceMind proves the concept.

- [ ] **Step 9: Keep documentation unstaged until the final narrow-stage review**

`docs/implementation_progress.md` already contains user-owned changes. Do not use a whole-file `git add` command for this task and do not create a task-local documentation commit. Leave the documentation unstaged so the final reviewer can inspect and stage only the Phase 2A hunk if the user later authorizes a commit. Never stage `docs/product_backlog.md`.

---

### Task 4: Verify The Full Phase 2A Boundary And Rendered UI

**Files:**

- Review: every Phase 2A file from Tasks 1-3
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/imports/ui/App.svelte`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/client/main.css`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/server/tracemind_publications.js`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/sdk/`
- Verify unchanged: `/Users/wolf3c/Project/TraceMind/public/agents/tracemind/`

**Interfaces:**

- Validates the complete product result without mutating production data or deploying.
- Produces a handoff with exact verification evidence and remaining runtime-state limitations.

- [ ] **Step 1: Run static scope and whitespace checks**

```bash
git diff --check
git status --short
git diff --name-only
git diff --name-only -- sdk/ public/agents/tracemind/ server/daily_reports.js imports/api/tracemind.js server/tracemind_publications.js imports/ui/App.svelte client/main.css
```

Expected:

- `git diff --check` exits `0`;
- the last command prints nothing;
- `docs/product_backlog.md` remains user-owned and unmodified by Phase 2A;
- no Phase 2A file is staged unless commits were explicitly authorized.

- [ ] **Step 2: Confirm the old Dashboard claims are gone**

```bash
rg -n '\\$t\\("(Active users|new users|New users|Traffic sources|visits)"\\)' imports/ui/ProjectHealthPanel.svelte
```

Expected: no output.

Confirm the retained axis explicitly:

```bash
rg -n 'healthCurrent\\.activeUsers|health\\?\\.trends\\?\\.activeUsers|hourlyMetrics\\.activeUsers|healthCurrent\\.retention' imports/ui/ProjectHealthPanel.svelte
```

Expected: the main value, trend, sparkline, and legacy-labelled retention still use the v1 fields.

- [ ] **Step 3: Confirm private evidence is not rendered or documented as public**

```bash
rg -n 'actorEvidenceV2|anonymousActorKey|userActorKey|aliasPairs' imports/ui/ProjectHealthPanel.svelte server/capture_routes.js
```

Expected: no output.

- [ ] **Step 4: Run Svelte diagnostics**

```bash
npx svelte-check
```

Expected: exit `0` with no errors.

- [ ] **Step 5: Run the complete Meteor suite**

```bash
npm test
```

Expected: exit `0` with zero failed tests.

- [ ] **Step 6: Start the local app for rendered verification**

Use a dedicated port so an existing checkout is not disturbed:

```bash
npm start -- --port 3112
```

Wait for Meteor to report that the app is running, then use the Codex in-app Browser at:

```text
http://localhost:3112
```

Do not reuse or stop a process from another checkout.

- [ ] **Step 7: Verify the actual actor card**

In the Browser:

1. open the selected project's health view;
2. confirm the collapsed title is “Observed actors” / “观测 Actor”;
3. confirm its main number, trend, and sparkline are still the same v1 observed-actor values;
4. expand the card;
5. for a complete report, compare every visible v2 value and the reconciliation with the same report's MCP `project_health.health.current.actorMetricsV2`;
6. for an unavailable historical report, confirm v2 counts are absent, legacy values are labelled, and no `0` is fabricated;
7. if no complete or unavailable report exists locally, record the exact missing state instead of altering production data or weakening the check;
8. confirm the attribution card says “Attribution count” / “归因计数”, explains the hourly-rollup boundary, and explains `direct`;
9. repeat in Chinese and English;
10. verify one desktop viewport and one mobile viewport without changing the four-column desktop grid or causing overflow.

Do not create a production fixture, backfill, or feature flag to satisfy this check.

- [ ] **Step 8: Review the agent-owned diff against the approved spec**

Check every spec requirement:

- v1 trend axis remains intact;
- complete-only v2 counts;
- partial/unavailable do not format `null`;
- no “new users” or attribution “visits” in the health panel;
- deterministic/no-human/no-registration disclaimer;
- unchanged MCP schema;
- unchanged aggregation/SDK/capture/public privacy boundary;
- all supported runtimes remain no-change outside Dashboard/MCP wording.

Fix only issues inside the approved Phase 2A boundary and rerun Steps 1-7.

- [ ] **Step 9: Final handoff without deploy**

Report:

- exact changed files;
- focused red-green results;
- `npx svelte-check` and `npm test` results;
- rendered states actually verified and any state unavailable locally;
- unchanged SDK/report/API/capture boundaries;
- preserved user-owned `docs/implementation_progress.md` and `docs/product_backlog.md` hunks;
- branch, staged state, and whether commits were authorized;
- no deployment or production mutation.

Suggested final implementation commit, if the user later requests one:

```text
feat: explain actor metrics in project health
```

---

## Self-Review Checklist

- Every approved spec requirement maps to Tasks 1-4.
- No task changes actor computation, storage, response fields, SDKs, capture, or public Agent Skill versions.
- UI values use the exact existing property names from `actorMetricsV2`.
- Coverage gating is `coverage === "complete"` and never falls back under a v2 label.
- The main value/trend/sparkline/retention remain v1.
- Traffic aggregation is untouched; only its presentation and documentation change.
- Every code or behavior step contains exact target text, property names, and verification.
- No placeholder, compatibility layer, feature flag, or speculative classifier is present.
