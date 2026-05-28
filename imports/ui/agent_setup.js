import { mcpServerNameForProject } from '../api/project_identity';

function promptLine(value, fallback) {
  return String(value || fallback).replace(/\s+/g, ' ').trim() || fallback;
}

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
  const resolvedProjectId = promptLine(projectId, 'unknown-project-id').slice(0, 120);
  const resolvedProjectName = promptLine(projectName, 'Current TraceMind project').slice(0, 120);
  const resolvedMcpServerName = promptLine(
    mcpServerName || mcpServerNameForProject({ _id: projectId }),
    'tracemind-project',
  ).slice(0, 120);

  if (locale !== 'zh') {
    return `Install TraceMind coding agent support in the current project.

Before installing, first confirm that the current working directory or repository is the target project that should be connected to TraceMind project "${resolvedProjectName}" (${resolvedProjectId}). If the current repository is not clearly the target project, stop and ask the user to switch to the correct coding agent workspace before changing files or MCP configuration.

Install 3 items:

1. Add the TraceMind Skill
Skill URL: ${resolvedSkillUrl}
Read this file and first confirm whether the current agent explicitly supports a project-level skill directory. If it does, install the skill into the official project-level skill directory recognized by that agent. If project-level skills are unsupported or cannot be confirmed: Do not create a custom skill directory and do not fail; instead, append the skill link, version, and core workflow to the project-level agent instruction / rules file.

2. Update the project agent instruction
Read and append this rules snippet: ${resolvedSnippetUrl}
Append it to AGENTS.md, CLAUDE.md, .cursor/rules, .windsurf/rules, or the current agent's supported project-level rules/instructions file.
Also add this repository-specific TraceMind project binding to the same project-level instruction file. This binding is safe to commit because it does not include the MCP URL, mcpToken, Bearer token, or projectKey:

TraceMind project binding:
- Project name: ${resolvedProjectName}
- Project ID: ${resolvedProjectId}
- Expected MCP server: ${resolvedMcpServerName}

Before using any TraceMind MCP tool in this repository, use MCP server \`${resolvedMcpServerName}\`, call \`tracemind.project_info\`, and continue only if the returned \`projectId\` is \`${resolvedProjectId}\`. If it does not match, stop and ask the user to configure the correct TraceMind MCP server. Do not use another \`tracemind-*\` MCP server for this repository unless the user explicitly confirms the project switch.

3. Add the TraceMind MCP
MCP server:
- Name: ${resolvedMcpServerName}
- Project label: ${resolvedProjectName}
- URL: ${mcpUrl}

Add this server according to the current coding agent's MCP configuration method. Prefer project-level MCP configuration. If only global configuration is available, use the global MCP configuration.
Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md, Skill, README, source code, or any other rules file that may be committed to the repository; only write it into the agent MCP configuration.
After MCP is configured, call \`tracemind.agent_guidance\` to confirm the current authority version. If existing TraceMind Skill or AGENTS rules were found, call \`tracemind.check_agent_setup\` with the local file contents and merge only missing guidance before SDK setup. Then call \`tracemind.capture_setup\` to retrieve the Web Auto Capture script for the current project. For iOS, macOS, Android, React Native, hybrid, mini program, browser extension, MCP server, Agent Skill, or server application projects, pass the matching \`platform\` argument and use the returned one-line initialization code plus setup checks. Use registry install commands when \`distributionMode: "registry"\`; if the setup returns \`distributionMode: "local_source"\` or \`localSourceFallback\` is explicitly needed, use its GitHub clone, \`vendor/\` copy, local dependency, SwiftPM local path, Gradle module, or PYTHONPATH instructions exactly as returned. For server application setup, run the returned \`preDeployChecks\` and \`postDeployVerification\` after a real business event before concluding capture is working or inactive. Use the returned public projectKey only for capture writes; never use the MCP token in frontend code. Do not use an MCP token, Bearer token, or TraceMind internal dogfood configuration as the server capture key.
After installation, you can ask the agent to review product health, real-time online status, last 24 hours performance, and traffic sources. Operations questions should use Dashboard-aligned metrics first: call \`tracemind.project_health\` and \`tracemind.recent_online\` before any instrumentation setup, then use \`tracemind.summary\` and \`tracemind.query_events\` for non-natural-day windows and evidence drilldown.
After installation, call \`tracemind.project_health\` first for a daily health check and \`tracemind.recent_online\` for real-time online status. Then use \`tracemind.summary\` and \`tracemind.query_events\` for feature usage analysis or anomaly or drop investigation. Use \`tracemind.query_raw_behaviors\` only when semantic evidence is insufficient.
When implementing an end-user feedback entry in the app, use TraceMind SDK \`submitFeedback\` methods. Do not use \`/api/capture\`, \`capture("custom")\`, or \`tracemind.submit_feedback\` for terminal user feedback. Use \`tracemind.query_user_feedback\` and \`tracemind.update_user_feedback\` to triage submitted user reports.

Existing configuration handling:
- If TraceMind Skill or TraceMind rules already exist, do not append a duplicate full block. Check the existing version and content, then add only missing guidance.
- If existing TraceMind Skill or rules may be stale, call \`tracemind.check_agent_setup\` with the local Skill, AGENTS/rules, and manifest content; update only the missing rules after telling the user which files will change.
- If the project-level instruction file already contains a \`TraceMind project binding\` with a different Project ID, stop and ask the user whether they are switching this repository to project "${resolvedProjectName}". Do not append a second project binding without explicit confirmation.
- If the same Project ID binding already exists, keep it and add only missing guidance, or update the matching MCP server URL/token.
- If an MCP server named \`${resolvedMcpServerName}\` already exists, update its URL/token for project "${resolvedProjectName}".
- If other \`tracemind-*\` TraceMind MCP servers exist, keep them. They likely belong to other TraceMind projects.
- If an old \`tracemind\` MCP server exists, first confirm whether it belongs to project "${resolvedProjectName}" through MCP metadata or \`tracemind.project_info\`; migrate it to \`${resolvedMcpServerName}\` only if it is this project, otherwise keep it and add \`${resolvedMcpServerName}\`.
- Prefer MCP tools/list descriptions or call \`tracemind.project_info\` to confirm which TraceMind project a server represents. Do not guess from the server name alone.

Execution requirements:
- Before modifying any file or running any command, list the files and commands you plan to use.
- Do not overwrite existing configuration; only merge or append.
- If existing TraceMind configuration is found, reuse and update it instead of adding duplicates.
- After installation, verify that the skill or instruction exists, the MCP server is configured, and list TraceMind MCP tools if possible.
- If the current agent cannot automatically verify MCP, explain the limitation.
Report completion with these statuses:
- Skill / instruction: installed | fallback-installed | pending
- MCP: configured | unsupported
- Tools: listed | manifest-only | unavailable

Manifest: ${resolvedManifestUrl}
`;
  }

  return `请帮我在当前项目中安装 TraceMind 的 coding agent 支持。

安装前，先确认当前工作目录或仓库就是用户要接入 TraceMind 的目标项目“${resolvedProjectName}”（${resolvedProjectId}）。如果当前仓库不能明确确认是目标项目，停止并要求用户切换到正确的 coding agent 工作区后再修改文件或 MCP 配置。

需要安装 3 项内容：

1. 添加 TraceMind Skill
Skill 地址：${resolvedSkillUrl}
请读取这个文件，并先确认当前 agent 是否明确支持项目级 skill 目录。如果支持，请安装到该 agent 官方识别的项目级 skill 目录。如果不支持或无法确认，请不要创建自定义 skill 目录，也不要报错；改为把 skill 链接、版本号和核心工作流追加到项目级 agent instruction / rules 文件。

2. 更新项目 agent instruction
请读取并追加这个规则片段：${resolvedSnippetUrl}
可以追加到 AGENTS.md、CLAUDE.md、.cursor/rules、.windsurf/rules 或当前 agent 支持的项目级 rules/instructions 文件。
同时把下面这个当前仓库专属的 TraceMind 项目绑定写入同一个项目级 instruction 文件。这个绑定可以提交到仓库，因为它不包含 MCP URL、mcpToken、Bearer token 或 projectKey：

TraceMind project binding:
- Project name: ${resolvedProjectName}
- Project ID: ${resolvedProjectId}
- Expected MCP server: ${resolvedMcpServerName}

在这个仓库中使用任何 TraceMind MCP tool 前，必须使用 MCP server \`${resolvedMcpServerName}\`，调用 \`tracemind.project_info\`，并且只有返回的 \`projectId\` 等于 \`${resolvedProjectId}\` 时才能继续。如果不匹配，停止并要求用户配置正确的 TraceMind MCP server。除非用户明确确认切换项目，否则不要为这个仓库使用其他 \`tracemind-*\` MCP server。

3. 添加 TraceMind MCP
MCP server:
- Name: ${resolvedMcpServerName}
- Project label: ${resolvedProjectName}
- URL: ${mcpUrl}

请根据当前 coding agent 的 MCP 配置方式添加这个 server。优先使用项目级 MCP 配置。如果只能使用全局配置，请使用全局 MCP 配置。
不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md、Skill、README、源码或其他会进入仓库的规则文件；只能写入 agent 的 MCP 配置。
MCP 配好后，先调用 \`tracemind.agent_guidance\` 确认当前权威版本。如果发现已有 TraceMind Skill 或 AGENTS rules，调用 \`tracemind.check_agent_setup\` 并传入本地文件内容，先补齐缺失规则，再做 SDK 接入。然后通过 \`tracemind.capture_setup\` 获取 Web Auto Capture 接入脚本。对于 iOS、macOS、Android、React Native、混合应用、小程序、浏览器插件、MCP server、Agent Skill 或 server application 项目，传入对应 \`platform\` 并使用返回的一行初始化代码和接入检查。如果返回 \`distributionMode: "registry"\`，优先使用 registry 安装命令；如果返回 \`distributionMode: "local_source"\` 或明确需要 \`localSourceFallback\`，再按返回的 GitHub clone、\`vendor/\` 复制、本地依赖、SwiftPM local path、Gradle module 或 PYTHONPATH 指令执行。server application 接入后执行返回的 \`preDeployChecks\` 和 \`postDeployVerification\`，触发真实业务事件后再判断采集成功或无活跃。只把返回的公开 projectKey 用于采集写入，不要把 MCP token 写进前端代码。不要把 MCP token、Bearer token 或 TraceMind 内部 dogfood 配置当作服务端 capture key。
安装完成后，可直接让 agent 查看产品健康、实时在线、过去 24 小时表现和流量来源。运营查询优先使用 Dashboard 同源口径：先调用 \`tracemind.project_health\` 和 \`tracemind.recent_online\`，不要先进入埋点安装；再用 \`tracemind.summary\` 和 \`tracemind.query_events\` 查询非自然日时间窗和证据下钻。
安装完成后，优先调用 \`tracemind.project_health\` 做今日健康检查，并调用 \`tracemind.recent_online\` 查看实时在线态势。然后使用 \`tracemind.summary\` 和 \`tracemind.query_events\` 做功能使用分析、异常或下降原因分析。只有语义证据不足时，才调用 \`tracemind.query_raw_behaviors\` 复核原始行为。
如果要在客户 app 里实现终端用户反馈入口，必须使用 TraceMind SDK 的 \`submitFeedback\` 方法；不要使用 \`/api/capture\`、\`capture("custom")\` 或 \`tracemind.submit_feedback\` 上传终端用户反馈。处理用户反馈时使用 \`tracemind.query_user_feedback\` 查询，并使用 \`tracemind.update_user_feedback\` 标记状态、备注和解决方式。

已有配置处理：
- 如果已经安装过 TraceMind Skill 或已经追加过 TraceMind rules，不要重复追加完整内容；只检查版本和规则内容，缺什么补什么。
- 如果已有 TraceMind Skill 或 rules 可能过期，调用 \`tracemind.check_agent_setup\` 并传入本地 Skill、AGENTS/rules 和 manifest 内容；先告诉用户会更新哪些文件，再只补缺失规则。
- 如果项目级 instruction 文件里已经存在不同 Project ID 的 \`TraceMind project binding\`，停止并询问用户是否要把这个仓库切换到项目“${resolvedProjectName}”；没有明确确认前，不要直接追加第二个项目绑定。
- 如果已经存在相同 Project ID 的 \`TraceMind project binding\`，保留它，只补缺失规则，或更新匹配的 MCP server URL/token。
- 如果已有同名 MCP server \`${resolvedMcpServerName}\`，更新它对项目“${resolvedProjectName}”的 URL/token。
- 如果已有其他 \`tracemind-*\` TraceMind MCP server，请保留；它们大概率属于其他 TraceMind 项目。
- 如果已有旧的 \`tracemind\` MCP server，先通过 MCP metadata 或 \`tracemind.project_info\` 确认它是否属于项目“${resolvedProjectName}”；只有确认是当前项目时才迁移成 \`${resolvedMcpServerName}\`，否则保留并新增 \`${resolvedMcpServerName}\`。
- 优先读取 MCP tools/list 的描述或调用 \`tracemind.project_info\` 来确认 MCP server 对应哪个 TraceMind 项目，不要只凭 server name 猜。

执行要求：
- 在修改任何文件或运行任何命令前，先列出你准备修改的文件和命令。
- 不要覆盖已有配置，只能合并或追加。
- 如果发现已有 TraceMind 配置，请复用并更新，不要重复添加。
- 安装完成后，验证 skill 或 instruction 已存在，MCP server 已配置，并尽量列出 TraceMind MCP tools。
- 如果当前 agent 不能自动验证 MCP，请说明限制。
完成后请按以下状态汇报：
- Skill / instruction: installed | fallback-installed | pending
- MCP: configured | unsupported
- Tools: listed | manifest-only | unavailable

Manifest：${resolvedManifestUrl}
`;
}
