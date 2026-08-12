# Project Health Email Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one privacy-safe project-owner email when either existing high-severity completed-hour health signal opens, suppress repeats while it remains open, and send one recovery email when both signals clear.

**Architecture:** Reuse the existing completed-hour report refresh, `attentionItemsForHealth()`, `Projects`, `Developers`, and Meteor Email/Mailgun. Store one opt-in boolean and one compact transition state directly on each Project; add one server module for decision, message, and delivery logic; expose only the boolean in owner-scoped project data; add one compact Dashboard setting row. Do not add a collection, queue, lock, rules engine, channel abstraction, migration, or SDK contract.

**Tech Stack:** Meteor, MongoDB, Svelte 5, Meteor Email/Mailgun, JavaScript, Meteor Mocha with Node `assert`, Svelte Check, Codex Browser.

**Approved design:** `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-08-12-project-health-email-alerts-design.md`

**Status:** Approved for implementation on 2026-08-12; not implemented or deployed.

## Global Constraints

- Keep the implementation opt-in and project-owner-only. The existing `Developer.email` is the sole recipient; do not add recipient settings.
- Reuse exactly two existing high-severity codes: `event_stream_stopped` and `failure_events_increased`. Do not add thresholds, severity configuration, or a second rules implementation.
- Compare the latest fully completed hour with the same hour one day earlier. Missing either hourly report means `unavailable`: no email and no state transition.
- Store only `healthAlertEnabled` and `healthAlertState` on `Projects`. Treat an absent boolean as disabled and absent state as a normal baseline.
- `healthAlertState` has only `status`, `evaluatedHourKey`, `openedAt` and `codes` while open, and `updatedAt`. Disabling unsets the state.
- Send before changing state. A send failure leaves state unchanged so the next five-minute pass retries. A successful send followed by a failed state write may duplicate once; accept that documented edge case rather than adding a queue.
- While open, do not send another incident even when the active code set changes. Preserve the original `openedAt` and `codes` until recovery.
- Email content is plain text and aggregate-only. Never include raw errors, stacks, event details, prompts/content, event/session/device/user IDs, request/response bodies, headers, cookies, tokens, source code/diffs, or query-bearing URLs.
- Keep hourly report generation independent from email delivery. Alert evaluation or SMTP failure must not fail or roll back report refresh.
- Preserve existing unrelated work. Stage only files named by the current task.
- Do not deploy in this plan. Production rollout remains gated behind the Web retry-idempotency 72-hour observation ending `2026-08-15T08:39:25Z`.

## Runtime Impact Matrix

| Runtime or surface | Status | Required work |
|---|---|---|
| Web Dashboard | change | Owner-only opt-in row, public boolean projection, desktop/mobile verification |
| Meteor server and hourly health jobs | change | Transition evaluation, email delivery, inactive enabled-project inclusion |
| iOS | no change | Auto Capture and SDK contract unchanged |
| macOS | no change | Auto Capture and SDK contract unchanged |
| Android | no change | Auto Capture and SDK contract unchanged |
| React Native | no change | Auto Capture and SDK contract unchanged |
| Hybrid | no change | WebView/native capture behavior unchanged |
| Mini Program | no change | SDK contract unchanged |
| Browser Extension | no change | SDK contract unchanged |
| Server SDKs | no change | Capture contract unchanged |
| MCP | no change | No new tool, field, or output |
| Agent Skill | no change | No workflow or contract change |
| Public API/capture script | no change | No event schema, endpoint, or SDK release change |

---

