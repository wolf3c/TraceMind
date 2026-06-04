---
name: tracemind-social-progress-posting
description: Use when the user asks to publish TraceMind product progress updates, build-in-public updates, social media product posts, launch/update announcements, or cross-platform original posts based on recent git commits. Tracks last publish time and cutoff commit, analyzes changes since the last cutoff or the past 3 days, drafts concise customer-value posts for approval, publishes only after confirmation, and updates the skill state after posting.
---

# TraceMind Social Progress Posting

Use this skill for original TraceMind product-progress posts on social platforms. It is not for reply/comment outreach; use `$tracemind-daily-customer-acquisition` for candidate discovery, replies, customer win-back, or daily acquisition operations.

## Core Rules

- The skill invocation authorizes research, drafting, local doc/status updates, and preparing posts. It does not authorize publishing.
- Always pause for user approval before posting. Approval must cover the exact platform list and exact copy.
- Focus on customer value: what builders can now do, understand, verify, or ship faster. Avoid internal implementation detail unless it explains user value.
- Do not publish secrets, tokens, private customer data, internal emails, private reports, raw logs, raw prompts, source diffs, or unreleased claims that are not supported by the git/doc evidence.
- Base the update window on committed git history. Mention uncommitted changes only if the user explicitly asks; do not use them as publish evidence by default.
- Advance the stored cutoff only after at least one approved original post is successfully published.

## Publish State

Update this section after successful publishing so the next run has a reliable cutoff.

- Last published at: `2026-06-04 11:07:01 +0800`
- Last cutoff commit: `0b2580c77dc9fe03ba86b03d6425feda9fd3a0c3`
- Last platforms: `X/Twitter, 即刻`
- Last source window: `7f89c2cbd68702fadf903442551990a6edf184a8..0b2580c77dc9fe03ba86b03d6425feda9fd3a0c3`
- Last notes: `Google/GitHub sign-in posts published to X/Twitter at https://x.com/old_farmer_/status/2062368422445596939 and 即刻 at https://web.okjike.com/u/a8a81b7f-ecc0-4ec5-a90f-2710f55daeea/post/6a20eb89c2dc8bf83fdc0a2c; source window intentionally ends at 0b2580c77dc9fe03ba86b03d6425feda9fd3a0c3, leaving newer commits after that cutoff for future review.`

## Source Inputs

Read only what is needed:

- Git history: `git rev-parse HEAD`, `git log`, `git diff --stat`, `git show --stat`, and focused file reads for relevant commits.
- Product messaging: `README.md`, `.codex/private/customer_acquisition/messaging/customer_messaging.md`, latest `.codex/private/customer_acquisition/posts/social_promotion_posts_YYYY-MM-DD.md`, latest `.codex/private/customer_acquisition/progress/customer_acquisition_progress.md`, and latest `.codex/private/customer_acquisition/workplans/customer_acquisition_workplan_YYYY-MM-DD.md` if present.
- Release or product docs touched by the update window.
- Existing social post docs if present, to avoid repeated wording.

Do not read `.codex/private/customer_usage_reviews/` customer reports for public post copy unless the user explicitly asks for a private operational review. Never copy private operational details into public drafts.

## Workflow

### 1. Resolve The Update Window

1. Read `Publish State`.
2. If `Last cutoff commit` is a real commit in the repo, use `Last cutoff commit..HEAD`.
3. If there is no valid cutoff, use commits from the past 3 days.
4. Record `HEAD` as the candidate cutoff for this run, but do not write it back yet.
5. If there are no new committed changes, say so and draft nothing unless the user asks for a broader window.

Useful commands:

```bash
git rev-parse HEAD
git log --reverse --date=iso --pretty=format:'%h %ad %s' <range>
git diff --stat <range>
git show --stat --oneline <commit>
```

For the fallback window:

```bash
git log --reverse --since='3 days ago' --date=iso --pretty=format:'%h %ad %s'
```

### 2. Extract Product-Visible Updates

Group commits into product themes:

- User-facing feature or workflow improvement.
- SDK, MCP, capture, setup, dashboard, or analysis capability that helps customers get value.
- Reliability, performance, deployment, or onboarding improvement that reduces customer friction.
- Documentation or messaging update that changes what users can understand or do.
- Internal-only cleanup, tests, refactors, private ops, or release plumbing.

Prefer updates that clearly improve one of TraceMind's core promises:

- Auto-capture product behavior without heavy analytics setup.
- Turn product behavior into AI-readable evidence.
- Let builders ask AI where users get stuck or what is actually used.
- Verify whether AI-coded changes improved user behavior.
- Help non-technical or weak-technical builders close the loop after shipping with Codex, Claude Code, Cursor, Trae, or similar tools.

Skip or down-rank updates that are mostly internal, not shipped, hard to explain, risky to overclaim, or likely to attract the wrong audience.

### 3. Build A Short Update Brief

Before drafting posts, prepare a compact brief:

```markdown
## Product Update Brief

- Source window:
- Candidate cutoff commit:
- Most customer-visible changes:
- Skipped internal changes:
- Recommended value angle:
- Evidence / changed files:
- Risks or claims to avoid:
```

If the update set is weak, recommend not posting or propose a low-key build-in-public note rather than forcing a promotional post.

### 4. Draft Platform-Specific Posts

