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

## 6. Depth & Elevation
TraceMind should rely primarily on borders, surface color shifts, and local shadows.

- Level 0: Warm Canvas background for broad page sections.
- Level 1: Porcelain Console cards with Sage Border for normal setup and account surfaces.
- Level 2: Soft shadow cards for important panels such as hero data preview and active console modules.
- Level 3: Dark instrument panels for live signal streams and agent-query previews.

Avoid heavy floating-card decoration. Elevation should clarify information hierarchy, not make the page feel ornamental.

## 7. Do's and Don'ts
Do:
- Keep TraceMind visibly developer-facing and analytics-native.
- Make copy, setup, and token actions visibly stateful.
- Use warm surfaces for readability and dark panels for live signal emphasis.
- Keep public concepts such as `projectKey` prominent and internal credentials out of primary UI.
- Prefer dense operator panels over broad marketing cards.

Don't:
- Copy another brand's accent palette, mascot style, or novelty illustrations directly.
- Turn the whole product into a dark terminal interface.
- Use purple/blue gradient SaaS decoration as the main identity.
- Add nested cards where rows or dividers would be clearer.
- Hide important success, error, copied, blocked, or loading states in subtle text only.

## 8. Responsive Behavior
Desktop layouts can use two-column hero and console grids with dense side panels. Tablet layouts should collapse secondary panels below the primary workflow. Mobile layouts should use a single column, full-width form controls, stable 44px minimum touch targets, and horizontally scrollable code/token fields.

Metrics should collapse from three columns to one or two columns before labels truncate. Buttons should wrap cleanly; text inside controls must not overflow.

## 9. Agent Prompt Guide
When generating TraceMind UI, use this prompt direction:

Build a warm, developer-facing product analytics console inspired by PostHog's approachable analytics density, adapted to TraceMind's deep green and teal signal identity. Use warm paper backgrounds, compact 6-8px rounded controls, crisp sage borders, dense event rows, dark live-data panels, and clear copied/setup/loading/error states. The screen should feel like an AI behavior intelligence cockpit, not a generic SaaS landing page.
