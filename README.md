# TraceMind

TraceMind 是一个面向 AI Coding Agent 的产品行为分析层。开发者按平台添加初始化代码后，TraceMind 就会把 Web、iOS、macOS、Android、React Native、混合应用、小程序、浏览器插件、MCP server、普通后端服务和可执行 Agent Skill runtime 里的真实行为自动整理成可分析的产品线索，并通过 MCP 让 Codex、Claude Code、Cursor 等工具直接追问用户流失、功能使用和转化问题，也可以在开发者确认后上报问题或想法反馈。

## Coding Agent 产品分析路径

TraceMind 的 MCP 查询路径面向这些高频客户问题：

- 今天产品是否正常：先调用 `tracemind.project_info` 确认项目，再调用 `tracemind.project_health` 读取今日健康、较前一日变化、小时趋势、需关注项和上报健康。今天的日报基于已结束小时聚合，并与昨天同一小时段对比。
- 现在是否有人在用：调用 `tracemind.recent_online` 查看近 30 分钟在线用户、5 分钟桶、地区 Top3、活跃页面 Top3 和高频事件 Top3。
- 用户在做什么：在日报或实时态势判断大盘后，用 `tracemind.summary` 和 `tracemind.query_events` 按路径、事件名、设备来源、流量来源、用户或 session 下钻功能使用；`summary` 返回最近语义事件样本，全天指标以 `project_health` 为准。
- 用户从哪里来：先看 `project_health` 的 traffic sources，再用 `attributionSource`、`attributionMedium`、`attributionCampaign` 和 `landingPath` 过滤 `summary` / `query_events`，解释增长、下降或转化变化来自哪个渠道。
- 数据为什么没有送达：先用 `project_health` 查看上报健康，再用 `tracemind.query_delivery_diagnostics` 查询最近 7 天按小时、平台、来源、原因类别和 HTTP 状态类别聚合的失败、重试、丢弃、队列峰值与恢复耗时。该工具不返回原始错误、请求/响应体、URL、日志、用户内容或 session/device/batch 标识。
- 为什么下降或哪里卡住：先用 `project_health` 锁定下降指标和时间窗口；如果上报健康异常，先查 `query_delivery_diagnostics`，再查 `query_events`，只有语义证据不足或需要复核采集行为时才查 `query_raw_behaviors`。

`tracemind.submit_feedback` 不是主分析入口；只有 Agent 发现问题或想法，并且开发者明确确认上报后，才把脱敏摘要和证据引用写入反馈库。

## 1 分钟接入

Web 应用把下面这行代码放到页面的 `<head>` 或 `</body>` 前：

```html
<script src="https://tracemind.sandbox.galaxycloud.app/capture.js" data-tracemind-token="tm_proj_xxx" async></script>
```

其中：

- `src` 是 TraceMind 的采集脚本地址。
- `data-tracemind-token` 是项目的公开采集 token。
- `async` 表示脚本异步加载，不阻塞页面解析。

开发者控制台支持中英文切换，右上角选择语言后会保存在当前浏览器中。
控制台默认收起项目配置详情，但在收起态保留 Coding Agent 安装提示词复制入口；展开配置详情后可以复制 `projectKey`、管理 MCP Token 并查看采集来源。各环境的安装步骤与使用方式以本文档为准。

Native、小程序、浏览器插件、MCP 和 server SDK 应先调用 `tracemind.capture_setup` 获取当前项目的真实安装方式。npm、PyPI 和 Maven Central 已发布的平台默认返回 registry 安装命令；Swift iOS/macOS 继续使用本地源码 Swift Package。所有 SDK setup 都会返回 `latestSdk`、`installedVersionDetection`、`upgradeCommands` 和 `verificationCommands`，并继续用 `contentHash` 判断是否需要升级，而不是只看版本号。registry 不可用或企业内网限制时，返回内容里的 `localSourceFallback` 可作为受控兜底。包安装和依赖配置完成后，业务代码只需要一行初始化：

```swift
TraceMind.start(projectKey: "tm_proj_xxx")
```

```kotlin
TraceMind.start(application, projectKey = "tm_proj_xxx")
```

```js
TraceMind.start({ projectKey: "tm_proj_xxx" });
```

混合应用通过 `tracemind.capture_setup({ platform: "hybrid" })` 获取组合接入步骤：WebView 内使用 Web Auto Capture，原生壳层使用对应 iOS/macOS/Android SDK，并在登录和 deeplink 入口打通安全身份与来源上下文。

小程序通过 `tracemind.capture_setup({ platform: "mini_program", provider: "wechat" })` 获取同一套通用 SDK 接入方式，`provider` 可选 `wechat`、`alipay`、`douyin` 或 `dingtalk`：

```js
import { TraceMind } from "@tracemind/mini-program";

TraceMind.start({
  projectKey: "tm_proj_xxx",
  provider: "wechat",
  appId: "wx123",
  appName: "Example Mini Program"
});
```

浏览器插件通过 `tracemind.capture_setup({ platform: "browser_extension" })` 获取 Chrome / Edge / Firefox 共用的 WebExtension SDK 接入方式：

```js
import { TraceMind } from "@tracemind/browser-extension";

TraceMind.start({
  projectKey: "tm_proj_xxx",
  extensionName: "Example Extension"
});
```

接入后会自动采集：

- `page_view`: 页面打开或刷新。
- `click`: 用户点击页面元素或原生界面控件。
- `input`: 输入控件发生变化，不采集输入值。
- `submit`: 表单提交。
- `route_change`: SPA 路由变化或原生页面切换。
- 在线时长：Web、iOS、macOS、Android、React Native、混合应用的 WebView/原生壳层、小程序和浏览器插件自有前台页面分别上报前台在线区间；5 秒 heartbeat 只更新在线区间，不进入最近事件列表。

