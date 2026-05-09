# Remote MCP Design

## 目标

让 LLM / AI Coding Agent 通过远程 MCP 分析 TraceMind 已抽取的产品行为语义。TraceMind 自己的远程 MCP 端点不是采集目标，而是只读分析入口；第三方 MCP server 若要分析自身 tool/resource/prompt 运行情况，应通过 `mcp_node` 或 `mcp_python` SDK 使用公开 `projectKey` 写入 `/api/capture`；普通后端服务第一版通过 `server_node`、`server_python` 或 `server_http` 添加手动业务埋点，不做 request Auto Capture。开发者可以在 Codex、Claude Code、Cursor 等工具里直接追问用户流失、功能使用和转化问题：默认查询语义事件，需要复核时再查询原始日志。

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

安装到用户项目时，动态 install prompt 会把非敏感绑定信息写入项目级 `AGENTS.md`、`CLAUDE.md` 或 rules 文件：项目显示名、`projectId` 和 expected MCP server name。Agent 看到多个 `tracemind-*` TraceMind MCP server 时，必须先使用 expected server 调用 `tracemind.project_info`，并只在返回的 `projectId` 与项目级规则匹配时继续；不匹配时停止并要求用户配置正确 MCP，不要只凭 server name 猜。

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

汇总语义事件，返回总事件数、事件分布、路径分布、去重用户数、去重设备数和 DAU。返回值也包含 `presence`，用于分析当前在线用户、在线 session、最近在线、总在线时长、平均 session 时长，以及按 path/source 聚合的停留时长。Presence 来自 `/api/presence` 和 `tracemind_presence_sessions`，不是 semantic event。

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

返回当前项目的 Auto Capture 公开项目 key、指定平台的一行接入代码、结构化安装指南和安全说明。Coding agent 应先调用它获取当前项目 key；Web 项目验证 `/capture.js` 和 `data-tracemind-token`，Native 项目使用返回的 SDK 安装步骤和初始化代码。返回的 `projectKey` 只能用于 Auto Capture 写入，不能替代 MCP token。

Input:

```json
{
  "platform": "web"
}
```

`platform` 可省略，默认 `web`；也可传 `ios`、`android`、`react_native`、`mcp_node`、`mcp_python`、`agent_skill`、`server_node`、`server_python` 或 `server_http`。

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
  "installCommands": [
    "No package install is required. Add captureSnippet to the global HTML head or root document layout."
  ],
  "filesToEdit": [
    "main HTML file, root layout, app.html, _document, or equivalent global document entry"
  ],
  "initLocation": "Global document head or root layout loaded on every page.",
  "idempotencyChecks": [
    "Search for /capture.js",
    "Search for data-tracemind-token"
  ],
  "verificationCommands": [
    "Run the web app, trigger a page load/click/input/submit, then query TraceMind raw behaviors or semantic events."
  ],
  "identifySnippet": "window.TraceMind.identify(\"user_123\", { plan: \"pro\" })",
  "manualCaptureExamples": [
    "window.TraceMind.capture(\"custom\", { eventName: approvedEventName, properties: { plan: \"pro\", amount: 29, trial: true }, context: { source: \"pricing\" } })"
  ],
  "supportedPropertyTypes": ["string", "number", "boolean"],
  "manualCaptureWorkflow": [
    "Call tracemind.search_event_names before adding a custom event name.",
    "Call tracemind.validate_event_payload with the approved event name and sanitized primitive properties before coding.",
    "Run tracemind.validate_instrumentation_diff before finishing instrumentation changes."
  ],
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
  "installCommands": [
    "Add the TraceMind Swift Package from the TraceMind SDK distribution; in this repo the package is sdk/ios.",
    "Import TraceMind in App.swift, AppDelegate.swift, or the app startup file that owns launch."
  ],
  "filesToEdit": [
    "Package.swift or the Xcode Swift Package dependency list",
    "App.swift",
    "AppDelegate.swift"
  ],
  "initLocation": "Run once during app startup, before the first user screen is shown.",
  "idempotencyChecks": [
    "Search the app for TraceMind.start("
  ],
  "initSnippet": "TraceMind.start(projectKey: \"tm_proj_xxx\")",
  "identifySnippet": "try? TraceMind.identify(\"user_123\", traits: [\"plan\": \"pro\"])",
  "manualCaptureExamples": [
    "try? TraceMind.capture(\"custom\", eventName: approvedEventName, path: \"CheckoutViewController\", properties: [\"plan\": \"pro\", \"amount\": 29, \"trial\": true], context: [\"source\": \"pricing\"])"
  ],
  "supportedPropertyTypes": ["string", "number", "boolean"],
  "verificationCommands": [
    "swift test --package-path sdk/ios"
  ],
  "tokenType": "public_auto_capture_project_key"
}
```

Native 和 React Native 返回还包含：

- `autoCapturedSignals`: app/session start、screen/page view、tap/click、input changed、submit 等自动采集口径。
- `privacyConstraints`: 不采集输入值、截图、DOM/native snapshot、session replay、secret、token、raw prompt、raw user content 或完整 query URL。
- `sourceModel`: iOS 使用 bundle id，Android 使用 package name，React Native 保持 `platform` 为 `ios` 或 `android` 并标记 `react_native` framework。
- `identifySnippet`: 登录成功后绑定稳定业务 `userId` 的示例。
- `manualCaptureExamples`: 自动采集无法稳定表达业务结果时才使用的 `custom` 示例。
- `supportedPropertyTypes`: 手动 `properties` / `context` 支持的值类型，目前为 string、number、boolean。
- `manualCaptureWorkflow`: agent 添加手动埋点前必须执行的搜索、校验和 diff validation 流程。

MCP server 示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "mcp_node",
  "eventPlatform": "server",
  "installCommands": [
    "Install @tracemind/mcp-node from the TraceMind SDK distribution; in this repo the package is sdk/mcp-node.",
    "Import TraceMindMCP in the MCP server entrypoint."
  ],
  "initSnippet": "import { TraceMindMCP } from \"@tracemind/mcp-node\";\n\nTraceMindMCP.start(server, {\n  projectKey: \"tm_proj_xxx\",\n  sourceKey: \"docs-mcp\"\n});",
  "autoCapturedSignals": [
    "MCP server/session start",
    "MCP tool call completed",
    "MCP resource read completed",
    "MCP prompt request completed"
  ],
  "sourceModel": "platform is server; sourceType is mcp_server; sourceKey is the configured MCP server/package name.",
  "privacyConstraints": [
    "Do not capture raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs."
  ]
}
```

