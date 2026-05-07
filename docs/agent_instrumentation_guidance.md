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
- 当前项目的短稳定 MCP server name，例如 `tm-a8f3k2`，以及项目显示名。server name 只用于配置兼容和区分多个 MCP，不从项目名生成。
- 修改前必须列出文件和命令、只合并追加、不覆盖已有配置、安装后验证的要求。
- 项目级 skill 只在当前 agent 明确支持官方项目级 skill 目录时安装；否则回退到项目级 rules/instructions，不创建自定义目录。
- MCP URL 和 token 只写入 agent 的 MCP 配置，不写入 `AGENTS.md`、skill、README、源码或其他仓库规则文件。
- Web Auto Capture 的当前项目脚本由 `tracemind.capture_setup` 动态返回，不写入静态 guidance 或安装提示词。
- 如果 MCP 只能写入全局配置，agent 必须先等待用户确认，并把结果标记为 partially installed，而不是声称三项全部完成。
- 如果已经存在 TraceMind Skill 或 rules，agent 只检查版本和补充缺失内容，不重复追加完整区块。
- 如果已经存在同名 MCP server，agent 更新 URL/token；如果存在其他 `tm-*` TraceMind server，必须保留；如果存在旧的 `tracemind` server，先通过 MCP 自描述或 `tracemind.project_info` 确认项目归属。
- 安装提示词跟随当前控制台 UI 语言：中文界面生成中文提示词，英文或其他语言生成英文提示词。

如果项目没有 MCP token，控制台不生成安装提示词，先引导用户创建 token。

控制台默认只展示复制入口，不展开完整安装提示词。MCP URL 跟随具体 MCP token，只在 token 管理区域提供对应复制入口。需要人工复核提示词、打开公开 guidance 链接或管理额外 MCP token 时，再展开对应的高级区域。

## MCP 工作流

Agent 后续修改 TraceMind 埋点时应按顺序使用 MCP：

1. `tracemind.project_info`：多项目或不确定时先确认当前 MCP 对应的 TraceMind 项目。
2. `tracemind.agent_guidance`：检查 guidance 版本和公开资源。
3. `tracemind.capture_setup`：Web 项目先获取当前项目 Auto Capture 脚本并验证 `/capture.js` + `data-tracemind-token` 已安装。
4. `tracemind.search_event_names`：搜索已有事件，避免随意创建 event name。
5. `tracemind.suggest_instrumentation`：判断复用事件、跳过手动埋点或创建 draft custom event。
6. `tracemind.validate_event_payload` / `tracemind.privacy_check`：检查单个 payload。
7. `tracemind.validate_instrumentation_diff`：完成前校验本次 diff。

MCP 只返回建议和 findings，不写入用户项目，也不把 draft event 自动变成正式事件。

## 更新机制

不做静默定时更新。Skill 和规则要求 agent 在埋点工作前调用 `tracemind.agent_guidance`。如果本地版本低于 MCP 返回版本，agent 必须告诉用户差异，并在用户确认后只更新 TraceMind 管理区块。
