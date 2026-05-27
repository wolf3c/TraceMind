# Remote MCP Design

## 目标

让 LLM / AI Coding Agent 通过远程 MCP 分析 TraceMind 已抽取的产品行为语义，并在开发者明确要求时上报问题或想法反馈。TraceMind 自己的远程 MCP 端点不是采集目标；它读取行为证据，并且只允许 `tracemind.submit_feedback` 写入开发者反馈、`tracemind.update_user_feedback` 更新终端用户反馈处理状态和备注。第三方 MCP server 若要分析自身 tool/resource/prompt 运行情况，应通过 `mcp_node` 或 `mcp_python` SDK 使用公开 `projectKey` 写入 `/api/capture`；小程序通过 `mini_program` 通用 SDK 写入 `/api/capture`；浏览器插件通过 `browser_extension` 通用 SDK 写入 `/api/capture`，并将 presence 写入 `/api/presence`；普通后端服务第一版通过 `server_node`、`server_python` 或 `server_http` 添加手动业务埋点，不做 request Auto Capture。开发者可以在 Codex、Claude Code、Cursor 等工具里直接追问今天产品是否正常、用户在做什么、哪里值得改：Agent 默认先读取项目健康日报，再下钻语义事件，需要复核时再查询原始日志。

## Endpoint

```text
GET /mcp?mcpToken=MCP_TOKEN
POST /mcp?mcpToken=MCP_TOKEN
```

推荐使用 Bearer 方式，避免 token 出现在 URL 日志里：

```text
Authorization: Bearer MCP_TOKEN
```

`MCP_TOKEN` 是独立 MCP 凭证，格式为 `tm_mcp_xxx`。它不同于 Auto Capture 使用的公开 `projectKey`，项目 key 不能访问 MCP。MCP token 可读取项目行为证据和终端用户反馈，并允许通过 `tracemind.submit_feedback` 提交开发者反馈、通过 `tracemind.update_user_feedback` 更新用户反馈处理信息；它不能修改用户原始反馈 message。

## 多项目识别

一个 MCP token 只绑定一个 TraceMind 项目。多项目使用同一个 coding agent 时，MCP server 配置名使用短稳定 ASCII 名称，例如 `tracemind-a8f3k2`，由项目 `_id` 归一化后取后 6 位生成，不从项目显示名生成。项目名可以是中文或包含空格，但只出现在 MCP metadata 和安装提示词里。

项目归属由 MCP 自描述提供，而不是依赖 agent rules 中的静态映射：

- `initialize.instructions` 在 token 可解析时说明当前 MCP 绑定的项目名和建议 server name。
- `tools/list` 的每个 tool `title` / `description` 都包含当前项目显示名。
- `tracemind.project_info` 返回当前 MCP 绑定的 `{ projectId, projectName, mcpServerName }`，不返回 MCP token 或项目 key。

安装到用户项目时，动态 install prompt 会把非敏感绑定信息写入项目级 `AGENTS.md`、`CLAUDE.md` 或 rules 文件：项目显示名、`projectId` 和 expected MCP server name。Agent 写入前必须先确认当前工作目录或仓库就是用户要接入 TraceMind 的目标项目；如果项目级规则里已有不同 Project ID 的 `TraceMind project binding`，必须停止并询问用户是否切换该仓库的 TraceMind 项目，不能直接追加第二个绑定。Agent 看到多个 `tracemind-*` TraceMind MCP server 时，必须先使用 expected server 调用 `tracemind.project_info`，并只在返回的 `projectId` 与项目级规则匹配时继续；不匹配时停止并要求用户配置正确 MCP，不要只凭 server name 猜。

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
  "targetHash": "tm_target_xxx",
  "actionKey": "web:/pricing:click:target:data-testid:start-trial",
  "path": "/pricing"
}
```

返回字段包含 `userId`、`anonymousId`、`sessionId`、`deviceId`、`deviceFingerprint`、`platform`、`deviceInfo`、`ip`、`geo`、`sourceType`、`sourceKey`、`sourceLabel`、`sourceDetails`、`eventType`、`eventName`、`meaning`、`target`、`targetIdentity`、`identitySource`、`identityConfidence`、`targetHash`、`actionKey`、`relatedActionKey`、`relatedTargetHash`、`correlationId`、`properties`、`context` 和 `rawBehaviorId`。

### `tracemind.query_raw_behaviors`

查询原始行为日志。只有在需要复核语义事件背后的原始采集数据时使用。原始行为明细当前保留 30 天；超过窗口查不到原始记录时，应先使用 `tracemind.query_events`、`tracemind.summary` 和 `tracemind.project_health`，不要直接判断为数据丢失。

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
  "targetHash": "tm_target_xxx",
  "actionKey": "web:/pricing:click:target:data-testid:start-trial",
  "path": "/pricing"
}
```