## Web 接入方式

最简单方式是一行脚本：

```html
<script src="https://tracemind.sandbox.galaxycloud.app/capture.js" data-tracemind-token="tm_proj_xxx" async></script>
```

如果需要自定义上报地址，可以加 `data-tracemind-endpoint`：

```html
<script
  src="https://tracemind.sandbox.galaxycloud.app/capture.js"
  data-tracemind-token="tm_proj_xxx"
  data-tracemind-endpoint="https://tracemind.sandbox.galaxycloud.app/api/capture"
  async>
</script>
```

TraceMind 会在页面上暴露：

```js
window.TraceMind.capture(type, data);
window.TraceMind.captureError(errorOrInfo);
window.TraceMind.identify(userId, traits);
window.TraceMind.openFeedback();
window.TraceMind.submitFeedback({ message });
window.TraceMind.flush();
window.TraceMind.status();
```

Web 自动采集会先写入内存队列，并尽量同步持久化到 `localStorage`。队列会批量发送行为事件和在线区间，网络失败时保留事件并指数退避重试；页面隐藏、关闭、恢复联网或调用 `TraceMind.flush()` 时都会尝试 flush。`TraceMind.status()` 返回队列长度、丢弃计数、重试次数和最近错误等非敏感诊断摘要，可用于排查跨境网络或 CSP/connect-src 导致的上报稀疏问题。

## 错误上下文

TraceMind 支持 `app_error` 事件，用于把产品错误放回用户行为、路径、来源、session、用户和健康趋势里分析。它不是 Sentry/Crashlytics 替代品；v1 只回答“用户在哪里遇到错误、之前做了什么、影响哪些路径/转化、是否集中爆发”。

Web Auto Capture 会自动监听 `window.error` 和 `unhandledrejection`，只上报错误摘要：`errorKind`、`errorType`、`messageFingerprint`、`messagePreview`、`stackFingerprint`、`topFrameFingerprint`、`causeType`、`causeFingerprint`、`fatal`、`handled`、`source`、`path/screen`、`release`、`component`、`operation`、`feature`、`routeName`、`correlationId`、`requestId`、`httpStatus`、`status` 和 `occurredAt`。不会上报原始 stack trace、源码、request/response body、headers、cookies、authorization、raw log、输入值、raw prompt、raw user content、secret、带 query 的完整 URL、截图、录屏或 session replay。

```js
window.TraceMind.captureError(error, {
  component: "CheckoutForm",
  release: "2026.05.25",
  handled: true
});
```

Native、小程序、浏览器插件和 server SDK 也提供手动 helper：iOS/macOS `TraceMind.captureError(...)`、Android `TraceMind.captureError(...)`、React Native `TraceMind.captureError(...)`、Mini Program `TraceMind.captureError(...)`、Browser Extension `TraceMind.captureError(...)`、Node/Python server SDK `TraceMindServer.captureError(...)` / `capture_error(...)`。Server SDK v1 仍然只做手动错误摘要，不做全局 request hook、log hook、DB hook 或 crash reporter。

## 终端用户反馈

客户 app 可以通过 TraceMind SDK 直接收集终端用户反馈，不需要自己新建服务端。用户反馈写入独立的 `tracemind_user_feedback_reports` 集合，不进入 raw behaviors，也不是 `custom` event。

```js
window.TraceMind.submitFeedback({
  message: {
    kind: "issue",
    title: "Cannot upgrade",
    body: "The upgrade button did not finish.",
    contact: { email: "user@example.com", consent: true },
    fields: { plan: "pro" },
    attachments: []
  }
});
```

Native、小程序、浏览器插件和 server SDK 使用同名能力：iOS/macOS `TraceMind.submitFeedback(message:)`、Android `TraceMind.submitFeedback(message)`、React Native `TraceMind.submitFeedback({ message })`、Mini Program `TraceMind.submitFeedback({ message })`、Browser Extension `TraceMind.submitFeedback({ message })`、Node/Python server SDK `TraceMindServer.submitFeedback(...)` / `submit_feedback(...)`。

联系方式只允许来自用户主动提交的 feedback payload；自动采集仍然不读取输入值、邮箱、手机号、prompt、token、源码 diff、请求/响应 body 或完整 query URL。v1 不做公开反馈板、投票、roadmap、changelog、截图、录屏或附件上传，`attachments` 只保留为空数组用于未来兼容。Coding agent 实现用户反馈入口时必须使用 `submitFeedback`，不能用 `/api/capture`、`capture("custom")` 或 `tracemind.submit_feedback` 替代。

## iOS 接入方式

通过 `tracemind.capture_setup({ platform: "ios" })` 获取真实安装步骤：Swift SDK 当前仍从 TraceMind GitHub 源码仓库复制 `sdk/ios` 到客户项目的 `vendor/TraceMind`，再作为本地 Swift Package 加入应用。随后在 App 入口初始化：

```swift
import TraceMind

TraceMind.start(projectKey: "tm_proj_xxx")
```

iOS SDK 会使用 bundle id 作为 `sourceKey`，自动记录应用激活、页面/控制器路径、点击、输入变化和提交类行为；不会采集输入值或截图。

当 iOS app 通过 universal link、自定义 URL scheme、handoff 或其他 app 打开时，在 URL 处理入口调用：

```swift
TraceMind.recordOpenURL(url, sourceApplication: sourceApplication)
```

如果来源由业务逻辑确定，也可以先传入已经脱敏的自定义归因：

```swift
TraceMind.setAttribution(TraceMindAttribution(source: "partner", medium: "universal_link", campaign: "launch", landingPath: "/invite"))
```

