# Design System: TraceMind
**Project ID:** local-tracemind

## 1. Visual Theme & Atmosphere
TraceMind should feel like a focused AI operations cockpit: calm, precise, data-rich, and slightly cinematic without becoming decorative. The product is about turning invisible behavior into readable signals, so the interface should foreground traces, event streams, and MCP access points. The mood is high-contrast and analytical, with warm paper surfaces used only where users read or copy operational details.

## 2. Color Palette & Roles
- Deep Instrument Green (#0F2F2A): Primary navigation, hero surfaces, and high-authority controls.
- Signal Teal (#18A77A): Active signal lines, positive status, and current workflow markers.
- Capture Amber (#F2B84B): Secondary highlights for raw behavior, setup prompts, and important data chips.
- Alert Clay (#B95C3B): Destructive or risk-bearing actions such as blocking a source or deleting a token.
- Porcelain Console (#FFFDF8): Main card and form surfaces that need high readability.
- Mist Grid (#E6EEE9): Subtle borders, separators, and quiet layout scaffolding.
- Graphite Text (#17231F): Primary text for product copy and console data.

## 3. Typography Rules
Use a system sans stack with restrained weight contrast. Product headlines should be firm and compact, not oversized marketing type. Console labels use small uppercase text with normal letter spacing; metric numbers are large but contained. Body copy should stay readable and quiet, with line lengths capped in hero and card descriptions.

## 4. Component Stylings
* **Buttons:** Compact rectangular controls with gently rounded corners, dark primary fills, and thin bordered secondary states. Destructive actions use clay text and borders rather than large red fills.
* **Cards/Containers:** Local cards should read as structured work surfaces: 8px corners, crisp borders, and soft layered shadows. Avoid nested-card ornament; use bands, rows, and grouped panels inside cards.
* **Inputs/Forms:** Inputs use porcelain backgrounds, mist borders, and strong focus rings. Read-only code fields should feel copyable and technical, with subtle amber or teal tinting.
* **Badges:** Use pill-shaped local badges for product status, data categories, and metric qualifiers. Badges should carry semantic information, not decoration.

## 5. Layout Principles
The first viewport should immediately communicate the product: capture stream, semantic conversion, and AI-agent query path. Use an asymmetric hero with concise copy on the left and a dense product-console preview on the right. Below the hero, keep workflow steps in a scannable horizontal rail on desktop and a single column on mobile. Console sections should be dense but breathable, optimized for repeated operator use rather than marketing.
