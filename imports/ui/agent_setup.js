import { mcpServerNameForProject } from '../api/tracemind';

export function buildAgentInstallPrompt({
  locale,
  origin,
  mcpUrl,
  projectId,
  projectName,
  mcpServerName,
  skillUrl,
  snippetUrl,
  manifestUrl,
}) {
  const resolvedOrigin = String(origin || '').replace(/\/$/, '');
  const resolvedSkillUrl = skillUrl || `${resolvedOrigin}/agents/tracemind/SKILL.md`;
  const resolvedSnippetUrl = snippetUrl || `${resolvedOrigin}/agents/tracemind/AGENTS_SNIPPET.md`;
  const resolvedManifestUrl = manifestUrl || `${resolvedOrigin}/agents/tracemind/manifest.json`;
  const resolvedProjectName = String(projectName || 'Current TraceMind project').trim() || 'Current TraceMind project';
  const resolvedMcpServerName = mcpServerName || mcpServerNameForProject({ _id: projectId });

  if (locale !== 'zh') {
    return `Install TraceMind coding agent support in the current project.

Install 3 items:

1. Add the TraceMind Skill
Skill URL: ${resolvedSkillUrl}
Read this file and first confirm whether the current agent explicitly supports a project-level skill directory. If it does, install the skill into the official project-level skill directory recognized by that agent. If project-level skills are unsupported or cannot be confirmed: Do not create a custom skill directory and do not fail; instead, append the skill link, version, and core workflow to the project-level agent instruction / rules file.

2. Update the project agent instruction
Read and append this rules snippet: ${resolvedSnippetUrl}
Append it to AGENTS.md, CLAUDE.md, .cursor/rules, .windsurf/rules, or the current agent's supported project-level rules/instructions file.

3. Add the TraceMind MCP
MCP server:
- Name: ${resolvedMcpServerName}
- Project label: ${resolvedProjectName}
- URL: ${mcpUrl}

Add this server according to the current coding agent's MCP configuration method. Prefer project-level MCP configuration. If only global configuration is available, tell me first and wait for confirmation.
Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md, Skill, README, source code, or any other rules file that may be committed to the repository; only write it into the agent MCP configuration.
After MCP is configured, Call \`tracemind.capture_setup\` to retrieve the Web Auto Capture script for the current project. For iOS, Android, or React Native projects, pass the matching \`platform\` argument and use the returned one-line initialization code. Use the returned public projectKey only for capture writes; never use the MCP token in frontend code.

Existing configuration handling:
- If TraceMind Skill or TraceMind rules already exist, do not append a duplicate full block. Check the existing version and content, then add only missing guidance.
- If an MCP server named \`${resolvedMcpServerName}\` already exists, update its URL/token for project "${resolvedProjectName}".
- If other \`tm-*\` TraceMind MCP servers exist, keep them. They likely belong to other TraceMind projects.
- If an old \`tracemind\` MCP server exists, first confirm whether it belongs to project "${resolvedProjectName}" through MCP metadata or \`tracemind.project_info\`; migrate it to \`${resolvedMcpServerName}\` only if it is this project, otherwise keep it and add \`${resolvedMcpServerName}\`.
- Prefer MCP tools/list descriptions or call \`tracemind.project_info\` to confirm which TraceMind project a server represents. Do not guess from the server name alone.

Execution requirements:
- Before modifying any file or running any command, list the files and commands you plan to use.
- Do not overwrite existing configuration; only merge or append.
- If existing TraceMind configuration is found, reuse and update it instead of adding duplicates.
- After installation, verify that the skill or instruction exists, the MCP server is configured, and list TraceMind MCP tools if possible.
- If the current agent cannot automatically verify MCP, explain the limitation.
- If MCP is waiting for user confirmation because only global configuration is available, mark the state as "rules/skill installed, MCP pending confirmation" and do not claim all 3 items are complete.

Report completion with these statuses:
- Skill / instruction: installed | fallback-installed | pending
- MCP: configured | pending-global-confirmation | unsupported
- Tools: listed | manifest-only | unavailable

Manifest: ${resolvedManifestUrl}
`;
  }

  return `请帮我在当前项目中安装 TraceMind 的 coding agent 支持。

需要安装 3 项内容：

1. 添加 TraceMind Skill
Skill 地址：${resolvedSkillUrl}
请读取这个文件，并先确认当前 agent 是否明确支持项目级 skill 目录。如果支持，请安装到该 agent 官方识别的项目级 skill 目录。如果不支持或无法确认，请不要创建自定义 skill 目录，也不要报错；改为把 skill 链接、版本号和核心工作流追加到项目级 agent instruction / rules 文件。

2. 更新项目 agent instruction
请读取并追加这个规则片段：${resolvedSnippetUrl}
可以追加到 AGENTS.md、CLAUDE.md、.cursor/rules、.windsurf/rules 或当前 agent 支持的项目级 rules/instructions 文件。

3. 添加 TraceMind MCP
MCP server:
- Name: ${resolvedMcpServerName}
- Project label: ${resolvedProjectName}
- URL: ${mcpUrl}

请根据当前 coding agent 的 MCP 配置方式添加这个 server。优先使用项目级 MCP 配置。如果只能使用全局配置，请先告诉我并等待确认。
不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md、Skill、README、源码或其他会进入仓库的规则文件；只能写入 agent 的 MCP 配置。
MCP 配好后，通过 \`tracemind.capture_setup\` 获取 Web Auto Capture 接入脚本。对于 iOS、Android 或 React Native 项目，传入对应 \`platform\` 并使用返回的一行初始化代码。只把返回的公开 projectKey 用于采集写入，不要把 MCP token 写进前端代码。

已有配置处理：
- 如果已经安装过 TraceMind Skill 或已经追加过 TraceMind rules，不要重复追加完整内容；只检查版本和规则内容，缺什么补什么。
- 如果已有同名 MCP server \`${resolvedMcpServerName}\`，更新它对项目“${resolvedProjectName}”的 URL/token。
- 如果已有其他 \`tm-*\` TraceMind MCP server，请保留；它们大概率属于其他 TraceMind 项目。
- 如果已有旧的 \`tracemind\` MCP server，先通过 MCP metadata 或 \`tracemind.project_info\` 确认它是否属于项目“${resolvedProjectName}”；只有确认是当前项目时才迁移成 \`${resolvedMcpServerName}\`，否则保留并新增 \`${resolvedMcpServerName}\`。
- 优先读取 MCP tools/list 的描述或调用 \`tracemind.project_info\` 来确认 MCP server 对应哪个 TraceMind 项目，不要只凭 server name 猜。

执行要求：
- 在修改任何文件或运行任何命令前，先列出你准备修改的文件和命令。
- 不要覆盖已有配置，只能合并或追加。
- 如果发现已有 TraceMind 配置，请复用并更新，不要重复添加。
- 安装完成后，验证 skill 或 instruction 已存在，MCP server 已配置，并尽量列出 TraceMind MCP tools。
- 如果当前 agent 不能自动验证 MCP，请说明限制。
- 如果 MCP 因需要全局配置而等待用户确认，请把状态标记为“rules/skill 已安装，MCP 待确认”，不要声称 3 项都已完成。

完成后请按以下状态汇报：
- Skill / instruction: installed | fallback-installed | pending
- MCP: configured | pending-global-confirmation | unsupported
- Tools: listed | manifest-only | unavailable

Manifest：${resolvedManifestUrl}
`;
}
