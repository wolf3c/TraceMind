---
name: tracemind-daily-customer-acquisition
description: Use when the user asks to run TraceMind customer acquisition, seed-customer operations, social outreach, reply/comment outreach, post publishing, retrospective review, or daily/multi-run acquisition work. Supports focused run modes such as morning-review, outreach-block, post-publish, end-of-day-retro, and full-day. Reads TraceMind docs, uses logged-in Chrome sessions for 即刻, V2EX, X/Twitter, 小红书, 少数派, Appinn/小众软件, or similar platforms when needed, drafts candidate/reply tables for user approval before outbound replies, records progress, compares operating results, optimizes the workflow, and creates the next workplan.
---

# TraceMind Daily Customer Acquisition

Run TraceMind's daily seed-customer acquisition workflow from the repository docs. This skill is for operational execution plus a lightweight retrospective that improves the next run.

## Core Rule

When the user invokes this skill, first resolve the requested run mode. If the user names a mode, run only that slice. If the user says to run the daily workflow or gives no mode, use `full-day`.

Treat the chosen mode as authorization to read docs, check planned platforms, find candidates, draft replies, update local docs, and prepare the next workplan. The chosen mode is not authorization to send public replies, comments, private messages, emails, or new original posts.

Always pause for confirmation before:

- Sending any public reply or comment.
- Sending private messages or emails.
- Posting in a new community not already covered by the plan.
- Paying for promotion, submitting to a launch platform, or changing account settings.
- Publishing original posts on 小红书, 少数派, X/Twitter, Appinn/小众软件, or similar platforms unless the current user message already provides the exact target, exact copy, and an explicit instruction to publish.

## Approval Gate For Outbound Replies

Before sending any public reply or comment, prepare a review table or list and ask the user to approve specific rows. Do not send until the user explicitly approves.

Use this table shape when possible:

| ID | Platform | Source / Author | Post Summary | Fit | Proposed Reply | Risk / Notes |
| --- | --- | --- | --- | --- | --- | --- |

Guidelines:

- Summarize the other person's post in one or two sentences before proposing a reply.
- Make the proposed reply specific to that post and keep it editable.
- Include weak relevance, platform-rule, tone, or promotion-risk notes.
- Prefer asking the user to approve row IDs, for example `Approve A and C`.
- After approval, reply only to the approved rows, one by one. Do not substitute new targets or materially different copy without asking again.
- If the user rejects or edits a draft, record the decision as `skipped_by_user`, `needs_rewrite`, or `approved_with_edits` in the local target/progress docs when useful.

## Source Documents

Read these first, if present:

- `docs/customer_acquisition_progress.md`
- Latest `docs/customer_acquisition_workplan_YYYY-MM-DD.md`
- `docs/social_reply_targets_YYYY-MM-DD.md`
- `docs/customer_messaging.md`
- `docs/vibe_coding_seed_customer_pipeline_YYYY-MM-DD.md`
- `docs/social_promotion_posts_YYYY-MM-DD.md`

Use the latest dated files when multiple exist. If no current workplan exists, create one before doing outbound work.

## Operating Learnings

- X communities can produce more attention than ordinary profile posts when the community is tightly matched to TraceMind's ICP. When a relevant X community is already covered by the plan, prioritize community-native posts and replies before standalone profile posts, while still following community rules and avoiding duplicate shilling. Record community engagement separately from main-profile X posts.
- Build in Public and Vibe Coding are primary recurring X community channels. In each outreach block, inspect posts from the most recent 24 hours in both communities first, then select product-author posts that naturally match TraceMind before searching broader X. Draft replies that recommend TraceMind only for suitable product posts, and still require row-level user approval before sending.
- In X/community copy, lead with `Codex`, `Claude Code`, `Cursor`, and `Trae` because they have stronger recognition and larger user bases among AI coding builders. Treat `Lovable`, `Base44`, `Bolt`, and `Replit` as optional secondary examples for no-code or weak-technical vibe coding segments. Do not make Lovable/Base44/Bolt/Replit the main examples unless the day's ICP experiment explicitly targets those builders.
- Appinn/小众软件 is a low-frequency Chinese tool self-recommendation channel, not a daily comment-spam channel. Use it for polished `开发者自荐` posts when TraceMind has a clear homepage, screenshots, trial ask, and concise setup explanation. Avoid repeated bumps or unrelated comments.