### Task 1: Add The Owner-Only Project Opt-In Contract

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/api/tracemind.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/tracemind_publications.js`
- Modify: `/Users/wolf3c/Project/TraceMind/server/tracemind_methods.js`

**Interfaces:**

- Adds `tracemind.project.healthAlert.setEnabled(projectId, enabled)`.
- Returns the existing public Project projection plus `healthAlertEnabled: boolean`.
- Publishes `healthAlertEnabled` to the owner but never publishes or returns `healthAlertState`.
- Enabling preserves an existing open state; disabling unsets both the boolean and state.

- [ ] **Step 1: Write the failing method and projection tests**

Add a server test beside `lets project owners rename only their own projects`:

```js
it('lets project owners opt in to health email alerts without exposing state', async function () {
  const ownerUserId = await Meteor.users.insertAsync({
    emails: [{ address: `health-alert-owner-${Date.now()}@example.com`, verified: true }],
    createdAt: new Date(),
  });
  const otherUserId = await Meteor.users.insertAsync({
    emails: [{ address: `health-alert-other-${Date.now()}@example.com`, verified: true }],
    createdAt: new Date(),
  });
  const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
  const setEnabledMethod = Meteor.server.method_handlers['tracemind.project.healthAlert.setEnabled'];
  const dashboard = await dashboardMethod.apply({ userId: ownerUserId }, []);
  const projectId = dashboard.projects[0]._id;

  const developer = await Developers.findOneAsync({ userId: ownerUserId });
  const ownerEmail = developer.email;
  try {
    await Developers.updateAsync(developer._id, { $set: { email: 'invalid-email' } });
    await assert.rejects(
      () => setEnabledMethod.apply({ userId: ownerUserId }, [projectId, true]),
      (error) => error.error === 'email-not-found',
    );
  } finally {
    await Developers.updateAsync(developer._id, { $set: { email: ownerEmail } });
  }

  const enabledProject = await setEnabledMethod.apply({ userId: ownerUserId }, [projectId, true]);
  assert.strictEqual(enabledProject.healthAlertEnabled, true);
  assert.strictEqual(enabledProject.healthAlertState, undefined);

  await Projects.updateAsync(projectId, {
    $set: {
      healthAlertState: {
        status: 'open',
        evaluatedHourKey: '2026-08-12T07:00:00.000Z',
        openedAt: new Date('2026-08-12T08:00:00.000Z'),
        codes: ['event_stream_stopped'],
        updatedAt: new Date('2026-08-12T08:01:00.000Z'),
      },
    },
  });

  const stillEnabledProject = await setEnabledMethod.apply({ userId: ownerUserId }, [projectId, true]);
  assert.strictEqual(stillEnabledProject.healthAlertEnabled, true);
  assert.strictEqual((await Projects.findOneAsync(projectId)).healthAlertState.status, 'open');

  const disabledProject = await setEnabledMethod.apply({ userId: ownerUserId }, [projectId, false]);
  const storedDisabledProject = await Projects.findOneAsync(projectId);
  assert.strictEqual(disabledProject.healthAlertEnabled, false);
  assert.strictEqual(disabledProject.healthAlertState, undefined);
  assert.strictEqual(storedDisabledProject.healthAlertEnabled, undefined);
  assert.strictEqual(storedDisabledProject.healthAlertState, undefined);

  await assert.rejects(
    () => setEnabledMethod.apply({ userId: otherUserId }, [projectId, true]),
    (error) => error.error === 'not-found',
  );
  await assert.rejects(
    () => setEnabledMethod.apply({ userId: ownerUserId }, [projectId, 'true']),
    (error) => error.error === 'invalid-request',
  );
});
```

Extend an existing `publicProject()` assertion, or add this small unit assertion:

```js
assert.deepStrictEqual(
  {
    enabled: TraceMindApi.publicProject({ healthAlertEnabled: true, healthAlertState: { status: 'open' } }).healthAlertEnabled,
    state: TraceMindApi.publicProject({ healthAlertEnabled: true, healthAlertState: { status: 'open' } }).healthAlertState,
  },
  { enabled: true, state: undefined },
);
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
MOCHA_GREP="health email alerts without exposing state" npm test -- --port 3141
```

Expected: FAIL because `tracemind.project.healthAlert.setEnabled` is not registered and the public field is absent.

- [ ] **Step 3: Implement the smallest owner-scoped toggle**

In `imports/api/tracemind.js`, add only this field to `publicProject()`:

```js
healthAlertEnabled: project.healthAlertEnabled === true,
```

In `server/tracemind_publications.js`, add only `healthAlertEnabled: 1` to `PROJECT_PUBLIC_FIELDS`. Do not add `healthAlertState`.

In `server/tracemind_methods.js`, register the method beside the rename method:

```js
async 'tracemind.project.healthAlert.setEnabled'(projectId, enabled) {
  if (typeof enabled !== 'boolean') {
    throw new Meteor.Error('invalid-request', 'Enabled must be a boolean.');
  }

  const developer = await getOrCreateDeveloperForUser(this.userId);
  const project = await findProjectForDeveloper(projectId, developer._id);
  if (!project) {
    throw new Meteor.Error('not-found', 'Project not found.');
  }
  if (enabled && !isValidEmail(developer.email)) {
    throw new Meteor.Error('email-not-found', 'Project owner email is required.');
  }

  const updatedAt = new Date();
  await Projects.updateAsync(project._id, enabled
    ? { $set: { healthAlertEnabled: true, updatedAt } }
    : {
        $set: { updatedAt },
        $unset: { healthAlertEnabled: 1, healthAlertState: 1 },
      });
  return publicProject(await Projects.findOneAsync(project._id));
},
```

Add `isValidEmail` to the existing shared API imports. Validate only on enable so a Project with a damaged legacy email can always be disabled. Do not use the MCP-token helper, because changing the alert setting must not create or normalize unrelated credentials.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Review and commit only Task 1 files**

```bash
git diff -- tests/main.js imports/api/tracemind.js server/tracemind_publications.js server/tracemind_methods.js
git add tests/main.js imports/api/tracemind.js server/tracemind_publications.js server/tracemind_methods.js
git commit -m "Add project health alert opt-in"
```

---

### Task 2: Implement The Completed-Hour Transition And Email Module

**Files:**

- Create: `/Users/wolf3c/Project/TraceMind/server/health_alerts.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

