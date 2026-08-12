# Project Health Email Alerts Design

> Date: 2026-08-12
>
> Status: 用户已确认方案，待书面规格复核
>
> Feedback: `oSYMbGhavJYRp6KLp` / backlog `TM-ALERT-001`

## Decision

第一版只提供项目负责人邮件通知，并直接复用现有小时健康报告、`attentionItemsForHealth()`、五分钟刷新任务、开发者登录邮箱和 Meteor Email/Mailgun。

不新增 Incident 实体、MongoDB collection、索引、迁移、规则引擎、通知队列或第三方通知渠道。唯一持久化状态是现有 Project 文档上的启用开关和一个服务端内部状态子文档。

## Problem Evidence

- 反馈来自 `AI分身术` 项目的 `server_app / yezi2-server`，属于一个目标项目的直接反馈。
- TraceMind 已能通过 Dashboard 和 MCP 展示 `needs_attention`、高严重度健康项和 delivery health，但负责人必须主动查看。
- 2026-07-20 聚合报告记录 944 个事件、210 个失败事件；前一天为 378 个事件、48 个失败事件。小时报告也显示连续失败高峰。
- 证据足以确认单项目的真实运营缺口，但不足以证明所有客户都需要该能力。因此第一版必须是 opt-in 小范围验证。

## Product Result

启用邮件健康告警后，项目负责人应在已有高严重度健康信号首次出现时收到一封事故邮件，在该健康信号恢复正常后收到一封恢复邮件；异常持续期间不重复发送。

“恢复”只表示 TraceMind 的健康规则不再触发，不证明客户服务、TraceMind 服务或外部网络已经恢复。

## Selected Approach

### Selected: completed-hour health transition email

每五分钟运行的现有健康任务继续生成已结束小时报告。对启用邮件告警的项目，比较最近已结束小时与前一天相同时段，复用 `attentionItemsForHealth()`，并只接受当前已确认的 `event_stream_stopped` 和 `failure_events_increased` 两个 high code。

优点：不引入新指标语义，不重复查询明细事件，不增加实时规则系统，并与 Dashboard/MCP 的现有健康定义保持一致。

代价：告警延迟约 5–65 分钟。这是明确接受的 MVP 边界，不能描述为实时告警。

### Rejected: five-minute rolling incident detector

它能更快通知，但必须新定义滚动窗口、阈值、基线、抖动抑制和恢复语义，并重复扫描事件或新增聚合。因此不采用。

### Rejected: webhook or complete incident platform

Webhook 需要 URL 与密钥配置、签名、超时、重试和投递记录；完整事故平台还需要确认、升级、静默、规则编辑和独立 Incident 生命周期。这些都超出已确认需求。

## Runtime and Surface Matrix

| Runtime / Surface | Impact | Decision |
| --- | --- | --- |
| Web capture | No change | 继续作为现有健康报告的数据源。 |
| iOS / macOS | No change | 现有事件可进入健康报告，不改 SDK。 |
| Android | No change | 现有事件可进入健康报告，不改 SDK。 |
| React Native / Hybrid | No change | 现有事件可进入健康报告，不改 SDK/bridge。 |
| Mini Program / Browser Extension | No change | 现有事件可进入健康报告，不改 SDK。 |
| Server SDKs | No change | 现有业务结果和错误事件继续进入健康报告。 |
| MCP server runtimes / Agent Skill | No change | 不增加工具、事件或公开字段。 |
| Dashboard | Change | 在现有项目设置区域增加 opt-in 邮件告警开关。 |
| Server jobs | Change | 已结束小时报告生成后评估项目级健康状态转换。 |
| Public API / capture contract | No change | 不修改采集、语义事件或 SDK contract。 |

## Data Contract

现有 `Projects` 文档只增加以下字段：

```js
{
  healthAlertEnabled: true,
  healthAlertState: {
    status: 'normal' | 'open',
    evaluatedHourKey: '2026-08-12T08:00:00.000Z',
    openedAt: Date,              // 仅 open 时存在
    codes: ['failure_events_increased'], // 仅 open 时存在
    updatedAt: Date,
  },
}
```