## Run Modes

Use one of these modes so the skill can run multiple times per day without repeating the entire workflow.

### `morning-review`

Use for the first check of the day.

- Read yesterday's latest workplan and progress.
- Check replies, likes, follows, comments, and visible engagement on already-posted content.
- Classify signals as `high`, `medium`, `low`, `not_fit`, or `no_response`.
- Draft replies only for `high` or clearly promising `medium` interactions, then present them for approval.
- Update `docs/customer_acquisition_progress.md` and target statuses.
- Do not create a new tomorrow plan unless the user asks.

### `outreach-block`

Use for a focused 30-90 minute block of finding posts and drafting TraceMind reply recommendations.

- Read the latest workplan, target list, and messaging doc.
- Search only the channels or keywords requested by the user; if none are specified, use the workplan priorities.
- Prepare candidate summaries and proposed replies only for high-relevance public posts that satisfy the reply rules.
- Present the candidate table and wait for user approval before sending any replies.
- Record every drafted, contacted, or skipped candidate with status and reason.
- End with a short note on which channel looked most promising.
- Do not run a full retrospective or write tomorrow's plan.

### `post-publish`

Use when the user asks to publish a specific public post or community post.

- Draft or reuse the approved post copy.
- Prefer X communities over main-profile posts when the community is relevant and already covered by the plan.
- Post directly only when the current user message gives the exact target, exact copy, and explicit publish instruction. Otherwise, present the draft and wait for approval.
- After publishing, record URL, channel, copy version, visible engagement if available, and any blockers.
- Do not search for new candidates unless the user asks.

### `end-of-day-retro`

Use near the end of the day.

- Read today's progress and target docs.
- Compare planned work against actual output and visible engagement.
- Identify what worked, what did not, best channel, best wording, best ICP signal, and weakest assumption.
- Update `docs/customer_acquisition_progress.md`, `docs/social_reply_targets_YYYY-MM-DD.md`, and `docs/customer_messaging.md` only if wording changed.
- Create or update tomorrow's workplan.
- Do not send new outreach unless the user explicitly asks.

### `full-day`

Use when the user asks for the complete daily run or gives no mode.

- Run the full workflow below: review plan, check feedback, draft high-intent follow-ups, do one candidate outreach block, present proposed replies for approval, handle approved outbound work if the user approves, update progress, run retrospective, and create tomorrow's workplan.

## Daily Workflow

Use this full sequence only for `full-day`. For other modes, run the relevant subset from `Run Modes`.

### 1. Establish Today And Yesterday

Use the environment date. Resolve:

- `today` in `YYYY-MM-DD`
- `yesterday`
- `tomorrow`

Find yesterday's or latest available workplan. If it is stale, still use it as the baseline and say so in the progress note.

### 2. Review Planned Work

Extract:

- Platforms to check.
- Existing posts and comment URLs.
- Candidate leads or reply targets.
- Promised next actions.
- Any blocked items, such as Chrome file-upload permission or login requirements.

Keep the execution scope tight to the documented plan unless the user explicitly expands it.

### 3. Check Feedback

Use Chrome for logged-in platform checks when needed.

For each platform in the plan:

- Open the relevant post, comment, notification, or profile page.
- Check for replies, likes, DMs only when the user requested private-channel handling, follows, or visible engagement.
- Classify each signal as `high`, `medium`, `low`, `not_fit`, or `no_response`.

Do not inspect cookies, local storage, passwords, or unrelated private browser data.

### 4. Draft Replies To High-Intent Interactions

Prioritize people who:

- Have a product already launched.
- Are actively asking for feedback or users.
- Do not know where users get stuck.
- Built with Codex, Claude Code, Cursor, Trae, or similar AI coding agents; include Lovable, Base44, Bolt, and Replit when targeting no-code or weak-technical builders.
- Are non-technical or weak-technical creators who shipped with vibe coding.

Use short, specific draft replies. Anchor each draft in the other person's product before mentioning TraceMind.

Preferred value angle:

```text
TraceMind 自动采集用户行为，不用先搭复杂 analytics。你可以直接问 AI 用户卡在哪、哪个功能真的被用、改完有没有变好。
```

