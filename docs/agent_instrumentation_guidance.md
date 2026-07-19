# Coding Agent Instrumentation Guidance

## 目标

让开发者把 TraceMind 埋点规范交给自己的 coding agent 执行，而不是手动研究各家 agent 的配置差异。用户在控制台复制一段动态安装提示词，发给 Codex、Claude Code、Cursor、Windsurf 或其他 coding agent；agent 负责在当前项目安装 TraceMind guidance、追加项目级规则，并在能力允许时配置 MCP。

## 公开资源

Meteor 静态资源放在 `public/`，通过根路径访问：

- `/agents/tracemind/SKILL.md`：agent skill，包含版本、工作流、隐私规则和更新规则。
- `/agents/tracemind/AGENTS_SNIPPET.md`：可追加到 `AGENTS.md`、`CLAUDE.md` 或 rules 文件的项目级规则片段。
- `/agents/tracemind/manifest.json`：当前 guidance 版本、资源路径和 MCP 工具清单。

这些文件不包含项目 token，也不写死生产域名。当前项目的 MCP URL 只在登录后的控制台动态生成。

## 动态安装提示词

控制台根据当前 `origin` 和 MCP token 生成安装任务，包含：

- Skill URL。
- Agent rules snippet URL。
- Manifest URL。
- 当前项目 MCP URL。
- 当前项目的短稳定 MCP server name，例如 `tracemind-a8f3k2`，以及项目显示名。server name 只用于配置兼容和区分多个 MCP，不从项目名生成。
- 当前项目的非敏感绑定信息：项目显示名、`projectId` 和 expected MCP server name。安装时必须把这些值写入项目级 `AGENTS.md`、`CLAUDE.md` 或 rules 文件，并要求 agent 使用 TraceMind MCP 前先调用 `tracemind.project_info` 比对返回的 `projectId`。不匹配时停止，不得继续使用其他 `tracemind-*` server，除非用户明确确认切换项目。
- 安装前必须先确认当前工作目录或仓库就是用户要接入 TraceMind 的目标项目；如果已有不同 Project ID 的 `TraceMind project binding`，必须停止并询问用户是否切换该仓库的 TraceMind 项目，不能直接追加第二个项目绑定。
- 修改前必须列出文件和命令、只合并追加、不覆盖已有配置、安装后验证的要求。
- 项目级 skill 只在当前 agent 明确支持官方项目级 skill 目录时安装；否则回退到项目级 rules/instructions，不创建自定义目录。
- MCP URL、token、Bearer token 和 Auto Capture `projectKey` 不写入 `AGENTS.md`、skill、README、源码或其他仓库规则文件；项目级规则只保存可提交的 `projectId`、项目显示名和 expected MCP server name。
- 当前项目接入代码由 `tracemind.capture_setup` 动态返回，不写入静态 guidance 或安装提示词；Web 省略 platform，Native 传 `ios`、`macos`、`android` 或 `react_native`，混合应用传 `hybrid`，小程序传 `mini_program` 并指定 `provider`，浏览器插件传 `browser_extension`，第三方 MCP server 传 `mcp_node` 或 `mcp_python`，Agent Skill 传 `agent_skill`，普通后端服务传 `server_node`、`server_python` 或 `server_http`。agent 应使用返回的 `distributionMode`、`installCommands`、`filesToEdit`、`initLocation`、`idempotencyChecks`、`initSnippet`、`identifySnippet`、`manualCaptureExamples`、`errorCaptureWorkflow`、`errorCaptureMethods`、`supportedPropertyTypes`、`manualCaptureWorkflow`、`latestSdk`、`installedVersionDetection`、`upgradeCommands` 和 `verificationCommands`；server application 还要使用 `projectKeyUsage`、`configurationModes`、`preDeployChecks`、`postDeployVerification` 和 `expectedCaptureQuery`。当 `distributionMode` 为 `registry` 时优先使用 npm、PyPI 或 Maven Central 安装命令，当 `distributionMode` 为 `local_source` 或明确需要 `localSourceFallback` 时，才按返回的 GitHub clone、`vendor/` 复制、本地依赖、SwiftPM local path、Gradle module 或 PYTHONPATH 指令接入。不要从静态文档复制 project key。
- 如果 MCP 只能写入全局配置，agent 直接使用全局 MCP 配置，并继续避免把 MCP URL 或 token 写入仓库文件。
- 如果已经存在 TraceMind Skill 或 rules，agent 只检查版本和补充缺失内容，不重复追加完整区块。
- 如果已经存在相同 Project ID 的 `TraceMind project binding`，agent 复用该绑定，只补缺失规则或更新匹配的 MCP server URL/token。
- 如果已经存在同名 MCP server，agent 更新 URL/token；如果存在其他 `tracemind-*` TraceMind server，必须保留；如果存在旧的 `tracemind` server，先通过 MCP 自描述或 `tracemind.project_info` 确认项目归属。
- 安装提示词跟随当前控制台 UI 语言：中文界面生成中文提示词，英文或其他语言生成英文提示词。