Agent Skill setup 返回 host runtime hook 指南。静态 Skill 文件不能 auto-capture；只有宿主 agent runtime 提供可执行 lifecycle hook 时，才能记录 `skill_lifecycle`。

普通服务端应用示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "server_node",
  "eventPlatform": "server",
  "installCommands": [
    "Install @tracemind/server-node from the TraceMind SDK distribution; in this repo the package is sdk/server-node.",
    "Import TraceMindServer in the backend entrypoint or instrumentation module."
  ],
  "initSnippet": "import { TraceMindServer } from \"@tracemind/server-node\";\n\nTraceMindServer.start({\n  projectKey: \"tm_proj_xxx\",\n  sourceKey: \"billing-api\"\n});",
  "autoCapturedSignals": [],
  "sourceModel": "platform is server; sourceType is server_app; sourceKey is the configured backend service name.",
  "manualCaptureExamples": [
    "TraceMindServer.capture(\"custom\", { eventName: approvedEventName, userId: \"user_123\", properties: { amount: 2900, success: true }, context: { source: \"stripe_webhook\" } })"
  ],
  "privacyConstraints": [
    "Do not capture request body, response body, headers, cookies, authorization values, secrets, tokens, raw prompts, raw user content, or full query URLs."
  ]
}
```

`server_http` 返回同样语义的 `payloadTemplate`，供 Java、Go、Ruby、PHP 等没有一方 SDK 的后端通过 HTTPS 直接写入 `/api/capture`。这些服务端平台是 manual capture only：coding agent 必须先搜索和校验 event name，再把埋点放在支付成功、账单已付、工作区创建、任务完成、同步完成等稳定业务结果处。

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
2. 调用 `tracemind.summary` 获取时间窗口内的概览、DAU/设备数和 presence 在线时长。
3. 调用 `tracemind.query_events` 按 `eventName`、`eventType`、`userId`、`path`、`targetHash` 等维度下钻。
4. 只有当语义事件含义不够或需要排查采集问题时，调用 `tracemind.query_raw_behaviors`。

当同一页面存在多个相同文案的按钮或输入框时，不要只按 `targetText` 判断。先查看事件里的 `target.path`、`target.id`、`target.name`、`target.testId`，再用 `targetHash` 精确查询同一元素。

## 推荐 Coding Agent 埋点顺序

1. 调用 `tracemind.agent_guidance` 检查 guidance 版本。
2. 调用 `tracemind.capture_setup` 获取目标平台接入方式；MCP server 使用 `mcp_node` 或 `mcp_python`，Agent Skill 使用 `agent_skill`。
3. 调用 `tracemind.search_event_names` 搜索可复用事件。
4. 必要时调用 `tracemind.suggest_instrumentation` 获取复用、Auto Capture 或 draft 建议。
5. 修改代码前后使用 `tracemind.validate_event_payload` 或 `tracemind.privacy_check` 复核字段。
6. 完成前调用 `tracemind.validate_instrumentation_diff` 校验本次 diff。

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
- 多项目 MCP 配置使用短稳定 server name，项目名通过 MCP metadata 和 `tracemind.project_info` 暴露；项目级 agent rules 记录 expected `projectId` 和 MCP server name 作为使用前校验契约。
- Auto Capture 的项目 key 只用于采集写入，不能访问 MCP。
- 暂不实现 resources、prompts、SSE streaming、OAuth discovery 或多成员项目权限。