Offer a low-friction next step:

```text
如果你愿意，我可以帮你先看一版早期用户行为诊断。
```

Avoid:

- Generic "try our product" comments.
- Posting the same wording repeatedly.
- Dropping links in every reply.
- Commenting under unrelated discussions.

Do not send these replies yet. Add them to the approval table with the post summary, fit, proposed reply, and risk notes.

### 5. Do Second-Batch Candidate Discovery

If the plan calls for new outreach, search the planned channels and prepare candidate reply drafts.

Default search prompts:

- 即刻: `vibe coding 做了`, `做了一个 产品`, `欢迎反馈`, `Codex 做了`, `Claude Code 做了`, `Cursor 做了一个`, `Trae 做了`, `Lovable 做了`, `上线了 求反馈`
- V2EX: `https://www.v2ex.com/go/create`, `https://www.v2ex.com/go/ideas`
- X: `"built with Codex" app`, `"built with Claude Code" app`, `"built this with Cursor" feedback`, `"built with Trae" app`, `"AI coding agent" launch`, `"vibe coded" app launch`; add `"built with Lovable" feedback` and `"made with Lovable" app` only for no-code-focused searches.
- 小红书: `vibe coding`, `AI 做产品`, `用 AI 做了一个 app`, `Codex 做产品`, `Claude Code 做产品`, `Cursor 做产品`, `Trae 做产品`, `Lovable 做网站`, `零基础 做 app`
- 少数派: `AI 工具`, `独立开发`, `效率工具`, `我做了一个`, `产品上线`, `插件`
- Appinn/小众软件: `meta.appinn.net` 投稿/发现频道；只在准备 `开发者自荐` 或重要版本更新时使用，不做每日搜索式触达。

Channel intent:

- 即刻: primary Chinese A0 source; prioritize vibe coding builders and AI product experiments.
- V2EX: product/tool launch source; prioritize people asking for feedback or validation.
- X: prioritize Build in Public and Vibe Coding posts from the last 24 hours first, then other relevant X communities, then public X search. Primarily target Codex, Claude Code, Cursor, and Trae builders with short comments matched to the specific product post. Add Lovable, Bolt, Replit, and Base44 only when the post/community is explicitly no-code or weak-technical.
- 小红书: discovery-heavy A0 source; prioritize non-technical or weak-technical creators showing AI-built products, workflows, or launch screenshots. Default to candidate collection and reply drafts; ask before publishing original posts.
- 少数派: tool and productivity audience; prioritize polished tools, plugins, workflows, and app authors. Use more substantive, less salesy comments; ask before submitting articles or original posts.
- Appinn/小众软件: low-frequency tool discovery audience; publish as `开发者自荐` only after user confirmation. Use practical wording: what problem it solves, who it is for, setup effort, current trial status, homepage, and feedback requested.

Only include a candidate when at least two are true:

- The post promotes the author's own product.
- The author asks for feedback, users, or validation.
- The product has a demo, screenshots, link, or real users.
- TraceMind naturally helps answer their stated problem.
- The reply can be personalized to their product.

Record every candidate, even skipped ones, with a short reason. Do not send replies in this step.

### 6. Present Reply Approval Table

Before any outbound comment, present the candidate table to the user and wait.

Include:

- Each post's approximate content.
- Why the post fits or does not fit.
- The exact proposed reply.
- Any concern that the reply may feel promotional, too generic, or against channel norms.

If the user approves rows, send only those rows and then record the result. If the user does not approve yet, stop after the table and do not continue into sending or final retrospective that assumes replies were sent.

### 7. Handle Screenshot Follow-Up

If the plan includes adding screenshots:

- Use existing assets under `docs/assets/social/` when available.
- If Chrome upload fails due file permissions, do not work around it. Record the blocker and tell the user to enable Chrome extension file URL access.
- Never upload screenshots containing accounts, emails, tokens, or private dashboard data.

### 8. Update Progress

Append a dated section to `docs/customer_acquisition_progress.md`.

Use this structure:

```markdown
### YYYY-MM-DD Daily Run

- Workplan used:
- Channels checked:
- Public replies sent:
- Public replies proposed / awaiting approval:
- Private messages sent:
- New candidates found:
- High-intent leads:
- Blockers:
- Retrospective:
- Next actions:
```

