# TraceMind Customer Acquisition Workplan - 2026-05-21

本文档用于 2026-05-21 直接执行种子客户运营工作。核心目标：先处理 2026-05-20 的高意图追问，不继续扩大冷启动候选。

## Goal

- 优先处理 `docs/social_reply_targets_2026-05-20.md` rows K-M：秒译、GPT Image2、Markra。
- 如果用户批准 K-M，只发送被批准的行，并记录回复 URL。
- 如果用户没有批准，先把 K-M 标记为 `awaiting_user_approval`，不要继续新增大量候选。
- 继续检查 Appinn、V2EX 主帖、X Vibe Coding Community 和 Johnny thread 的反馈。
- 只在高意图追问处理完后，新增最多 2-3 条高质量候选。

## Retrospective Carry-Over

- Continue: V2EX 高上下文产品帖，尤其是作者已经回复 TraceMind、询问使用方式、用户路径、行为埋点或转化诊断的帖子。
- Stop: 为了完成数量而从 X 搜索里硬挑弱相关帖；弱相关 X 回复会更像推广。
- Test: 对“怎么使用”和“是否需要埋点”类问题，用更清晰的接入边界回答：Web 可以从轻量自动采集开始；iOS/macOS/桌面 App 需要 SDK 或少量关键事件；目标是最小路径诊断，不是一开始搭完整 analytics。

## Feedback To Check

- V2EX:
  - 秒译: `https://www.v2ex.com/t/1213722#reply5`
  - GPT Image2: `https://www.v2ex.com/t/1213620#reply30`
  - Markra: `https://www.v2ex.com/t/1213587#reply16`
  - Main TraceMind post: `https://www.v2ex.com/t/1213290`
  - If rows K-M are approved and sent, recheck whether authors reply again.
- Appinn / 小众软件:
  - TraceMind topic: `https://meta.appinn.net/t/topic/85521`
  - Check replies, views, and homepage-link click count. Do not bump the topic.
- X:
  - Community post: `https://x.com/old_farmer_/status/2055896097890193663`
  - Johnny follow-up: `https://x.com/old_farmer_/status/2055939454217638329`
  - Use the parent thread if the direct status URL keeps loading blank.
- 2026-05-18 carry-over:
  - Rows A-F remain approval-gated. Send only if the user explicitly approves them.

## High-Intent People To Follow Up

- 秒译: answer setup precisely and offer a minimal pilot path.
- GPT Image2: explain TraceMind as behavior evidence for the "SEO traffic but no paid users" path.
- Markra: clarify that behavior capture is needed, but the first version can focus on a few key paths rather than a full analytics taxonomy.

## New Outreach Target Count

- 0 cold replies before K-M are processed.
- 2-3 new candidates maximum after high-intent follow-ups are handled.
- Prefer V2EX product posts with explicit conversion, retention, setup, or "why users do not pay/use" questions.

## Channels And Search Keywords

- V2EX `分享创造`: `怎么使用`, `为什么没人付费`, `用户路径`, `求反馈`, `来验收`, `vibe`, `AI`, `插件`, `上线`.
- X Communities/search only after V2EX follow-ups:
  - Build in Public and Vibe Coding recent posts from the last 24 hours.
  - Search: `"built with Claude Code" launch`, `"built with Cursor" feedback`, `"vibe coded" app launch`, `"AI-built app" feedback`, `"looking for beta users" "AI app"`.
  - Keep only product-author posts with demo/link/users and a natural post-launch behavior question.

## Blockers To Clear

- User approval is required before sending rows K-P from `docs/social_reply_targets_2026-05-20.md`.
- User approval is still required before sending 2026-05-18 rows A-F.
- X direct status pages may load blank; use parent thread context when necessary.
- Do not send native-SDK claims beyond the current product capability; for native apps, frame the answer as SDK/key-event setup plus minimal diagnosis.

## Messaging Experiment

Use this structure for usage/setup questions:

```text
先确认对方产品的平台和关键路径。
再说最小接入方式：Web 自动采集，或原生/桌面 SDK + 少量关键事件。
最后说明产出：AI 可读的行为证据，用来问用户卡在哪、改完有没有变好。
```

Use only source-level links:

```text
https://tracemind.sandbox.galaxycloud.app/?utm_source=v2ex
https://tracemind.sandbox.galaxycloud.app/?utm_source=x
```

Avoid:

- Saying native apps can be completely zero-setup.
- Replying to weak X search results just to meet volume.
- Adding more cold candidates while direct follow-ups are still waiting.

## Success Criteria

- K-M are either sent, rejected, or marked as still awaiting approval.
- No public reply is sent without row-level approval.
- Appinn, V2EX main post, and X parent community thread are checked once.
- Any approved comment link uses only `utm_source`.
- New candidates remain capped and higher quality than the current direct replies.

## End-Of-Day Checklist

- [ ] Process rows K-M if approved.
- [ ] Record sent reply URLs and status changes.
- [ ] Recheck 秒译, GPT Image2, and Markra after sending if applicable.
- [ ] Check Appinn topic views/replies/link clicks.
- [ ] Check V2EX main TraceMind post.
- [ ] Check X community and Johnny thread.
- [ ] Add at most 2-3 new candidates after follow-ups are processed.
- [ ] Update `docs/customer_acquisition_progress.md`.
- [ ] Update target statuses.
- [ ] Create the next workplan if another daily run is planned.