### `tracemind.agent_guidance`

返回当前 coding agent guidance 版本、公开 skill/rules/manifest 路径、Dashboard 同源运营查看流程、数据保留规则和推荐埋点工作流。Agent 在日常运营查询时应优先使用 `project_health` / `recent_online`；只有添加或修改 TraceMind 埋点时才进入 `capture_setup` 等接入流程。发现本地 skill 过期时先请求用户确认再更新。

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

### `tracemind.project_health`

读取当前 MCP token 绑定项目的健康报告，帮助 Agent 先回答“今天产品是否正常、哪里需要关注、较前一天发生了什么变化”，再决定是否下钻到语义事件或原始行为。报告由小时级健康数据聚合而来：历史日期按完整自然日对比，今天只使用已结束小时并与昨天同一小时段对比。工具返回项目级健康、趋势、关注项、上报健康和数据保留规则，不返回内部 actor/session hash 字段。

Input:

```json
{
  "reportDate": "2026-05-15"
}
```

`reportDate` 可省略，默认今天。历史日期只读取已有日报；缺少日报时返回 `status: "missing"` 和空健康结构，不触发大量历史回填。

Output:

```json
{
  "ok": true,
  "project": {
    "_id": "abc123",
    "name": "我的 Web App"
  },
  "reportDate": "2026-05-15",
  "previousReportDate": "2026-05-14",
  "timezone": "Asia/Shanghai",
  "status": "draft",
  "computedAt": "2026-05-15T08:30:00.000Z",
  "sourceWindow": {
    "startAt": "2026-05-14T16:00:00.000Z",
    "endAt": "2026-05-15T08:00:00.000Z",
    "fullEndAt": "2026-05-15T16:00:00.000Z"
  },
  "health": {
    "window": {
      "granularity": "hour_rollup",
      "comparisonMode": "completed_hours",
      "currentHourCount": 16,
      "previousHourCount": 16
    },
    "status": "needs_attention",
    "attentionSummary": "所选日期已结束小时活跃会话较昨天同一时段下降 53%。",
    "current": {
      "activeUsers": 14,
      "sessionCount": 95,
      "eventCount": 239
    },
    "previous": {
      "activeUsers": 17,
      "sessionCount": 203,
      "eventCount": 884
    },
    "trends": {
      "activeUsers": -0.18,
      "sessions": -0.53,
      "events": -0.73
    },
    "hourlyComparison": {
      "granularity": "hour_rollup",
      "comparisonMode": "completed_hours",
      "currentHourCount": 16,
      "previousHourCount": 16,
      "metrics": {
        "activeUsers": [
          {
            "hourLabel": "00:00",
            "current": 2,
            "previous": 3,
            "currentStartAt": "2026-05-14T16:00:00.000Z",
            "currentEndAt": "2026-05-14T17:00:00.000Z",
            "previousStartAt": "2026-05-13T16:00:00.000Z",
            "previousEndAt": "2026-05-13T17:00:00.000Z"
          }
        ],
        "sessions": [],
        "averageActiveDuration": [],
        "events": []
      }
    },
    "attentionItems": [
      {
        "code": "sessions_dropped",
        "severity": "medium",
        "message": "所选日期已结束小时活跃会话较昨天同一时段下降 53%。"
      }
    ]
  },
  "delivery": {
    "accepted": 120,
    "failedFlushes": 0,
    "droppedOldest": 0,
    "droppedStorage": 0
  },
  "dataRetention": {
    "detailWindows": [
      { "dataSet": "capture_delivery_reports", "retentionDays": 7 },
      { "dataSet": "presence_sessions", "retentionDays": 30 },
      { "dataSet": "raw_behaviors", "retentionDays": 30 }
    ],
    "retainedSummaries": [
      { "dataSet": "semantic_events", "retentionDays": null },
      { "dataSet": "project_hourly_reports", "retentionDays": null },
      { "dataSet": "project_daily_reports", "retentionDays": null }
    ]
  }
}
```