如果项目没有 MCP token，控制台不生成安装提示词，先引导用户创建 token。

控制台默认只展示 Coding Agent 安装提示词复制入口，项目配置详情保持收起。公开 guidance 链接随复制的安装提示词交给 coding agent 使用；`projectKey`、MCP URL 和采集来源放在配置详情或 token 管理区域，不在默认首屏展开。

复制安装提示词成功后，控制台会创建内部 setup attempt，用于运营上判断用户是否继续完成 MCP 连接、调用 guidance / `capture_setup`、以及是否产生首条 capture / presence 数据。这个记录不改变提示词内容，不要求 agent 携带 `setupAttemptId`，也不保存 prompt、MCP token 原文、工具参数、工具结果、源码、用户输入或完整带 query URL。

## MCP 工作流

Agent 分析产品行为时应先按只读路径使用 MCP：

1. `tracemind.project_info`：先确认当前 MCP 对应的 TraceMind 项目，并与项目级 instruction 中的 expected `projectId` 比对；不匹配时停止。读取 `availableCapabilities.currentOnline`、`availableCapabilities.projectHealth` 和 `availableCapabilities.deliveryDiagnostics`，确认当前项目的实时在线、项目健康和近期上报诊断能力入口。
2. `tracemind.project_health`：读取项目日报，回答今天是否正常、较前一日变化、需关注项和上报健康。今天的日报使用已结束小时聚合，并与昨天同一小时段对比。
3. `tracemind.recent_online`：读取近 30 分钟实时在线态势，回答现在是否有人在线、用户集中在哪些页面/地区和最近高频事件。
4. `tracemind.query_delivery_diagnostics`：`project_health.delivery` 出现失败、重试、丢弃或队列异常时，查询最近 7 天的脱敏聚合。只使用小时/source/platform、reason 类别、HTTP 状态类别、队列深度、重试/丢弃计数和可用恢复耗时；不返回或索要原始错误、请求/响应体、URL、日志、用户内容或 session/device/batch 标识。
5. `tracemind.summary`：在日报或实时态势指向的时间窗口内看最近语义事件样本概览、DAU/设备数线索、presence 在线时长和流量来源分布。读取 `summarySample`；`summary.totalEvents`、`topActions`、`dailyActiveUsers` 是样本口径，不是自然日全量指标。`topActions` 是原始 actionKey 排行；判断用户意图时优先使用 `topIntentActions`，把 `topFieldInteractions` 作为输入框、表单字段等高频编辑/聚焦噪声或弱信号单独说明。
6. `tracemind.query_events`：按路径、事件名、用户、session、`actionKey`、`targetHash`、`attributionSource`、`attributionMedium`、`attributionCampaign` 或 `landingPath` 下钻语义证据。
7. `tracemind.query_raw_behaviors`：只有语义证据不足或需要排查采集问题时才使用。
8. `tracemind.submit_feedback`：只有开发者明确确认上报后，才提交脱敏摘要和证据引用。
9. `tracemind.query_user_feedback` / `tracemind.update_user_feedback`：处理终端用户反馈时使用，前者查询反馈和证据引用，后者只更新状态、备注、解决说明、关联 issue 或重复关系，不修改用户原始 message。

如果当前 active tool list 看不到 `tracemind.project_health`、`tracemind.query_delivery_diagnostics`、`tracemind.recent_online`、`tracemind.query_raw_behaviors` 或 `tracemind.submit_feedback`，不要直接判断这些工具不可用。先读取 MCP `tools/list` 或按精确工具名重新 discovery；如果仍缺失，刷新 connector/session/MCP 配置/token，再调用 `tracemind.project_info` 复核项目绑定和 `availableCapabilities`。不要通过增大 `tracemind.summary.limit` 来代偿缺失的 current online 或 project health 能力；使用已文档化的 fallback 来源并明确标注数据缺口。即使用 `summary` 作为 fallback，也必须说明指标来自 `summarySample` 描述的样本。

固定分析任务：

