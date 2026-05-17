# TraceMind Customer Acquisition Workplan - 2026-05-18

本文档用于 2026-05-18 直接执行种子客户运营工作。核心目标：把 2026-05-17 的公开发布和评论触达推进成真实对话，并继续找到更贴近 A0 ICP 的种子客户。

## 当日目标

- 检查所有已发帖和已评论内容的反馈信号。
- 推进 1-2 个愿意继续沟通或试点的人。
- 新增 5-8 条高质量公开回复，优先小红书、即刻，其次 V2EX、X，少数派低频深评论。
- 清理图片上传阻塞；若已解除，在小红书发布带图试点招募帖。
- 复盘哪类人、哪句话、哪个平台更接近真实种子客户。

## 执行原则

- 优先 A0 ICP：非技术/弱技术、用 AI 或 vibe coding 做出了产品、已经上线或有人试用。
- 评论先说对方产品，再说 TraceMind；首轮尽量不放链接。
- 不在纯教程、纯观点、纯工具推荐、弱相关内容下评论。
- 不发送私信，除非对方明确表示想继续聊或用户当天确认。
- 少数派只做有内容的深评论，不做批量触达。
- 遇到平台规则、登录、文件上传、验证码等阻塞，记录阻塞，不绕过。

## 输入文档

- `docs/customer_acquisition_progress.md`
- `docs/social_reply_targets_2026-05-17.md`
- `docs/customer_messaging.md`
- `docs/vibe_coding_seed_customer_pipeline_2026-05-17.md`

## 任务 1：反馈检查

### 必查链接

即刻：

- 自己发布的试点招募帖：从个人主页或 timeline 打开。
- 已评论候选：
  - `https://web.okjike.com/u/D0EC08CC-47CB-4E99-8F45-137314B2F449/post/6a02cfe505d49c015c8a0e62`
  - `https://web.okjike.com/u/2a3547bf-9a41-4620-821d-472c8d399752/post/69fef715a110301e1b4b31e5`
  - `https://web.okjike.com/u/4D1BA507-7BB5-44E1-8B75-B603BBEEE09E/post/69e34a8dd71a18985bf6a3f0`

V2EX：

- 主帖：`https://www.v2ex.com/t/1213290/review`
- 已评论候选：
  - `https://www.v2ex.com/t/1213256#reply15`
  - `https://www.v2ex.com/t/1213245#reply6`

X：

- 主帖：`https://x.com/old_farmer_/status/2055893615612924388`
- Vibe Coding Community：`https://x.com/i/communities/1898129646782497027`

小红书：

- `https://www.xiaohongshu.com/explore/69a9937e0000000026031c05`
- `https://www.xiaohongshu.com/explore/69ccadc8000000001b001ba5`

少数派：

- `https://sspai.com/post/108082`

### 信号分级

- `high`: 对方问接入、表示愿意试、要求链接、愿意继续聊。
- `medium`: 对方点赞、回复但还没明确试用意愿。
- `low`: 只有浏览、点赞或泛泛互动。
- `not_fit`: 对方不是产品作者，或不是当前 ICP。
- `no_response`: 无可见反馈。

### 记录格式

追加到 `docs/customer_acquisition_progress.md`：

```text
- Platform:
- Source URL:
- Person / Handle:
- Signal:
- Intent:
- What they asked:
- Action taken:
- Follow-up:
```

## 任务 2：推进高意向互动

只回复 `high` 和明显 `medium` 的互动。每条回复都要围绕对方产品的一条核心路径。

短回复模板：

```text
可以，我可以帮你先做一次很轻的试点：接入 TraceMind 后，不需要先搭复杂看板，我们直接看一份用户行为诊断，重点回答用户卡在哪、哪个功能真的被用、改完有没有变好。
```

更具体的回复：

```text
你的产品已经有真实使用场景了，TraceMind 比较适合先看一条核心路径：用户从进入产品到完成关键动作，中间哪一步掉得最多。我们可以先做一次早期诊断，不需要你先设计完整 analytics 体系。
```

如果对方问“怎么接入”：

```text
先接一段很轻的 capture snippet 就行。早期不需要你先设计完整埋点，我们先看用户真实路径，再让 AI 总结卡点和改动效果。
```

如果对方问“和传统 analytics 有什么不同”：

```text
传统 analytics 更像看指标和看板；TraceMind 更偏给 AI 一份可读的用户行为证据，让你直接问“用户卡在哪”“哪个功能没人用”“这次改动有没有变好”。
```

## 任务 3：清理配图阻塞

当前阻塞：Chrome 扩展上传本地文件返回 `Not allowed`。

先检查是否已经开启：

1. 打开 `chrome://extensions`。
2. 进入 Codex Chrome Extension 详情。
3. 确认 `Allow access to file URLs` 已开启。
4. 回到 X 或小红书创作中心测试上传。

可用截图：

- `docs/assets/social/tracemind-intro-01-hero.png`
- `docs/assets/social/tracemind-intro-02-ai-evidence.png`
- `docs/assets/social/tracemind-intro-03-loop.png`

如果上传仍失败，不继续消耗时间；记录阻塞即可。