## macOS 接入方式

macOS 复用同一套 Swift Package，不需要单独的包。通过 `tracemind.capture_setup({ platform: "macos" })` 复制 `sdk/ios` 到 `vendor/TraceMind`，加入本地依赖后在 App 入口初始化：

```swift
import TraceMind

TraceMind.start(projectKey: "tm_proj_xxx")
```

macOS SDK 会使用 bundle id 作为 `sourceKey`，上报 `platform: "macos"` 和 `source.type: "macos"`。Auto Capture 第一版记录应用激活、窗口/主窗口变化和 screen 在线区间；如果应用有更稳定的业务 screen 名称，可以主动调用：

```swift
TraceMind.setScreen("CheckoutWindow")
```

手动业务事件继续使用同一套 `TraceMind.capture(...)` API，适合记录自动采集无法推断的业务结果。

macOS 如果处理自定义 URL scheme、universal link 或 handoff，也复用 `TraceMind.recordOpenURL(...)` / `TraceMind.setAttribution(...)` 记录安全来源归因。

## Android 接入方式

通过 `tracemind.capture_setup({ platform: "android" })` 获取 Maven Central 安装命令，在 Gradle 中加入返回的 `implementation(...)` 依赖，随后在 `Application.onCreate()` 初始化；如果 registry 不可用，再使用返回的 `localSourceFallback`：

```kotlin
import com.tracemind.TraceMind

TraceMind.start(application, projectKey = "tm_proj_xxx")
```

Android SDK 会使用 package name 作为 `sourceKey`，通过 Activity lifecycle、Window touch/key callback 记录页面、点击、输入变化和提交类行为；不会采集输入值或截图。Activity 前台期间会记录在线区间，进入后台时结束该区间并 flush。

当 Android app 通过 app link、自定义 scheme 或其他 app 打开时，SDK 会尝试读取 Activity intent/referrer；如果 deeplink 在路由层更新，应显式调用：

```kotlin
TraceMind.recordDeepLink(
  url = intent.data?.toString(),
  referrer = referrer?.toString(),
  sourcePackage = callingPackage
)
```

## React Native 接入方式

通过 `tracemind.capture_setup({ platform: "react_native" })` 获取 npm/pnpm/yarn registry 安装命令，并完成 iOS/Android 原生安装步骤：

```js
import { TraceMind } from "@tracemind/react-native";

TraceMind.start({ projectKey: "tm_proj_xxx" });
```

React Native 复用原生 iOS/Android SDK，上报时保持 `platform: "ios"` 或 `platform: "android"`，并在 `deviceInfo.framework` 标记 `react_native`。推荐在导航变化时调用 `TraceMind.setScreen("ScreenName")`，用于更准确的 screen 区间和严格活跃时长。

React Native 的来源归因应接在 `Linking.getInitialURL()` 和 URL 订阅中：

```js
TraceMind.recordDeepLink({ url, referrer, sourcePackage });
TraceMind.setAttribution({ source: "partner", medium: "deeplink", campaign: "launch", landingPath: "/invite" });
```

## 混合应用接入方式

混合应用不是新的事件平台，而是 WebView 和原生壳层的组合接入。coding agent 应通过 `tracemind.capture_setup({ platform: "hybrid" })` 获取当前项目的 WebView 脚本、原生初始化、幂等检查和验证步骤。

WebView 内的 H5 页面继续使用 Web Auto Capture：

```html
<script src="https://tracemind.sandbox.galaxycloud.app/capture.js" data-tracemind-token="tm_proj_xxx" data-tracemind-framework="hybrid" async></script>
```

原生壳层继续使用对应 SDK：

```swift
TraceMind.start(projectKey: "tm_proj_xxx")
```

```kotlin
TraceMind.start(application, projectKey = "tm_proj_xxx")
```

事件归属保持清晰：WebView 里的页面、点击、输入、提交和 Web 路由仍上报 `platform: "web"`；壳层启动、前后台、原生页面和 deeplink 仍上报 `platform: "ios"`、`"macos"` 或 `"android"`。WebView 脚本用 `data-tracemind-framework` 写入 `sourceDetails.framework`，默认可填 `hybrid`，明确框架时可改为 `capacitor`、`cordova`、`electron` 或 `tauri`；原生壳层继续用 `deviceInfo.framework` 或 `sourceDetails.framework` 标记具体壳层。

登录成功后，在 WebView 和原生壳层都调用 `identify`，使用同一个稳定内部 `userId`，这样 Agent 可以把同一用户在 H5 和壳层里的行为关联起来。原生壳层处理 universal link、app link、自定义 scheme 或 WebView deeplink 时，继续使用 `TraceMind.recordOpenURL(...)` 或 `TraceMind.recordDeepLink(...)`；桥接层只传安全身份、路由和来源元信息，不能传输入值、cookie、token、页面内容或完整 query URL。

验证时至少覆盖三条路径：WebView 页面加载/点击/提交，原生前后台或页面切换，以及 deeplink 进入混合页面。确认两层使用同一个 `projectKey`，登录后共享同一个业务 `userId`，且原始行为里没有输入值、token、cookie 或完整 query URL。

## 小程序接入方式

小程序是独立运行时平台，不复用 Web `capture.js`，因为微信、支付宝、抖音、钉钉小程序没有 DOM/script 注入环境。V1 使用一套通用 `@tracemind/mini-program` SDK，通过 `provider` 区分宿主，不为每个平台复制 SDK。当前通过 `tracemind.capture_setup` 返回 npm registry 安装命令。

```js
import { TraceMind } from "@tracemind/mini-program";

TraceMind.start({
  projectKey: "tm_proj_xxx",
  provider: "wechat",
  appId: "wx123",
  appName: "Example Mini Program"
});
```