**Interfaces:**

```js
export const PROJECT_HEALTH_EMAIL_ALERT_CODES;
export function buildProjectHealthEmailAlertDecision({ state, currentReport, previousReport, now });
export function buildProjectHealthAlertEmail({ project, developer, decision, currentReport, previousReport, dashboardUrl });
export async function evaluateProjectHealthEmailAlert(projectId, hourStartAt, dependencies);
```

- [ ] **Step 1: Add failing pure transition tests**

Import the new module inside the existing `Meteor.isServer` setup. Add a local report fixture that always provides the arrays expected by the existing health helper:

```js
function healthAlertHourlyReport(hourStartAt, current) {
  const start = new Date(hourStartAt);
  return {
    hourKey: start.toISOString(),
    hourStartAt: start,
    hourEndAt: new Date(start.getTime() + 60 * 60 * 1000),
    timezone: 'Asia/Shanghai',
    current: {
      activeUsers: 0,
      sessionCount: 0,
      eventCount: 0,
      failureEventCount: 0,
      topEvents: [],
      ...current,
    },
  };
}
```

Cover the literal state table:

```js
it('decides one incident, suppresses an open hour, and decides one recovery', function () {
  const now = new Date('2026-08-12T08:05:00.000Z');
  const currentIncident = healthAlertHourlyReport('2026-08-12T07:00:00.000Z', { eventCount: 0 });
  const previousIncident = healthAlertHourlyReport('2026-08-11T07:00:00.000Z', { eventCount: 12 });
  const incident = buildProjectHealthEmailAlertDecision({
    currentReport: currentIncident,
    previousReport: previousIncident,
    now,
  });

  assert.strictEqual(incident.transition, 'incident');
  assert.deepStrictEqual(incident.nextState.codes, ['event_stream_stopped']);
  assert.strictEqual(incident.nextState.openedAt.toISOString(), '2026-08-12T08:00:00.000Z');

  assert.strictEqual(buildProjectHealthEmailAlertDecision({
    state: incident.nextState,
    currentReport: currentIncident,
    previousReport: previousIncident,
    now,
  }), null);

  const currentOpen = healthAlertHourlyReport('2026-08-12T08:00:00.000Z', { failureEventCount: 4 });
  const previousOpen = healthAlertHourlyReport('2026-08-11T08:00:00.000Z', { failureEventCount: 1 });
  const open = buildProjectHealthEmailAlertDecision({
    state: incident.nextState,
    currentReport: currentOpen,
    previousReport: previousOpen,
    now,
  });
  assert.strictEqual(open.transition, null);
  assert.deepStrictEqual(open.nextState.codes, ['event_stream_stopped']);
  assert.strictEqual(open.nextState.openedAt.toISOString(), '2026-08-12T08:00:00.000Z');

  const currentRecovery = healthAlertHourlyReport('2026-08-12T09:00:00.000Z', { eventCount: 8 });
  const previousRecovery = healthAlertHourlyReport('2026-08-11T09:00:00.000Z', { eventCount: 5 });
  const recovery = buildProjectHealthEmailAlertDecision({
    state: open.nextState,
    currentReport: currentRecovery,
    previousReport: previousRecovery,
    now,
  });
  assert.strictEqual(recovery.transition, 'recovery');
  assert.deepStrictEqual(recovery.nextState, {
    status: 'normal',
    evaluatedHourKey: '2026-08-12T09:00:00.000Z',
    updatedAt: now,
  });
});
```