规则：

- `healthAlertEnabled` 缺失等同于 `false`。
- `healthAlertState` 缺失等同于尚未建立基线的 `normal`。
- 关闭开关时 `$unset` `healthAlertState`，不保留历史事故状态。
- `healthAlertEnabled` 可发布给项目所有者；`healthAlertState` 必须保持服务端私有，不进入 publication、Dashboard、MCP、capture 或项目公开投影。
- 不新增索引或历史迁移。

## Evaluation Flow

1. `refreshCompletedHourDraftReports()` 的候选项目由“最近有活动的项目”扩展为“最近有活动的项目 + 已启用邮件告警的项目”。这保证当前小时没有事件时仍能评估 `event_stream_stopped`。
2. 现有逻辑继续物化最近已结束小时以及前一天相同时段的 `ProjectHourlyReports`。
3. 报告持久化成功后，独立调用邮件告警评估器；邮件逻辑失败不得回滚或阻塞健康报告。
4. 评估器读取当前小时和前一天相同时段。任一报告缺失时标记为证据不可用，不发送事故或恢复邮件，也不改变现有状态。
5. 调用现有 `attentionItemsForHealth(current, previous, hourEndAt, { comparisonWindow: 'completed_hours' })`，只保留 `severity === 'high'` 且 code 属于固定 allowlist `event_stream_stopped` / `failure_events_increased` 的项目。未来新增 high rule 不会自动开始发邮件，必须单独评审后加入 allowlist。
6. 同一个 `evaluatedHourKey` 已处理时直接返回。

状态转换：

| Previous | Current high items | Action |
| --- | --- | --- |
| no baseline / normal | none | 保存 normal 基线，不发邮件。 |
| no baseline / normal | one or more | 发送一封事故邮件；成功后保存 open 状态。 |
| open | one or more | 保持 open，只推进 `evaluatedHourKey`，不重复通知。 |
| open | none | 发送一封健康信号恢复邮件；成功后保存 normal 状态。 |

项目级 open 状态是第一版的天然冷却机制：异常持续期间即使高严重度 code 变化也不发送更新或第二起事故。只有先恢复到 normal，未来再次出现 high 才会发送新的事故邮件。

## Email Contract

收件人直接使用 Project 对应 `Developer.email`，不增加收件人字段。发件基础设施复用现有 Meteor Email、Mailgun `MAIL_URL` 和 TraceMind 发件地址。

事故主题：`[TraceMind] <project> 需要关注`

恢复主题：`[TraceMind] <project> 健康信号已恢复`

第一版只发送纯文本邮件，内容限定为：

- 项目名；
- 事故或恢复状态；
- 已结束小时的时间范围和 `Asia/Shanghai` 时区；
- high 规则 code 和 severity；
- 当前/对比小时的事件数与失败事件数；
- TraceMind Dashboard 根链接。

禁止包含原始错误、错误 message/stack、事件明细、Prompt、用户内容、用户/设备/session ID、请求响应、header/cookie/token、source code/diff 或带 query string 的 URL。

## Delivery and Failure Semantics

- 邮件发送成功后才更新 `healthAlertState`；发送失败时状态不变，下一次五分钟任务重试。
- `openedAt` 使用触发事故的已结束小时终点，不使用邮件实际发送时间。
- 邮件异常必须被独立捕获并写入脱敏 server log，不能使健康报告任务失败。
- 普通成功路径保证同一状态转换只发送一次。
- SMTP 已发送但随后数据库状态写入失败时，下一次任务可能重复发送。第一版明确接受这个极小窗口；为消除它而新增消息队列或投递实体不符合当前 KISS 边界。
- 当前生产单实例任务不增加分布式锁。未来只有在多实例部署出现重复证据后才设计 claim/lease。

## Dashboard Interaction

在现有项目 setup details 中增加一个普通设置行，不新增卡片或弹窗：

- Label：`邮件健康告警`
- Description：`每个已结束小时检查高严重度健康信号，并发送到当前项目负责人邮箱。`
- Control：单个 checkbox/switch，默认关闭。

