# TraceMind Customer Acquisition Workplan - 2026-05-23

本文档用于 2026-05-23 直接执行种子客户运营工作。核心目标：先处理 V2EX 账号/版务风险和客户 usage marker 配置问题，再决定是否继续任何公开外联。

## Goal

- 不发送任何 V2EX backlog 行，直到用户手动确认账号状态和是否继续使用 V2EX。
- 复查 X1/X2 是否有回复或可见互动；两条 X 回复已在 2026-05-22 用户批准后发送。
- 复查 W1/W2 是否有回复；只有用户明确批准时才继续跟进。
- 验证 TraceMind 自身 `customer_project_capture_active` marker 配置是否恢复，避免继续用 0 事件做客户健康结论。

## Retrospective Carry-Over

- Continue: X posts where product authors explicitly discuss launch learning, feedback, distribution, retention, payment, or whether to continue.
- Stop: V2EX link-bearing cold replies and V2EX approval backlog execution until account/moderation risk is reviewed.
- Test: X replies that anchor on the author's exact post-launch question and keep the TraceMind link last.

## Feedback To Check

- V2EX:
  - Do not reply.
  - Manually inspect whether `wolf3c` can still access/post on V2EX before any future V2EX outreach.
  - Keep `docs/social_reply_targets_2026-05-20.md` row N and `docs/social_reply_targets_2026-05-18.md` rows A-F as held.
- Appinn / 小众软件:
  - TraceMind topic: `https://meta.appinn.net/t/topic/85521`
  - Check replies, views, and homepage-link count. Do not bump the topic.
- X:
  - Row X1 source: `https://x.com/r3yanshJuneja/status/2057522425869582684`
  - Row X1 reply: `https://x.com/old_farmer_/status/2057653994621915201`
  - Row X2 source: `https://x.com/JKeselak/status/2057419058375500093`
  - Row X2 reply: `https://x.com/old_farmer_/status/2057654350076662010`
  - Community post: `https://x.com/old_farmer_/status/2055896097890193663`
  - Johnny follow-up: `https://x.com/old_farmer_/status/2055939454217638329`
  - Row Q reply: `https://x.com/old_farmer_/status/2056928446413197561`

## Customer Usage Review

- Re-run `customer_project_capture_active` with `tracemind.summary` for today, yesterday, and last 7 days.
- If still 0, verify deployed `TRACEMIND_PRODUCT_USAGE_PROJECT_ID` and `TRACEMIND_PRODUCT_USAGE_PROJECT_KEY` before drawing customer-health conclusions.
- Keep customer emails and win-back drafts only in `.codex/private/customer_usage_reviews/YYYY-MM-DD.md`.

## High-Intent People To Follow Up

- X1 Reyansh Juneja / Feedzap: reply already sent after approval on 2026-05-22; monitor for author response before any follow-up.
- X2 Jan Keselak / vibe-coded experiment: reply already sent after approval on 2026-05-22; monitor for author response before any follow-up.
- W1/W2 private win-back: already sent after approval on 2026-05-22; only follow up if there is a reply and user approves the follow-up.

## New Outreach Target Count

- 0 V2EX.
- 0-2 new X replies, approval-gated.
- Add at most 2 new X candidates only after checking whether X1/X2 produced replies or visible engagement.

## Channels And Search Keywords

- X English:
  - `"vibe coded" feedback`
  - `"vibe coded" launch downloads`
  - `"built with Claude Code" feedback`
  - `"built with Codex" app feedback`
  - `"AI app" "first users"`
- X Chinese:
  - `Codex 上线 产品`
  - `vibe coding 产品 反馈`
  - `AI 产品 留存`
  - `AI 产品 没人付费`
  - `用 AI 做了一个 app 求反馈`

## Blockers To Clear

- V2EX account/moderation status is the top blocker.
- Product usage marker remains empty; deployed env/config must be checked before retention reporting is authoritative.
- Any new X replies and any W1/W2 follow-up require row-level approval.

## Messaging Experiment

For X, use:

```text
<specific product/launch signal>. I’m building TraceMind for this post-launch loop: auto-capture product behavior, ask AI where users got stuck, and verify whether changes helped. Happy to have you try it: https://tracemind.sandbox.galaxycloud.app/?utm_source=x
```

For V2EX, do not send until account status is reviewed. If V2EX resumes later, default to no-link replies unless the author directly asks how to use TraceMind.

## Success Criteria

- No V2EX reply is sent.
- X1/X2 replies are checked for author response or visible engagement.
- W1/W2 replies are checked once, with no follow-up sent without approval.
- Customer usage marker configuration is checked or explicitly recorded as still blocked.
- Tomorrow's progress doc separates channel-risk findings from customer-usage findings.

## End-Of-Day Checklist

- [ ] Check V2EX account/moderation status manually.
- [ ] Re-run customer usage marker review.
- [ ] Check Appinn topic views/replies/link count.
- [ ] Check X community, Johnny follow-up, and row Q.
- [ ] Check X1/X2 replies for author response or visible engagement.
- [ ] Check W1/W2 replies; do not follow up without approval.
- [ ] Update `docs/customer_acquisition_progress.md`.
- [ ] Update `docs/social_reply_targets_2026-05-22.md` statuses.
- [ ] Create the next workplan if another daily run is planned.
