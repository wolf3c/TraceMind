# Auto Capture Design

## 目标

让 Web、iOS、macOS、Android、React Native、混合应用、小程序、第三方 MCP server 和可执行 Agent Skill runtime 启用 TraceMind 行为采集，并且同时支持自动采集、手动埋点、用户识别、设备信息和服务端埋点。普通后端服务第一版只提供手动埋点，不做通用 request Auto Capture，避免采集大量低价值请求噪音。

## 一行接入

Web:

```html
<script src="https://tracemind.example.com/capture.js" data-tracemind-token="PROJECT_KEY" async></script>
```

iOS:

```swift
TraceMind.start(projectKey: "PROJECT_KEY")
```

macOS:

```swift
TraceMind.start(projectKey: "PROJECT_KEY")
```

Android:

```kotlin
TraceMind.start(application, projectKey = "PROJECT_KEY")
```

React Native:

```js
TraceMind.start({ projectKey: "PROJECT_KEY" });
```

MCP Node:

```ts
TraceMindMCP.start(server, { projectKey: "PROJECT_KEY", sourceKey: "docs-mcp" });
```

MCP Python:

```py
TraceMindMCP.start(server, project_key="PROJECT_KEY", source_key="docs-mcp")
```

Agent Skill host hook:

```js
TraceMindMCP.captureSkillLifecycle({ skillName: "docs-indexer", phase: "completed", success: true });
```

Server Node:

```ts
TraceMindServer.start({ projectKey: "PROJECT_KEY", sourceKey: "billing-api" });
```

Server Python:

```py
TraceMindServer.start(project_key="PROJECT_KEY", source_key="billing-api")
```

Native、React Native、混合应用、小程序、浏览器插件、MCP 和 server SDK 的包安装、Gradle/Swift Package/Python package 配置不计入“一行代码”；真正进入业务代码的接入点保持一行初始化。`capture_setup` 默认返回已发布平台的 registry 安装命令：npm 用于 JS/RN/小程序/浏览器插件/MCP Node/server Node，PyPI 用于 Python SDK，Maven Central 用于 Android；Swift iOS/macOS 继续返回 `distributionMode: "local_source"`。当返回 `localSourceFallback` 或 `distributionMode: "local_source"` 时，coding agent 才按 GitHub clone、`latestSdk.sourceRef`、`vendor/` 复制、本地 file dependency、SwiftPM local path、Gradle module 或 PYTHONPATH 指令接入。发布版 `latestSdk.sourceRef` 使用不可变 `tracemind-release-<version>` tag，而不是浮动 `main`。SDK 升级治理以源码内容 hash 为准：`latestSdk.contentHash` 和运行时 `sourceDetails.sdkContentHash` 用于发现过旧或未知 SDK，`displayVersion` 只给人看。本地开发时，控制台会显示当前项目和平台对应的一行代码。macOS 复用 `sdk/ios` Swift Package，并以 `platform: "macos"` / `sourceType: "macos"` 区分来源。混合应用通过 `hybrid` setup 返回组合接入指导：WebView 使用 Web Auto Capture，原生壳层使用对应 Native SDK，不新增 `hybrid` 事件平台。小程序通过一个通用 `mini_program` SDK 接入，使用 `provider` 区分微信、支付宝、抖音和钉钉，不复用 Web 脚本注入。浏览器插件通过一个通用 `browser_extension` SDK 接入，支持 Chrome、Edge、Firefox 的插件自有页面和 background 手动事件，不复用 Web 脚本注入，也不对 content script 宿主页做无侵入自动采集。静态 Skill 文件不是运行时，不能独立 auto-capture；只有宿主 agent runtime 暴露 lifecycle hook 时，`agent_skill` 才能采集。普通 server SDK 的一行初始化只启用手动埋点队列，不开启请求自动采集。

