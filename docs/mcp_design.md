# Remote MCP Design

## 目标

让 LLM / AI Coding Agent 可以通过远程 MCP 查询 TraceMind 采集到的产品行为数据：先查事件含义说明表，再按时间、事件名、用户、Session、设备、路径等维度查询语义事件；需要复核时再查询原始日志。

## Endpoint

```text
GET /mcp?projectKey=PROJECT_KEY
POST /mcp?projectKey=PROJECT_KEY
```

也可以使用：

```text
Authorization: Bearer PROJECT_KEY
```

## Transport

端点实现最小 Streamable HTTP JSON-RPC MCP 表面，协议版本为 `2025-06-18`，兼容 `2025-03-26`：

- `POST /mcp?projectKey=...` 接收 JSON-RPC 消息。
- `initialize` 返回 server capabilities 和 tools 能力。
- `notifications/initialized` 返回 HTTP `202`。
- `ping` 返回空结果。
- `tools/list` 返回 TraceMind 工具列表。
- `tools/call` 调用 TraceMind 工具。
- `GET /mcp?projectKey=...` 保留为人工调试 JSON preview。

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
  "path": "/pricing"
}
```

返回字段包含 `userId`、`anonymousId`、`sessionId`、`deviceId`、`deviceFingerprint`、`platform`、`deviceInfo`、`ip`、`geo`、`eventType`、`eventName`、`meaning`、`properties`、`context` 和 `rawBehaviorId`。

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
  "path": "/pricing"
}
```

## 推荐 LLM 查询顺序

1. 调用 `tracemind.event_definitions` 理解事件含义和字段。
2. 调用 `tracemind.summary` 获取时间窗口内的概览和 DAU/设备数。
3. 调用 `tracemind.query_events` 按 `eventName`、`eventType`、`userId`、`path` 等维度下钻。
4. 只有当语义事件含义不够或需要排查采集问题时，调用 `tracemind.query_raw_behaviors`。

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
- 项目 key 可以通过 URL 或 `Authorization: Bearer` 传入。
- 暂不实现 resources、prompts、SSE streaming、OAuth discovery 或多成员项目权限。
