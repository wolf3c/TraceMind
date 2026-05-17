# TraceMind Customer Acquisition Workplan - 2026-05-18

本文档用于 2026-05-18 直接执行种子客户运营工作。目标是把 2026-05-17 的公开发布和评论触达，推进成真实对话，并争取 1-2 个愿意试点的开发者。

## 目标

- 检查即刻、V2EX、X 的评论、私信、点赞和可见互动。
- 对有兴趣的人做一对一回复，推动进入试点沟通。
- 再完成 5-8 条高质量回复型触达。
- 给 X 主帖补产品截图，前提是 Chrome 扩展已允许本地文件上传。
- 更新获客进展、候选状态和有效话术。

## 输入文档

- `docs/customer_acquisition_progress.md`
- `docs/social_reply_targets_2026-05-17.md`
- `docs/customer_messaging.md`
- `docs/vibe_coding_seed_customer_pipeline_2026-05-17.md`

## 上午：复盘反馈

### 检查平台

1. 即刻
   - 检查自己发布的试点招募帖。
   - 检查 3 条候选评论是否有人回复或点赞。
   - 重点看是否有人表达“想试试”“怎么接入”“发我看看”。

2. V2EX
   - 检查主帖 `https://www.v2ex.com/t/1213290/review`。
   - 检查已评论的两个帖子：
     - `https://www.v2ex.com/t/1213256#reply15`
     - `https://www.v2ex.com/t/1213245#reply6`

3. X
   - 检查主帖 `https://x.com/old_farmer_/status/2055893615612924388`。
   - 检查 Vibe Coding Community 帖。
   - 检查是否有私信、关注、回复或 profile visit 迹象。

### 记录方式

把结果追加到 `docs/customer_acquisition_progress.md`，每条记录包含：

```text
- Platform:
- Source URL:
- Person / Handle:
- Signal: reply / like / DM / follow / no_response
- Intent: high / medium / low / not_fit
- What they asked:
- Next action:
```

## 中午：推进高意向用户

优先回复以下类型：

- 已有产品上线。
- 正在找用户反馈。
- 明确不知道用户卡在哪。
- 使用 Lovable、Base44、Bolt、Replit、Cursor、Claude Code 等工具做产品。
- 非技术或弱技术背景，但已经靠 AI 做出可用产品。

### 一对一回复模板

短回复：

```text
可以，我可以帮你先做一次很轻的试点：接入 TraceMind 后，不需要先搭复杂看板，我们直接看一份用户行为诊断，重点回答用户卡在哪、哪个功能真的被用、改完有没有变好。
```

更具体的回复：

```text
你的产品已经有真实使用场景了，TraceMind 比较适合先看一条核心路径：用户从进入产品到完成关键动作，中间哪一步掉得最多。我们可以先做一次早期诊断，不需要你先设计完整 analytics 体系。
```

给开发者朋友的私信：

```text
我现在在找几个 AI-built 产品做 TraceMind 的早期试点。它做的事情是自动采集用户行为，然后让 AI 直接回答用户卡在哪、哪些功能没人用、改完之后有没有变好。你现在这个产品如果已经有人试用，挺适合先跑一版诊断。
```

## 下午：第二批触达

### 搜索关键词

即刻：

- `vibe coding 做了`
- `做了一个 产品`
- `欢迎反馈`
- `Lovable 做了`
- `Cursor 做了一个`
- `上线了 求反馈`

V2EX：

- 分享创造节点：`https://www.v2ex.com/go/create`
- 奇思妙想节点：`https://www.v2ex.com/go/ideas`
- 优先找标题包含：`做了一个`、`求反馈`、`不确定有没有人需要`、`vibe coding`、`插件`、`工具站`

X：

- `"built with Lovable" feedback`
- `"vibe coded" app launch`
- `"made with Lovable" app`
- `"built this with Cursor" feedback`
- `"AI-built" "users get stuck"`

### 评论筛选规则

只评论满足至少两项的帖子：

- 对方正在发布自己的产品。
- 对方明确要反馈、试用或用户。
- 产品已经有可访问链接、截图、demo 或真实用户。
- TraceMind 能自然帮助其理解用户行为。
- 评论能围绕对方产品本身展开，而不是只介绍 TraceMind。

跳过：

- 纯观点讨论。
- 与产品上线无关的 AI 新闻。
- 已经明显商业推广且无互动空间的广告帖。
- 版规不允许推广的社区。

## 补图任务

已准备截图：

- `docs/assets/social/tracemind-intro-01-hero.png`
- `docs/assets/social/tracemind-intro-02-ai-evidence.png`
- `docs/assets/social/tracemind-intro-03-loop.png`

补图前置条件：

1. 打开 Chrome 扩展详情页。
2. 给 Codex Chrome Extension 开启 `Allow access to file URLs`。
3. 回到 X 主帖，回复一条带 3 张图的补充说明。

补图文案：

```text
Adding a few screenshots for context. TraceMind is not another dashboard: it gives your coding agent AI-readable behavior evidence, so it can answer where users got stuck and whether fixes worked.
```

如果 X 仍无法上传图片，不要强行绕过；记录原因即可。

## 傍晚：文案复盘

检查当天哪些表达更容易引发回应：

- “AI 自动埋点”
- “不用搭 analytics 看板”
- “直接问 AI 用户卡在哪”
- “改完验证有没有变好”
- “帮你做一版早期用户行为诊断”

更新：

- `docs/customer_messaging.md`
- `docs/social_reply_targets_2026-05-17.md`
- `docs/customer_acquisition_progress.md`

## 成功标准

- 完成至少 5 条高质量回复型触达。
- 至少获得 1 个愿意继续沟通或试点的人。
- 明确记录哪个渠道、哪句话、哪类客户有反馈。
- 没有在不相关帖子下硬推 TraceMind。

## 明日收尾清单

- [ ] 检查即刻反馈。
- [ ] 检查 V2EX 反馈。
- [ ] 检查 X 反馈。
- [ ] 回复所有高意向互动。
- [ ] 新增 5-8 条候选并选择是否评论。
- [ ] 尝试给 X 主帖补图。
- [ ] 更新获客进展文档。
- [ ] 更新有效文案和无效文案。