Coding agent 接入时不应从静态 skill 或 rules 文件读取项目 key。应先配置 TraceMind MCP，再调用 `tracemind.capture_setup` 获取当前项目和平台的一行接入代码。Native、React Native、混合应用、小程序、浏览器插件、MCP server、Agent Skill 和 server application 接入还应使用 MCP 返回的 `distributionMode`、`installCommands`、`filesToEdit`、`initLocation`、`idempotencyChecks`、`latestSdk`、`installedVersionDetection`、`upgradeCommands` 和 `verificationCommands`，先确认没有现有 SDK 依赖、vendored SDK 目录或初始化代码后再修改项目。

## 自动采集信号

- `page_view`: Web 页面首次打开，或 Native app/screen 进入。
- `click`: Web 文档级点击，或 Native tap/click 控件行为，包含元素定位信息。
- `input`: 用户修改 Web 表单字段或 Native text input 后提交一次变化证据，包含元素定位信息，不采集输入值。
- `submit`: Web 表单提交，或 Native 键盘 done/search/send 与确认类提交。
- `route_change`: Web `history.pushState` / 前进后退，或 Native screen/controller/activity 切换。
- Web 还会覆盖 `history.replaceState`、`hashchange`、输入完成聚合、点击 submit button 和键盘 Enter/Search 的提交意图。Web `input`/`change` 只接受浏览器标记为 trusted 的用户事件；脚本主动 `dispatchEvent(new Event("input"))` 这类程序派发事件不会作为用户输入证据。输入字段优先在 `change`/`blur` 后提交一次聚合事件，并保留 5 秒 idle fallback，避免连续打字按字符上传。普通 event 的 `path` 默认只保存 `pathname + hash`，不保存 query string。
- 在线时长：Web、iOS、macOS、Android、React Native、混合应用中的 WebView/原生壳层、小程序和浏览器插件自有前台页面使用独立 `/api/presence` 记录前台在线区间，5 秒 heartbeat 只更新区间，不进入 raw/semantic 事件流。Dashboard 健康里的活跃时长使用严格 `activeDurationMs`，要求前台/可见且最近 60 秒内有交互；Web 和浏览器插件自有页面还要求窗口处于焦点。
- `tool_call`: MCP tool handler 完成，记录 tool name、status、duration、error type 和 result size bucket。
- `resource_read`: MCP resource handler 完成，记录 resource name、URI scheme、status、duration 和 result size bucket。
- `prompt_request`: MCP prompt handler 完成，记录 prompt name、status、duration 和 result size bucket。
- `skill_lifecycle`: 宿主 agent runtime 的 Skill started/completed/failed hook。
- `custom`: 通过 Web `window.TraceMind.capture(type, data)` 或 Native `TraceMind.capture(...)` 手动上报。

普通后端服务不在第一版 Auto Capture 信号列表里。它们只通过 `server_node`、`server_python` 或 `server_http` 手动上报稳定业务结果，例如支付成功、账单已付、工作区创建、任务完成或同步完成。

## 流量归因

`attribution` 回答“用户从哪里跳转进来”，和 `sourceType/sourceKey` 的采集来源治理分开。Web Auto Capture 会在每次浏览器 visit 的落地页生成 first-touch attribution，并用 `sessionStorage` 在同一次 visit 内复用到 `page_view`、`route_change`、`click`、`input`、`submit`、`custom` 和 presence 数据。浏览器不支持或拒绝 `sessionStorage` 时，只在内存中保留本次页面生命周期的归因。

`attribution` 只接受隐私安全的白名单字段：

- `source` / `medium` / `campaign` / `content`: Web 仅来自 `utm_source`、`utm_medium`、`utm_campaign`、`utm_content`；Native/RN 可来自 URL/deeplink helper 或开发者显式设置的安全来源。
- `referrerDomain` / `referrerType`: 只保存 referrer/app source 的域名、package/bundle-like 标识和 `direct`、`internal`、`external`、`search`、`social` 分类。
- `landingPath`: 只保存落地页 `pathname + hash`，不保存 query string。
- `gclidPresent` / `fbclidPresent` / `msclkidPresent`: 只保存是否存在广告点击参数，不保存点击 ID。