`health.hourlyComparison` 面向 Dashboard 和 Agent 的结构化解释：它只包含可展示的小时标签、当前窗口值、前一日同小时值和窗口边界，不包含内部 actor/session 去重键。Dashboard 使用它在活跃用户、活跃会话、人均活跃时长和总事件卡片内展示小时折线；Agent 可用同一字段解释下降发生在哪些小时。

### `tracemind.recent_online`

读取当前 MCP token 绑定项目最近 30 分钟的实时在线态势，帮助 Agent 回答“现在是否有人在用、用户集中在哪些页面或地区、最近高频事件是什么”。它是实时窗口工具，不并入自然日日报，也不替代 `tracemind.project_health`。

Input:

```json
{}
```

Output:

```json
{
  "ok": true,
  "project": {
    "_id": "abc123",
    "name": "我的 Web App"
  },
  "window": {
    "startAt": "2026-05-15T09:00:00.000Z",
    "endAt": "2026-05-15T09:30:00.000Z",
    "windowMs": 1800000,
    "bucketMs": 300000
  },
  "totalOnlineUsers": 4,
  "buckets": [
    {
      "startAt": "2026-05-15T09:00:00.000Z",
      "endAt": "2026-05-15T09:05:00.000Z",
      "onlineUsers": 1
    }
  ],
  "topRegions": [{ "label": "US", "count": 2 }],
  "topDurationPaths": [{ "path": "/pricing", "durationMs": 120000, "sessions": 1 }],
  "topEvents": [{ "label": "pricing_viewed", "count": 3 }]
}
```

返回值不包含 actor id、session id、presence id、device fingerprint 或原始用户识别字段。

## Dashboard / MCP 口径映射

Dashboard 是视觉入口，MCP 是同口径的 agent 查询入口，不维护第二套运营解释。客户问“今天怎么样、昨天数据、过去一天表现、线上是否有人、推广效果、哪里下降”时：

- `tracemind.project_health` 对应项目健康看板，返回 `health.current`、`health.trends`、`health.hourlyComparison`、`delivery`、`attentionSummary` 和 `attentionItems`。它覆盖活跃用户、新用户、留存、活跃会话、事件/会话、流量来源、活跃时长、跳出页、总事件、上报健康和日报/小时趋势。
- `tracemind.recent_online` 对应近 30 分钟在线卡片，返回在线用户、5 分钟桶、Top 地区、Top 活跃页面和 Top 高频事件。
- `tracemind.summary` / `tracemind.query_events` 用于非自然日时间窗、功能路径、事件名、actionKey、targetHash、用户、session、设备和流量来源归因下钻。它们提供证据聚合，不替代 Dashboard 日报口径，也是超过原始明细窗口后的主要分析入口。
- `tracemind.query_raw_behaviors` 只用于 30 天内复核原始行为明细；上报投递诊断明细保留 7 天，presence 会话明细保留 30 天，语义事件和日/小时健康报告当前长期保留。
- 项目绑定 MCP 只回答当前绑定项目。账号级“几个客户项目活跃”不是单项目 Dashboard 口径，不能从一个项目的选择器文案或普通事件里推断；需要单独的账号级工具或 TraceMind 自采集产品使用事件。

### `tracemind.capture_setup`

返回当前项目的 Auto Capture 公开项目 key、指定平台的一行接入代码、结构化安装指南和安全说明。Coding agent 应先调用它获取当前项目 key；Web 项目验证 `/capture.js` 和 `data-tracemind-token`，Native 项目使用返回的 SDK 安装步骤和初始化代码，小程序使用通用 SDK 并通过 `provider` 区分宿主，浏览器插件使用通用 WebExtension SDK。registry-backed SDK 返回 `distributionMode: "registry"` 和 npm、PyPI 或 Maven Central 安装命令；Swift iOS/macOS 继续返回 `distributionMode: "local_source"`。当 registry 不可用或企业环境需要 vendoring 时，agent 才使用返回的 `localSourceFallback`、GitHub clone、`vendor/` 复制、本地依赖、SwiftPM local path、Gradle module 或 PYTHONPATH 指令。返回的 `projectKey` 只能用于 Auto Capture 写入，不能替代 MCP token。

Input:

```json
{
  "platform": "web",
  "provider": "wechat"
}
```

