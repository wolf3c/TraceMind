# Semantic Event Design

## 目标

把 Web、iOS、Android、MCP server、Agent Skill hook 和服务端上报的原始行为统一抽取为稳定的语义事件，让 LLM/MCP 能直接按业务含义、时间、用户、设备、路径等维度查询分析。

## 当前链路

1. `/api/capture` 写入 `tracemind_raw_behaviors`，状态为 `semanticStatus: "pending"`。
2. `startSemanticExtractionJob()` 每 30 秒处理 pending 原始行为。
3. `buildSemanticEvent()` 对每条原始行为生成一条语义事件。
4. 原始行为标记为 `processed`，并保存 `semanticEventId`，方便从语义事件回溯原始日志。

## 语义事件字段

```json
{
  "projectId": "project-id",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "userId": "user-123",
  "deviceId": "tm_dev_xxx",
  "deviceFingerprint": "tm_fp_xxx",
  "platform": "web",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0",
    "language": "zh-CN",
    "platform": "MacIntel",
    "timezone": "Asia/Shanghai"
  },
  "ip": "203.0.113.10",
  "geo": {
    "country": "US",
    "region": "CA",
    "city": "San Francisco",
    "source": "headers"
  },
  "sourceType": "web",
  "sourceKey": "app.example.com",
  "sourceLabel": "app.example.com",
  "sourceDetails": {
    "origin": "https://app.example.com",
    "path": "/pricing",
    "referrer": "https://google.com/search?q=app"
  },
  "rawBehaviorId": "raw-id",
  "eventType": "custom",
  "eventName": "checkout_started",
  "title": "checkout_started",
  "meaning": "用户在 /pricing 触发了 checkout_started 行为。",
  "path": "/pricing",
  "targetText": "Start trial",
  "targetTag": "BUTTON",
  "target": {
    "tag": "BUTTON",
    "text": "Start trial",
    "id": "start-trial",
    "role": "button",
    "path": "main:nth-of-type(1)>section:nth-of-type(2)>button#start-trial"
  },
  "targetHash": "tm_fp_xxx",
  "properties": {
    "plan": "pro",
    "amount": 29
  },
  "context": {
    "source": "manual"
  },
  "occurredAt": "2026-05-06T10:00:00.000Z"
}
```

## 身份与指标口径

- `userId` 是业务系统识别出的登录用户 ID，用于 DAU、留存、转化和用户路径分析。
- `anonymousId` 是 TraceMind 为未登录访客生成的匿名 ID；当 `userId` 缺失时，用它作为临时用户口径。
- `sessionId` 表示一次访问会话，适合分析单次访问路径。
- `deviceId` 是本地持久设备 ID，和 `sessionId` 一起用于跨 session 识别同一设备。
- `deviceFingerprint` 是基于稳定设备信息计算的轻量指纹，只作为辅助去重字段，不替代登录用户 ID。
- DAU 口径使用 `userId || anonymousId` 按自然日去重。
- Web、iOS、Android 和 React Native 都支持 `identify`。Native SDK 会把 `userId` 持久化到本地身份存储，并让后续自动采集和手动 `custom` 事件带上同一个 `userId`。

## 设备、IP 与地理信息

- Web 自动采集会发送 `deviceInfo`，包括 UA、语言、平台、时区、屏幕、viewport、硬件并发、内存和 referrer。
- iOS/Android 自动采集会发送平台、系统、框架、bundle id/package name、app label 和 SDK 框架来源；React Native 保持原生 `platform`，并用 `deviceInfo.framework` 或 `sourceDetails.framework` 标记 `react_native`。
- 设备指纹只使用较稳定字段，避免 viewport/referrer 变化导致同一设备被频繁重算。
- 服务端通过请求头采集 IP，包括 `x-forwarded-for`、`cf-connecting-ip`、`x-real-ip` 和 socket 地址。
- 地理信息使用无感请求头来源，例如 Cloudflare、Vercel、CloudFront、App Engine 注入的国家、地区、城市字段；后续可接入 IP geo 数据库，但不需要改变事件表结构。

## 自定义字段

- `eventName` 表达具体业务事件名，例如 `checkout_started`、`plan_selected`、`invite_sent`。
- `properties` 保存事件自身属性，例如金额、套餐、按钮位置、实验分组。
- `context` 保存上报上下文，例如 `source: "server"`、trace id、feature flag、入口渠道。
- Web、Native、React Native、MCP server、Agent Skill runtime 和服务端埋点都使用同一字段，后续扩展不用修改表结构。SDK 只保留 string、number、boolean 类型，省略 null、嵌套对象、数组、PII-like 字段、credential values、raw prompt/content、input value、tool arguments/result、resource content 和带 query 的完整 URL。

## 手动埋点与 Coding Agent 规则

- Coding agent 添加或修改手动埋点前，应通过 MCP 搜索当前项目已有事件，优先复用业务含义匹配的 `eventName`。
- 自动采集已经能稳定覆盖的页面浏览、点击、输入、表单提交和路由跳转，不需要重复添加手动埋点。
- 手动 `custom` 事件适合表达自动采集无法稳定推断的业务结果，例如 `checkout_started`、`subscription_created`、`invite_sent`。
- 对 Native 和 React Native，agent 应优先使用 `capture_setup` 返回的 `identifySnippet` 和 `manualCaptureExamples`，并确认 `supportedPropertyTypes` 后再写代码。
- 如果没有匹配事件，agent 只能生成 draft custom event proposal，并让用户确认后再当作正式事件使用。
- `eventName` 使用 lower snake_case，例如 `checkout_started`。
- 禁止在 `properties` 或 `context` 中上报 email、phone、secret、access token、API key、raw prompt、raw user content 或带 query string 的完整 URL。

