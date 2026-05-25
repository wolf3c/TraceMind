# TraceMind Customer Acquisition Workplan - 2026-05-26

This plan follows the 2026-05-25 catch-up run. Core goal: resolve the usage-marker configuration blocker first, keep risky channels paused, and only do new outreach if there is direct inbound intent.

## Goal

- Verify or add the deployed `TRACEMIND_PRODUCT_USAGE_PROJECT_ID` and `TRACEMIND_PRODUCT_USAGE_PROJECT_KEY` settings.
- Re-run `customer_project_capture_active` after a capture or presence event is accepted.
- Monitor X/Appinn for direct replies only; do not add cold outreach volume while the marker and channel-risk blockers remain unresolved.
- Keep V2EX out of outreach until the user manually confirms account/moderation state.

## Retrospective Carry-Over

- Continue: Appinn low-frequency monitoring and X reply monitoring for author responses.
- Stop: V2EX backlog execution, V2EX cold replies, and X follow-ups based only on view count increases.
- Test: after product-usage marker is fixed, use TraceMind's own customer-health evidence to decide whether to send any further win-back follow-up.

## Feedback To Check

- Appinn / 小众软件:
  - TraceMind topic: `https://meta.appinn.net/t/topic/85521`
  - Check replies, views, and homepage-link count. Do not bump the topic.
- X:
  - X1 reply: `https://x.com/old_farmer_/status/2057653994621915201`
  - X2 reply: `https://x.com/old_farmer_/status/2057654350076662010`
  - Community post: `https://x.com/old_farmer_/status/2055896097890193663`
  - Johnny follow-up: `https://x.com/old_farmer_/status/2055939454217638329`
  - Row Q reply: `https://x.com/old_farmer_/status/2056928446413197561`
  - If X returns a page-load error again, record it as blocked and do not infer engagement.
- Gmail:
  - Check W1/W2 threads only for direct replies.

## Customer Usage Review

- Confirm `.codex/private/customer_usage_reviews/2026-05-26.md` is ignored before writing.
- Confirm MCP binding with `tracemind.project_info`.
- Query `customer_project_capture_active` for today, yesterday, and the last 7 days in Asia/Shanghai.
- If still 0, verify the deployed Galaxy/private settings before drawing customer-health conclusions.
- Keep customer emails and win-back details only in the private report.

## High-Intent People To Follow Up

- X1/X2: follow up only if the author replies or asks about setup/behavior diagnosis.
- W1/W2: follow up only if there is an inbound email reply and the user approves the row.
- Appinn: respond only to direct comments on the TraceMind topic.

## New Outreach Target Count

- 0 V2EX.
- 0 cold X replies unless the usage-marker blocker is resolved and a very high-fit post appears.
- 0 Appinn comments outside the existing TraceMind topic.

## Channels And Search Keywords

Use search only if the blockers above are resolved or the user explicitly asks for outreach.

- X English: `"built with Codex" feedback`, `"built with Claude Code" launch`, `"vibe coded" users`, `"AI coding agent" feedback`.
- X Chinese: `Codex 上线 产品`, `Claude Code 内测 工具`, `Cursor 插件 求反馈`, `AI 产品 留存`, `产品 用户路径 转化`.

## Blockers To Clear

- Product usage marker is empty and not authoritative until deployed settings are verified.
- X direct status pages may fail with "Something went wrong"; treat that as a channel execution blocker.
- V2EX account/moderation state is unresolved and V2EX must stay paused.

## Messaging Experiment

No new public copy test is planned. If a direct X reply appears, use:

```text
Thanks for checking it out. TraceMind is meant for the post-launch loop: auto-capture behavior, ask AI where users got stuck, and verify whether the next change helped. Happy to help you try the first setup.
```

## Success Criteria

- Product-usage env is verified or the exact deployment blocker is recorded.
- A new private customer usage report exists.
- No V2EX outreach is sent.
- No public reply/email is sent without row-level user approval.
- Progress doc records direct replies separately from passive views.

## End-Of-Day Checklist

- [ ] Verify deployed product-usage settings.
- [ ] Re-run the usage marker review.
- [ ] Check W1/W2 email replies.
- [ ] Check Appinn topic.
- [ ] Check X only if direct pages load.
- [ ] Update `docs/customer_acquisition_progress.md`.
- [ ] Update relevant target docs only if statuses change.