Add two boundary assertions: a normal/no-high first evaluation returns a decision with `transition === null` and a normal baseline state; a missing current or previous report returns `null`.

- [ ] **Step 2: Add failing delivery, retry, and privacy tests**

Create one enabled Project, matching Developer, and two exact hourly report pairs. Inject `sendEmail` so no real email is sent. Assert:

- first send failure returns `{ status: 'failed', transition: 'incident' }` and leaves `healthAlertState` absent;
- the same-hour retry sends again and stores `status: 'open'` only after success;
- another evaluation of the same hour returns `unchanged` and does not send;
- the next clear hour sends one recovery and stores only the normal baseline fields;
- if the user disables the Project while an injected `sendEmail` is in flight, the completed send must not restore the cleared `healthAlertState`;
- a disabled project returns `disabled` and never sends;
- a missing matching hour returns `unavailable` and never changes state.

Remove the test Project, Developer, and hourly reports in `afterEach`/`finally`, so later scheduler tests do not inherit an enabled Project from this fixture.

Build an email with a project name containing a newline. Put raw-looking sensitive strings only in ignored extra report fields so the test proves the builder does not serialize source detail. Assert the message:

```js
assert.match(message.subject, /TraceMind/);
assert.match(message.text, /event_stream_stopped/);
assert.match(message.text, /当前小时事件数：0/);
assert.match(message.text, /对比小时事件数：12/);
assert.match(message.text, /当前小时失败事件数：0/);
assert.match(message.text, /对比小时失败事件数：0/);
assert.match(message.text, /Asia\/Shanghai/);
assert.match(message.text, /^https:\/\/tracemind\.app\/$/m);
assert.ok(!message.text.includes('stack trace'));
assert.ok(!message.text.includes('session-secret'));
assert.ok(!message.subject.includes('\n'));
```

Do not assert or introduce localized rule messages from `attentionItemsForHealth()` in the email; use only fixed code labels and aggregate counts.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
MOCHA_GREP="decides one incident|retries health email delivery|builds privacy-safe health alert email" npm test -- --port 3142
```

Expected: FAIL because `server/health_alerts.js` does not exist.

- [ ] **Step 4: Implement the pure decision with the existing rules**

In `server/health_alerts.js`, define the immutable allowlist and one state builder:

```js
export const PROJECT_HEALTH_EMAIL_ALERT_CODES = Object.freeze([
  'event_stream_stopped',
  'failure_events_increased',
]);