`platform` 可省略，默认 `web`；也可传 `ios`、`macos`、`android`、`react_native`、`hybrid`、`mini_program`、`browser_extension`、`mcp_node`、`mcp_python`、`agent_skill`、`server_node`、`server_python` 或 `server_http`。`mini_program` 可选 `provider`：`wechat`、`alipay`、`douyin`、`dingtalk`；别名 `wechat_mini_program`、`alipay_mini_program`、`douyin_mini_program`、`dingtalk_mini_program` 会归一为 `mini_program + provider`。浏览器插件别名 `chrome_extension`、`edge_extension`、`firefox_extension`、`web_extension` 会归一为 `browser_extension`。

SDK 平台还会返回升级治理字段：`latestSdk.displayVersion`、`latestSdk.contentHash`、`latestSdk.sourceRef`、`installedVersionDetection`、`upgradePolicy`、`upgradeCommands` 和 `verificationCommands`。`contentHash` 是判断升级的硬依据，`displayVersion` 只用于展示。发布版 `sourceRef` 是不可变 `tracemind-release-<version>` tag，客户 agent 必须按返回值获取源码，不从浮动 `main` 推断。SDK runtime 通过白名单 `sourceDetails.sdkVersion` 和 `sourceDetails.sdkContentHash` 上报安全 metadata；`tracemind.project_health` 会在 hash 落后或未知时返回 `sdkUpgradeFindings`，让客户把更新 prompt 交给 coding agent 执行。

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
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "sdkSourceRepo": "https://github.com/wolf3c/TraceMind.git",
  "sdkSourcePath": "sdk/ios",
  "customerVendorPath": "vendor/TraceMind",
  "install": "Vendor the TraceMind Swift Package from the TraceMind GitHub source repo, add it as a local Swift Package, then import TraceMind in your App entrypoint.",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/TraceMind",
    "cp -R .tracemind-sdk-source/sdk/ios/. vendor/TraceMind/",
    "For Package.swift apps, add dependencies: [.package(path: \"vendor/TraceMind\")] and target dependency .product(name: \"TraceMind\", package: \"TraceMind\").",
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

macOS 示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "macos",
  "eventPlatform": "macos",
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "sdkSourceRepo": "https://github.com/wolf3c/TraceMind.git",
  "install": "Vendor the TraceMind Swift Package from the TraceMind GitHub source repo, add it as a local Swift Package, then initialize TraceMind once from the macOS app bootstrap.",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/TraceMind",
    "cp -R .tracemind-sdk-source/sdk/ios/. vendor/TraceMind/",
    "For Package.swift apps, add dependencies: [.package(path: \"vendor/TraceMind\")] and target dependency .product(name: \"TraceMind\", package: \"TraceMind\").",
    "Import TraceMind in App.swift, AppDelegate.swift, or the app startup file that owns launch."
  ],
  "initSnippet": "TraceMind.start(projectKey: \"tm_proj_xxx\")",
  "identifySnippet": "try? TraceMind.identify(\"user_123\", traits: [\"plan\": \"pro\"])",
  "manualCaptureExamples": [
    "try? TraceMind.capture(\"custom\", eventName: approvedEventName, path: \"CheckoutWindow\", properties: [\"plan\": \"pro\", \"amount\": 29, \"trial\": true], context: [\"source\": \"pricing\"])",
    "TraceMind.setScreen(\"CheckoutWindow\")"
  ],
  "source": {
    "type": "macos",
    "key": "macOS bundle id, for example com.example.app"
  },
  "sourceModel": "platform remains macos; sourceKey is the macOS bundle id; sourceDetails.framework is swift."
}
```

Native 和 React Native 返回还包含：

- `autoCapturedSignals`: 平台对应的自动采集口径。iOS/Android/React Native 覆盖 app/session start、screen/page view、tap/click、input changed、submit；macOS v1 覆盖 app/session start、screen/window view 和 window/main-window change。
- `privacyConstraints`: 不采集输入值、截图、DOM/native snapshot、session replay、secret、token、raw prompt、raw user content 或完整 query URL。
- `sourceModel`: iOS 和 macOS 使用 bundle id，Android 使用 package name，React Native 保持 `platform` 为 `ios` 或 `android` 并标记 `react_native` framework。
- `identifySnippet`: 登录成功后绑定稳定业务 `userId` 的示例。
- `manualCaptureExamples`: 自动采集无法稳定表达业务结果时才使用的 `custom` 示例。
- `supportedPropertyTypes`: 手动 `properties` / `context` 支持的值类型，目前为 string、number、boolean。
- `manualCaptureWorkflow`: agent 添加手动埋点前必须执行的搜索、校验和 diff validation 流程。

小程序示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "mini_program",
  "provider": "wechat",
  "eventPlatform": "mini_program",
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/tracemind/mini-program",
    "cp -R .tracemind-sdk-source/sdk/mini-program/. vendor/tracemind/mini-program/",
    "npm install ./vendor/tracemind/mini-program",
    "pnpm add ./vendor/tracemind/mini-program",
    "yarn add file:./vendor/tracemind/mini-program",
    "Run exactly one package-manager command above based on the project lockfile; do not run npm, pnpm, and yarn together.",
    "Initialize TraceMind once in app.js with provider: \"wechat\"."
  ],
  "initSnippet": "import { TraceMind } from \"@tracemind/mini-program\";\n\nTraceMind.start({\n  projectKey: \"tm_proj_xxx\",\n  provider: \"wechat\",\n  appId: \"your-mini-program-app-id\",\n  appName: \"Your Mini Program\"\n});",
  "autoCapturedSignals": [
    "mini program app/session start",
    "app show/hide foreground and background lifecycle",
    "page view and page show/hide",
    "route/page path without query strings",
    "presence heartbeat for foreground online intervals",
    "tap/input/submit only when developers call helper functions from event handlers"
  ],
  "sourceModel": "platform is mini_program; sourceType is mini_program; sourceKey is the mini program appId or configured sourceKey; sourceDetails.provider records wechat, alipay, douyin, or dingtalk.",
  "manualCaptureExamples": [
    "TraceMind.trackTap(\"checkout_button\", { path: \"/pages/pricing/index\", properties: { plan: \"pro\" } })",
    "TraceMind.capture(\"custom\", { eventName: approvedEventName, properties: { amount: 29, success: true } })"
  ],
  "verificationCommands": [
    "npm test --prefix sdk/mini-program"
  ]
}
```