`tracemind.capture_setup({ platform: "mini_program", provider: "wechat" })` 会返回同一套安装步骤，`provider` 可替换为 `alipay`、`douyin` 或 `dingtalk`。别名 `wechat_mini_program`、`alipay_mini_program`、`douyin_mini_program`、`dingtalk_mini_program` 会归一为 `mini_program + provider`。

自动采集 V1 覆盖 app/session start、app show/hide、page view、page show/hide、route/page path 和 presence heartbeat。点击、输入、提交不做“无侵入全自动”承诺，先通过 helper 接入已有 handler：

```js
TraceMind.trackTap("checkout_button", {
  path: "/pages/pricing/index",
  properties: { plan: "pro" }
});

TraceMind.trackInput("phone_input", {
  path: "/pages/pricing/index",
  properties: { field: "phone" }
});

TraceMind.trackSubmit("checkout_form", {
  path: "/pages/pricing/index",
  properties: { success: true }
});
```

小程序事件使用 `platform: "mini_program"`、`sourceType: "mini_program"`。`sourceKey` 优先使用小程序 `appId`，没有 `appId` 时使用配置的 `sourceKey`；`sourceDetails.provider` 标记 `wechat`、`alipay`、`douyin` 或 `dingtalk`。SDK 不采集输入值、截图、用户输入内容、完整 query URL、token、cookie 或 raw content。

## 浏览器插件接入方式

浏览器插件是独立运行时平台，不复用 Web `capture.js`。V1 使用一套通用 `@tracemind/browser-extension`，支持 Chrome、Edge 和 Firefox 的插件自有界面：popup、options、sidebar、devtools page，以及 background/service worker 里的手动业务事件。当前通过 `tracemind.capture_setup` 返回 npm registry 安装命令。

```js
import { TraceMind } from "@tracemind/browser-extension";

TraceMind.start({
  projectKey: "tm_proj_xxx",
  extensionName: "Example Extension"
});

TraceMind.capture("custom", {
  eventName: "export_completed",
  properties: { success: true }
});
```

`tracemind.capture_setup({ platform: "browser_extension" })` 会返回安装步骤、manifest 权限提示、初始化片段、来源模型和验证命令。别名 `chrome_extension`、`edge_extension`、`firefox_extension`、`web_extension` 会归一为 `browser_extension`。

插件自有 DOM 页面默认自动采集 extension UI start、page view、click、input changed without value、submit、route/path、前台 presence heartbeat 和安全 JS 错误摘要。background/service worker 没有 DOM，自动跳过 DOM listener，只支持 `capture`、`captureError`、`identify`、`submitFeedback` 和 `flush`。

浏览器插件事件使用 `platform: "browser_extension"`、`sourceType: "browser_extension"`。`sourceKey` 优先使用 extension id；`sourceDetails` 只保留安全白名单：`browser`、`manifestVersion`、`runtimeContext` 和 `sdkVersion`。V1 不支持 content script 对宿主页的无侵入全自动采集，不采集宿主页 DOM、页面内容、截图、浏览器历史、书签、cookies、tab 完整 URL、query、token 或输入值。

## MCP Server 接入方式

第三方 MCP server 可以像 Web/Native 一样接入 TraceMind。区别是 Auto Capture 记录的是 MCP 运行时事实，而不是页面点击：tool call、resource read、prompt request、status、duration、error type 和结果大小分桶。

Node MCP 使用 npm 包 `@tracemind/mcp-node`；Python MCP 使用 PyPI 包 `tracemind-mcp`。具体命令以 `tracemind.capture_setup` 返回值为准，受限环境可使用返回的 `localSourceFallback`。

Node MCP:

```ts
import { TraceMindMCP } from "@tracemind/mcp-node";

TraceMindMCP.start(server, {
  projectKey: "tm_proj_xxx",
  sourceKey: "docs-mcp"
});
```

Python MCP:

```py
from tracemind_mcp import TraceMindMCP

TraceMindMCP.start(server, project_key="tm_proj_xxx", source_key="docs-mcp")
```

MCP server 事件使用 `platform: "server"`、`sourceType: "mcp_server"`。SDK 只记录安全元数据，不记录 raw prompt、tool arguments、tool result、resource content、源码 diff、token 或完整 URL。

## Agent Skill 接入方式

静态 `SKILL.md` 是说明书，不是运行时，所以静态 Skill 文件本身不能 auto-capture。只有宿主 agent runtime 暴露 started/completed/failed 等生命周期 hook 时，才能接入：

```js
TraceMindMCP.captureSkillLifecycle({
  skillName: "docs-indexer",
  version: "1.2.0",
  phase: "completed",
  success: true
});
```

Agent Skill 事件使用 `platform: "server"`、`sourceType: "agent_skill"`。如果宿主没有生命周期 hook，就把 Skill 作为教程，实际埋点放到 MCP server 或真正执行任务的 runtime 中。

## Server 手动埋点接入方式

普通后端服务第一版先提供手动埋点能力，不做 request Auto Capture，避免把每个 HTTP 请求、日志或中间件细节变成低价值噪音。coding agent 应通过 `tracemind.capture_setup({ platform: "server_node" })`、`server_python` 或 `server_http` 获取当前项目的一行初始化、payload 模板和隐私规则；Node/Python SDK 默认走 npm/PyPI registry 安装，`server_http` 不需要 SDK 安装。服务端 SDK 不参与“用户在线时长”统计；服务实例存活监控属于后续独立能力，不能和用户端在线时长混用。