export function buildProjectHealthEmailAlertDecision({
  state = null,
  currentReport,
  previousReport,
  now = new Date(),
} = {}) {
  if (!currentReport?.hourKey || !previousReport?.hourKey) return null;
  if (state?.evaluatedHourKey === currentReport.hourKey) return null;

  const highItems = attentionItemsForHealth(
    currentReport.current,
    previousReport.current,
    currentReport.hourEndAt,
    { comparisonWindow: 'completed_hours' },
  ).filter((item) => (
    item.severity === 'high'
    && PROJECT_HEALTH_EMAIL_ALERT_CODES.includes(item.code)
  ));
  const previousStatus = state?.status === 'open' ? 'open' : 'normal';
  const nextStatus = highItems.length ? 'open' : 'normal';
  const transition = previousStatus === nextStatus
    ? null
    : nextStatus === 'open' ? 'incident' : 'recovery';
  const nextState = nextStatus === 'open'
    ? {
        status: 'open',
        evaluatedHourKey: currentReport.hourKey,
        openedAt: previousStatus === 'open' ? state.openedAt : currentReport.hourEndAt,
        codes: previousStatus === 'open'
          ? state.codes
          : highItems.map((item) => item.code).sort(),
        updatedAt: now,
      }
    : {
        status: 'normal',
        evaluatedHourKey: currentReport.hourKey,
        updatedAt: now,
      };

  return { transition, nextState, highItems, previousState: state };
}
```

Do not copy the two threshold conditions into this module; `attentionItemsForHealth()` remains the single rule source.

- [ ] **Step 5: Implement the fixed plain-text email builder**

Use `TraceMind <postmaster@email.super-tree.com>` as the local module constant. Normalize the project name with:

```js
const safeProjectName = String(project?.name || 'TraceMind project')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 80);
```

Format the window as the exact UTC range plus an `Asia/Shanghai` range using `Intl.DateTimeFormat`. For an incident, list only the fixed high code(s), severity `high`, and current/previous `eventCount` and `failureEventCount`. For recovery, say `健康信号已恢复` and list `decision.previousState.codes`. Finish with the root `Meteor.absoluteUrl()` value. Return only `{ to, from, subject, text }`.

Use the exact subjects from the approved contract:

```text
[TraceMind] <project> 需要关注
[TraceMind] <project> 健康信号已恢复
```

Do not refactor passwordless-login email configuration or add a shared email abstraction merely to reuse one sender string.

- [ ] **Step 6: Implement delivery with send-before-state semantics**

`evaluateProjectHealthEmailAlert()` must:

1. Read the Project and return `disabled` unless `healthAlertEnabled === true`.
2. Read the exact current hourly report by `projectId + hourStartAt` and the comparison report at `hourStartAt - 24 hours`.
3. Return `unavailable` if either report is absent.
4. Build the decision and return `unchanged` for an already evaluated hour.
5. Persist `nextState` immediately when `transition === null`, using `{ _id: projectId, healthAlertEnabled: true }` as the update selector.
6. Resolve `Developer` by `project.developerId`; reuse `normalizeEmail()` and `isValidEmail()` from the shared API and return `unavailable` when no valid email exists.
7. `await sendEmail(message)` inside a narrow try/catch. On failure, log only `projectId`, transition, and `errorName`; never log the error message, recipient, or email body. Return `failed` without a Project update.
8. After successful send, replace `healthAlertState` with `nextState`, again using `{ _id: projectId, healthAlertEnabled: true }` as the selector so a concurrent disable cannot restore cleared state. Let a database error surface so the scheduler logs it and the next pass retries.

Default dependencies should be `Email.sendAsync`, `Meteor.absoluteUrl()`, `new Date()`, and `console.error`. Tests inject all side-effectful dependencies.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run the Step 3 command. Expected: PASS with no real SMTP call.

- [ ] **Step 8: Review and commit only Task 2 files**

```bash
git diff -- tests/main.js server/health_alerts.js
git add tests/main.js server/health_alerts.js
git commit -m "Send deduplicated project health emails"
```

---

### Task 3: Wire Alert Evaluation Into The Existing Hourly Refresh

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/server/daily_reports.js`
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

**Interfaces:**

- Enabled projects are hourly-refresh candidates even without recent activity.
- Only enabled projects call `evaluateProjectHealthEmailAlert()`.
- Evaluation runs after the Project's hourly/daily reports finish refreshing.
- Report and alert failures use separate try/catch blocks.

- [ ] **Step 1: Extend the existing scheduler test and verify RED**

Rename `refreshes completed-hour draft reports only for projects with recent activity` to `refreshes active and health-alert-enabled projects after each completed hour`.

Keep its active and inactive projects, add a third inactive Project with `healthAlertEnabled: true`, and inject an evaluator spy:

```js
const evaluated = [];
const result = await refreshCompletedHourDraftReports(now, {
  evaluateHealthAlert: async (projectId, hourStartAt) => {
    evaluated.push({ projectId, hourStartAt });
  },
});
```

Assert:

