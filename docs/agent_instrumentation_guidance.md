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
- 修改前必须列出文件和命令、只合并追加、不覆盖已有配置、安装后验证的要求。
- 项目级 skill 只在当前 agent 明确支持官方项目级 skill 目录时安装；否则回退到项目级 rules/instructions，不创建自定义目录。
- MCP URL、token、Bearer token 和 Auto Capture `projectKey` 不写入 `AGENTS.md`、skill、README、源码或其他仓库规则文件；项目级规则只保存可提交的 `projectId`、项目显示名和 expected MCP server name。
- 当前项目接入代码由 `tracemind.capture_setup` 动态返回，不写入静态 guidance 或安装提示词；Web 省略 platform，Native 传 `ios`、`android` 或 `react_native`，第三方 MCP server 传 `mcp_node` 或 `mcp_python`，Agent Skill 传 `agent_skill`，普通后端服务传 `server_node`、`server_python` 或 `server_http`。agent 应使用返回的 `installCommands`、`filesToEdit`、`initLocation`、`idempotencyChecks`、`initSnippet`、`identifySnippet`、`manualCaptureExamples`、`supportedPropertyTypes` 和 `manualCaptureWorkflow`，不要从静态文档复制 project key。
- 如果 MCP 只能写入全局配置，agent 直接使用全局 MCP 配置，并继续避免把 MCP URL 或 token 写入仓库文件。
- 如果已经存在 TraceMind Skill 或 rules，agent 只检查版本和补充缺失内容，不重复追加完整区块。
- 如果已经存在同名 MCP server，agent 更新 URL/token；如果存在其他 `tracemind-*` TraceMind server，必须保留；如果存在旧的 `tracemind` server，先通过 MCP 自描述或 `tracemind.project_info` 确认项目归属。
- 安装提示词跟随当前控制台 UI 语言：中文界面生成中文提示词，英文或其他语言生成英文提示词。

如果项目没有 MCP token，控制台不生成安装提示词，先引导用户创建 token。

控制台默认只展示复制入口，不展开完整安装提示词或 guidance 链接。公开 guidance 链接随复制的安装提示词交给 coding agent 使用；MCP URL 跟随具体 MCP token，只在 token 管理区域提供对应复制入口。

## MCP 工作流

Agent 后续修改 TraceMind 埋点时应按顺序使用 MCP：

1. `tracemind.project_info`：先确认当前 MCP 对应的 TraceMind 项目，并与项目级 instruction 中的 expected `projectId` 比对；不匹配时停止。
2. `tracemind.agent_guidance`：检查 guidance 版本和公开资源。
3. `tracemind.capture_setup`：先获取当前项目接入代码；Web 验证 `/capture.js` 和脚本上的公开项目 key 属性，Native 使用返回的安装步骤、入口文件、幂等检查、初始化位置、SDK 初始化代码、identify 示例和手动埋点示例；MCP server 使用返回的 Node/Python SDK 初始化和 wrapper 指南；Agent Skill 只在宿主 runtime hook 可执行时接入 lifecycle capture；普通后端服务使用 `server_node`、`server_python` 或 `server_http`，只添加手动业务埋点。
4. `tracemind.search_event_names`：搜索已有事件，避免随意创建 event name。
5. `tracemind.suggest_instrumentation`：判断复用事件、跳过手动埋点或创建 draft custom event。
6. `tracemind.validate_event_payload` / `tracemind.privacy_check`：检查单个 payload。
7. `tracemind.validate_instrumentation_diff`：完成前校验本次 diff。

MCP 只返回建议和 findings，不写入用户项目，也不把 draft event 自动变成正式事件。

## Native SDK Guidance

`/agents/tracemind/SKILL.md` 是 coding agent 的短手册，必须让 agent 能独立完成 native 接入，而不是只看到一行初始化。它明确要求：

- 先识别平台，再调用 `tracemind.capture_setup({ platform })`。
- iOS 常见入口是 `App.swift`、`AppDelegate.swift` 或拥有启动逻辑的文件。
- Android 常见入口是 `Application.onCreate()`，必要时检查 `AndroidManifest.xml` 是否注册了自定义 `Application`。
- React Native 常见入口是 `index.js`、`App.js`、`App.tsx` 或 app bootstrap，并检查 native bridge 是否已连接。
- 修改前执行 `idempotencyChecks`，避免重复添加 SDK 依赖或 `TraceMind.start(...)`。
- 手动业务事件前使用 `manualCaptureWorkflow`：先搜索已有事件，再校验 payload，最后写入 `TraceMind.identify(...)` 和 `TraceMind.capture("custom", ...)`。
- `properties` 和 `context` 只使用 `supportedPropertyTypes` 返回的 string、number、boolean，不传 null、嵌套对象、数组、PII、credential values、raw prompt/content、input value 或完整 query URL。
- React Native 不新增 `platform: "react_native"`；事件保持 `ios` 或 `android`，并通过 framework metadata 标记来源。
- 完成后运行适用的 `verificationCommands`，再用 TraceMind MCP 查询 raw behaviors 或 semantic events。

## MCP Server And Skill Guidance

第三方 MCP server 使用 `mcp_node` 或 `mcp_python`。Auto Capture 只记录 tool/resource/prompt 安全元数据，例如名称、状态、耗时、错误类型和结果大小分桶。禁止采集 raw prompt、tool arguments、tool result、resource content、源码 diff、secret、token 或完整 query URL。

Agent Skill 使用 `agent_skill`。静态 Skill 文件不能 auto-capture；只有宿主 agent runtime 暴露 started/completed/failed lifecycle hook 时，才能把 lifecycle hook 作为可执行 runtime 接入。没有 hook 时，Skill 只作为教程，实际埋点应放到 MCP server 或执行任务的 runtime。

## Server Manual Capture Guidance

普通后端服务使用 `server_node`、`server_python` 或 `server_http`。第一版只做手动埋点，不做 request Auto Capture。coding agent 应把埋点放在稳定业务结果处，例如支付成功、账单已付、工作区创建、任务完成或同步完成；每次修改前先搜索 event name、校验 payload，完成后校验 diff。服务端事件使用 `platform: "server"`、`sourceType: "server_app"`，禁止采集 request/response body、headers、cookies、authorization、raw logs、secret、token、prompt、源码或完整 query URL。

## 更新机制

不做静默定时更新。Skill 和规则要求 agent 在埋点工作前调用 `tracemind.agent_guidance`。如果本地版本低于 MCP 返回版本，agent 必须告诉用户差异，并在用户确认后只更新 TraceMind 管理区块。
