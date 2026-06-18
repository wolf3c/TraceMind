# Semantic Event Design

## 目标

把 Web、iOS、macOS、Android、小程序、浏览器插件、MCP server、Agent Skill hook 和普通服务端手动埋点统一抽取为稳定的语义事件，让 LLM/MCP 能直接按业务含义、时间、用户、设备、路径等维度查询分析。

## 当前链路

1. `/api/capture` 写入 `tracemind_raw_behaviors`，状态为 `semanticStatus: "pending"`。
2. `startSemanticExtractionJob()` 每 30 秒处理 pending 原始行为。
3. `buildSemanticEvent()` 对每条原始行为生成一条语义事件。
4. 原始行为标记为 `processed`，并保存 `semanticEventId`，方便从语义事件回溯原始日志。

在线时长不走这条链路。Web、iOS、macOS、Android、React Native、小程序和浏览器插件自有页面通过 `/api/presence` upsert `tracemind_presence_sessions`，用于当前在线和停留时长统计；presence 不生成 raw behavior 或 semantic event。`durationMs` 保留前台/可见 presence 停留时长，Dashboard 健康里的活跃时长使用严格 `activeDurationMs`：前台/可见、Web 或浏览器插件焦点窗口、且最近 60 秒内有交互，旧记录缺字段按 0 处理。

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
  "targetHash": "tm_target_xxx",
  "targetIdentity": {
    "key": "target:data-testid:start-trial",
    "source": "data-testid",
    "confidence": "high"
  },
  "identitySource": "data-testid",
  "identityConfidence": "high",
  "actionKey": "web:/pricing:click:target:data-testid:start-trial",
  "relatedActionKey": "web:/pricing:click:target:data-testid:start-trial",
  "relatedTargetHash": "tm_target_xxx",
  "correlationId": "corr_123",
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
- Web、iOS、macOS、Android、React Native、小程序和浏览器插件都支持 `identify`。Native、小程序和浏览器插件 SDK 会把 `userId` 持久化到本地身份存储，并让后续自动采集和手动 `custom` 事件带上同一个 `userId`。

## 设备、IP 与地理信息

- Web 自动采集会发送 `deviceInfo`，包括 UA、语言、平台、时区、屏幕、viewport、硬件并发、内存和 referrer。
- iOS/macOS/Android 自动采集会发送平台、系统、框架、bundle id/package name、app label 和 SDK 框架来源；macOS 上 `deviceInfo.os` 为 `macOS`，`platform/sourceType` 为 `macos`；React Native 保持原生 `platform`，并用 `deviceInfo.framework` 或 `sourceDetails.framework` 标记 `react_native`。混合应用不新增事件平台，WebView 保持 Web 来源并可通过 `data-tracemind-framework` 写入 `sourceDetails.framework`，原生壳层保持 Native 来源，并用 framework metadata 标记具体壳层。小程序使用 `platform/sourceType: "mini_program"`，`sourceKey` 优先取 appId，`sourceDetails.provider` 标记微信、支付宝、抖音或钉钉。浏览器插件使用 `platform/sourceType: "browser_extension"`，`sourceKey` 优先取 extension id，只保留 `sourceDetails.browser`、`manifestVersion`、`runtimeContext` 和 `sdkVersion`。
- 设备指纹只使用较稳定字段，避免 viewport/referrer 变化导致同一设备被频繁重算。
- 服务端通过请求头采集 IP，包括 `x-forwarded-for`、`cf-connecting-ip`、`x-real-ip` 和 socket 地址。
- 地理信息使用无感请求头来源，例如 Cloudflare、Vercel、CloudFront、App Engine 注入的国家、地区、城市字段；后续可接入 IP geo 数据库，但不需要改变事件表结构。

## 自定义字段

- `eventName` 表达具体业务事件名，例如 `checkout_started`、`plan_selected`、`invite_sent`。
- `properties` 保存事件自身属性，例如金额、套餐、按钮位置、实验分组。
- `context` 保存上报上下文，例如 `source: "server"`、trace id、feature flag、入口渠道。
- Web、Native、React Native、混合应用、小程序、浏览器插件、MCP server、Agent Skill runtime 和服务端埋点都使用同一字段，后续扩展不用修改表结构。SDK 只保留 string、number、boolean 类型，省略 null、嵌套对象、数组、PII-like 字段、credential values、raw prompt/content、input value、request/response body、headers、cookies、authorization、tool arguments/result、resource content 和带 query 的完整 URL。

## 手动埋点与 Coding Agent 规则