## 元素定位

- `targetText` 和 `targetTag` 只适合做人类阅读摘要，不能作为唯一定位依据。
- `target` 保存元素摘要，包括 tag、id、class、name、type、role、aria-label、placeholder、testId 和短 DOM path。
- `targetHash` 基于 `target` 计算，用于区分同一个页面上的相同文案按钮、多个输入框或重复列表项操作。
- 对于长期稳定的关键漏斗，优先推荐开发者手动上报明确 `eventName`，自动 `targetHash` 主要用于自动采集和问题复核。

## 事件含义说明表

| eventType | 名称 | 含义 | 常见字段 | 平台 |
| --- | --- | --- | --- | --- |
| `page_view` | 页面浏览 | 用户打开或刷新页面，或进入 Native screen/activity/controller，用于分析访问量、落地页、路径入口和页面级留存。 | `title`, `path`, `referrer` | Web, iOS, Android, Server |
| `click` | 元素点击 | 用户点击 Web 元素或 Native 控件，用于分析功能入口、按钮转化和交互兴趣。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `input` | 输入变化 | 用户修改输入控件，用于分析表单填写、设置修改和关键流程参与度；不保存输入值。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `submit` | 表单提交 | 用户提交表单、点击确认或触发 Native keyboard done/search/send，用于分析注册、支付、创建、搜索等转化节点。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `route_change` | 页面跳转 | 用户在 Web SPA 或 Native app 内发生页面切换，用于分析路径流转、漏斗顺序和页面间跳转。 | `path`, `referrer` | Web, iOS, Android |
| `api_call` | 接口调用 | 客户端或服务端记录接口调用，用于分析接口失败、关键后端流程和服务端埋点。 | `method`, `status`, `path` | Web, iOS, Android, Server |
| `tool_call` | MCP 工具调用 | MCP server 记录工具调用完成情况，用于分析工具使用量、失败率和耗时。 | `toolName`, `status`, `durationMs`, `errorType`, `resultSizeBucket` | Server |
| `resource_read` | MCP 资源读取 | MCP server 记录资源读取完成情况，用于分析资源访问、失败率和耗时。 | `resourceName`, `uriScheme`, `uriTemplateHash`, `status`, `durationMs` | Server |
| `prompt_request` | MCP Prompt 请求 | MCP server 记录 prompt 请求完成情况，用于分析 prompt 使用、失败率和耗时。 | `promptName`, `status`, `durationMs` | Server |
| `skill_lifecycle` | Agent Skill 生命周期 | 宿主 agent runtime 记录 Skill started/completed/failed 等生命周期信号。 | `skillName`, `version`, `phase`, `success`, `durationMs` | Server |
| `custom` | 自定义事件 | 开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。 | `eventName`, `properties`, `context` | Web, iOS, Android, Server |

这张表同时暴露给 MCP 的 `tracemind.event_definitions`，用于帮助 LLM 判断应该查询哪个事件。

## 跨平台扩展原则

- 表结构保持平台无关：`platform` 区分 `web`、`ios`、`android`、`server`，平台差异写入 `deviceInfo`、`sourceDetails`、`properties` 和 `context`。
- 来源使用 `sourceType + sourceKey`，避免把 Web-only 的 `hostname` 做成通用字段名。Web 优先使用请求 `Origin` / `Referer` 归一化来源；iOS 使用 bundle id；Android 使用 package name；MCP server 使用 server/package 名；Agent Skill 使用 Skill 名或宿主 runtime skill id。
- 自动采集字段和手动埋点字段共用同一事件模型，避免未来增加移动端 SDK 时迁移 Mongo 集合。
- 移动端可复用 `sessionId`、`anonymousId`、`userId`、`deviceId`、`deviceFingerprint`、`sourceType`、`sourceKey`、`eventType`、`eventName`、`properties`、`context`。
- 移动端 `target` 统一保存 class/type、accessibility id、resource id、test id、label 摘要、screen 和短层级 path；`targetHash` 仍使用 `tm_target_` 前缀。
- MCP server 自动事件使用 `platform: "server"`、`sourceType: "mcp_server"`，自动记录 tool/resource/prompt 名称、状态、耗时、错误类型和结果大小分桶，不记录 raw prompt、tool arguments/result 或 resource content。
- Agent Skill hook 使用 `platform: "server"`、`sourceType: "agent_skill"`，只在宿主 agent runtime 提供可执行 lifecycle hook 时记录 Skill started/completed/failed；静态 Skill 文件不能独立 auto-capture。
- 服务端埋点可使用 `platform: "server"`，通常上报 `userId`、`eventName`、`properties`、`context.traceId` 和 `occurredAt`。

## MVP 决策

- v1.0 不调用 LLM，语义抽取先使用确定性规则，便于本地开发和测试。
- Raw Behavior 和 Semantic Event 一对一生成，保证可追溯。
- 汇总在读取时通过 `summarizeSemanticEvents()` 计算，包括事件分布、路径分布、去重用户、去重设备和 DAU。