- 今日健康检查：报告 `project_health.health.attentionItems`、`trends`、`delivery` 和需要继续下钻的指标。
- 实时在线态势：报告 `recent_online.totalOnlineUsers`、5 分钟在线桶、地区 Top3、活跃页面 Top3 和高频事件 Top3。
- 功能使用分析：从日报判断大盘，再按路径、事件名、设备来源、流量来源、用户或 session 分析功能使用。
- 流量来源分析：从日报的 traffic source/medium/campaign/landing path 汇总开始，再用 `attributionSource`、`attributionMedium`、`attributionCampaign` 和 `landingPath` 过滤语义事件，解释增长、下降或转化变化来自哪个渠道。
- 异常或下降原因分析：先确认下降指标和 `project_health.health.window` 里的实际比较窗口。遇到上报健康异常，先用 `query_delivery_diagnostics` 按新旧 runtime 边界、小时/source/platform/reason 下钻；再用语义事件和流量来源维度解释业务变化，必要时复核原始行为。

数据保留窗口：

- 上报投递异常诊断明细保留 7 天；用 `tracemind.query_delivery_diagnostics` 查询脱敏聚合，绝不暴露原始错误或请求/响应体。成功 flush 只保留小时级上报健康聚合。
- Presence 在线会话明细、raw behavior 原始行为明细和 semantic events 语义事件明细保留 10 天。
- Hourly reports 和 daily reports 当前长期保留，不设置 TTL。
- 如果超过明细窗口后查不到 raw/presence/delivery/semantic 记录，应优先使用 `tracemind.project_health` 和日/小时报告，不要先判断为数据丢失或埋点异常。

Agent 后续修改 TraceMind 埋点时应按顺序使用 MCP：

1. `tracemind.project_info`：先确认当前 MCP 对应的 TraceMind 项目，并与项目级 instruction 中的 expected `projectId` 比对；不匹配时停止。
2. `tracemind.agent_guidance`：检查 guidance 版本和公开资源。
3. `tracemind.capture_setup`：先获取当前项目接入代码；Web 验证 `/capture.js` 和脚本上的公开项目 key 属性，Native 使用返回的安装步骤、入口文件、幂等检查、初始化位置、SDK 初始化代码、identify 示例、手动埋点示例和 `trafficAttribution` 指南；macOS 传 `platform: "macos"` 并复用 Swift Package；小程序传 `platform: "mini_program"` 和 `provider`，使用通用 SDK，不复制四套 SDK；浏览器插件传 `platform: "browser_extension"`，使用通用 WebExtension SDK，并只承诺插件自有页面自动采集和 background 手动事件；MCP server 使用返回的 Node/Python SDK 初始化和 wrapper 指南；Agent Skill 只在宿主 runtime hook 可执行时接入 lifecycle capture；普通后端服务使用 `server_node`、`server_python` 或 `server_http`，只添加手动业务埋点。SDK 平台若返回 `distributionMode: "local_source"`，安装命令以本地源码 vendoring 为准。
4. `tracemind.search_event_names`：搜索已有事件，避免随意创建 event name。
5. `tracemind.suggest_instrumentation`：判断复用事件、跳过手动埋点或创建 draft custom event。
6. `tracemind.validate_event_payload` / `tracemind.privacy_check`：检查单个 payload。
7. `tracemind.validate_instrumentation_diff`：完成前校验本次 diff。

MCP 只返回建议和 findings，不写入用户项目，也不把 draft event 自动变成正式事件。

## Native SDK Guidance

`/agents/tracemind/SKILL.md` 是 coding agent 的短手册，必须让 agent 能独立完成 native 接入，而不是只看到一行初始化。它明确要求：

