# Auto Capture Design

## 目标

让 Web、iOS、Android、React Native、第三方 MCP server 和可执行 Agent Skill runtime 只用一行初始化代码就能启用 TraceMind 行为采集，并且同时支持自动采集、手动埋点、用户识别、设备信息和服务端埋点。

## 一行接入

Web:

```html
<script src="https://tracemind.example.com/capture.js" data-tracemind-token="PROJECT_KEY" async></script>
```

iOS:

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

Native、React Native 和 MCP SDK 的包安装、Gradle/Swift Package/Python package 配置不计入“一行代码”；真正进入业务代码的接入点保持一行初始化。本地开发时，控制台会显示当前项目和平台对应的一行代码。静态 Skill 文件不是运行时，不能独立 auto-capture；只有宿主 agent runtime 暴露 lifecycle hook 时，`agent_skill` 才能采集。

Coding agent 接入时不应从静态 skill 或 rules 文件读取项目 key。应先配置 TraceMind MCP，再调用 `tracemind.capture_setup` 获取当前项目和平台的一行 Auto Capture 代码。Native、React Native、MCP server 和 Agent Skill 接入还应使用 MCP 返回的 `installCommands`、`filesToEdit`、`initLocation`、`idempotencyChecks` 和 `verificationCommands`，先确认没有现有 SDK 依赖或初始化代码后再修改项目。

## 自动采集信号

- `page_view`: Web 页面首次打开，或 Native app/screen 进入。
- `click`: Web 文档级点击，或 Native tap/click 控件行为，包含元素定位信息。
- `input`: Web 表单字段或 Native text input 发生变化，包含元素定位信息，不采集输入值。
- `submit`: Web 表单提交，或 Native 键盘 done/search/send 与确认类提交。
- `route_change`: Web `history.pushState` / 前进后退，或 Native screen/controller/activity 切换。
- `tool_call`: MCP tool handler 完成，记录 tool name、status、duration、error type 和 result size bucket。
- `resource_read`: MCP resource handler 完成，记录 resource name、URI scheme、status、duration 和 result size bucket。
- `prompt_request`: MCP prompt handler 完成，记录 prompt name、status、duration 和 result size bucket。
- `skill_lifecycle`: 宿主 agent runtime 的 Skill started/completed/failed hook。
- `custom`: 通过 Web `window.TraceMind.capture(type, data)` 或 Native `TraceMind.capture(...)` 手动上报。

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

Native 和 React Native 使用同一语义：应用启动只调用一次 `TraceMind.start(...)`，登录成功后可调用 `TraceMind.identify(...)` 持久化业务 `userId`。iOS 存入 `UserDefaults`，Android 存入 `SharedPreferences`，React Native 代理到对应原生 SDK。`identify` 会产生一个经过清洗的 `custom` / `identify` 行为事实，traits 只保留 string、number、boolean。

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