Default platforms are the social channels already used in acquisition docs: X/Twitter, 即刻, 小红书, 少数派, and Appinn/小众软件. Use only the platforms requested by the user or already covered by the current plan.

Drafts should be concise, concrete, and easy to approve:

- One clear hook.
- One product change or tight cluster of related changes.
- One customer value.
- One optional link or call to action.
- No long changelog dumps.

Tone guidance:

- X/Twitter: short build-in-public style; one strong angle; English, Chinese, or bilingual based on the intended audience.
- 即刻: conversational Chinese; emphasize the builder pain and what TraceMind now helps answer.
- 小红书: beginner-friendly Chinese; avoid developer jargon; focus on "不用搭复杂 analytics，也能看懂用户卡在哪".
- V2EX: do not draft, publish, or retry TraceMind promotional posts because this conflicts with the community's rules and norms.
- 少数派: polished tool/productivity framing; explain workflow value and setup effort.
- Appinn/小众软件: use only for meaningful milestone updates; concise `开发者自荐` style with problem, audience, setup, and feedback ask.

For X/Twitter product intro posts, especially inside Communities, default to a three-part thread:

1. Main post: short, warm intro with no product link, ending with `Link in comments 👇`.
2. First reply: product name plus the landing-page link with the matching UTM source.
3. Second reply: a concise capability/advantage list.

Preferred X Community intro template:

```text
Hi everyone, I’m building TraceMind — an AI-native analytics tool for vibe-coded products.

AI coding helps us ship faster, but after launch I still want my coding agent to understand: where users got stuck, what was actually used, and whether the latest change helped.

Link in comments 👇
```

For Chinese X Community product intro posts, keep the same thread shape but make the main post itself value-forward. It should do more than name TraceMind: briefly state what TraceMind lets AI-coding builders accomplish, such as turning real user behavior into coding-agent-readable context, finding where users get stuck, seeing which features are actually used, identifying errors that affect key paths, and judging whether a change improved the flow. Do not leave all product value for replies.

Preferred first reply:

```text
TraceMind:
https://tracemind.sandbox.galaxycloud.app/?utm_source=<source>
```

Preferred second reply:

```text
What TraceMind helps with:

- Auto-capture user behavior
- Turn behavior into AI-readable evidence
- Ask your coding agent where users got stuck
- Check which features were actually used
- Verify whether a product change improved the flow
```

Default Chinese pattern:

```text
最近给 TraceMind 加了/改了 <具体能力>。

它现在可以帮 AI coding 产品作者 <客户价值>。

如果你用 Codex / Claude Code / Cursor / Trae 做产品，可以直接让 AI 基于真实用户行为判断：用户卡在哪、功能有没有被用、改完有没有变好。
```

Default English pattern:

```text
New in TraceMind: <specific capability>.

It helps AI-coded products turn real user behavior into evidence your coding agent can read, so you can ask where users get stuck and verify whether a change actually helped.
```

### 5. Approval Gate

Present drafts in a review table and stop.

| ID | Platform | Audience | Draft | Link / Asset | Risk / Notes |
| --- | --- | --- | --- | --- | --- |

Ask the user to approve specific row IDs or provide edits. Do not publish until approval is explicit. If the user edits copy, publish the edited copy only.

### 6. Publish

Use Chrome logged-in sessions for platforms that require browser authentication. Do not inspect unrelated private browser data, cookies, passwords, or local storage.

For 小红书 original posts, first open the creator publish page and confirm the current browser context is logged in. If it shows a login dialog, `登录后查看搜索结果`, no account/profile entry, or otherwise lacks a usable publish form, pause and ask the user to scan/login, then retry the same publish page after the user confirms. Do not abandon 小红书 solely because the current browser context is logged out.

Publish one approved row at a time:

1. Open the target platform or community.
2. Paste the approved copy exactly, except for platform-required formatting.
3. Attach only approved images/assets.
4. Submit only after the approved copy is visible.
5. Capture the post URL, visible timestamp, and any blocker.

If a platform blocks posting because of login, rate limits, community rules, upload permissions, or unclear target location, record the blocker and continue only with other approved platforms.

Do not publish TraceMind promotional posts on V2EX, even if explicitly present in an older plan or backlog. Record it as `skipped_platform_rules`.

### 7. Record Results

After publishing, report:

- Posted platforms and URLs.
- Platforms blocked or skipped.
- Exact cutoff commit used.
- Source window.
- Any follow-up needed.

If useful, append a PII-free entry to the latest social/acquisition progress doc. Do not create broad docs unless the user asks.

### 8. Update This Skill's Publish State

After at least one approved post is successfully published, edit only the `Publish State` section in this file:

- `Last published at`: current local timestamp with timezone.
- `Last cutoff commit`: the candidate cutoff commit used for the run.
- `Last platforms`: comma-separated successful platforms.
- `Last source window`: git range or fallback date window.
- `Last notes`: short summary plus blocked platforms if any.

Do not advance the cutoff if all publishing failed or the user only approved drafts but did not approve publishing.

## Final Response

Keep the final response operational:

- Source window and cutoff commit.
- Customer-value updates selected.
- Platforms posted with URLs.
- Blockers or skipped platforms.
- Whether `Publish State` was updated.
- Suggested git commit message.
