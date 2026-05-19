# TraceMind Customer Acquisition Workplan - 2026-05-20

本文档用于 2026-05-20 直接执行种子客户运营工作。核心目标：先处理审批积压，再做少量新发现，不继续堆未发送候选。

## Goal

- 检查 2026-05-19 已发送的 G-J 四条 V2EX 回复是否有回应。
- 如果用户批准 `docs/social_reply_targets_2026-05-18.md` 中剩余行，只发送被批准的行。
- 检查 Appinn 已公开自荐帖是否出现评论、更多浏览或官网链接点击增长。
- 检查 V2EX 主帖、X Vibe Coding Community 和 Johnny thread 是否有新反馈。
- 新增最多 4-6 条高质量候选，其中至少 2 条来自 Build in Public / Vibe Coding 最近 24 小时内的产品作者帖；如果审批积压未处理，仍至少完成一轮这两个社区的候选发现但不发送。
- 验证“先拆真实用户路径，末尾给 TraceMind 链接并欢迎试用”的回复方式是否缩短转化周期。

## Retrospective Carry-Over

- Continue: V2EX 高上下文候选，尤其是明确问转化、留存、流量来源、功能使用的帖子；同时把 Build in Public 和 Vibe Coding 作为固定主动发现渠道，优先看最近 24 小时内发布自己产品、demo、beta、launch、求反馈的帖子。
- Stop: 在未处理审批积压前继续扩大量；不要把增长/浏览量直接当作试点意图。
- Test: 首句先复述对方产品的一个真实路径或卡点，再说明行为证据能回答的问题，末尾提供 TraceMind 链接和低压试用邀请。X 回复也使用这个结构，但文案更短、更像对产品帖的自然评论。

## Feedback To Check

- Appinn / 小众软件:
  - TraceMind topic: `https://meta.appinn.net/t/topic/85521`
  - Check replies, views, and homepage-link click count.
- V2EX:
  - Main TraceMind post: `https://www.v2ex.com/t/1213290`
  - Sent rows from `docs/social_reply_targets_2026-05-19.md`: G-J.
  - Approved rows from `docs/social_reply_targets_2026-05-18.md`, if any are sent.
- X:
  - Community post: `https://x.com/old_farmer_/status/2055896097890193663`
  - Johnny follow-up: `https://x.com/old_farmer_/status/2055939454217638329`
  - Search Build in Public and Vibe Coding for product-author posts from the last 24 hours, especially posts asking for users, feedback, beta testers, or launch validation.
  - Find and qualify additional X Communities before ordinary public search when time is limited.
- 即刻 / 小红书 / 少数派:
  - Check only if there is a valid logged-in/search-state path and time remains after approval backlog.

## High-Intent People To Follow Up

- Johnny Nel only if he or another X community member replies again.
- Any Appinn commenter asking setup, privacy, trial, or demo questions.
- V2EX rows G-J if their authors reply, especially GPT Image2, 秒译, and Markra.

## New Outreach Target Count

- 2 X candidates minimum from Build in Public / Vibe Coding recent product-author posts, even if replies are not sent yet.
- 4-6 candidates maximum across V2EX and X.
- Send 0 replies without explicit row approval.

## Channels And Search Keywords

- V2EX `分享创造`: `为什么没人付费`, `用户突破`, `订阅用户`, `求反馈`, `来验收`, `插件`, `AI`, `上线`.
- X Communities and public X search:
  - Treat X Community as a first-class channel, not just a place to repost the main X thread.
  - First inspect Build in Public and Vibe Coding posts from the last 24 hours.
  - Select product-author posts where TraceMind can naturally help with post-launch behavior evidence, conversion diagnosis, retention, feature usage, or validating whether a recent change worked.
  - Start with communities around: `Vibe Coding`, `Build in Public`, `Indie Hackers`, `AI Builders`, `AI Coding`, `Claude Code`, `Cursor`, `Codex`, `Trae`, `Lovable`, `Bolt`, `Replit`, `MVP builders`, `SaaS builders`.
  - For each candidate community, record: community name, URL, approximate member/activity level, rules/promotion sensitivity, example post fit, and whether TraceMind can comment naturally.
  - Prioritize communities where members post their own products, launch updates, demos, beta asks, or feedback requests.
  - Skip communities dominated by memes, token promotion, job posts, generic AI news, or threads where product promotion is off-topic.
  - Community latest product-author posts with app/site links and explicit post-launch questions.
  - Search: `"built with Codex" app`, `"built with Claude Code" launch`, `"built this with Cursor" feedback`, `"vibe coded" app launch`, `"AI built" product feedback`, `"looking for beta users" "AI app"`, `"just launched" "vibe coding"`.
  - Prioritize posts where the author owns the product and asks for users, feedback, beta testers, validation, or help understanding growth/conversion.