小程序不复用 Web `capture.js`。V1 不做编译期 WXML/AXML/TTML 改写，也不承诺无侵入全自动 tap/input/submit 捕获；交互事件通过 helper 接到开发者已有 handler。

浏览器插件示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "browser_extension",
  "eventPlatform": "browser_extension",
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/tracemind/browser-extension",
    "cp -R .tracemind-sdk-source/sdk/browser-extension/. vendor/tracemind/browser-extension/",
    "npm install ./vendor/tracemind/browser-extension",
    "pnpm add ./vendor/tracemind/browser-extension",
    "yarn add file:./vendor/tracemind/browser-extension",
    "Run exactly one package-manager command above based on the project lockfile; do not run npm, pnpm, and yarn together.",
    "Initialize TraceMind once in extension-owned popup, options, sidebar, or devtools pages; background/service worker contexts use manual capture only."
  ],
  "initSnippet": "import { TraceMind } from \"@tracemind/browser-extension\";\n\nTraceMind.start({\n  projectKey: \"tm_proj_xxx\",\n  extensionName: \"Example Extension\"\n});",
  "autoCapturedSignals": [
    "extension UI start",
    "page view for extension-owned pages",
    "click/input without value/submit",
    "route/path changes without query strings",
    "foreground presence heartbeat",
    "background/service worker manual capture only"
  ],
  "sourceModel": "platform is browser_extension; sourceType is browser_extension; sourceKey is the extension id or configured extensionId; sourceDetails.browser, manifestVersion, runtimeContext, and sdkVersion are the only saved extension metadata.",
  "manifestPermissions": [
    "Add host_permissions or permissions that allow HTTPS requests to the TraceMind endpoint.",
    "Allow connect-src to the TraceMind endpoint in extension CSP when CSP is declared."
  ],
  "manualCaptureExamples": [
    "TraceMind.capture(\"custom\", { eventName: approvedEventName, properties: { success: true } })"
  ],
  "verificationCommands": [
    "npm test --prefix sdk/browser-extension"
  ]
}
```

浏览器插件 V1 不把 content script 宿主页作为无侵入自动采集目标，不采集宿主页 DOM、页面内容、截图、浏览器历史、书签、cookies、tab 完整 URL、query、token 或输入值。

MCP server 示例：

```json
{
  "ok": true,
  "projectKey": "tm_proj_xxx",
  "platform": "mcp_node",
  "eventPlatform": "server",
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/tracemind/mcp-node",
    "cp -R .tracemind-sdk-source/sdk/mcp-node/. vendor/tracemind/mcp-node/",
    "npm install ./vendor/tracemind/mcp-node",
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
  "distributionMode": "local_source",
  "publishStatus": "not_published",
  "installCommands": [
    "test -d .tracemind-sdk-source || git clone --depth 1 https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source",
    "mkdir -p vendor/tracemind/server-node",
    "cp -R .tracemind-sdk-source/sdk/server-node/. vendor/tracemind/server-node/",
    "npm install ./vendor/tracemind/server-node",
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

### `tracemind.submit_feedback`

在开发者明确要求或确认后，将问题或想法反馈写入独立的 `tracemind_feedback_reports` 集合。这个工具不写入 `/api/capture`，也不会创建 raw behavior 或 semantic event。

对使用 lazy tool discovery 的 Agent（例如 Codex），`tracemind.submit_feedback` 的工具描述必须包含 `直接反馈给 TraceMind`、`submit feedback`、`上报问题`、`上报想法` 等自然语言触发词。Agent 如果只看到部分 active tools，不能据此判断反馈不可用；应先重新发现或搜索 `tracemind.submit_feedback`。

Input:

```json
{
  "type": "issue",
  "title": "Pricing CTA does not submit",
  "summary": "Users click the pricing CTA, but no submit event appears in the selected time window.",
  "expected": "The CTA should create a submit or checkout event.",
  "actual": "Only repeated click events are visible.",
  "suggestion": "Inspect the form handler and disabled state after the click.",
  "reproductionSteps": ["Open /pricing", "Click Start trial", "Check that no submit event appears"],
  "evidence": {
    "startAt": "2026-05-10T00:00:00.000Z",
    "endAt": "2026-05-10T01:00:00.000Z",
    "paths": ["/pricing"],
    "eventIds": ["event_1"],
    "rawBehaviorIds": ["raw_1"],
    "actionKeys": ["web:/pricing:click:target:data-testid:start-trial"],
    "targetHashes": ["tm_target_abc"],
    "userIds": ["user_123"],
    "sessionIds": ["tm_sess_123"],
    "deviceIds": ["tm_dev_123"],
    "examples": ["Three clicks from one session with no follow-up submit event."]
  },
  "environment": {
    "platform": "web",
    "sourceType": "web",
    "sourceKey": "app.example.com"
  }
}
```

服务端要求 `type`、`title` 和 `summary`，`type` 只能是 `issue` 或 `idea`。提交内容会被截断、数组会被限制长度，并通过隐私检查拒绝 PII、token、raw prompt、原始用户内容、源码 diff、请求/响应 body、headers、cookies、authorization 值和带 query 的完整 URL。服务端会按同一项目和 MCP token 对 24 小时内相同脱敏内容做去重，重复提交返回已有 `feedbackId` 和 `deduplicated: true`；非重复提交按同一项目和 MCP token 限制为每分钟最多 5 条、24 小时最多 100 条，超限返回 `feedback_rate_limited` 且不写入反馈库。成功返回值为 `{ ok, feedbackId, createdAt }`。

### `tracemind.query_user_feedback`

查询终端用户通过客户 app 主动提交的反馈。数据来自独立集合 `tracemind_user_feedback_reports`，不来自 raw behaviors 或 semantic events。默认列表返回摘要、状态、环境和证据引用；传入 `id` 或 `includeMessage: true` 时才返回完整 `message`，包括用户主动提交的 consented contact 和 custom fields。

Input:

```json
{
  "status": "new",
  "kind": "issue",
  "path": "/pricing",
  "platform": "web",
  "sessionId": "tm_sess_123",
  "keyword": "upgrade",
  "hasContact": true,
  "limit": 20
}
```

### `tracemind.update_user_feedback`

更新终端用户反馈处理信息，写入 `activityLog`，记录当前 MCP token/agent 在什么时候做了什么。这个工具只能更新 `status`、`note`、`resolution`、`linkedIssueUrl` 和 `duplicateOf`，不能修改用户原始 `message`。

Input:

```json
{
  "id": "feedback_123",
  "status": "resolved",
  "note": "Fixed disabled state in checkout form.",
  "resolution": "Patched upgrade submit handler.",
  "linkedIssueUrl": "https://linear.app/acme/issue/TR-123"
}
```

## 推荐 LLM 查询顺序

1. 调用 `tracemind.project_info` 确认当前 MCP 绑定项目。
2. 调用 `tracemind.project_health` 获取日报健康、当前报告窗口的对比变化、需关注项和上报健康；需要实时态势时并列调用 `tracemind.recent_online`。
3. 调用 `tracemind.summary` 获取相关时间窗口内的概览、DAU/设备数和 presence 在线时长。
4. 调用 `tracemind.query_events` 按 `eventName`、`eventType`、`userId`、`path`、`actionKey`、`targetHash` 等维度下钻。
5. 只有当语义事件含义不够或需要排查 30 天内采集问题时，调用 `tracemind.query_raw_behaviors`；超过明细窗口时继续使用语义事件、`summary` 和 `project_health`。
6. 当开发者发现问题或提出想法时，先询问是否需要上报；若开发者明确要求上报，收集脱敏摘要和证据引用后调用 `tracemind.submit_feedback`。
7. 当开发者要处理终端用户反馈时，调用 `tracemind.query_user_feedback` 查询，再调用 `tracemind.update_user_feedback` 标记状态、备注和解决方式。

固定产品分析任务：

- 今日健康检查：先读 `project_health`，总结 `attentionItems`、`trends` 和 `delivery`，再用 `summary` 或 `query_events` 解释变化来源。
- 实时在线态势：读 `recent_online`，总结在线用户、5 分钟桶、地区、活跃页面和高频事件，再用 `query_events` 复核具体行为。
- 功能使用分析：先用 `project_health` 判断大盘是否正常，再用 `summary` 和 `query_events` 按路径、事件名、设备来源或用户分组分析功能使用。
- 异常或下降原因分析：先确认日报中的下降指标和时间窗口，再下钻相关路径、事件和 session；只有语义证据不足时才查询原始行为。

当同一页面存在多个相同文案的按钮或输入框时，不要只按 `targetText` 判断。先查看事件里的 `targetIdentity`、`identityConfidence`、`target.path`、`target.id`、`target.name`、`target.testId`，优先用 `actionKey` 聚合同一动作，再用 `targetHash` 精确查询同一元素。低置信度 identity 适合 session 复核，不适合直接作为长期漏斗节点。

## 推荐 Coding Agent 埋点顺序

1. 调用 `tracemind.agent_guidance` 检查 guidance 版本。
2. 调用 `tracemind.capture_setup` 获取目标平台接入方式；MCP server 使用 `mcp_node` 或 `mcp_python`，Agent Skill 使用 `agent_skill`。
3. 调用 `tracemind.search_event_names` 搜索可复用事件。
4. 必要时调用 `tracemind.suggest_instrumentation` 获取复用、Auto Capture 或 draft 建议。
5. 修改代码前后使用 `tracemind.validate_event_payload` 或 `tracemind.privacy_check` 复核字段。
6. 完成前调用 `tracemind.validate_instrumentation_diff` 校验本次 diff。
7. 如果开发者在埋点或分析过程中发现问题/想法并要求上报，调用 `tracemind.submit_feedback`，优先附上事件 ID、raw behavior ID、路径、`actionKey`、`targetHash` 和时间窗口，不要粘贴原始敏感内容。

## GET Preview Response

```json
{
  "protocol": "tracemind-mcp-preview",
  "tools": [
    { "name": "tracemind.event_definitions" },
    { "name": "tracemind.project_health" },
    { "name": "tracemind.recent_online" },
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

- MCP 端点的分析工具只读；`tracemind.submit_feedback` 是唯一反馈写入工具，写入独立反馈集合。
- LLM 默认从语义事件开始分析，但可以显式查询原始行为日志。
- MCP 使用独立 token，可以在控制台新增、重命名、刷新或删除；刷新/删除后旧 token 立即失效。
- MCP token 可以通过 `mcpToken` URL 参数或 `Authorization: Bearer` 传入，推荐 Bearer。
- 多项目 MCP 配置使用短稳定 server name，项目名通过 MCP metadata 和 `tracemind.project_info` 暴露；项目级 agent rules 记录 expected `projectId` 和 MCP server name 作为使用前校验契约。
- Auto Capture 的项目 key 只用于采集写入，不能访问 MCP。
- 暂不实现 resources、prompts、SSE streaming、OAuth discovery 或多成员项目权限。