`capture_setup` 返回的 `projectKey` 是当前客户项目的 public write key，可以直接放在服务端初始化代码里；这不是 MCP token，也不是 Bearer token。默认使用返回的 `inline_project_key` 模式。只有当客户仓库已有“公开 runtime config 走部署环境变量”的工程惯例时，才使用可选 `env_project_key` 模式，并把 `TRACEMIND_PROJECT_KEY` 配成同一个 public projectKey。`TRACEMIND_PRODUCT_USAGE_PROJECT_ID/KEY` 只属于 TraceMind 自己的内部 dogfood marker，不是客户服务端埋点参数。

Server 接入完成后不要只看一次查询结果为 0 就判断无活跃。先执行返回的 `preDeployChecks`：确认 `initSnippet` 已在服务启动时运行、没有把 MCP token/Bearer token/内部 dogfood 配置当作 capture key、env 模式下部署环境存在 `TRACEMIND_PROJECT_KEY`、服务端能 egress 到 `captureApiUrl`。部署后触发刚刚埋点的真实业务路径，再按 `postDeployVerification.expectedCaptureQuery` 查询 `eventName + sourceType/server_app + sourceKey`。如果仍为 0，排查顺序是 SDK 初始化、projectKey/env、egress/TLS/proxy、`/api/capture` delivery、事件名和查询窗口/sourceKey。

Node server:

```ts
import { TraceMindServer } from "@tracemind/server-node";

TraceMindServer.start({
  projectKey: "tm_proj_xxx",
  sourceKey: "billing-api"
});

TraceMindServer.capture("custom", {
  eventName: approvedEventName,
  userId: "user-123",
  attribution: { source: "partner", medium: "referral", campaign: "launch", landingPath: "/invite" },
  properties: { amount: 2900, success: true },
  context: { source: "stripe_webhook" }
});
```

Python server:

```py
from tracemind_server import TraceMindServer

TraceMindServer.start(project_key="tm_proj_xxx", source_key="billing-api")

TraceMindServer.capture(
    "custom",
    event_name=approved_event_name,
    user_id="user-123",
    attribution={"source": "partner", "medium": "referral", "campaign": "launch", "landingPath": "/invite"},
    properties={"amount": 2900, "success": True},
    context={"source": "stripe_webhook"},
)
```

其它后端语言使用 `server_http` 返回的 `/api/capture` payload 模板。普通服务端事件使用 `platform: "server"`、`sourceType: "server_app"`。只记录稳定业务结果，例如支付成功、账单已付、工作区创建、任务完成或同步完成；服务端不自动推断用户流量来源，只有业务事件已经持有来自产品侧的安全来源上下文时才传 `attribution`。不要采集 request body、response body、headers、cookies、authorization、raw logs、secret、token、prompt、源码、完整 query URL、搜索词或原始 click id。

## 记录登录用户 UID

如果网站有登录系统，建议把业务用户 ID 传给 TraceMind。这样才能计算 DAU、留存、用户路径、转化漏斗等常见产品分析指标。

方式一：使用全局 UID 获取方法。

```html
<script>
  window.getCurrentUserId = function () {
    return window.appUser && window.appUser.id;
  };
</script>

<script
  src="https://tracemind.sandbox.galaxycloud.app/capture.js"
  data-tracemind-token="tm_proj_xxx"
  data-tracemind-user-id-provider="getCurrentUserId"
  async>
</script>
```

这个方式适合 React、Vue、Svelte、Angular、Meteor、Next.js 或普通 HTML 页面。只要最终能在 `window` 上提供一个函数或值，TraceMind 就能读取。

方式二：登录成功后主动 identify。

```js
window.TraceMind.identify("user-123", {
  plan: "pro",
  role: "admin"
});
```

TraceMind 会把 `userId` 保存到浏览器本地，并随之后的事件自动上报。DAU 口径使用 `userId || anonymousId` 按自然日去重。

Native 和 React Native 使用同一个模型，在登录成功后调用：

```swift
try? TraceMind.identify("user-123", traits: [
  "plan": "pro",
  "trial": true
])
```

```kotlin
TraceMind.identify(
  userId = "user-123",
  traits = mapOf("plan" to "pro", "trial" to true)
)
```

```js
TraceMind.identify("user-123", {
  plan: "pro",
  trial: true
});
```

## 手动埋点

自动采集适合快速覆盖通用行为。关键业务动作建议使用手动埋点，提供稳定、明确的事件名。

```js
window.TraceMind.capture("custom", {
  eventName: "plan_selected",
  userId: "user-123",
  properties: {
    plan: "pro",
    amount: 29
  },
  context: {
    source: "pricing_page",
    experiment: "pricing_v2"
  }
});
```

字段约定：

- `eventName`: 稳定的业务事件名，例如 `plan_selected`、`checkout_started`。
- `properties`: 事件自身属性，例如套餐、金额、按钮位置、订单 ID。
- `context`: 上报上下文，例如来源、实验分组、trace id、feature flag。
- `userId`: 业务用户 ID。前端已调用 `identify()` 时可省略。

Native 手动埋点保持同样字段，iOS 和 macOS 都使用 Swift API，macOS 事件会携带 `platform: "macos"`。`properties` 和 `context` 只保留 string、number、boolean；SDK 会丢弃 null、嵌套对象、数组、PII-like 字段、credential values、raw prompt/content、input value 和带 query 的完整 URL。

错误摘要使用 `captureError`，只保留错误类型、脱敏后的短消息预览、消息/stack/top-frame/cause 指纹、handled/fatal、component/release、operation/feature、correlation/request id、HTTP 状态和 path/screen 等上下文字段，不采集原始 stack 或 raw message。

```swift
try? TraceMind.capture(
  "custom",
  eventName: approvedEventName,
  path: "PricingViewController",
  properties: [
    "plan": "pro",
    "amount": 29,
    "trial": true
  ],
  context: [
    "source": "pricing_page"
  ]
)
```