```js
assert.ok(result.projectCount >= 2);
assert.ok(await ProjectDailyReports.findOneAsync({ projectId: activeProjectId, reportDate: '2026-05-13' }));
assert.strictEqual(await ProjectDailyReports.findOneAsync({ projectId: inactiveProjectId, reportDate: '2026-05-13' }), undefined);
assert.ok(await ProjectDailyReports.findOneAsync({ projectId: alertEnabledProjectId, reportDate: '2026-05-13' }));
assert.deepStrictEqual(
  evaluated.filter((item) => item.projectId === alertEnabledProjectId),
  [{
    projectId: alertEnabledProjectId,
    hourStartAt: new Date('2026-05-12T17:00:00.000Z'),
  }],
);
assert.strictEqual(evaluated.some((item) => item.projectId === activeProjectId), false);
assert.strictEqual(evaluated.some((item) => item.projectId === inactiveProjectId), false);
```

Add a second test whose injected evaluator throws. Assert the enabled project's draft and exact hourly report still exist and `projectCount` still includes it.

Wrap each scheduler test in `try/finally`. In `finally`, remove every Project ID created by that test from `SemanticEvents`, `ProjectHourlyReports`, `ProjectDailyReports`, and `Projects`. This is required because enabled Projects are now global scheduler candidates and must not leak into later tests.

- [ ] **Step 2: Run focused scheduler tests and verify RED**

```bash
MOCHA_GREP="health-alert-enabled projects|alert evaluation failure does not fail hourly report refresh" npm test -- --port 3143
```

Expected: FAIL because inactive enabled projects are excluded and the function does not accept an evaluator dependency.

- [ ] **Step 3: Include opt-in projects in the existing candidate query**

Rename the private `recentActivityProjectIds()` helper to `completedHourProjects()`. Keep the five existing `distinct()` activity reads. Replace its final Project query with:

```js
return Projects.find(
  {
    $or: [
      { _id: { $in: candidateIds } },
      { healthAlertEnabled: true },
    ],
  },
  { fields: { _id: 1, healthAlertEnabled: 1 } },
).fetchAsync();
```

An empty `$in` is valid, so do not add a special branch. This keeps one candidate query and no new index; opt-in projects are expected to remain a small subset in v1.

- [ ] **Step 4: Evaluate the just-completed hour after report refresh**

Change the function signature to:

```js
export async function refreshCompletedHourDraftReports(now = new Date(), {
  evaluateHealthAlert = evaluateProjectHealthEmailAlert,
} = {})
```

Derive the exact evaluated hour once:

```js
const completedHourStartAt = new Date(sourceEndAt.getTime() - HEALTH_ROLLUP_HOUR_MS);
```

Loop over Project documents. Keep report refresh in its current try/catch and increment `projectCount` on success. Only after successful refresh, and only when `project.healthAlertEnabled === true`, call the evaluator in a second try/catch. Log alert failure separately as `[TraceMind] project health email alert evaluation failed` with only `projectId` and `errorName`, never the error message or email data.

Do not await or send email inside `computeProjectHourlyReport()` or `persistProjectHealthReport()`.

- [ ] **Step 5: Run focused scheduler tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Review and commit only Task 3 files**

```bash
git diff -- tests/main.js server/daily_reports.js
git add tests/main.js server/daily_reports.js
git commit -m "Evaluate health alerts after hourly reports"
```

---

### Task 4: Add The Compact Dashboard Setting

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/App.svelte`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/ProjectSetupPanel.svelte`
- Modify: `/Users/wolf3c/Project/TraceMind/imports/ui/i18n/locales/zh.js`
- Modify: `/Users/wolf3c/Project/TraceMind/client/main.css`

**Interfaces:**

- Adds one native checkbox row inside existing `#project-setup-details`, immediately after Project key.
- Keeps published Project data as the UI source of truth.
- Uses the existing global loading/status pattern and reverts the checkbox if the method fails.
- Adds no page, modal, nested card, or reusable toggle component.

There is no isolated Svelte component-test harness in this repository. Use Svelte compilation plus the real rendered interaction as the closest behavior-level UI verification; the server-side persistence contract remains red-green tested in Task 1.

- [ ] **Step 1: Add client mapping and handler before markup**

In `publicProjectFromClient()` add:

```js
healthAlertEnabled: project.healthAlertEnabled === true,
```

Add this App handler beside `renameProject()`:

```js
async function setHealthAlertEnabled(enabled) {
  if (!primaryProject) return false;
  loading = true;
  showStatus('');
  try {
    const updatedProject = await callMethod(
      'tracemind.project.healthAlert.setEnabled',
      primaryProject._id,
      enabled,
    );
    replaceProject(updatedProject);
    showSuccessStatus(translateNow(
      enabled ? 'Email health alerts enabled.' : 'Email health alerts disabled.',
    ));
    return true;
  } catch (error) {
    showStatus(errorMessage(error));
    return false;
  } finally {
    loading = false;
  }
}
```

Pass `{setHealthAlertEnabled}` to `ProjectSetupPanel`.

- [ ] **Step 2: Add one accessible setting row**

Add the prop and a four-line local failure-revert helper:

```js
async function changeHealthAlertEnabled(event) {
  const input = event.currentTarget;
  const desired = input.checked;
  if (!await setHealthAlertEnabled(desired)) input.checked = !desired;
}
```

Insert immediately after the Project key label:

```svelte
<div class="project-setting-row">
  <div id="health-alert-description" class="project-setting-copy">
    <strong>{$t("Email health alerts")}</strong>
    <span>{$t("Check high-severity health signals after each completed hour and email the current project owner.")}</span>
  </div>
  <label class="project-setting-control">
    <span class="sr-only">{$t("Email health alerts")}</span>
    <input
      type="checkbox"
      name="healthAlertEnabled"
      role="switch"
      aria-describedby="health-alert-description"
      checked={primaryProject.healthAlertEnabled === true}
      onchange={changeHealthAlertEnabled}
      disabled={loading}
    />
  </label>
</div>
```

Use a native checkbox. Do not add a custom switch component or local shadow state.

- [ ] **Step 3: Add only the required locale strings and CSS**

Add these Chinese mappings; `en.js` remains empty because English keys are the fallback strings:

```js
"Email health alerts": "邮件健康告警",
"Check high-severity health signals after each completed hour and email the current project owner.": "每个已结束小时检查高严重度健康信号，并发送到当前项目负责人邮箱。",
"Email health alerts enabled.": "邮件健康告警已开启。",
"Email health alerts disabled.": "邮件健康告警已关闭。",
```

Add minimal CSS alongside `.project-setup-details`:

```css
.project-setting-row {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
}

.project-setting-copy {
  display: grid;
  gap: 3px;
}

.project-setting-copy span {
  color: var(--muted);
  font-size: 0.9rem;
}

.project-setting-control {
  display: grid;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  margin: 0;
  place-items: center;
}

.project-setting-control input {
  width: 22px;
  height: 22px;
  padding: 0;
  accent-color: var(--signal);
}
```

- [ ] **Step 4: Run compile and focused contract checks**

```bash
npx svelte-check
MOCHA_GREP="health email alerts without exposing state" npm test -- --port 3144
```

Expected: both PASS.

- [ ] **Step 5: Verify the rendered interaction with Codex Browser**

Start a dedicated local server:

```bash
npm start -- --port 3147
```

Using Codex Browser, verify `http://localhost:3147/` in the signed-in local Dashboard:

1. Desktop width: expand setup details; the row is directly below Project key, preserves the existing layout axis, and has no nested card.
2. Toggle on: success status appears, a refresh preserves checked state, and published client data contains no `healthAlertState`.
3. Toggle off: success status appears and refresh preserves unchecked state.
4. Simulate a method failure or temporarily disconnect the client: the native checkbox visibly reverts and error status appears.
5. Mobile width near 390px: copy wraps without horizontal overflow and the control has a 44px target.

Stop the dedicated local Meteor process after verification. Do not use `networkidle` as the readiness signal; wait for the signed-in Dashboard and setup controls to be visible.

- [ ] **Step 6: Review and commit only Task 4 files**

```bash
git diff -- imports/ui/App.svelte imports/ui/ProjectSetupPanel.svelte imports/ui/i18n/locales/zh.js client/main.css
git add imports/ui/App.svelte imports/ui/ProjectSetupPanel.svelte imports/ui/i18n/locales/zh.js client/main.css
git commit -m "Add health email alert setting"
```

---

### Task 5: Align Documentation And Run The Full Acceptance Gate