iOS/macOS 使用 `TraceMind.recordOpenURL(url, sourceApplication:)` 从 universal links、自定义 URL scheme、handoff 或外部 app 打开场景生成 attribution，也支持 `TraceMind.setAttribution(...)` 传入已经脱敏的自定义来源。Android 使用 `TraceMind.recordDeepLink(url, referrer, sourcePackage)` 从 app links、自定义 scheme、Activity intent/referrer 或路由层 deeplink 生成 attribution。React Native 通过 bridge 暴露 `TraceMind.recordDeepLink(...)` 和 `TraceMind.setAttribution(...)`，通常接在 `Linking.getInitialURL()` 和 URL 订阅中。普通 server SDK 不自动推断用户流量来源；只有业务事件已经持有来自产品侧的安全来源上下文时，才手动传入 `attribution`。

服务端会再次清洗 `attribution` 后写入 `RawBehaviors`、`SemanticEvents` 和 `PresenceSessions`。查询层和 MCP 支持按 `attributionSource`、`attributionMedium`、`attributionCampaign` 和 `landingPath` 过滤，健康概览会聚合 Top traffic sources、mediums、campaigns 和 landing pages。旧事件缺少可靠的原始 query/referrer/deeplink 上下文，不能准确回填历史归因；统计从部署后的新事件开始。

## Web 可靠发送队列

Web Auto Capture 不再把每个事件直接交给 `sendBeacon` 或 `fetch` 后立即丢弃。脚本会先把 `page_view`、`click`、`input`、`submit`、`route_change`、`custom`、`app_error` 和 presence 写入内存队列，并尽量同步保存到 `localStorage`。队列按项目 key 隔离，默认最多保留 300 条；超过上限或浏览器存储 quota 不足时才丢弃最旧记录，并把丢弃数量记录到 delivery diagnostics。

普通前台发送会按批次写入 `/api/capture` 或 `/api/presence`，每批默认最多 20 条。发送失败时事件保留在队列中，使用 1 秒起步、60 秒封顶的指数退避重试。`online`、`visibilitychange`、`pagehide`、`beforeunload`、presence heartbeat 和 `window.TraceMind.flush()` 都会触发 flush。页面隐藏或卸载时，脚本会把单批控制在约 60KB 内并优先使用 `sendBeacon`。

Presence 也进入同一可靠队列。为了避免离线 heartbeat 挤占关键行为事件，同一 `presenceId` 的 pending heartbeat 会合并为最新一次心跳；`start`、`foreground`、`background` 和 `end` 不合并，保持在线区间边界。

用户反馈使用独立的 `feedback` 队列记录和 `/api/user-feedback` endpoint。Web SDK 暴露 `window.TraceMind.openFeedback()` 和 `window.TraceMind.submitFeedback({ message })`，但反馈不会写入 `/api/capture`、raw behavior 或 semantic event。反馈 payload 允许用户主动提交的 `contact` 和客户自定义 primitive `fields`，同时继续拒绝 token、secret、authorization、raw prompt、源码 diff、请求/响应 body、headers、cookies、tool arguments/results、resource content 和带 query 的完整 URL。截图、录屏和附件上传不在 v1 范围内，`attachments` 固定为空数组作为未来兼容字段。

## 数据保留窗口

TraceMind 的明细数据用于近期下钻排查，聚合数据用于长期趋势：

- `tracemind_capture_delivery_reports` 保留 7 天，用于近期上报失败、重试、丢弃、队列深度和 presence 合并排查。更早的上报健康以 `project_health.delivery`、小时报告和日报为准。
- `tracemind_presence_sessions` 保留 30 天，用于近期在线区间、实时在线和活跃时长下钻。更早的在线和活跃趋势以小时报告和日报为准。
- `tracemind_raw_behaviors` 保留 30 天，用于复核语义事件背后的原始采集事实。超过窗口时，`tracemind.query_raw_behaviors` 没有结果不代表数据丢失。
- `tracemind_semantic_events`、`tracemind_project_hourly_reports` 和 `tracemind_project_daily_reports` 当前长期保留，是历史分析的主要数据来源。