For each interaction:

```text
- Platform:
- Source URL:
- Person / Handle:
- Signal:
- Intent:
- Action taken:
- Follow-up:
```

Use statuses such as `drafted_for_approval`, `awaiting_user_approval`, `approved_to_reply`, `commented`, `replied`, `blocked`, `skipped`, `skipped_by_user`, and `needs_rewrite`.

### 9. Run Daily Retrospective

Compare today's work with yesterday's plan and prior results. The goal is to improve the operating system, not just list activity.

Assess:

- Which channels produced signals: reply, like, follow, DM, click proxy, or no response.
- Which ICP type responded best: non-technical builder, weak-technical builder, technical indie hacker, tool maker, SaaS founder, plugin author.
- Which value angle worked best:
  - `AI 自动埋点`
  - `不用搭 analytics 看板`
  - `直接问 AI 用户卡在哪`
  - `改完验证有没有变好`
  - `帮你做一版早期用户行为诊断`
- Which reply style worked best: short comment, longer contextual comment, no-link comment, link-included comment, screenshot follow-up.
- Where execution was blocked: login, file upload permission, platform rules, weak relevance, unclear lead quality, low channel activity.
- Whether the work matched the A0 ICP: non-technical or weak-technical vibe coding product creators.

Write a `Retrospective` subsection in the day's progress entry:

```markdown
#### Retrospective

- What worked:
- What did not work:
- Best channel today:
- Best customer signal:
- Best wording:
- Weakest assumption:
- Workflow change for tomorrow:
- Messaging change for tomorrow:
- Candidate selection change for tomorrow:
```

Use the retrospective to make concrete changes. Examples:

- If comments with no link get better replies, keep links out of first-touch comments.
- If V2EX replies are too technical and low-converting, shift tomorrow's first hour to 即刻.
- If 小红书 shows more non-technical AI builders than developer forums, allocate tomorrow's search time there and keep comments casual and specific.
- If 少数派 candidates are higher quality but lower volume, use it for weekly deeper outreach rather than daily volume.
- If Appinn/小众软件 brings higher-trust but lower-volume feedback, keep it as a milestone/update channel rather than a daily outreach target.
- If "AI 自动埋点" is unclear, lead with "不用搭 analytics，看用户卡在哪".
- If a lead asks about setup effort, update `docs/customer_messaging.md` with a shorter setup answer.
- If screenshot upload is still blocked, keep it as a blocker instead of spending more time on it.

### 10. Update Operating Docs

Based on the retrospective, update the relevant docs:

- `docs/customer_messaging.md`: only when wording actually needs to change.
- `docs/customer_acquisition_progress.md`: always update with the daily run and retrospective.
- `docs/social_reply_targets_YYYY-MM-DD.md`: update target statuses and add newly found candidates.
- `docs/customer_acquisition_workplan_YYYY-MM-DD.md`: make tomorrow's plan reflect the retrospective.

Keep changes evidence-based. Do not rewrite the strategy just because one post had no response.

### 11. Update Candidate Documents

Update the relevant target/pipeline docs:

- Set targets to `drafted_for_approval`, `awaiting_user_approval`, `approved_to_reply`, `commented`, `replied`, `dm_drafted`, `blocked`, `skipped`, `skipped_by_user`, or `needs_rewrite`.
- Add new candidate URLs and reply drafts.
- Keep comments and drafts concise.

### 12. Create Tomorrow's Workplan

Create `docs/customer_acquisition_workplan_YYYY-MM-DD.md` for tomorrow.

Include:

- Goal for the day.
- Retrospective carry-over: what to continue, stop, and test.
- Feedback to check.
- High-intent people to follow up.
- New outreach target count.
- Channels and search keywords.
- Specific blockers to clear.
- Messaging experiment for tomorrow.
- Success criteria.
- End-of-day checklist.

Tomorrow's plan should be executable without reading the entire chat history.

## Final Response

Keep the final response short and operational:

- Mode used.
- What was checked.
- What was sent.
- What was proposed and still needs approval.
- What was updated.
- Any blockers.
- Tomorrow's plan file path.

If outbound work was blocked by login, permissions, rate limits, or unclear relevance, say exactly what blocked it.