```kotlin
TraceMind.capture(
  type = "custom",
  eventName = approvedEventName,
  path = "PricingActivity",
  properties = mapOf(
    "plan" to "pro",
    "amount" to 29,
    "trial" to true
  ),
  context = mapOf("source" to "pricing_page")
)
```

```js
TraceMind.capture("custom", {
  eventName: approvedEventName,
  path: "Pricing",
  properties: {
    plan: "pro",
    amount: 29,
    trial: true
  },
  context: {
    source: "pricing_page"
  }
});
```

MCP server 手动埋点适合记录自动生命周期无法稳定表达的业务结果，例如文档索引完成、仓库同步成功或部署创建：

```ts
TraceMindMCP.capture("custom", {
  eventName: approvedEventName,
  userId: "user-123",
  properties: {
    documentCount: 12,
    success: true
  },
  context: {
    toolName: "sync_docs"
  }
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

普通服务端或 SDK 队列也可以向同一个 `/api/capture` 上报事件。单事件格式继续兼容；批量格式使用 `{ "projectKey": "...", "events": [...] }`。普通服务端埋点建议设置 `platform: "server"` 和 `sourceType: "server_app"`：

```json
{
  "projectKey": "tm_proj_xxx",
  "platform": "server",
  "type": "custom",
  "eventName": "invoice_paid",
  "userId": "user-123",
  "source": {
    "type": "server_app",
    "key": "billing-api"
  },
  "attribution": {
    "source": "partner",
    "medium": "referral",
    "campaign": "launch",
    "landingPath": "/invite"
  },
  "properties": {
    "invoiceId": "inv_123",
    "amount": 2900
  },
  "context": {
    "source": "stripe_webhook"
  }
}
```

## 在线时长

Web、iOS、macOS、Android、React Native 和小程序 SDK 会向 `/api/presence` 上报在线区间：

```json
{
  "projectKey": "tm_proj_xxx",
  "presenceId": "tm_pres_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "deviceId": "tm_dev_xxx",
  "platform": "web",
  "path": "/pricing",
  "state": "heartbeat",
  "heartbeatIntervalMs": 5000,
  "activeDurationMs": 120000,
  "lastActiveAt": "2026-05-08T01:02:00.000Z",
  "activeState": "active",
  "idleTimeoutMs": 60000
}
```

Presence 数据写入 `tracemind_presence_sessions`，同一个 `presenceId` 只更新一条区间记录。`durationMs` 保留为前台/可见在线区间时长，`lastSeenAt` 距当前 15 秒内视为在线。页面隐藏、App 进后台、路由或 screen 切换时结束当前区间；Native/RN `setScreen` 会结束旧 screen 区间并开启新区间。Web presence 只记录 `pathname`，不包含 query string。Presence 不生成 raw behavior 或 semantic event。

Traffic attribution 用 `attribution` 表示用户从哪里来到产品，和 `sourceType/sourceKey` 这种采集来源治理字段分开。Web Auto Capture 会在一次浏览器 visit 的落地页上生成 first-touch attribution，并通过 `sessionStorage` 复用到该 visit 后续的 page、route、click、input、submit 和 presence 数据；iOS/macOS、Android 和 React Native 通过 `recordOpenURL`、`recordDeepLink` 或 `setAttribution` 把 universal link、app link、custom scheme、外部 app referrer 或安全业务来源附到后续事件和 presence；小程序通过 `TraceMind.setAttribution(...)` 传入已经脱敏的 campaign、scene、二维码、分享或渠道信息。归因只保留白名单字段：`utm_source`、`utm_medium`、`utm_campaign`、`utm_content`、referrer domain/type、landing path，以及 `gclidPresent` 等布尔点击标记；不会保存完整 URL、任意 query、搜索词、click id 或 PII。旧事件没有可靠的原始 query/referrer/deeplink 上下文，部署后只从新事件开始统计，不做历史回填。

Dashboard 健康概览里的活跃时长使用更严格的 `activeDurationMs`：Web 必须页面可见且浏览器窗口获得焦点，并且最近 60 秒内有加载、focus、click、input、change、submit、keydown、scroll、touch 或 pointer 交互；切到其他桌面 App 时立即停止严格活跃计时，但 presence heartbeat 可继续更新前台在线区间。iOS/Android/RN 必须 App 处于前台，tap、text、screen 变化刷新 60 秒活跃窗口。旧 presence 记录缺少 `activeDurationMs` 时按 0 处理，不回填旧 `durationMs`。

健康概览的日视图由小时级健康报告聚合而来，避免把今天的半天数据和昨天全天直接比较。选择“今天”时，日报告只使用已结束小时，并与昨天相同小时段对比；当前未结束小时不进入日报趋势。控制台会延迟异步加载“近 30 分钟在线人数”卡片，它不阻塞日报告卡片，单独统计过去半小时的去重在线用户、每 5 分钟在线人数、地区分布 Top3、活跃时长最长页面 Top3 和高频事件 Top3。

## 数据保留窗口

TraceMind 会区分“可下钻明细”和“长期分析口径”：

- `tracemind_capture_delivery_reports` 是上报投递异常诊断明细，保留 7 天。使用 `tracemind.query_delivery_diagnostics` 查询小时/source/platform、reason 类别、HTTP 状态类别、队列深度、重试/丢弃计数和可用恢复耗时等脱敏聚合；它不回显原始错误、请求/响应体、URL、日志、用户内容或 session/device/batch 标识。成功 flush 只写入小时级上报健康聚合，更早的上报健康请看 `project_health.delivery`、小时报告和日报。
- `tracemind_presence_sessions` 是在线区间和会话级在线明细，按 `lastSeenAt` 保留 10 天。更早的在线人数、活跃时长和页面停留趋势请看小时报告和日报。
- `tracemind_raw_behaviors` 是原始行为日志，按 `occurredAt` 保留 10 天。超过窗口后，`tracemind.query_raw_behaviors` 查不到明细不代表数据丢失，应先用 `tracemind.project_health`、小时报告和日报排查。
- `tracemind_semantic_events` 是语义事件明细，按 `occurredAt` 保留 10 天，用于近期 MCP/LLM 证据下钻。
- `tracemind_project_hourly_reports` 和 `tracemind_project_daily_reports` 当前长期保留，是历史产品行为分析和长期健康趋势的主要来源。

## Semantic Event 事件说明

TraceMind 会先保存原始行为日志，再抽取为语义事件，方便 LLM/MCP 按业务含义查询。

| eventType | 名称 | 含义 | 常见字段 |
| --- | --- | --- | --- |
| `page_view` | 页面浏览 | 用户打开或刷新页面，用于分析访问量、落地页、路径入口、流量归因和页面级留存。 | `title`, `path`, `referrer`, `attribution` |
| `click` | 元素点击 | 用户点击界面元素，用于分析功能入口、按钮转化和交互兴趣。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` |
| `input` | 输入变化 | 用户修改输入控件，用于分析表单填写、设置修改和关键流程参与度。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` |
| `submit` | 表单提交 | 用户提交表单或确认动作，用于分析注册、支付、创建、搜索等转化节点。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` |
| `route_change` | 页面跳转 | 用户在应用内发生路由变化，用于分析路径流转、漏斗顺序和页面间跳转。 | `path`, `referrer`, `attribution` |
| `api_call` | 接口调用 | 客户端或服务端记录接口调用，用于分析接口失败、关键后端流程和服务端埋点。 | `method`, `status`, `path` |
| `app_error` | 产品错误 | 产品或运行时记录隐私安全的错误摘要，用于分析错误发生路径、前序行为、影响范围和集中爆发。 | `errorKind`, `errorType`, `messageFingerprint`, `messagePreview`, `stackFingerprint`, `topFrameFingerprint`, `causeType`, `causeFingerprint`, `fatal`, `handled`, `source`, `path`, `screen`, `release`, `component`, `operation`, `feature`, `routeName`, `correlationId`, `requestId`, `httpStatus`, `status`, `occurredAt` |
| `tool_call` | MCP 工具调用 | MCP server 记录工具调用完成情况，用于分析工具使用量、失败率和耗时。 | `toolName`, `status`, `durationMs`, `errorType`, `resultSizeBucket` |
| `resource_read` | MCP 资源读取 | MCP server 记录资源读取完成情况，用于分析资源访问、失败率和耗时。 | `resourceName`, `uriScheme`, `uriTemplateHash`, `status`, `durationMs` |
| `prompt_request` | MCP Prompt 请求 | MCP server 记录 prompt 请求完成情况，用于分析 prompt 使用、失败率和耗时。 | `promptName`, `status`, `durationMs` |
| `skill_lifecycle` | Agent Skill 生命周期 | 宿主 agent runtime 记录 Skill started/completed/failed 等生命周期信号。 | `skillName`, `version`, `phase`, `success`, `durationMs` |
| `custom` | 自定义事件 | 开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。 | `eventName`, `properties`, `context` |

