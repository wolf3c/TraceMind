# Frontend Optimization Plan

## Current Behavior

- `imports/ui/App.svelte` renders the landing page and developer console with local HTML controls and custom CSS.
- The component still uses legacy Svelte reactive declarations and `on:event` listeners.
- `imports/ui/i18n/` exists but is not used by the UI, and its locale dictionaries are empty.
- The UI does not depend on a third-party component kit.

## Target Behavior

- Use local UI primitives and CSS classes for repeated cards, labels, inputs, textareas, selects, and alerts.
- Keep the existing TraceMind product flow intact: email code login, project creation, capture snippet display, source blocking, MCP token management, dashboard refresh, and logout.
- Add English and Chinese UI support through `imports/ui/i18n`, with a language selector and locale persistence.
- Convert `App.svelte` to Svelte 5 runes for local state, derived values, and effects, and use standard event handler props such as `onclick`.

## Affected Modules

- `imports/ui/App.svelte`
- `imports/ui/i18n/i18n.js`
- `imports/ui/i18n/locales/en.js`
- `imports/ui/i18n/locales/zh.js`
- `client/main.css`
- `client/main.html`
- `public/favicon.svg`
- `tests/main.js`
- `README.md`
- `docs/implementation_progress.md`
- `tsconfig.json`
- `package.json` and `package-lock.json` if UI dependencies change.

## Risks

- Local UI primitives must preserve form semantics, focus states, and responsive layout without relying on component-library defaults.
- Svelte 5 conversion can break reactivity if derived dashboard fields or Tracker cleanup are moved incorrectly.
- i18n can regress operator-facing status messages if keys are missing or interpolation is wrong.
- UI cleanup should not remove existing console capabilities or change server method contracts.

## Verification Plan

- Add failing Meteor Mocha coverage for locale normalization, fallback translation, interpolation, and required UI message keys before editing production i18n code.
- Run `npm test` after implementation.
- Run `npx svelte-check --compiler-warnings error` for Svelte diagnostics.
- Start the app with `npm start` and verify the local page loads if dependency installation and the local Meteor environment allow it.
- Check the page in Chrome DevTools for successful render, expected localized copy, and no new blocking console errors.

## 2026-05-07 Visual Polish Pass

### Current Behavior

- The UI briefly used Flowbite form/card primitives, but the visual result still read close to the previous custom layout.
- English locale entries duplicate their keys and values; the fallback behavior in `translateMessage()` is underused.
- The hero panel explains the product but does not show enough of the product's data-control surface.

### Target Behavior

- Use English source strings directly as translation keys so `imports/ui/i18n/locales/en.js` can stay compact.
- Use `DESIGN.md` as the local semantic design reference for a more product-specific AI behavior cockpit style.
- Add compact semantic chips and visible state labels, while keeping the existing product workflows unchanged.
- Improve first-screen hierarchy with a product-console preview, denser metrics, stronger contrast, and clearer setup flow.

### Risks

- Replacing symbolic i18n keys with English source keys touches many UI strings and status messages.
- Visual polish must not break login, project creation, MCP token management, source blocking, or dashboard refresh flows.
- Component-library additions must avoid package barrel imports that can pull incompatible modules into Meteor Rspack; prefer local primitives when the UI pattern is simple.

### Verification Plan

- Update i18n tests first so they fail against the old duplicated English dictionary contract.
- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Verify `npm start` returns HTTP 200 and inspect the rendered page in the browser.

## 2026-05-07 Flowbite Removal Pass

### Current Behavior

- `imports/ui/App.svelte` imports Flowbite-Svelte components for cards, labels, inputs, selects, textareas, and alerts.
- The TraceMind visual identity is already implemented through local design tokens and CSS, while Flowbite contributes only shallow form and card wrappers.
- One attempted Flowbite component import exposed a Meteor Rspack package-resolution incompatibility.

### Target Behavior

- Remove `flowbite` and `flowbite-svelte` dependencies.
- Replace Flowbite-Svelte usage with semantic native elements and existing local classes.
- Preserve the login, project creation, capture snippet, source management, MCP token, dashboard refresh, locale selection, and status-message flows.
- Keep `DESIGN.md` as the source of UI direction instead of using a generic component-library look.

### Risks

- Native replacements can accidentally change binding behavior, readonly fields, or accessible labels.
- Card and alert spacing may shift if library defaults were carrying hidden layout.
- Package lock cleanup must remove Flowbite transitive packages without unrelated dependency churn.

### Verification Plan

- Search for all remaining Flowbite references after editing.
- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Start the app and verify HTTP 200 plus a browser render smoke check.

## 2026-05-07 Landing Positioning Pass

### Current Behavior

- The hero headline emphasized avoiding complex tracking work, which sounded too internal and implementation-focused for first-time developers.
- The hero lede listed low-level capture categories before explaining the product value.
- The workflow presented MCP as a setup goal instead of the read-only analysis path that lets developers ask product questions from AI coding tools.

### Target Behavior

- Lead with the developer outcome: one script helps developers see how users actually use the product.
- Summarize captured behavior as analyzable product signals instead of listing every raw event category in the hero.
- Present remote MCP as the AI-analysis entrypoint for Codex, Claude Code, Cursor, and similar tools, while preserving its read-only security model.

### Verification Plan

- Run `npx svelte-check --compiler-warnings error`.
- Run `npm test`.
- Inspect the Chinese landing page copy and verify the setup flow says `1 分钟接入流程`.