错误上下文使用 `app_error` 进入普通行为队列，Web 自动监听 `window.error` 和 `unhandledrejection`，手动场景使用 `window.TraceMind.captureError(...)`。该事件只保存错误类型、消息指纹、handled/fatal、component/release 和 path/screen 等摘要字段；stack trace、raw log、raw message、源码、请求/响应 body、headers、cookies、authorization、输入值、prompt、secret、截图、录屏、crash dump 和 session replay 都不进入 v1。

开发者可在浏览器控制台查看非敏感发送状态：

```js
window.TraceMind.status();
window.TraceMind.flush();
```

`status()` 只返回队列长度、丢弃计数、重试次数、最近错误和最近 flush 时间，不包含用户输入值、页面内容、token 或完整 query URL。

## 用户识别

最简单的方式是在页面上提供一个全局方法，然后在 script 上写方法名：

```html
<script>
  window.TraceMindUserId = function () {
    return "user-123";
  };
</script>

<script
  src="https://tracemind.example.com/capture.js"
  data-tracemind-token="PROJECT_KEY"
  data-tracemind-user-id-provider="TraceMindUserId"
  async>
</script>
```

React、Vue、Svelte、jQuery、原生 JS 都可以用这个方式，只要这个方法能返回当前登录用户 ID。TraceMind 不执行字符串代码，只会按名字读取 `window` 上的函数或变量。

如果是后端模板渲染，也可以直接写静态用户 ID：

```html
<script
  src="https://tracemind.example.com/capture.js"
  data-tracemind-token="PROJECT_KEY"
  data-tracemind-user-id="user-123"
  async>
</script>
```

登录后业务系统可以调用：

```js
window.TraceMind.identify("user-123", {
  plan: "pro",
  role: "owner"
});
```

TraceMind 会把 `userId` 保存到浏览器本地，并随之后的事件自动上报。DAU 和常见产品分析指标使用 `userId || anonymousId` 去重。

Native 和 React Native 使用同一语义：应用启动只调用一次 `TraceMind.start(...)`，登录成功后可调用 `TraceMind.identify(...)` 持久化业务 `userId`。iOS 和 macOS 存入 `UserDefaults`，Android 存入 `SharedPreferences`，React Native 代理到对应原生 SDK。`identify` 会产生一个经过清洗的 `custom` / `identify` 行为事实，traits 只保留 string、number、boolean。

在线时长使用独立 presence 模型：SDK 在前台或页面可见时启动 `presenceId` 区间，每 5 秒发送 heartbeat；页面隐藏、App 进后台、路由或 screen 切换时结束当前区间，Native/RN `setScreen` 会切分旧 screen 和新 screen 的在线区间。Web presence 只记录 `pathname`，不包含 query string。服务端按 `projectId + presenceId` upsert 到 `tracemind_presence_sessions`，15 秒内有 `lastSeenAt` 的区间视为当前在线。Presence 不生成 raw behavior 或 semantic event。

`durationMs` 保留为前台/可见 presence 停留时长。`activeDurationMs` 是严格活跃时长：Web 必须页面可见、窗口有焦点，且处于初始/focus 60 秒窗口或最近 60 秒内发生 click、input、change、submit、keydown、scroll、touchstart、pointerdown；`window.blur` 立即截断严格活跃片段，但不结束前台 presence 区间。iOS/Android/RN 必须 App 前台，tap、text、screen 刷新同一个 60 秒窗口。旧数据缺少 `activeDurationMs` 时按 0 处理，不用旧 `durationMs` 兜底。