**Files:**

- Modify: `/Users/wolf3c/Project/TraceMind/docs/product_backlog.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/implementation_progress.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/mvp_technical_plan.md`
- Modify: `/Users/wolf3c/Project/TraceMind/docs/auth_token_design.md`
- Review: `/Users/wolf3c/Project/TraceMind/docs/superpowers/specs/2026-08-12-project-health-email-alerts-design.md`
- Review: every source and test file changed in Tasks 1–4

- [ ] **Step 1: Update durable documentation without claiming deployment**

- In `docs/product_backlog.md`, move `TM-ALERT-001` from `待方案` to `待发布`, record the fixed email-only v1 contract, and keep the rollout dependency on the Web idempotency observation.
- In `docs/implementation_progress.md`, record the local implementation, state fields, send-before-state retry contract, privacy boundary, focused/full verification, and `not deployed` status.
- In `docs/mvp_technical_plan.md`, add `server/health_alerts.js` to the server health/reporting ownership description.
- In `docs/auth_token_design.md`, state that an opted-in Project may use its existing `Developer.email` for privacy-safe health incident/recovery notifications and that no recipient profile is added.
- Re-read the approved design. If implementation matches, do not edit the design spec. If a necessary mismatch is found, stop and ask before changing the approved contract.

- [ ] **Step 2: Run all focused server tests together**

```bash
MOCHA_GREP="health email alerts|health-alert-enabled projects|health alert email|alert evaluation failure" npm test -- --port 3145
```

Expected: all new opt-in, decision, retry, privacy, and scheduler tests PASS.

- [ ] **Step 3: Run the full repository gates**

```bash
npx svelte-check
npm test -- --port 3146
```

Expected: Svelte diagnostics are clean and the full Meteor suite passes, including the existing pretest release/SDK/deploy gates. This feature changes no file under `sdk/`, so do not run or commit an SDK manifest update unless the standard gate detects an unexpected SDK diff.

- [ ] **Step 4: Validate the analytics/instrumentation boundary**

Using MCP server `tracemind-ywrtpb`, call `tracemind.project_info` and continue only when `projectId === 'BJuZgMywBxYYWrTpB'`. Then run the TraceMind instrumentation diff validation against the implementation diff.

Expected: no new custom event is required; the native setting interaction remains covered by Web Auto Capture; no SDK, capture, MCP, or Agent Skill contract changed. If the MCP binding or validation is unavailable, report it as unavailable rather than treating it as passed.

- [ ] **Step 5: Perform the final simplicity and privacy review**

Review `git diff` and confirm all of the following:

- no new Mongo collection, index, migration, queue, lock, cron, rules engine, channel abstraction, dependency, SDK field, public MCP field, or custom event;
- no second implementation of the two health rules;
- no email body uses `attentionItemsForHealth().message` or any raw/source identifier;
- no Project response/publication exposes `healthAlertState`;
- same-hour suppression, open-state suppression, recovery, missing-report unavailable, SMTP retry, and report isolation are all covered;
- disabling removes state and repeated enabling does not reset an open state;
- docs say local/not deployed and preserve the rollout gate.

- [ ] **Step 6: Commit documentation only after all gates pass**

```bash
git diff -- docs/product_backlog.md docs/implementation_progress.md docs/mvp_technical_plan.md docs/auth_token_design.md
git add docs/product_backlog.md docs/implementation_progress.md docs/mvp_technical_plan.md docs/auth_token_design.md
git commit -m "Document project health email alerts"
```

- [ ] **Step 7: Report the implementation handoff**

Report:

- exact commits created;
- focused, full-suite, Svelte, Browser desktop/mobile, and MCP validation results separately;
- that SDKs, capture, MCP, Agent Skill, and public API stayed unchanged;
- any unavailable evidence or residual duplicate-on-state-write-failure risk;
- that deployment was not performed and remains gated until `2026-08-15T08:39:25Z`.
- that the later approved rollout is AI分身术 only, followed by the controlled `1 incident / 0 ongoing duplicate / 1 recovery` check and seven-day observation before resolving feedback `oSYMbGhavJYRp6KLp`.

Suggested squash commit message if the user later requests one commit:

```text
Add project health incident emails
```