### 小红书带图帖

只有在图片上传可用时发布。若无法上传，暂不发纯文字版。

标题：

```text
AI 做完产品之后，怎么知道用户到底卡在哪？
```

正文：

```text
最近在做 TraceMind，想找几个用 AI 做产品的朋友试点。

很多人现在可以用 Cursor / Lovable / Bolt 很快把产品做出来，但上线后会遇到另一个问题：

用户真的用了哪些功能？
注册/付费/提交表单卡在哪一步？
改完之后有没有变好？

TraceMind 想解决这个问题：
不用先设计复杂埋点，也不用自己搭看板。
它会自动采集用户行为，把这些行为整理成 AI 能读懂的证据。

然后你可以直接问 AI：
“用户卡在哪？”
“哪个功能没人用？”
“这次改动有没有改善？”

如果你是用 AI 做出了产品、已经有用户在试，欢迎评论或私信，我可以帮你先看一版早期用户行为诊断。
```

## 任务 4：第二批公开触达

### 渠道配比

- 小红书：3-4 条，主攻 A0 ICP。
- 即刻：1-2 条，找 vibe coding 产品和 AI 工具作者。
- V2EX：1 条，只选明确求反馈或产品上线帖。
- X：0-1 条，只选 Lovable / Bolt / Replit / Cursor 明确 build-in-public 的产品。
- 少数派：0-1 条，只在文章上下文非常匹配时评论。

当天总量控制在 5-8 条，宁缺毋滥。

### 搜索关键词

小红书：

- `零基础 做 app`
- `AI 做产品`
- `用 AI 做了一个 app`
- `vibe coding 上线`
- `独立开发 总结`
- `Cursor 做产品`

即刻：

- `vibe coding 做了`
- `做了一个 产品`
- `欢迎反馈`
- `Cursor 做了一个`
- `上线了 求反馈`

V2EX：

- `https://www.v2ex.com/go/create`
- `https://www.v2ex.com/go/ideas`
- 标题优先：`做了一个`、`求反馈`、`不确定有没有人需要`、`vibe coding`、`插件`、`工具站`

X：

- `"built with Lovable" feedback`
- `"vibe coded" app launch`
- `"made with Lovable" app`
- `"built this with Cursor" feedback`

少数派：

- `独立开发`
- `效率工具`
- `AI 工具`
- `插件`
- `我做了一个`

### 评论筛选

至少满足 2 条才评论：

- 对方发布的是自己的产品。
- 对方明确要反馈、用户、试用或验证需求。
- 产品已经有截图、demo、链接、上架记录、收入或真实用户。
- TraceMind 能自然回答其用户路径或转化卡点。
- 评论可以具体到对方产品的一条路径。

跳过：

- 纯工具盘点。
- 纯教程。
- 纯观点讨论。
- 纯广告帖。
- 版规不适合推广的社区。

### 推荐评论结构

```text
这个产品已经有真实使用路径了，后面最值得看的可能不是再加功能，而是用户从进入产品到完成关键动作，哪一步掉得最多。我们在做 TraceMind，想找几个 AI-built 产品试点：自动记录用户行为，然后直接问 AI 用户卡在哪、改完有没有变好。
```

针对已收入产品：

```text
已经有收入/试用反馈了，下一步很适合看真实用户路径：用户从看到功能、开始试用，到付费或复用，哪一步掉得最多。我们在做 TraceMind，帮 AI-built 产品自动记录行为，然后直接问 AI 用户卡在哪、改完有没有变好。
```

针对工具/插件：

```text
这类工具最值得看的可能是首次成功路径：安装、打开、完成关键动作、复制/导出结果，哪一步掉得最多。TraceMind 可以自动记录这些行为，再让 AI 总结用户卡在哪、哪些功能真的被用。
```

## 任务 5：复盘与文档更新

当天结束前更新：

- `docs/customer_acquisition_progress.md`
- `docs/social_reply_targets_2026-05-17.md`
- 必要时更新 `docs/customer_messaging.md`

复盘必须回答：

- 哪个平台最接近 A0 ICP？
- 哪条评论或文案有反馈？
- 哪类人最可能愿意试点？
- 哪句话最容易被理解？
- 哪些渠道或关键词需要降低优先级？
- 明天是否继续以小红书为主？

## 成功标准

- 至少完成 5 条高质量公开触达。
- 至少识别 2 条高质量新候选。
- 至少推动 1 个潜在试点进入下一步沟通。
- 明确记录所有反馈、无响应和阻塞。
- 没有在弱相关帖子下硬推 TraceMind。

## 收尾清单

- [ ] 检查即刻反馈。
- [ ] 检查 V2EX 反馈。
- [ ] 检查 X 反馈。
- [ ] 检查小红书 2 条评论反馈。
- [ ] 检查少数派 MioKit 评论反馈。
- [ ] 回复所有高意向互动。
- [ ] 检查 Chrome 扩展本地文件上传权限。
- [ ] 可上传时发布小红书带图帖。
- [ ] 新增 5-8 条高质量回复型触达。
- [ ] 更新获客进展文档。
- [ ] 更新候选状态和有效话术。