Dashboard 日健康由小时级报告聚合得出。历史日期聚合完整 24 个小时并与前一天完整 24 小时对比；选择“今天”时只聚合已结束小时，并与昨天相同小时段对比，当前未结束小时不进入日报趋势。Dashboard 选择“今天”时会单独延迟加载近 30 分钟在线人数卡片。该卡片只扫描最近半小时 presence 和 semantic event：总在线人数、5 分钟在线桶、地区分布 Top3 以去重 presence actor 为准，页面时长 Top3 使用窗口内严格 `activeDurationMs`，高频事件 Top3 使用同窗口 semantic event。

健康概览里的「跳出页面 Top3」依赖同一套 session、presence 和 route/screen 边界：同一个 `sessionId` 在统计窗口内只有一个 `path` 或 `screen`、没有 `route_change`、且没有明确互动事件时才算跳出。旧数据缺少 `sessionId` 时只用 `presenceId` 兜底，平均跳出时长使用严格 `activeDurationMs`。

## 手动埋点

自动采集无法表达的业务语义使用 `custom` + `eventName`：

```js
window.TraceMind.capture("custom", {
  eventName: "checkout_started",
  properties: {
    plan: "pro",
    amount: 29
  },
  context: {
    source: "pricing_page"
  }
});
```

`properties` 放事件属性，`context` 放上报上下文。iOS、macOS、Android、React Native、混合应用、小程序、浏览器插件、MCP server、普通 server app 和 Agent Skill runtime 手动埋点保持同样字段：只保留 string、number、boolean，省略 null、嵌套对象、数组、PII-like 字段、credential values、raw prompt/content、input value、request/response body、headers、cookies、authorization、tool arguments/result、resource content 和带 query 的完整 URL。服务端埋点可以向同一个 `/api/capture` 写入相同字段，并设置 `platform: "server"`。

手动埋点不替代 Auto Capture，二者用于不同层级：Auto Capture 记录入口、点击、输入、提交意图、路径流转和在线区间；手动或服务端 `custom` 事件记录业务结果，例如 `project_created`、`checkout_completed`、`settings_saved`。手动事件可以携带 `relatedActionKey`、`relatedTargetHash` 或 `correlationId`，用于把业务结果和前序自动采集动作关联起来；如果手动事件已有明确 `eventName`，语义层不会覆盖它的业务含义。

Native 手动埋点示例：

```swift
try? TraceMind.capture(
  "custom",
  eventName: approvedEventName,
  path: "CheckoutViewController",
  properties: ["plan": "pro", "amount": 29, "trial": true],
  context: ["source": "pricing_page"]
)
```

```kotlin
TraceMind.capture(
  type = "custom",
  eventName = approvedEventName,
  path = "CheckoutActivity",
  properties = mapOf("plan" to "pro", "amount" to 29, "trial" to true),
  context = mapOf("source" to "pricing_page")
)
```

```js
TraceMind.capture("custom", {
  eventName: approvedEventName,
  path: "Checkout",
  properties: { plan: "pro", amount: 29, trial: true },
  context: { source: "pricing_page" }
});
```

MCP 手动埋点示例：

```ts
TraceMindMCP.capture("custom", {
  eventName: approvedEventName,
  userId: "user-123",
  properties: { documentCount: 12, success: true },
  context: { toolName: "sync_docs" }
});
```

```py
TraceMindMCP.capture(
    "custom",
    event_name=approved_event_name,
    user_id="user-123",
    properties={"documentCount": 12, "success": True},
    context={"toolName": "sync_docs"},
)
```

普通服务端手动埋点示例：

```ts
TraceMindServer.capture("custom", {
  eventName: approvedEventName,
  userId: "user-123",
  properties: { amount: 2900, success: true },
  context: { source: "stripe_webhook" }
});
```

```py
TraceMindServer.capture(
    "custom",
    event_name=approved_event_name,
    user_id="user-123",
    properties={"amount": 2900, "success": True},
    context={"source": "stripe_webhook"},
)
```

## Ingestion API

`POST /api/capture`

单事件：