保存调用一个 owner-only Meteor method：

```text
tracemind.project.healthAlert.setEnabled(projectId, enabled)
```

启用前复用现有项目 ownership 和 Developer email 校验。方法只返回包含公开布尔开关的 Project 投影；内部状态不返回。控件复用现有紧凑表单、Sage Border 和 Signal Teal 状态，保持至少 44px 的移动端触控目标，不新增页面、嵌套卡片或视觉层级。

## Module Boundaries

- `server/health_alerts.js`: 小型独立模块，负责纯状态转换、隐私安全邮件构造、发送和状态保存。邮件 transport 可注入以便测试。
- `server/daily_reports.js`: 只负责把启用项目纳入小时报告候选，并在报告成功后调用告警模块。
- `server/tracemind_methods.js`: owner-only 开关方法。
- `server/tracemind_publications.js`、`imports/api/tracemind.js`: 只公开 `healthAlertEnabled`，不公开内部状态。
- `imports/ui/App.svelte`、`imports/ui/ProjectSetupPanel.svelte` 和 locale：绑定现有项目设置中的开关；不新增 CSS 时优先复用现有样式。
- `tests/main.js`: 覆盖状态转换、任务隔离、授权和公开边界。
- 文档：更新 `docs/product_backlog.md`、`docs/implementation_progress.md` 和 `docs/auth_token_design.md` 中的邮件用途说明；`docs/deployment.md`、SDK/MCP 文档和 release guidance 不改，因为没有新增配置或公开 contract。

新增 `server/health_alerts.js` 不代表新增领域实体。该模块用于把可失败的邮件副作用与健康报告生成隔离，避免继续扩大 `server/daily_reports.js` 的职责。

## Verification

### Focused tests

1. 开关默认为 false，只有 owner 能修改。
2. publication/public Project 只包含 `healthAlertEnabled`，绝不包含 `healthAlertState`。
3. 启用但无近期活动的项目仍生成可比较的已结束小时报告。
4. normal -> high 发送一封事故邮件并保存 open。
5. 同一小时重复刷新和后续持续 high 均不重复发送。
6. open -> normal 只发送一封“健康信号恢复”邮件。
7. 当前或对比报告缺失时不误报恢复。
8. 邮件发送失败不影响健康报告，状态保持不变，下一轮可以重试。
9. 关闭开关不发送并清除内部状态。
10. 邮件 payload 和公开投影不包含禁止字段。

### Broader verification

- `git diff --check`
- `npm test`，包括 release metadata、SDK manifest、deploy gates、lint 和 Meteor tests
- 本地 Dashboard 桌面与移动宽度检查：开关可见、可操作、状态明确，不破坏现有 setup details 布局
- TraceMind instrumentation diff validation；本次不应出现新增 capture event

## Rollout and Product Validation

1. 实现和本地验证可以独立进行；部署不得干扰 Web retry idempotency 的 72 小时观察窗口。
2. 发布后先只在 `AI分身术` 项目启用。
3. 完成一次受控 high、一次持续 high 和一次恢复检查，确认分别为 1 封事故、0 封重复、1 封恢复邮件。
4. 继续观察 7 天，由项目负责人确认邮件是否及时、有用且没有明显噪声。没有依据时不设虚构的点击率或响应时间目标。
5. 只有端到端验证和观察均通过后，才将 `oSYMbGhavJYRp6KLp` 标记 resolved；否则保持 opt-in，并根据证据调整或停止。

回滚只需关闭项目开关或回滚 server/UI 版本。因为没有新 collection、索引或迁移，不需要数据回滚。

## Explicit Non-goals

- 自定义规则、阈值或通知频率；
- acknowledgement、assignee、escalation、silence、maintenance window；
- Webhook、Slack、飞书、企业微信、短信或多收件人；
- TraceMind 自身宕机、DNS、Galaxy、MongoDB 或互联网连通性监控；
- 事故历史页面、投递历史、SLA 或实时告警承诺；
- SDK、MCP、Agent Skill、capture payload 或 Semantic Event contract 变更。