- 即刻: `vibe coding 做了`, `做了一个 产品`, `上线了 求反馈`, `Cursor 做了`, `Codex 做了`.
- 小红书: only through valid search-state/mobile access; `AI 做产品`, `零基础 做 app`, `产品上线`.
- Appinn: check only; no bump or duplicate submission.

## Blockers To Clear

- User approval is required before sending 2026-05-18 rows A-F.
- 小红书 web direct links remain unreliable; do not treat gated pages as deletion.
- Chrome local screenshot upload remains out of scope unless an original post is explicitly approved.

## Messaging Experiment

Use this structure:

```text
先说对方产品当前最该看的真实路径。
再指出该路径能回答的转化/留存/功能使用问题。
最后轻提 TraceMind：自动记录行为，让 AI 看用户卡在哪、改完有没有变好。末尾加只带 `utm_source` 的官网链接和“欢迎试用”。
```

Tracking-link rule for comments:

```text
https://tracemind.sandbox.galaxycloud.app/?utm_source=<platform>
```

Use `utm_source=v2ex` for V2EX comments and `utm_source=x` for X comments. Do not include `utm_medium`, `utm_campaign`, `utm_content`, author names, post titles, raw user text, or private context in comment URLs.

Suggested ending for V2EX high-fit replies:

```text
TraceMind: https://tracemind.sandbox.galaxycloud.app/?utm_source=v2ex
如果你愿意，欢迎试用，我也可以帮你先看一版早期用户行为诊断。
```

Suggested ending for X high-fit replies:

```text
I’m building TraceMind for this post-launch loop: auto-capture product behavior, ask AI where users got stuck, and verify whether changes helped.

Happy to have you try it: https://tracemind.sandbox.galaxycloud.app/?utm_source=x
```

Avoid:

- Generic "可以试试 TraceMind".
- Links in weak-fit replies, duplicate replies, or X Communities where the rules or local norms discourage product promotion.
- Commenting under broad opinions, funding announcements, or generic AI news where the author is not showing their own product.
- Replying under posts with only炫耀式增长 but no product/路径/问题上下文.

## Success Criteria

- Approval backlog is reduced: approved rows are sent and recorded, or rejected rows are marked `skipped_by_user` / `needs_rewrite`.
- At least 1 checked channel has a concrete reply/question/trial-intent signal, or explicitly records `no_response`.
- No public reply is sent without row-level approval.
- Every comment link uses only `utm_source` for source tracking.
- Appinn status is checked without bumping the thread.

## End-Of-Day Checklist

- [ ] Check replies to 2026-05-19 rows G-J.
- [ ] Process any newly approved rows from 2026-05-18 target file.
- [ ] Record sent reply URLs and status changes.
- [ ] Check Appinn topic.
- [ ] Check V2EX main post.
- [ ] Check X community and Johnny thread.
- [ ] Find 3-5 suitable X Communities and record whether each is usable for TraceMind outreach.
- [ ] Search Build in Public and Vibe Coding posts from the last 24 hours; draft at least 2 candidate replies for suitable product-author posts.
- [ ] Search other X Communities and public X only after the two primary communities are covered.
- [ ] Add at most 4-6 new candidates across V2EX and X.
- [ ] Update `docs/customer_acquisition_progress.md`.
- [ ] Update target statuses.
- [ ] Create the next workplan.