在线时长不是语义事件类型；它通过独立 presence 区间统计当前在线、最近在线、总在线时长、平均会话时长，以及按页面、screen、来源聚合的停留时长。

每条语义事件会尽量保留这些分析字段：

- 身份字段：`userId`、`anonymousId`、`sessionId`
- 设备字段：`deviceId`、`deviceFingerprint`、`deviceInfo`
- 平台字段：`platform`
- 地理字段：`ip`、`geo`
- 页面字段：`path`、`title`
- 元素字段：`target`、`targetHash`、`targetText`、`targetTag`
- 扩展字段：`properties`、`context`

## 区分相同按钮和输入框

如果同一个页面有两个输入框，或者两个都叫“更多”的按钮，只看文案是不够的。

TraceMind 会为 `click`、`input`、`submit` 自动记录：

```json
{
  "target": {
    "tag": "BUTTON",
    "text": "更多",
    "id": "order-more",
    "role": "button",
    "testId": "order-card-more",
    "path": "main:nth-of-type(1)>section:nth-of-type(2)>button#order-more"
  },
  "targetHash": "tm_target_xxx"
}
```

`targetHash` 用于查询和区分同一页面上的相同文案元素。对于长期稳定的关键漏斗，仍建议手动上报明确事件名，例如：

```js
window.TraceMind.capture("custom", {
  eventName: "order_card_more_clicked",
  properties: {
    orderId: "order_123"
  }
});
```

## 远程 MCP 授权

MCP 使用独立 token，格式为 `tm_mcp_xxx`。它和 Auto Capture 的公开 `tm_proj_xxx` 项目 token 分离，项目 token 只能写入采集数据，不能查询 MCP。MCP token 可读取项目行为证据和用户反馈，并允许通过 `tracemind.submit_feedback` 提交开发者反馈、通过 `tracemind.update_user_feedback` 标记终端用户反馈状态；不能修改用户原始反馈内容。

控制台里可以为同一个项目创建多个 MCP Token，分别发给不同成员或 Agent。泄露后可以刷新单个 token，刷新后旧 token 立即失效；也可以删除不再使用的 token。

复制 Coding Agent 安装提示词前，请先切到目标代码仓库对应的 agent 会话或工作区，避免把另一个 TraceMind 项目的绑定写入错误仓库。

MCP 连接地址：

```text
https://tracemind.sandbox.galaxycloud.app/mcp?mcpToken=tm_mcp_xxx
```