- 先识别平台，再调用 `tracemind.capture_setup({ platform })`。
- iOS 常见入口是 `App.swift`、`AppDelegate.swift` 或拥有启动逻辑的文件。
- macOS 常见入口是 `App.swift`、`AppDelegate.swift` 或拥有启动逻辑的文件；第一版 Auto Capture 记录 app/session start、窗口/主窗口变化和 screen 在线区间，业务 screen 名称可通过 `TraceMind.setScreen(...)` 手动补充。
- Android 常见入口是 `Application.onCreate()`，必要时检查 `AndroidManifest.xml` 是否注册了自定义 `Application`。
- React Native 常见入口是 `index.js`、`App.js`、`App.tsx` 或 app bootstrap，并检查 native bridge 是否已连接。
- 修改前执行 `idempotencyChecks`，避免重复添加 SDK 依赖或 `TraceMind.start(...)`。
- 手动业务事件前使用 `manualCaptureWorkflow`：先搜索已有事件，再校验 payload，最后写入 `TraceMind.identify(...)` 和 `TraceMind.capture("custom", ...)`。
- 实现终端用户反馈入口时使用平台 SDK 的 `submitFeedback`：Web `window.TraceMind.submitFeedback({ message })`、iOS/macOS `TraceMind.submitFeedback(message:)`、Android `TraceMind.submitFeedback(message)`、React Native `TraceMind.submitFeedback({ message })`、小程序 `TraceMind.submitFeedback({ message })`、浏览器插件 `TraceMind.submitFeedback({ message })`、服务端 `TraceMindServer.submitFeedback(...)` / `submit_feedback(...)`。不要用 `/api/capture`、`capture("custom")` 或 `tracemind.submit_feedback` 替代。
- 产品/运行时错误上下文使用 `app_error` 和平台 `captureError` helper：Web `window.TraceMind.captureError(...)`，iOS/macOS `TraceMind.captureError(...)`，Android `TraceMind.captureError(...)`，React Native `TraceMind.captureError(...)`，小程序 `TraceMind.captureError(...)`，浏览器插件 `TraceMind.captureError(...)`，服务端 `TraceMindServer.captureError(...)` / `capture_error(...)`。它只记录 `errorKind`、`errorType`、`messageFingerprint`、`messagePreview`、`stackFingerprint`、`topFrameFingerprint`、`causeType`、`causeFingerprint`、`fatal`、`handled`、`source`、`path/screen`、`release`、`component`、`operation`、`feature`、`routeName`、`correlationId`、`requestId`、`httpStatus`、`status`、`occurredAt` 等摘要字段，用于行为上下文分析，不替代 Sentry/Crashlytics。
- 需要来源归因时，Web 默认自动记录 UTM/referrer/landing path；iOS/macOS 在 universal links、自定义 URL scheme、handoff 或外部 app 打开时调用 `TraceMind.recordOpenURL(...)`，Android 在 app links、自定义 scheme 或 deeplink routing 中调用 `TraceMind.recordDeepLink(...)`，React Native 从 `Linking.getInitialURL()` 和 URL 订阅里调用 `TraceMind.recordDeepLink(...)`，小程序只用 `TraceMind.setAttribution(...)` 传入已脱敏的 campaign、scene、二维码、分享或渠道信息，浏览器插件只用 `TraceMind.setAttribution(...)` 传入已脱敏的 extension workflow 或 campaign metadata。如果来源由业务逻辑设定，使用 `TraceMind.setAttribution(...)` 传入已经脱敏的 `source`、`medium`、`campaign`、`content`、`referrerDomain`、`referrerType`、`landingPath` 和 boolean click marker。
- `properties` 和 `context` 只使用 `supportedPropertyTypes` 返回的 string、number、boolean，不传 null、嵌套对象、数组、PII、credential values、raw prompt/content、input value 或完整 query URL。
- `app_error` 严禁采集原始 stack trace、raw log、source code、request/response body、headers、cookies、authorization、raw message、输入值、prompt、raw user content、secret、截图、录屏、crash dump、sourcemap 或 session replay；SDK 只能本地派生脱敏短消息预览和不可逆指纹。Native、React Native、小程序、浏览器插件 background 和 server SDK v1 只做手动 `captureError`；不要自行添加全局 crash reporter、request/log/database hook 或符号化链路。
- 来源归因不要只写在 `context.source`；需要 MCP 可过滤分析时使用 SDK attribution helper 或安全 `attribution` 对象。
- 用户反馈 `message.contact` 可以包含用户主动提交且 consented 的联系方式；Auto Capture 和普通手动埋点仍然不能采集输入值、邮箱、手机号、prompt、token、源码 diff、请求/响应 body 或完整 query URL。
- React Native 不新增 `platform: "react_native"`；事件保持 `ios` 或 `android`，并通过 framework metadata 标记来源。
- 混合应用不新增 `hybrid` 事件平台；WebView 使用返回 snippet 里的 `data-tracemind-framework` 写入来源 metadata，原生壳层保持 `ios`、`macos` 或 `android`。
- 小程序不复用 Web `capture.js`，使用 `@tracemind/mini-program`；事件保持 `platform: "mini_program"` 和 `sourceType: "mini_program"`，宿主放在 `sourceDetails.provider`。V1 自动采集 app/page lifecycle 和 presence，tap/input/submit 只通过 helper 接入已有 handler，不读取 input value。
- 浏览器插件不复用 Web `capture.js`，使用 `@tracemind/browser-extension`；事件保持 `platform: "browser_extension"` 和 `sourceType: "browser_extension"`，来源优先使用 extension id，并只保留安全 browser/manifest/runtime/sdk metadata。V1 自动采集插件自有 DOM 页面，background/service worker 只做手动事件，不采集宿主页 DOM、tab 完整 URL、历史、书签、cookie、token 或输入值。
- SDK 升级治理使用 `contentHash` 而不是人工记忆。SDK runtime 安全上报 `sourceDetails.sdkVersion` 和 `sourceDetails.sdkContentHash`；`project_health` 可返回 `sdkUpgradeFindings`。客户 agent 看到升级提示后，应调用 `capture_setup({ platform })`，registry 平台按返回的包版本升级，local-source 平台或 fallback 场景再按 `latestSdk.sourceRef` 获取 vendored SDK，并运行返回的验证命令汇报。TraceMind 自身 SDK runtime 改动后必须运行 `npm run update:sdk-manifest` 和 `npm run test:sdk-release`；发布前必须运行 `npm run prepare:sdk-release-ref -- <version>`，推送 `tracemind-release-<version>` tag，等待 `SDK Publish` workflow 成功，并通过 `npm run check:sdk-registry-publication -- <version>` 后再部署。
- Web Auto Capture 脚本升级治理使用 `sourceDetails.scriptReleaseId`，不使用脚本 hash 或 capabilities。`project_health` 返回 `captureScriptFindings` 时，表示旧 Web 脚本仍在运行并上报；客户 agent 应调用 `capture_setup({ platform: "web" })`，把固定 `capture.<hash>.js` 或自托管脚本改回返回的稳定 `captureScriptUrl`。生产默认脚本由 Cloudflare Pages 分发，API 写入仍走 Galaxy；检查 service worker/Workbox/CDN/反向代理/WebView bundle 缓存，部署后用 `window.TraceMind.status().scriptReleaseId` 和再次 `project_health` 验证。没有近期 Web 上报时不能判断本地缓存是否旧。
- 完成后运行适用的 `verificationCommands`，再用 TraceMind MCP 查询 raw behaviors 或 semantic events。

