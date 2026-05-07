export function buildAgentInstallPrompt({
  locale,
  origin,
  mcpUrl,
  skillUrl,
  snippetUrl,
  manifestUrl,
}) {
  const resolvedOrigin = String(origin || '').replace(/\/$/, '');
  const resolvedSkillUrl = skillUrl || `${resolvedOrigin}/agents/tracemind/SKILL.md`;
  const resolvedSnippetUrl = snippetUrl || `${resolvedOrigin}/agents/tracemind/AGENTS_SNIPPET.md`;
  const resolvedManifestUrl = manifestUrl || `${resolvedOrigin}/agents/tracemind/manifest.json`;

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
- Name: tracemind
- URL: ${mcpUrl}

Add this server according to the current coding agent's MCP configuration method. Prefer project-level MCP configuration. If only global configuration is available, tell me first and wait for confirmation.
Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md, Skill, README, source code, or any other rules file that may be committed to the repository; only write it into the agent MCP configuration.

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
- Name: tracemind
- URL: ${mcpUrl}

请根据当前 coding agent 的 MCP 配置方式添加这个 server。优先使用项目级 MCP 配置。如果只能使用全局配置，请先告诉我并等待确认。
不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md、Skill、README、源码或其他会进入仓库的规则文件；只能写入 agent 的 MCP 配置。

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