```json
{
  "projectKey": "tm_proj_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "userId": "user-123",
  "deviceId": "tm_dev_xxx",
  "deviceFingerprint": "tm_fp_xxx",
  "platform": "web",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0",
    "language": "zh-CN",
    "timezone": "Asia/Shanghai"
  },
  "source": {
    "type": "web",
    "url": "https://app.example.com/pricing?plan=pro",
    "referrer": "https://google.com/search?q=app"
  },
  "type": "custom",
  "eventName": "checkout_started",
  "path": "/pricing",
  "title": "Pricing",
  "targetText": "Start trial",
  "targetTag": "BUTTON",
  "target": {
    "tag": "BUTTON",
    "text": "Start trial",
    "id": "start-trial",
    "role": "button",
    "testId": "pricing-start-trial",
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
    "plan": "pro"
  },
  "context": {
    "source": "manual"
  },
  "occurredAt": "2026-05-06T10:00:00.000Z"
}
```

`POST /api/presence`

```json
{
  "projectKey": "PROJECT_KEY",
  "presenceId": "tm_pres_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "deviceId": "tm_dev_xxx",
  "platform": "web",
  "source": { "type": "web", "url": "https://app.example.com/pricing" },
  "path": "/pricing",
  "title": "Pricing",
  "state": "heartbeat",
  "heartbeatIntervalMs": 5000
}
```

批量 presence：

```json
{
  "projectKey": "PROJECT_KEY",
  "events": [
    {
      "presenceId": "tm_pres_xxx",
      "path": "/pricing",
      "state": "heartbeat",
      "occurredAt": "2026-05-06T10:00:05.000Z"
    }
  ],
  "deliveryStats": {
    "batchId": "tm_batch_xxx",
    "reason": "scheduled",
    "queued": 3,
    "sent": 1,
    "droppedOldest": 0,
    "droppedStorage": 0,
    "retryCount": 0,
    "coalescedPresence": 2,
    "maxQueueDepth": 4
  }
}
```

批量事件：

```json
{
  "projectKey": "tm_proj_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "deliveryStats": {
    "batchId": "tm_batch_xxx",
    "reason": "scheduled",
    "queued": 12,
    "sent": 2,
    "droppedOldest": 1,
    "droppedStorage": 0,
    "retryCount": 3,
    "coalescedPresence": 0,
    "maxQueueDepth": 18
  },
  "events": [
    {
      "platform": "ios",
      "type": "page_view",
      "path": "CheckoutViewController",
      "source": {
        "type": "ios",
        "bundleId": "com.example.app",
        "label": "Example iOS",
        "details": {
          "framework": "swift"
        }
      }
    }
  ]
}
```

服务端会补充：

- `ip`: 从 `x-forwarded-for`、`cf-connecting-ip`、`x-real-ip` 或 socket 地址读取。
- `geo`: 从 Cloudflare、Vercel、CloudFront、App Engine 等代理/CDN 请求头读取国家、地区、城市。
- `sourceType` / `sourceKey` / `sourceLabel` / `sourceDetails`: 从 SDK payload 和请求头归一化得到的来源字段。Web 的 `sourceKey` 优先使用请求 `Origin`，其次使用请求 `Referer`，最后才回退到 SDK payload URL；iOS 使用 bundle id；Android 使用 package name；React Native 复用原生来源并在 `deviceInfo.framework` 或 `sourceDetails.framework` 标记 `react_native`；混合应用不新增事件平台，WebView 保持 Web 来源并可通过 `data-tracemind-framework` 写入 `sourceDetails.framework`，原生壳层保持对应 Native 来源并可在 `deviceInfo.framework` 或 `sourceDetails.framework` 标记 `hybrid`、`capacitor`、`cordova`、`electron` 或 `tauri`；小程序使用 `sourceType: "mini_program"`，`sourceKey` 优先使用 appId，没有 appId 时使用配置的 sourceKey，只白名单保留 `sourceDetails.provider`、`sdkVersion` 和 `sdkContentHash`；浏览器插件使用 `sourceType: "browser_extension"`，`sourceKey` 优先使用 extension id，只白名单保留 `sourceDetails.browser`、`manifestVersion`、`runtimeContext`、`sdkVersion` 和 `sdkContentHash`；MCP server 使用配置的 server/package 名作为 `sourceKey`；普通后端服务使用 `sourceType: "server_app"` 和配置的服务名；Agent Skill 使用稳定 Skill 名或宿主 runtime skill id。SDK 升级只通过白名单的 `sdkVersion` / `sdkContentHash` 判断，不透传任意 source details。
- `attribution`: 流量归因字段，只保留白名单 UTM/source/medium/campaign/content、referrer domain/type、landing path 和广告点击布尔标记；Web 自动生成，iOS/macOS/Android/React Native 和混合应用壳层通过 URL/deeplink helper 或 `setAttribution` 设置，小程序通过 `setAttribution` 传入已脱敏的 campaign、scene、二维码、分享或渠道信息，浏览器插件通过 `setAttribution` 传入已脱敏的 extension workflow 或 campaign metadata，普通 server SDK 只在业务事件已经持有安全产品来源上下文时手动传入。MCP server 和 Agent Skill 的 `sourceType/sourceKey` 仍表示工具/runtime 来源，不表示产品流量来源。
- `semanticStatus: "pending"`: 等待语义抽取任务处理。