## MCP Server And Skill Guidance

第三方 MCP server 使用 `mcp_node` 或 `mcp_python`。Auto Capture 只记录 tool/resource/prompt 安全元数据，例如名称、状态、耗时、错误类型和结果大小分桶。禁止采集 raw prompt、tool arguments、tool result、resource content、源码 diff、secret、token 或完整 query URL。

Agent Skill 使用 `agent_skill`。静态 Skill 文件不能 auto-capture；只有宿主 agent runtime 暴露 started/completed/failed lifecycle hook 时，才能把 lifecycle hook 作为可执行 runtime 接入。没有 hook 时，Skill 只作为教程，实际埋点应放到 MCP server 或执行任务的 runtime。

## Server Manual Capture Guidance

普通后端服务使用 `server_node`、`server_python` 或 `server_http`。第一版只做手动埋点，不做 request Auto Capture。coding agent 应把埋点放在稳定业务结果处，例如支付成功、账单已付、工作区创建、任务完成或同步完成；每次修改前先搜索 event name、校验 payload，完成后校验 diff。服务端事件使用 `platform: "server"`、`sourceType: "server_app"`，禁止采集 request/response body、headers、cookies、authorization、raw logs、secret、token、prompt、源码或完整 query URL。服务端不自动推断用户流量来源；只有当业务事件已经持有来自产品侧的安全来源上下文时，才传 `attribution` 对象，并继续避免完整 URL、query、搜索词、click id 和 PII。

Server `capture_setup` 默认推荐 `inline_project_key`：直接使用返回的 public `projectKey`。如果客户项目已有部署环境变量惯例，可以选择 `env_project_key` 并设置 `TRACEMIND_PROJECT_KEY`，但这只是工程偏好，不是 TraceMind 安全要求。MCP token、Bearer token、`TRACEMIND_PRODUCT_USAGE_PROJECT_ID/KEY` 或其他 TraceMind 内部 dogfood 配置都不能作为客户服务端 capture key。部署前跑返回的 `preDeployChecks`；部署后触发真实业务路径并使用 `postDeployVerification.expectedCaptureQuery` 查 `eventName + sourceType/server_app + sourceKey`。若结果为 0，按初始化、projectKey/env、egress/TLS/proxy、`/api/capture` delivery、事件名/窗口/sourceKey 顺序排查。

## 更新机制

不做静默定时更新。Skill 和规则要求 agent 在埋点工作前调用 `tracemind.agent_guidance`。如果本地版本低于 MCP 返回版本，agent 必须告诉用户差异，并在用户确认后只更新 TraceMind 管理区块。