- Coding agent 添加或修改手动埋点前，应通过 MCP 搜索当前项目已有事件，优先复用业务含义匹配的 `eventName`。
- 自动采集已经能稳定覆盖的页面浏览、点击、输入、表单提交和路由跳转，不需要重复添加手动埋点。
- 手动 `custom` 事件适合表达自动采集无法稳定推断的业务结果，例如 `checkout_started`、`subscription_created`、`invite_sent`、`invoice_paid` 或 `job_completed`。普通服务端应用第一版只做这类手动业务事件，不做 request Auto Capture。
- `app_error` 是产品/运行时错误摘要事件，用于把错误放回用户行为上下文分析。它不是 crash reporter；只允许 `errorKind`、`errorType`、`messageFingerprint`、`messagePreview`、`stackFingerprint`、`topFrameFingerprint`、`causeType`、`causeFingerprint`、`fatal`、`handled`、`source`、`path/screen`、`release`、`component`、`operation`、`feature`、`routeName`、`correlationId`、`requestId`、`httpStatus`、`status`、`occurredAt` 等摘要字段。
- 对 Native、React Native、小程序和浏览器插件，agent 应优先使用 `capture_setup` 返回的 `identifySnippet`、`manualCaptureExamples`、`errorCaptureWorkflow` 和 `errorCaptureMethods`，并确认 `supportedPropertyTypes` 后再写代码。
- 如果没有匹配事件，agent 只能生成 draft custom event proposal，并让用户确认后再当作正式事件使用。
- `eventName` 使用 lower snake_case，例如 `checkout_started`。
- 禁止在 `properties` 或 `context` 中上报 email、phone、secret、access token、API key、raw prompt、raw user content、request/response body、headers、cookies、authorization、原始 stack trace、raw log、源码、输入值或带 query string 的完整 URL。`app_error` 也禁止截图、录屏、session replay、crash dump 和 raw message；允许 SDK 从原始错误本地派生脱敏短消息预览和不可逆指纹后再上报。

## 元素定位

- `targetText` 和 `targetTag` 只适合做人类阅读摘要，不能作为唯一定位依据。
- `target` 保存元素摘要，包括 tag、id、class、name、type、role、aria-label、placeholder、testId 和短 DOM path。它保留 raw 工程线索，用于 UI 或代码变化后的问题追踪。
- `targetIdentity` 复用已有工程标识生成稳定身份，不要求开发者额外标注。优先级为测试标识、id/name、aria/form 标识、route + text、route + DOM path。
- `targetHash` 优先基于 `targetIdentity.key` 计算，降低 UI 文案、class 和 DOM 层级变化导致的匹配漂移。
- `actionKey` 基于 platform、path、event type 和 `targetIdentity.key` 生成，用于 MCP 和汇总接口按可分析动作聚合。
- `identityConfidence` 标记长期分析可靠度。低置信度 action 可以用于 session 复核，但不应直接当作稳定漏斗节点。
- 手动 `custom` 事件可以通过 `relatedActionKey`、`relatedTargetHash` 或 `correlationId` 关联自动采集动作；语义层保留手动事件的业务 `eventName`，不把结果事件改写成 click/input/submit。

## 事件含义说明表

| eventType | 名称 | 含义 | 常见字段 | 平台 |
| --- | --- | --- | --- | --- |
| `page_view` | 页面浏览 | 用户打开或刷新页面，或进入 Native screen/activity/controller/window/小程序页面/浏览器插件自有页面，用于分析访问量、落地页、路径入口和页面级留存。 | `title`, `path`, `referrer` | Web, iOS, macOS, Android, Mini Program, Browser Extension, Server |
| `click` | 元素点击 | 用户点击 Web 元素、Native 控件、小程序 helper 标记的 tap 或浏览器插件自有页面元素，用于分析功能入口、按钮转化和交互兴趣。 | `target`, `targetIdentity`, `targetHash`, `actionKey`, `targetText`, `targetTag`, `path` | Web, iOS, macOS, Android, Mini Program, Browser Extension |
| `input` | 输入变化 | 用户完成一次输入控件修改，用于分析表单填写、设置修改和关键流程参与度；不保存输入值。Web 会过滤程序派发的 DOM input/change，并优先在 change/blur 后提交一次聚合事件。 | `target`, `targetIdentity`, `targetHash`, `actionKey`, `targetText`, `targetTag`, `path` | Web, iOS, macOS, Android, Mini Program, Browser Extension |
| `submit` | 表单提交 | 用户提交表单、点击确认或触发 Native keyboard done/search/send、小程序 submit helper 或浏览器插件自有页面提交，用于分析注册、支付、创建、搜索等转化节点。 | `target`, `targetIdentity`, `targetHash`, `actionKey`, `targetText`, `targetTag`, `path` | Web, iOS, macOS, Android, Mini Program, Browser Extension |
| `route_change` | 页面跳转 | 用户在 Web SPA、Native app、小程序或浏览器插件自有页面内发生页面切换，用于分析路径流转、漏斗顺序和页面间跳转。 | `path`, `referrer` | Web, iOS, macOS, Android, Mini Program, Browser Extension |
| `api_call` | 接口调用 | 客户端或服务端记录接口调用，用于分析接口失败、关键后端流程和服务端埋点。 | `method`, `status`, `path` | Web, iOS, macOS, Android, Mini Program, Browser Extension, Server |
| `app_error` | 产品错误 | 产品或运行时记录隐私安全的错误摘要，用于分析用户在哪里遇到错误、之前做了什么、影响哪些路径/转化和是否集中爆发。 | `errorKind`, `errorType`, `messageFingerprint`, `messagePreview`, `stackFingerprint`, `topFrameFingerprint`, `causeType`, `causeFingerprint`, `fatal`, `handled`, `source`, `path`, `screen`, `release`, `component`, `operation`, `feature`, `routeName`, `correlationId`, `requestId`, `httpStatus`, `status`, `occurredAt` | Web, iOS, macOS, Android, Mini Program, Browser Extension, Server |
| `tool_call` | MCP 工具调用 | MCP server 记录工具调用完成情况，用于分析工具使用量、失败率和耗时。 | `toolName`, `status`, `durationMs`, `errorType`, `resultSizeBucket` | Server |
| `resource_read` | MCP 资源读取 | MCP server 记录资源读取完成情况，用于分析资源访问、失败率和耗时。 | `resourceName`, `uriScheme`, `uriTemplateHash`, `status`, `durationMs` | Server |
| `prompt_request` | MCP Prompt 请求 | MCP server 记录 prompt 请求完成情况，用于分析 prompt 使用、失败率和耗时。 | `promptName`, `status`, `durationMs` | Server |
| `skill_lifecycle` | Agent Skill 生命周期 | 宿主 agent runtime 记录 Skill started/completed/failed 等生命周期信号。 | `skillName`, `version`, `phase`, `success`, `durationMs` | Server |
| `custom` | 自定义事件 | 开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。 | `eventName`, `properties`, `context` | Web, iOS, macOS, Android, Mini Program, Browser Extension, Server |

