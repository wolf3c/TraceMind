# TraceMind Seed Customer Pipeline - Batch 1

Date: 2026-05-17

Goal: 找到第一批高匹配种子客户，并准备可直接审核后发送的外联队列。

Status rule:

- `new`: 新发现，未联系。
- `ready`: 已筛选，文案可审核。
- `contacted`: 已联系。
- `replied`: 已回复。
- `meeting`: 已约沟通。
- `pilot`: 进入试点。
- `rejected`: 不匹配或无意愿。

## 筛选标准

优先选择同时满足以下条件的对象：

- 产品已公开上线。
- 团队或产品公开表现出 AI coding、MCP、Cursor、Claude Code、Codex、AI agent workflow 信号。
- 面向开发者、AI-native 小团队、AI SaaS、devtool、MCP 工具或早期 SaaS。
- 能找到公开外联入口，例如 Product Hunt maker、官网、GitHub、X、邮件或社区页面。
- 可能有明确的激活、留存、功能采用、转化或 onboarding 问题。

## Batch 1 Lead List

| Priority | Status | Lead | Source / signal | Why TraceMind fits | Outreach entry | First angle |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | ready | [DevLensPro](https://www.producthunt.com/products/devlenspro) | Product Hunt: Claude Code + MCP debugging Chrome extension | 强 AI coding 工具用户，产品自己也在解决“浏览器行为到 Claude Code”的上下文问题。 | Product Hunt maker / [devlens.pro](https://www.devlens.pro) | TraceMind 可以把真实用户行为也变成 coding agent 可分析的上下文。 |
| P0 | ready | [Open Computer Use](https://www.producthunt.com/products/open-computer-use) | Product Hunt: Codex / Claude Code / Gemini CLI / MCP desktop automation | 直接服务 agent stack，且处于早期反馈阶段。 | Product Hunt maker / GitHub | TraceMind 可以帮助他们理解开发者从安装到首次成功自动化的卡点。 |
| P0 | ready | [shutup-mcp](https://www.producthunt.com/products/shutup-mcp) | Product Hunt: MCP proxy, Claude Code token overhead pain | 与 MCP 使用体验高度相关，目标用户重合。 | Product Hunt maker / GitHub | TraceMind 可以帮助验证用户是否真的完成 MCP 配置并持续使用。 |
| P0 | ready | [LeanKG](https://github.com/FreePeak/LeanKG) | GitHub: MCP server for Cursor, OpenCode, Claude Code; has live demo | AI-assisted development devtool，有明显 onboarding 和 demo 使用路径。 | GitHub profile / repo discussion / website | TraceMind 可定位开发者从 demo 到本地安装的掉点。 |
| P0 | ready | [llm-wiki](https://github.com/Pratiyush/llm-wiki) | GitHub: Claude Code, Codex CLI, Copilot, Cursor, Gemini; MCP tools | 目标人群就是重度 AI coding 用户，适合 agent-readable behavior 定位。 | GitHub profile / project page | TraceMind 可以帮助发现用户是否完成 session 导入、wiki 构建和 MCP 查询。 |
| P0 | ready | [LobeSter](https://www.makerpad.co/tool/lobester) | MakerPad: built with Cursor; OpenClaw skill loadouts | Agent workflow 配置工具，用户行为和 setup success 很关键。 | MakerPad maker / product page | TraceMind 可显示用户在哪个 skill/loadout 配置步骤卡住。 |
| P0 | ready | [RealMarketAPI](https://www.makerpad.co/tool/realmarketapi) | MakerPad: built with Claude Code; REST/WebSocket/MCP API | Developer API，强 activation 问题：注册到首次成功调用。 | [realmarketapi.com](https://realmarketapi.com) | TraceMind 可回答开发者是否完成 API key、first call、MCP 配置。 |
| P0 | ready | [doQment](https://www.producthunt.com/products/doqment) | Product Hunt: turns websites into MCP-like systems; Codex/Cursor/Claude Code | MCP 工具，已在 PH 评论里公开追求反馈循环。 | Product Hunt maker / X / [doqment.dev](https://doqment.dev) | TraceMind 可帮助他们看用户从 crawl 到 connect agent 的真实转化路径。 |
| P0 | ready | [Claudy](https://www.producthunt.com/products/claudy) | Product Hunt: Claude Code wrapper with MCP/Skills marketplace | 直接面向 Claude Code power users，且有 marketplace 分发潜力。 | Product Hunt maker / [claudy.markg.app](https://claudy.markg.app) | TraceMind 可作为 marketplace 中的行为证据 MCP，也可帮助 Claudy 分析 activation。 |
| P0 | ready | [mcp-use](https://www.producthunt.com/products/mcp-use) | Product Hunt: MCP SDK/cloud infra for product teams | MCP 基础设施团队，可能是客户也可能是渠道合作方。 | Product Hunt maker / [mcp-use.com](https://mcp-use.com) | TraceMind 可补足“产品内行为证据进入 agent”的应用层场景。 |
| P1 | ready | [codesight](https://github.com/Houseofmvps/codesight) | GitHub: context generator for Claude Code, Cursor, Copilot, Codex; MCP server | AI coding devtool，有 install/init/open report/MCP 多步骤路径。 | GitHub profile / npm page | TraceMind 可分析哪些 setup path 带来真实持续使用。 |
| P1 | ready | [SpecLock](https://github.com/sgroy10/speclock) | GitHub: Cursor/Claude/Codex MCP install; AI constraint engine | 面向 agentic coding 项目，强调规则执行和 incident replay。 | GitHub profile / repo discussion | TraceMind 可帮助验证用户是否从 protect 到 doctor 到 MCP install 完成闭环。 |
| P1 | ready | [LocalePack](https://www.makerpad.co/tool/localepack) | MakerPad: built with Cursor; Chrome extension localization devtool | Web-first 文件上传流程，适合用 TraceMind 找转化卡点。 | [localepack.app](https://localepack.app) | TraceMind 可定位 upload、language select、download ZIP 的掉点。 |
| P1 | ready | [ShipBoost](https://www.makerpad.co/tool/shipboost) | MakerPad: built with Codex; launch platform for bootstrapped SaaS | 既是潜在客户，也是分发渠道。 | [shipboost.io](https://shipboost.io) | TraceMind 可作为 SaaS launch 后的默认行为诊断服务。 |
| P1 | ready | [SEObot](https://www.makerpad.co/tool/seobot) | MakerPad: built with Codex; AI SEO agent | 自助 onboarding、CMS 集成、首次发布都有明显卡点。 | [seobotai.com](https://seobotai.com) | TraceMind 可回答用户在哪一步没完成第一篇内容发布。 |
| P1 | ready | [Keyword Kick](https://www.makerpad.co/tool/keyword-kick) | MakerPad: built with Claude Code; uses Search Console/Analytics data | 已经有数据分析语境，但产品内行为仍可能缺失。 | [keywordkick.com](https://www.keywordkick.com) | TraceMind 可把产品内操作行为补进 AI 分析链路。 |
| P1 | ready | [LLaMaRush](https://www.makerpad.co/tool/llamarush) | MakerPad: built with Claude Code; uses GSC/GA4 data | AI SEO 自动化，强 first-value 路径。 | [llamarush.com](https://www.llamarush.com) | TraceMind 可看用户是否完成连接数据源并生成第一篇文章。 |
| P1 | ready | [xVault AI](https://www.makerpad.co/tool/xvault-ai) | MakerPad: built with Cursor; X bookmark AI workspace | 导入、整理、搜索、生成内容路径明确。 | [xvault-ai.com](https://xvault-ai.com) | TraceMind 可发现用户在导入 bookmark 后是否真的进入查询和复用。 |
| P1 | ready | [Clura AI Scraper](https://www.makerpad.co/tool/clura-ai-scraper) | MakerPad: built with Cursor; Chrome extension scraping workflow | Chrome extension 从 install 到 first export 路径明确。 | [clura.ai](https://www.clura.ai) | TraceMind 可定位 install、extract、organize、export 哪一步掉得最多。 |
| P1 | ready | [DemoKraft AI](https://www.makerpad.co/tool/demokraft-ai) | MakerPad: built with Claude Code; product demo and lead qualification | 本身关注 demo engagement 和 intent signals。 | [demokraft.ai](https://demokraft.ai) | TraceMind 可让他们在 agent 中直接分析 demo 使用证据。 |
| P2 | new | [Truleado](https://www.makerpad.co/tool/truleado) | MakerPad: built with Claude Code; influencer campaign platform | 有 agency 多客户和 ROI reporting 场景，但不一定 AI-native。 | [truleado.com](https://www.truleado.com) | TraceMind 可用于分析 campaign setup completion。 |
| P2 | new | [FlowLister](https://www.makerpad.co/tool/flowlister) | MakerPad: built with Claude Code; AI eBay listing | 清晰照片到 listing funnel，但 devtool 属性较弱。 | [flowlister.com](https://flowlister.com) | TraceMind 可看 sellers 在生成、编辑、发布哪一步放弃。 |
| P2 | new | [Infratailors](https://www.makerpad.co/tool/infratailors) | MakerPad: built with Codex; AI infrastructure optimization | 技术用户，但产品复杂度和外联入口需再验证。 | [infratailors.ai](https://infratailors.ai) | TraceMind 可分析从连接 infra 到获得建议的 setup path。 |
| P2 | new | [NicheMRR](https://www.makerpad.co/tool/nichemrr) | MakerPad: built with Cursor; SaaS niche research | 面向 founders，能形成试点案例，但 agent workflow 信号较弱。 | [nichemrr.site](https://nichemrr.site) | TraceMind 可看用户是否从搜索 niche 到查看 benchmark。 |
| P2 | new | [Gwirian](https://www.gwirian.com/) | MakerPad/Bolt signal; site mentions API/MCP integration | QA/dev team workflow，需确认真实用户和联系入口。 | Product site / GitHub if available | TraceMind 可看团队是否完成 first scenario/test flow。 |

## Today Outreach Queue

先联系这 10 个，理由是 AI coding / MCP 信号最强，且产品问题与 TraceMind 最贴近：

1. DevLensPro
2. Open Computer Use
3. shutup-mcp
4. LeanKG
5. llm-wiki
6. LobeSter
7. RealMarketAPI
8. doQment
9. Claudy
10. mcp-use

## First Message Drafts

### DevLensPro

```text
Hi, I saw DevLensPro connects browser UI context directly into Claude Code through MCP.

I am building TraceMind for the next layer of that workflow: real user behavior evidence that Codex / Claude Code / Cursor can query directly.

The goal is simple: AI 自动埋点，AI 分析数据，AI 驱动产品迭代闭环. For a tool like DevLensPro, TraceMind could show where users drop between install, first element click, and first successful fix.

I am looking for 5 early products to help set up and deliver a first behavior diagnosis within 24 hours. Open to trying it on DevLensPro?
```

### Open Computer Use

```text
Hi, I saw Open Computer Use brings local desktop automation to Codex, Claude Code, Gemini CLI, and MCP clients.

I am building TraceMind: a behavior layer that lets coding agents inspect real user behavior, not just code or tool context.

For Open Computer Use, it could help answer where developers get stuck: install, MCP connection, first inspect, first click/type action, or cross-platform setup.

I am looking for 5 early products to help set up and deliver a first behavior diagnosis within 24 hours. Would you be open to trying it?
```

### shutup-mcp

```text
Hi, I saw shutup-mcp tackles a very real MCP problem: too many tools and too much context before the user even starts.

I am building TraceMind for a related problem: product teams ship with AI fast, but cannot easily ask their coding agent how real users behave.

TraceMind captures behavior and makes it queryable from Codex / Claude Code / Cursor, so teams can ask where users get stuck and whether a product change worked.

Would you be open to trying it on shutup-mcp? I can help set it up and deliver a first behavior diagnosis within 24 hours.
```

### LeanKG

```text
Hi, I saw LeanKG gives Cursor, OpenCode, and Claude Code a queryable knowledge graph for codebases.

I am building TraceMind, which does something similar for real product usage: it turns user behavior into evidence that coding agents can query.

For LeanKG, TraceMind could help answer where developers drop between live demo, install, indexing a repo, opening the graph, and connecting MCP.

I am looking for 5 early devtools to help set up and deliver a first behavior diagnosis within 24 hours. Open to trying it?
```

### llm-wiki

```text
Hi, I saw llm-wiki turns Claude Code, Codex, Cursor, Copilot, and Gemini sessions into a searchable wiki and MCP tools.

I am building TraceMind: a behavior evidence layer for AI coding agents.

Instead of maintaining another analytics dashboard, teams can ask their agent where users get stuck, what features are ignored, and whether a product change improved behavior.

For llm-wiki, TraceMind could help diagnose the path from first sync to wiki build to MCP query. Would you be open to trying it?
```

### LobeSter

```text
Hi, I saw LobeSter helps manage OpenClaw skill configurations through deterministic loadouts.

I am building TraceMind, a behavior layer for AI coding agents. It helps teams ask Codex / Claude Code / Cursor how real users move through the product, instead of manually reading dashboards.

For a setup-heavy tool like LobeSter, TraceMind could show which skill/loadout steps are clear and where users get stuck.

Open to trying it as an early design partner? I can help set it up and deliver a first behavior diagnosis within 24 hours.
```

### RealMarketAPI

```text
Hi, I saw RealMarketAPI offers REST, WebSocket, and MCP access for real-time market data.

I am building TraceMind so AI coding agents can inspect real user behavior directly: AI 自动埋点，AI 分析数据，AI 驱动产品迭代闭环.

For a developer API, TraceMind can help answer where users drop: signup, API key, docs, first REST call, WebSocket, or MCP setup.

Would you be open to trying it on one onboarding flow? I can help wire it up and deliver a first diagnosis within 24 hours.
```

### doQment

```text
Hi, I saw doQment turns websites into MCP-like systems for Cursor, Codex, and Claude Code.

I am building TraceMind for product behavior: it lets coding agents query real user behavior evidence, so teams can ask where users get stuck and whether changes worked.

For doQment, TraceMind could help analyze the path from account creation to crawl, MCP connection, and first useful agent query.

Open to trying it as an early design partner? I can help set it up and deliver a first behavior diagnosis within 24 hours.
```

### Claudy

```text
Hi, I saw Claudy gives Claude Code a proper multi-session home plus a Marketplace for Skills, MCPs, and Commands.

I am building TraceMind, a behavior evidence layer for AI coding agents. It helps founders ask their coding agent how real users behave, instead of maintaining another analytics dashboard.

Claudy feels like a strong fit because your users already live inside Claude Code workflows.

Would you be open to trying TraceMind on Claudy, or discussing whether TraceMind belongs in the marketplace?
```

### mcp-use

```text
Hi, I saw mcp-use is building SDK and cloud infra for teams creating MCP agents.

I am building TraceMind at the application behavior layer: once a product has users, TraceMind makes real behavior queryable from Codex / Claude Code / Cursor through MCP.

It complements MCP infra by giving product teams an immediate use case: ask where users get stuck, what features are ignored, and whether a change worked.

Open to a quick design-partner conversation or integration discussion?
```

## No-send Boundary

以上文案还没有发送。发送前必须确认：

- 目标平台和账号。
- 收件人或目标页面。
- 最终正文。
- 是否包含敏感信息、客户信息、截图、prompt、源码、token 或带 query 的完整 URL。

## Next Operating Step

建议下一步：

1. 审核 `Today Outreach Queue` 和 10 条文案。
2. 选定首发渠道：Product Hunt comment/DM、X DM、官网 contact、GitHub discussion 之一。
3. 每次只发 5-10 条高质量外联。
4. 将发送状态改为 `contacted`，并记录回复内容。
