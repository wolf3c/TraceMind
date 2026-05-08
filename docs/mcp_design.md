# Remote MCP Design

## 目标

让 LLM / AI Coding Agent 通过远程 MCP 分析 TraceMind 已抽取的产品行为语义。MCP 不是采集目标，而是让开发者在 Codex、Claude Code、Cursor 等工具里直接追问用户流失、功能使用和转化问题的只读入口：默认查询语义事件，需要复核时再查询原始日志。

## Endpoint

```text
GET /mcp?mcpToken=MCP_TOKEN
POST /mcp?mcpToken=MCP_TOKEN
```

推荐使用 Bearer 方式，避免 token 出现在 URL 日志里：

```text
Authorization: Bearer MCP_TOKEN
```

`MCP_TOKEN` 是独立的只读 MCP 凭证，格式为 `tm_mcp_xxx`。它不同于 Auto Capture 使用的公开 `projectKey`，项目 key 不能访问 MCP。

## 多项目识别

一个 MCP token 只绑定一个 TraceMind 项目。多项目使用同一个 coding agent 时，MCP server 配置名使用短稳定 ASCII 名称，例如 `tracemind-a8f3k2`，由项目 `_id` 归一化后取后 6 位生成，不从项目显示名生成。项目名可以是中文或包含空格，但只出现在 MCP metadata 和安装提示词里。

项目归属由 MCP 自描述提供，而不是依赖 agent rules 中的静态映射：

- `initialize.instructions` 在 token 可解析时说明当前 MCP 绑定的项目名和建议 server name。
- `tools/list` 的每个 tool `title` / `description` 都包含当前项目显示名。
- `tracemind.project_info` 返回当前 MCP 绑定的 `{ projectId, projectName, mcpServerName }`，不返回 MCP token 或项目 key。

Agent 看到多个 `tracemind-*` TraceMind MCP server 时，应先读取 tools 描述或调用 `tracemind.project_info` 确认项目，不要只凭 server name 猜。

## Transport

端点实现最小 Streamable HTTP JSON-RPC MCP 表面，协议版本为 `2025-06-18`，兼容 `2025-03-26`：

- `POST /mcp?mcpToken=...` 接收 JSON-RPC 消息。
- `initialize` 返回 server capabilities 和 tools 能力。
- `notifications/initialized` 返回 HTTP `202`。
- `ping` 返回空结果。
- `tools/list` 返回 TraceMind 工具列表。
- `tools/call` 调用 TraceMind 工具。
- `GET /mcp?mcpToken=...` 保留为人工调试 JSON preview。

## Tools

### `tracemind.event_definitions`

返回事件含义说明表，帮助 LLM 决定应该查询哪个 `eventType` 或 `eventName`。

Input:

```json
{}
```

### `tracemind.summary`

汇总语义事件，返回总事件数、事件分布、路径分布、去重用户数、去重设备数和 DAU。

Input:

```json
{
  "limit": 200,
  "startAt": "2026-05-01T00:00:00.000Z",
  "endAt": "2026-05-06T23:59:59.999Z",
  "eventType": "custom",
  "eventName": "checkout_started",
  "userId": "user-123",
  "sessionId": "tm_sess_xxx",
  "deviceId": "tm_dev_xxx"
}
```

### `tracemind.query_events`

查询语义事件。LLM 做产品分析时应该优先使用这个工具，因为它返回的是已经抽取过的业务可读事件。

Input:

```json
{
  "limit": 50,
  "startAt": "2026-05-01T00:00:00.000Z",
  "endAt": "2026-05-06T23:59:59.999Z",
  "eventType": "click",
  "eventName": "plan_selected",
  "userId": "user-123",
  "anonymousId": "tm_anon_xxx",
  "sessionId": "tm_sess_xxx",
  "deviceId": "tm_dev_xxx",
  "targetHash": "tm_fp_xxx",
  "path": "/pricing"
}
```

返回字段包含 `userId`、`anonymousId`、`sessionId`、`deviceId`、`deviceFingerprint`、`platform`、`deviceInfo`、`ip`、`geo`、`sourceType`、`sourceKey`、`sourceLabel`、`sourceDetails`、`eventType`、`eventName`、`meaning`、`target`、`targetHash`、`properties`、`context` 和 `rawBehaviorId`。

### `tracemind.query_raw_behaviors`

查询原始行为日志。只有在需要复核语义事件背后的原始采集数据时使用。

Input:

```json
{
  "limit": 50,
  "startAt": "2026-05-01T00:00:00.000Z",
  "endAt": "2026-05-06T23:59:59.999Z",
  "eventType": "click",
  "eventName": "plan_selected",
  "userId": "user-123",
  "anonymousId": "tm_anon_xxx",
  "sessionId": "tm_sess_xxx",
  "deviceId": "tm_dev_xxx",
  "targetHash": "tm_fp_xxx",
  "path": "/pricing"
}
```

### `tracemind.agent_guidance`

返回当前 coding agent guidance 版本、公开 skill/rules/manifest 路径和推荐埋点工作流。Agent 在添加或修改 TraceMind 埋点前应先调用它，发现本地 skill 过期时先请求用户确认再更新。

Input:

```json
{}
```

### `tracemind.project_info`

返回当前 MCP server 绑定的 TraceMind 项目身份，供多项目场景下确认项目归属。

Input:

```json
{}
```

Output:

```json
{
  "projectId": "abc123",
  "projectName": "我的 Web App",
  "mcpServerName": "tracemind-abc123"
}
```