`properties` 放事件属性，`context` 放上报上下文。iOS、Android、React Native、MCP server 和 Agent Skill runtime 手动埋点保持同样字段：只保留 string、number、boolean，省略 null、嵌套对象、数组、PII-like 字段、credential values、raw prompt/content、input value、tool arguments/result、resource content 和带 query 的完整 URL。服务端埋点可以向同一个 `/api/capture` 写入相同字段，并设置 `platform: "server"`。

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
  "targetHash": "tm_fp_xxx",
  "properties": {
    "plan": "pro"
  },
  "context": {
    "source": "manual"
  },
  "occurredAt": "2026-05-06T10:00:00.000Z"
}
```

批量事件：

```json
{
  "projectKey": "tm_proj_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
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
- `sourceType` / `sourceKey` / `sourceLabel` / `sourceDetails`: 从 SDK payload 和请求头归一化得到的来源字段。Web 的 `sourceKey` 优先使用请求 `Origin`，其次使用请求 `Referer`，最后才回退到 SDK payload URL；iOS 使用 bundle id；Android 使用 package name；React Native 复用原生来源并在 `deviceInfo.framework` 或 `sourceDetails.framework` 标记 `react_native`；MCP server 使用配置的 server/package 名作为 `sourceKey`；Agent Skill 使用稳定 Skill 名或宿主 runtime skill id。
- `semanticStatus: "pending"`: 等待语义抽取任务处理。

## 来源治理

`data-tracemind-token` 是公开项目 key，不是密钥。为了保持一行脚本的低接入成本，MVP 不要求开发者预先配置白名单。

服务端会统计每个项目的来源。开发者可以在控制台看到最近写入该项目 key 的来源、事件数和最近出现时间；已屏蔽来源即使没有近期事件，也会保留在列表中以便解除屏蔽。发现异常来源后，可以屏蔽对应 `sourceType + sourceKey`。屏蔽命中后，`/api/capture` 仍返回正常 ok，但不会插入 `RawBehaviors`，也不会产生语义事件。

## 元素区分

自动采集不会只依赖按钮文案或输入框文本。每次 `click`、`input`、`submit` 都会带上：

- `target`: 元素摘要，包括 tag、id、class、name、type、role、aria-label、placeholder、data-testid 和短 DOM path。
- `targetHash`: 基于 `target` 计算的哈希，用于查询和区分同一页面上的相同文案元素。

例如两个都叫“更多”的按钮，只要它们位于不同 DOM 路径、拥有不同 id/name/testId 或所在结构不同，就会得到不同的 `targetHash`。如果某个关键业务动作需要长期稳定分析，仍建议开发者使用手动埋点提供明确的 `eventName`，例如 `header_more_clicked`、`order_card_more_clicked`。

## 跨平台字段

- `platform`: 当前约定为 `web`、`ios`、`android`、`server`；MCP server 和 Agent Skill hook 使用 `server`，具体来源由 `sourceType` 区分。
- `sourceType` 和 `sourceKey`: 表达采集来源，避免使用 `hostname` 这种 Web-only 字段名。Web 使用页面 hostname；iOS 使用 bundle id；Android 使用 package name；MCP server 使用 server/package 名；Agent Skill 使用 Skill 名或宿主 runtime skill id。
- `deviceInfo`: 平台差异字段放这里，例如 iOS/Android 的 OS version、app version、model、network。
- `properties` 和 `context`: 所有业务扩展字段都放这里，避免为每个业务事件改表。

## Native SDK v1 边界

- iOS SDK 位于 `sdk/ios`，公开入口为 `TraceMind.start(projectKey: "PROJECT_KEY")`。
- Android SDK 位于 `sdk/android`，公开入口为 `TraceMind.start(application, projectKey = "PROJECT_KEY")`。
- React Native SDK 位于 `sdk/react-native`，公开入口为 `TraceMind.start({ projectKey: "PROJECT_KEY" })`，内部复用原生 SDK。
- Coding agent 使用 `tracemind.capture_setup({ platform: "ios" | "android" | "react_native" | "mcp_node" | "mcp_python" | "agent_skill" })` 获取当前项目的安装步骤、入口文件、幂等检查和验证命令。静态文档只描述流程，不承载具体 project key。
- 第一阶段不自动 hook 网络请求、崩溃、session replay 或截图；这些能力后续独立设计。
- Native SDK 使用本地队列批量写入 `/api/capture`，前后台切换或网络恢复时 flush。
- SDK 过滤明显敏感字段，不采集输入值、截图、secret、token、raw prompt、raw user content 或完整 query URL。

## MVP 决策

- 项目 key 是公开采集 key，只允许写入行为数据。
- 项目 key 不做默认白名单；先提供来源统计和项目级来源屏蔽。
- 脚本优先使用 `navigator.sendBeacon`，失败时回退到 `fetch(..., keepalive: true)`。
- 暂不做 session replay、DOM/native snapshot、截图录制、自动网络 hook 或崩溃采集。
