# Design System: TraceMind
**Project ID:** local-tracemind
**Source Inspiration:** PostHog DESIGN.md from VoltAgent/awesome-design-md
**Adaptation Rule:** Use PostHog's developer-friendly analytics density and warm paper surfaces, but keep TraceMind's own deep green, teal, amber, and AI-agent instrumentation identity.

## 1. Visual Theme & Atmosphere
TraceMind should feel like a focused AI behavior intelligence console: calm, precise, data-rich, and operational. The product turns invisible user behavior into readable signals, so the UI should foreground capture streams, semantic event conversion, and MCP access points.

The closest fit from `awesome-design-md` is PostHog because it is also a developer-facing product analytics tool with a warm, approachable, content-rich design language. TraceMind should borrow that "serious analytics without enterprise coldness" posture, while avoiding overly playful mascot-led branding and avoiding a generic dark developer-tool clone.

The mood is warm technical clarity: paper-like reading surfaces, dark instrument panels for live behavior, compact controls, and visually obvious copy/setup states.

## 2. Color Palette & Roles
- Deep Instrument Green (#0F2F2A): Primary navigation, hero overlay, high-authority buttons, and main console emphasis.
- Night Console (#071B18): Dark live-data surfaces, event streams, and agent-query previews.
- Signal Teal (#18A77A): Success states, active signal lines, copied states, current workflow markers, and positive semantic conversion.
- Capture Amber (#F2B84B): Raw behavior markers, setup prompts, warnings that need attention without implying failure, and secondary chips.
- Alert Clay (#B95C3B): Risk-bearing actions such as blocking a source, deleting a token, or invalidating credentials.
- Warm Canvas (#F4F0E8): Page background and broad section canvas.
- Porcelain Console (#FFFDF8): Cards, forms, setup snippets, and other high-readability surfaces.
- Mist Grid (#E6EEE9): Subtle layout scaffolding, table dividers, and secondary panel backgrounds.
- Sage Border (#BACBC4): Form controls, card borders, and low-contrast separators.
- Graphite Text (#17231F): Primary text for product copy and console data.
- Muted Operator Text (#63756D): Secondary labels, help text, captions, empty states, and timestamps.

## 3. Typography Rules
Use the existing system sans stack: Inter, PingFang SC, Microsoft YaHei, and platform UI fonts. The interface is bilingual, so typography should prioritize robust Chinese/English rendering over imported brand fonts.

Headings should be firm and compact with strong weight, but not oversized except in the first hero. Console headings should feel like product surfaces, not marketing banners. Labels can use small uppercase text with normal letter spacing. Metric numbers should be larger than labels but contained inside stable cards. Code, endpoint, token, and MCP values use a system monospace stack.

Avoid negative letter spacing. Preserve readable line height for Chinese copy and long setup instructions.

## 4. Component Stylings
* **Buttons:** Compact rectangular controls with 6px corners. Primary buttons use Deep Instrument Green with Porcelain Console text and a restrained shadow. Secondary and ghost buttons use transparent or porcelain backgrounds with Sage Border. Copied states should visibly switch to Signal Teal.
* **Cards/Containers:** Use 8px corners, crisp borders, and soft shadows. Cards are work surfaces, not decoration. Avoid cards inside cards; use rows, dividers, and grouped bands when nesting information.
* **Inputs/Forms:** Use Porcelain Console backgrounds, Sage Border strokes, and Signal Teal focus rings. Read-only token fields should feel copyable and technical. Long MCP/setup prompts should wrap or scroll without resizing surrounding layout.
* **Badges:** Use pill-shaped badges for status and category labels. Signal Teal means live/ready/success. Capture Amber means setup/raw behavior/attention. Muted badges identify neutral product areas.
* **Data Panels:** Live behavior previews can use Night Console backgrounds, thin translucent borders, monospace event names, and compact row rhythm.
* **Code Blocks:** Code snippets use warm tinted backgrounds and should stay horizontally scrollable when needed. Do not let code overflow the page on mobile.

## 5. Layout Principles
The first viewport should immediately show the product: one-line capture, raw behavior stream, semantic conversion, and AI-agent query path. Use an asymmetric hero with concise copy on the left and a dense product-console preview on the right.

Below the hero, workflow steps should be scannable and compact. Console sections should be dense but breathable, optimized for repeated setup and operator use rather than a landing-page showcase. Favor direct labels, stable grids, and visible state changes over explanatory filler.

Use an 8px spacing base. Related controls can sit within 8-12px gaps; major page sections use 64-80px vertical rhythm on desktop and tighter spacing on mobile.

## 6. Product Narrative & Mechanism Expression
TraceMind's product story must preserve the core product definition before introducing compounding advantages. The primary value is: Auto Capture turns real user behavior into AI-readable product evidence, and MCP lets Coding Agents analyze that evidence to discover issues, understand causes, and drive product iteration. Feedback loops are an enhancement mechanism layered on top of that core promise, not a replacement for explaining what the product does.

For product-introduction pages, keep the first viewport focused on the core path:

1. One-sentence Agent setup: users should be able to say something like "帮我把 TraceMind 接入当前项目，并验证用户行为是否采集成功" instead of manually finding entry files, copying scripts, and guessing verification steps.
2. Auto Capture: show that TraceMind records page visits, clicks, inputs, submits, routes, MCP/tool calls, and business events without requiring a full analytics plan first.
3. AI-readable evidence: show raw behavior becoming semantic events, paths, sources, devices, user segments, time windows, and reproducible evidence.
4. MCP + Agent analysis: show Codex, Claude Code, Cursor, or another Coding Agent querying evidence to automatically discover problems, analyze context, and propose the next action.

The analysis value should be expressed as automation and efficiency, not as another dashboard. Preferred framing:

- "让 AI 自动完成高效产品迭代"
- "AI 自动发现、分析并给出下一步"
- "自动沉淀用户路径和使用偏好"
- "减少人工看报表、拼数据、猜原因的成本"

Avoid copy that talks about "客户" in the third person on customer-facing pages. Speak directly to the reader with "你" and "你的产品". Avoid casual, overly colloquial phrasing; the tone should be clear, product-grade, and action-oriented. Chinese headings should not end with `。` or `.`. If the page is Chinese, avoid stray English headings except for product terms such as TraceMind, Auto Capture, MCP, SDK, Agent, and Coding Agent.

Feedback-loop content should be visual, not just a text chain with arrows. Use two numbered circular loops when space allows:

- Your product growth loop: `1 真实用户行为` -> `2 TraceMind 自动整理证据` -> `3 Agent 自动分析并建议` -> `4 产品优化后体验提升`, with `AI 驱动` as the center.
- TraceMind intelligent evolution loop: `1 你的问题反馈` -> `2 MCP 带证据反馈` -> `3 优化 TraceMind 分析 / SDK / guidance` -> `4 下一次分析更快更准`, with `AI 优化` as the center.

On desktop, the two loops can sit side by side. On medium and mobile widths, keep them recognizable as circular loops by scaling the diagram, node sizes, and labels; do not collapse them into plain stacked lists unless the viewport is too narrow to preserve legibility.

## 7. Depth & Elevation
TraceMind should rely primarily on borders, surface color shifts, and local shadows.

- Level 0: Warm Canvas background for broad page sections.
- Level 1: Porcelain Console cards with Sage Border for normal setup and account surfaces.
- Level 2: Soft shadow cards for important panels such as hero data preview and active console modules.
- Level 3: Dark instrument panels for live signal streams and agent-query previews.

Avoid heavy floating-card decoration. Elevation should clarify information hierarchy, not make the page feel ornamental.

## 8. Do's and Don'ts
Do:
- Keep TraceMind visibly developer-facing and analytics-native.
- Make copy, setup, and token actions visibly stateful.
- Use warm surfaces for readability and dark panels for live signal emphasis.
- Keep public concepts such as `projectKey` prominent and internal credentials out of primary UI.
- Prefer dense operator panels over broad marketing cards.
- Preserve first-screen clarity about Auto Capture, AI-readable evidence, and MCP Agent analysis before introducing feedback-loop mechanisms.
- Show loops, evidence paths, and Agent reasoning as diagrams or console flows when explaining mechanisms to non-expert readers.

Don't:
- Copy another brand's accent palette, mascot style, or novelty illustrations directly.
- Turn the whole product into a dark terminal interface.
- Use purple/blue gradient SaaS decoration as the main identity.
- Add nested cards where rows or dividers would be clearer.
- Hide important success, error, copied, blocked, or loading states in subtle text only.
- Let a differentiator such as feedback loops push the core product function below the fold.
- Describe customer-facing value with third-person "客户..." phrasing when speaking directly to the reader would be clearer.

## 9. Responsive Behavior
Desktop layouts can use two-column hero and console grids with dense side panels. Tablet layouts should collapse secondary panels below the primary workflow. Mobile layouts should use a single column, full-width form controls, stable 44px minimum touch targets, and horizontally scrollable code/token fields.

Metrics should collapse from three columns to one or two columns before labels truncate. Buttons should wrap cleanly; text inside controls must not overflow.

Mechanism diagrams should preserve their meaning across breakpoints. Large desktop screens can show full circular loops with surrounding nodes. Medium screens should reduce padding and node width before changing the diagram type. Mobile screens should keep circles when legible; if a fallback is required, it must still communicate cycle direction, sequence numbers, and AI as the driver.

Setup-step visuals should be compact on medium and mobile screens. If four Agent setup steps are supportive rather than primary, render them as compact rows or a two-column grid instead of allowing them to dominate the viewport.

## 10. Agent Prompt Guide
When generating TraceMind UI, use this prompt direction:

Build a warm, developer-facing product analytics console inspired by PostHog's approachable analytics density, adapted to TraceMind's deep green and teal signal identity. Use warm paper backgrounds, compact 6-8px rounded controls, crisp sage borders, dense event rows, dark live-data panels, and clear copied/setup/loading/error states. The screen should feel like an AI behavior intelligence cockpit, not a generic SaaS landing page.