### `tracemind.capture_setup`

返回当前项目的 Auto Capture 公开项目 key、指定平台的一行接入代码和安全说明。Coding agent 应先调用它获取当前项目 key；Web 项目验证 `/capture.js` 和 `data-tracemind-token`，Native 项目使用返回的 SDK 初始化代码。返回的 `projectKey` 只能用于 Auto Capture 写入，不能替代 MCP token。

Input:

```json
{
  "platform": "web"
}
```

`platform` 可省略，默认 `web`；也可传 `ios`、`android` 或 `react_native`。

Output:

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "web",
  "eventPlatform": "web",
  "captureScriptUrl": "https://tracemind.example.com/capture.js",
  "captureSnippet": "<script src=\"https://tracemind.example.com/capture.js\" data-tracemind-token=\"tm_proj_xxx\" async></script>",
  "initSnippet": "<script src=\"https://tracemind.example.com/capture.js\" data-tracemind-token=\"tm_proj_xxx\" async></script>",
  "tokenType": "public_auto_capture_project_key"
}
```

Native 示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "ios",
  "eventPlatform": "ios",
  "install": "Add the TraceMind Swift Package from sdk/ios, then import TraceMind in your App entrypoint.",
  "initSnippet": "TraceMind.start(projectKey: \"tm_proj_xxx\")",
  "tokenType": "public_auto_capture_project_key"
}
```

### `tracemind.search_event_names`

搜索内置事件定义和当前项目已出现的自定义事件，帮助 coding agent 复用事件名，避免随意发明新的 `eventName`。

Input:

```json
{
  "query": "checkout",
  "limit": 20
}
```

### `tracemind.suggest_instrumentation`

根据业务意图、代码上下文摘要和平台，建议复用已有事件、跳过手动埋点，或创建 draft custom event proposal。

Input:

```json
{
  "intent": "user starts checkout",
  "context": "pricing page checkout button handler",
  "platform": "web"
}
```

### `tracemind.validate_event_payload`

校验单个事件 payload 的 `eventType`、`eventName`、`properties` 和 `context`，返回命名、字段和隐私风险 findings。

Input:

```json
{
  "eventType": "custom",
  "eventName": "checkout_started",
  "properties": {
    "plan": "pro"
  },
  "context": {
    "source": "manual"
  }
}
```

### `tracemind.validate_instrumentation_diff`

检查本次代码 diff 是否包含明显错误的埋点调用、敏感字段、命名问题或绕过 TraceMind 规范的调用。它只返回 findings，不修改代码。

Input:

```json
{
  "diff": "git diff text"
}
```

### `tracemind.privacy_check`

检查字段名和值样例是否疑似 PII、secret、token、raw prompt、raw user content 或完整 query URL。

Input:

```json
{
  "fields": {
    "plan": "pro",
    "userId": "user-123"
  }
}
```

## 推荐 LLM 查询顺序

1. 调用 `tracemind.event_definitions` 理解事件含义和字段。
2. 调用 `tracemind.summary` 获取时间窗口内的概览和 DAU/设备数。
3. 调用 `tracemind.query_events` 按 `eventName`、`eventType`、`userId`、`path`、`targetHash` 等维度下钻。
4. 只有当语义事件含义不够或需要排查采集问题时，调用 `tracemind.query_raw_behaviors`。

当同一页面存在多个相同文案的按钮或输入框时，不要只按 `targetText` 判断。先查看事件里的 `target.path`、`target.id`、`target.name`、`target.testId`，再用 `targetHash` 精确查询同一元素。

## 推荐 Coding Agent 埋点顺序

1. 调用 `tracemind.agent_guidance` 检查 guidance 版本。
2. 调用 `tracemind.search_event_names` 搜索可复用事件。
3. 必要时调用 `tracemind.suggest_instrumentation` 获取复用或 draft 建议。
4. 修改代码前后使用 `tracemind.validate_event_payload` 或 `tracemind.privacy_check` 复核字段。
5. 完成前调用 `tracemind.validate_instrumentation_diff` 校验本次 diff。

## GET Preview Response

```json
{
  "protocol": "tracemind-mcp-preview",
  "tools": [
    { "name": "tracemind.event_definitions" },
    { "name": "tracemind.summary" },
    { "name": "tracemind.query_events" },
    { "name": "tracemind.query_raw_behaviors" }
  ],
  "summary": {
    "totalEvents": 12,
    "uniqueUsers": 4,
    "uniqueDevices": 5,
    "dailyActiveUsers": [{ "date": "2026-05-06", "count": 4 }],
    "topEvents": [{ "eventType": "click", "count": 7 }],
    "topPaths": [{ "path": "/pricing", "count": 5 }]
  },
  "eventDefinitions": [],
  "recentEvents": []
}
```

## MVP 决策

- MCP 端点只读。
- LLM 默认从语义事件开始分析，但可以显式查询原始行为日志。
- MCP 使用独立 token，可以在控制台新增、重命名、刷新或删除；刷新/删除后旧 token 立即失效。
- MCP token 可以通过 `mcpToken` URL 参数或 `Authorization: Bearer` 传入，推荐 Bearer。
- 多项目 MCP 配置使用短稳定 server name，项目名通过 MCP metadata 和 `tracemind.project_info` 暴露。
- Auto Capture 的项目 key 只用于采集写入，不能访问 MCP。
- 暂不实现 resources、prompts、SSE streaming、OAuth discovery 或多成员项目权限。