这张表同时暴露给 MCP 的 `tracemind.event_definitions`，用于帮助 LLM 判断应该查询哪个事件。

## 跨平台扩展原则

- 表结构保持平台无关：`platform` 区分 `web`、`ios`、`macos`、`android`、`mini_program`、`browser_extension`、`server`，平台差异写入 `deviceInfo`、`sourceDetails`、`properties` 和 `context`。
- 来源使用 `sourceType + sourceKey`，避免把 Web-only 的 `hostname` 做成通用字段名。Web 优先使用请求 `Origin` / `Referer` 归一化来源；iOS/macOS 使用 bundle id；Android 使用 package name；小程序使用 appId 或配置的 sourceKey，并只保留 `sourceDetails.provider`；浏览器插件使用 extension id 或配置的 sourceKey，并只保留 `sourceDetails.browser`、`manifestVersion`、`runtimeContext` 和 `sdkVersion`；MCP server 使用 server/package 名；普通后端服务使用 `server_app` + service name；Agent Skill 使用 Skill 名或宿主 runtime skill id。
- 自动采集字段和手动埋点字段共用同一事件模型，避免未来增加移动端 SDK 时迁移 Mongo 集合。
- 移动端可复用 `sessionId`、`anonymousId`、`userId`、`deviceId`、`deviceFingerprint`、`sourceType`、`sourceKey`、`eventType`、`eventName`、`properties`、`context`。
- 移动端 `target` 统一保存 class/type、accessibility id、resource id、test id、label 摘要、screen 和短层级 path；`targetIdentity` 优先复用 test id、accessibility id、resource id，再回退到 label/path/class；`targetHash` 仍使用 `tm_target_` 前缀。
- 小程序 V1 不做编译期模板改写；tap/input/submit 由开发者在 handler 中调用 `trackTap`、`trackInput`、`trackSubmit` helper，且 helper 不接收或保存输入值。
- 浏览器插件 V1 不做 content script 宿主页无侵入采集；popup/options/sidebar/devtools 等插件自有 DOM 页面可以自动记录 page/click/input/submit/route、presence 和安全错误摘要，background/service worker 只支持手动 `capture`、`captureError`、`identify`、`submitFeedback` 和 `flush`。
- Web 会自动把 `window.error` 和 `unhandledrejection` 记录为 `app_error` 摘要；浏览器插件自有 DOM 页面在运行时允许时也记录同类摘要。iOS/macOS/Android/React Native/小程序/浏览器插件 background/server SDK v1 只提供手动 `captureError`，不接入 native crash reporter、全局 JS handler、request/log/database hook、sourcemap 上传或符号化；stack 只允许本地生成 `stackFingerprint` / `topFrameFingerprint`。
- MCP server 自动事件使用 `platform: "server"`、`sourceType: "mcp_server"`，自动记录 tool/resource/prompt 名称、状态、耗时、错误类型和结果大小分桶，不记录 raw prompt、tool arguments/result 或 resource content。
- Agent Skill hook 使用 `platform: "server"`、`sourceType: "agent_skill"`，只在宿主 agent runtime 提供可执行 lifecycle hook 时记录 Skill started/completed/failed；静态 Skill 文件不能独立 auto-capture。
- 普通服务端手动埋点使用 `platform: "server"`、`sourceType: "server_app"`，通常上报 `userId`、`eventName`、`properties`、`context.traceId` 和 `occurredAt`；不自动采集每个 HTTP request。

## MVP 决策

- v1.0 不调用 LLM，语义抽取先使用确定性规则，便于本地开发和测试。
- Raw Behavior 和 Semantic Event 一对一生成，保证可追溯。
- 汇总在读取时通过 `summarizeSemanticEvents()` 计算，包括事件分布、路径分布、action 分布、去重用户、去重设备和 DAU。