推荐在支持自定义请求头的 MCP 客户端中使用 Bearer：

```text
Authorization: Bearer tm_mcp_xxx
```

## 对用户网站的影响

添加脚本后，TraceMind 不会修改页面 DOM、不会插入 UI、不会修改样式。它会新增：

```js
window.TraceMind
window.__TraceMindLoaded
```

并包装一次 `history.pushState`，用于记录 SPA 路由变化。

网络影响：

- 页面会额外加载一次稳定入口 `capture.js`。该入口直接返回压缩脚本，带 `ETag` 和约 60 秒短缓存，兼容已经接入的旧 snippet、严格 CSP 和 SRI/代理环境。
- 自动事件和在线区间先写入本地队列，再批量发送到 `/api/capture` 和 `/api/presence`。
- 普通前台发送使用 `fetch` 获取成功/失败结果；页面隐藏或关闭时优先使用 `navigator.sendBeacon`。
- 发送失败会保留队列并重试，队列超过上限时才丢弃最旧记录。

性能影响：

- 普通页面影响很小。
- 高流量网站、复杂页面或高频交互场景会增加队列压力和数据库写入量。
- 后续生产版本应支持采样和更细粒度节流。

兼容性影响：

- 支持普通 HTML、React、Vue、Svelte、Angular、Meteor、Next.js 等前端技术。
- 如果网站配置了 CSP，需要允许脚本和上报地址。

```text
script-src https://tracemind.sandbox.galaxycloud.app
connect-src https://tracemind.sandbox.galaxycloud.app
```

## 隐私与安全

自动采集会记录：

- 页面路径、标题、来源页。
- 流量归因：Web 白名单 UTM/referrer/landing path，Native/RN URL 或 deeplink helper 生成的安全来源字段，以及广告点击布尔标记。
- 匿名 ID、session ID、device ID。
- 登录用户 ID，如果开发者配置了 UID 获取方法或调用 `identify()`。
- 浏览器 UA、语言、平台、时区、屏幕、viewport、硬件并发、设备内存等设备信息。
- IP 和无感地理位置，由服务端从请求头或 IP 推断。
- 点击/输入/提交元素的 tag、id、class、name、role、placeholder、aria-label、data-testid、DOM path。

自动采集不会记录：

- 输入框真实输入值。
- 密码字段内容。
- 页面截图。
- localStorage、cookie 的业务内容。

合规建议：

- 在隐私政策中说明行为分析、设备信息、IP/地理位置采集。
- 对欧盟、加州、中国等地区用户，结合业务场景提供同意管理或 opt-out。
- 不要在 URL query string、DOM id、class、placeholder、aria-label 中放敏感信息。
- 生产环境建议开启 rate limit 和异常流量过滤；域名白名单可以在客户明确需要更强治理时再启用。

`data-tracemind-token` 是公开项目 token，不是开发者密钥。但它会暴露在前端，因此服务端必须把它当作公开标识处理，不能把它当作私密凭证。

TraceMind 会记录采集来源并在控制台展示采集来源统计。这里的 `sourceType/sourceKey` 用于治理写入项目 key 的 App 或 SDK，不等同于用户跳转进来的流量来源。Web 来源会归一化为 `sourceType: "web"` 和 hostname `sourceKey`；iOS 使用 bundle id；macOS 使用 bundle id 并上报 `sourceType: "macos"`；Android 使用 package name；React Native 复用对应原生来源并额外标记 `deviceInfo.framework: "react_native"`；混合应用不新增 `hybrid` 事件平台，WebView 保持 Web 来源并可通过 `data-tracemind-framework` 写入 `sourceDetails.framework`，原生壳层保持对应 Native 来源并可用 `deviceInfo.framework` 或 `sourceDetails.framework` 标记具体混合框架；小程序使用 `sourceType: "mini_program"`，`sourceKey` 优先使用 appId，`sourceDetails.provider` 标记微信、支付宝、抖音或钉钉；浏览器插件使用 `sourceType: "browser_extension"`，`sourceKey` 优先使用 extension id，`sourceDetails` 只白名单保存 `browser`、`manifestVersion`、`runtimeContext`、`sdkVersion` 和 `sdkContentHash`；MCP server 使用 `sourceType: "mcp_server"`；普通后端服务使用 `sourceType: "server_app"`；Agent Skill hook 使用 `sourceType: "agent_skill"`。SDK runtime 会安全上报 `sourceDetails.sdkVersion` 和 `sourceDetails.sdkContentHash`；`project_health` 可据此提示 SDK 过旧或版本未知，并生成给 coding agent 的升级动作。SDK 本地源码接入必须按 `capture_setup.latestSdk.sourceRef` 获取源码；发布版使用不可变 `tracemind-release-<version>` tag，避免从浮动 `main` 安装到不匹配内容。开发者发现不是自己项目的来源后，可以在控制台屏蔽该来源。屏蔽后新事件会被静默拒收，`/api/capture` 仍返回正常 ok，但事件不会进入数据库；已屏蔽来源会继续显示，方便解除屏蔽。

流量来源分析使用单独的 `attribution` 字段。Web 自动生成；iOS/macOS、Android、React Native 和混合应用壳层通过 URL/deeplink helper 或安全 `setAttribution` 设置；小程序和浏览器插件通过安全 `setAttribution` 设置；server SDK 只在业务事件已经持有安全产品来源上下文时手动传入。MCP 可以用 `attributionSource`、`attributionMedium`、`attributionCampaign` 和 `landingPath` 过滤分析。

MCP Token 是查询凭证，不要放到前端页面里。为不同成员或 Agent 使用不同 MCP Token，泄露时只刷新或删除对应 token。