## 来源治理

`data-tracemind-token` 是公开项目 key，不是密钥。为了保持一行脚本的低接入成本，MVP 不要求开发者预先配置白名单。

服务端会统计每个项目的采集来源。这里的 `sourceType + sourceKey` 表示哪个 App、SDK、MCP server 或服务在写入公开项目 key，不表示用户从哪个营销渠道跳转进来。开发者可以在控制台看到最近写入该项目 key 的采集来源、事件数和最近出现时间；已屏蔽来源即使没有近期事件，也会保留在列表中以便解除屏蔽。发现异常来源后，可以屏蔽对应 `sourceType + sourceKey`。屏蔽命中后，`/api/capture` 仍返回正常 ok，但不会插入 `RawBehaviors`，也不会产生语义事件。

## 元素区分

自动采集不会只依赖按钮文案或输入框文本。每次 `click`、`input`、`submit` 都会带上：

- `target`: 元素摘要，包括 tag、id、class、name、type、role、aria-label、placeholder、data-testid 和短 DOM path。该字段保留原始工程语义线索，用于 UI 或代码变化后的问题追踪。
- `targetIdentity`: 从已有工程标识推导出的稳定身份，优先级为 `data-testid` / `data-cy` / `data-test`、`id`、`name`、`aria-label + role`、form identity、route + text、route + DOM path。TraceMind 不要求开发者额外标注 `data-tracemind-id`。
- `identitySource` / `identityConfidence`: 表明身份来自哪个字段，以及是否适合长期趋势分析。`high` 通常来自测试标识、id 或 name；`low` 通常来自 DOM path fallback。
- `targetHash`: 优先基于 `targetIdentity.key` 计算。只有没有稳定身份时才回退到 target 摘要。
- `actionKey`: 基于 platform、path、event type 和 `targetIdentity.key` 生成，用于把 raw 行为归并成可长期分析的动作。

例如两个都叫“更多”的按钮，只要它们拥有不同测试标识、id、name、aria/form 标识或 fallback 路径，就会得到不同的 `targetIdentity`、`targetHash` 和 `actionKey`。如果某个关键业务结果需要长期稳定分析，仍建议开发者使用手动或服务端埋点提供明确的 `eventName`，例如 `project_created`，并通过 `relatedActionKey` 关联前序自动采集动作。

## 跨平台字段

- `platform`: 当前约定为 `web`、`ios`、`macos`、`android`、`mini_program`、`browser_extension`、`server`；MCP server 和 Agent Skill hook 使用 `server`，具体来源由 `sourceType` 区分。
- `sourceType` 和 `sourceKey`: 表达采集来源，避免使用 `hostname` 这种 Web-only 字段名。Web 使用页面 hostname；iOS/macOS 使用 bundle id；Android 使用 package name；混合应用保持 WebView/Native 各自来源，并用 framework metadata 标记壳层；小程序使用 appId 或配置的 sourceKey，并在 `sourceDetails.provider` 标记宿主；浏览器插件使用 extension id，并在 `sourceDetails` 标记 browser、manifest/runtime context 和 SDK version；MCP server 使用 server/package 名；普通后端服务使用 `server_app` + service name；Agent Skill 使用 Skill 名或宿主 runtime skill id。
- `deviceInfo`: 平台差异字段放这里，例如 iOS/macOS/Android 的 OS version、app version、model、network。
- `properties` 和 `context`: 所有业务扩展字段都放这里，避免为每个业务事件改表。

## Native SDK v1 边界

- iOS SDK 位于 `sdk/ios`，公开入口为 `TraceMind.start(projectKey: "PROJECT_KEY")`。
- macOS 复用 `sdk/ios` Swift Package，公开入口同样为 `TraceMind.start(projectKey: "PROJECT_KEY")`；Auto Capture v1 覆盖应用激活、窗口/主窗口变化和 screen 在线区间，手动 `TraceMind.capture(...)` / `TraceMind.setScreen(...)` 仍可用。
- Android SDK 位于 `sdk/android`，公开入口为 `TraceMind.start(application, projectKey = "PROJECT_KEY")`。
- React Native SDK 位于 `sdk/react-native`，公开入口为 `TraceMind.start({ projectKey: "PROJECT_KEY" })`，内部复用原生 SDK。
- 混合应用使用 `tracemind.capture_setup({ platform: "hybrid" })` 获取 WebView + Native 壳层组合接入步骤。WebView 行为仍是 `web`，壳层行为仍是 `ios`、`macos` 或 `android`；登录后两层应使用同一个稳定内部 `userId`，桥接层只传安全身份、路由和来源元信息。
- 小程序使用 `tracemind.capture_setup({ platform: "mini_program", provider: "wechat" | "alipay" | "douyin" | "dingtalk" })` 获取通用 SDK 接入步骤。V1 自动覆盖 app/page lifecycle 和 presence，tap/input/submit 通过 helper 接入已有事件 handler，不承诺编译期模板改写或无侵入全自动交互采集。
- 浏览器插件使用 `tracemind.capture_setup({ platform: "browser_extension" })` 获取通用 WebExtension SDK 接入步骤。V1 自动覆盖插件自有 popup/options/sidebar/devtools DOM 页面和 foreground presence，background/service worker 只支持手动事件；不承诺 content script 对宿主页的无侵入全自动采集。
- Coding agent 使用 `tracemind.capture_setup({ platform: "ios" | "macos" | "android" | "react_native" | "hybrid" | "mini_program" | "browser_extension" | "mcp_node" | "mcp_python" | "agent_skill" | "server_node" | "server_python" | "server_http" })` 获取当前项目的安装步骤、入口文件、幂等检查和验证命令。静态文档只描述流程，不承载具体 project key；registry-backed SDK 优先使用包管理器安装，Swift 和 fallback 场景使用 local source。
- 第一阶段不自动 hook 网络请求、崩溃、session replay 或截图；这些能力后续独立设计。
- Native SDK 使用本地队列批量写入 `/api/capture`，前后台切换或网络恢复时 flush；在线区间写入 `/api/presence`，不参与普通事件队列。
- SDK 过滤明显敏感字段，不采集输入值、截图、secret、token、raw prompt、raw user content 或完整 query URL。

## MVP 决策

- 项目 key 是公开采集 key，只允许写入行为数据。
- 项目 key 不做默认白名单；先提供来源统计和项目级来源屏蔽。
- Web 脚本使用本地可靠队列批量发送；普通发送优先 `fetch` 获取成功/失败结果，页面隐藏或卸载时优先 `navigator.sendBeacon`。
- 暂不做 session replay、DOM/native snapshot、截图录制、自动网络 hook 或崩溃采集。
