# Repository Guidelines

## Project Structure & Module Organization

TraceMind is a Meteor app with a Svelte client.

- `client/` contains browser entry files: `main.html`, `main.js`, and global CSS.
- `server/` contains Meteor server startup and publications.
- `imports/api/` holds shared data-layer modules such as Mongo collections.
- `imports/ui/` holds Svelte UI components; `App.svelte` is the current root component.
- `tests/` contains Meteor Mocha tests loaded through `tests/main.js`.
- `docs/` stores product and planning documentation.
- `rspack.config.js` configures Meteor Rspack and Svelte preprocessing.

Keep reusable code under `imports/` so Meteor imports it explicitly instead of relying on legacy file load order.

## Optimization Workflow Requirements

For every optimization or behavior-changing improvement, do the design work before editing production code:

- First identify the current behavior, the target behavior, affected modules, risks, and verification plan.
- Write a concise implementation plan before making code changes.
- Reflect on whether the plan preserves existing product semantics and avoids unnecessary scope.
- Update all relevant documentation under `docs/` in the same change, including product, technical design, implementation progress, and user-facing usage docs when affected.
- Treat tests passing as insufficient by itself; confirm that docs, tests, and implementation all cover the requested optimization.

## Build, Test, and Development Commands

- `npm start` runs `meteor run` for local development.
- `npm test` runs the Mocha test suite once with `meteortesting:mocha`.
- `npm run test-app` runs full-app tests in watch mode with `TEST_WATCH=1`.
- `npm run visualize` starts a production bundle analysis with `bundle-visualizer`.
- `npx svelte-check` can be used for Svelte diagnostics; add an npm script if it becomes part of the regular workflow.

## Coding Style & Naming Conventions

Use modern JavaScript modules and Svelte 5 component syntax. Match the existing style: two-space indentation in Svelte/HTML/CSS, semicolons in JavaScript, and explicit imports from `meteor/*` packages. Name Svelte components in `PascalCase.svelte`; name shared API modules descriptively, for example `imports/api/links.js`. Use single-purpose functions for server methods, publications, and collection helpers.

## Testing Guidelines

Tests use Node `assert` with Meteor Mocha. Add new tests in `tests/main.js` or split larger suites into imported files under `tests/`. Use behavior-focused names such as `it("publishes seeded links", ...)`. Run `npm test` before handing off changes. For client/server-specific assertions, guard with `Meteor.isClient` or `Meteor.isServer` as shown in the existing tests.

## Commit & Pull Request Guidelines

This checkout does not include Git history, so no repository-specific commit convention can be inferred. Use concise imperative commits such as `Add link publication test` or `Refine Svelte startup`. Pull requests should include a short summary, testing performed, linked issue or task when available, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `node_modules/`, generated build output, or local secret files. Keep server-only credentials out of client code and expose data through publications or methods with explicit access checks.

You are able to use the Flowbite-Svelte MCP server, where you have access to comprehensive Flowbite-Svelte component documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. findComponent

Use this FIRST to discover components by name or category. Returns component information including the documentation path.
When asked about Flowbite-Svelte components, ALWAYS use this tool to locate the correct component before fetching documentation.
Example queries: 'Button', 'CardPlaceholder', 'form checkbox'

### 2. getComponentList

Lists all available Flowbite-Svelte components with their categories.
Use this to discover what components are available or to help users explore component options.

### 3. getComponentDoc

Retrieves full documentation content for a specific component. Accepts the component path found using findComponent.
After calling findComponent, use this tool to fetch the complete documentation including usage examples, props, and best practices.

### 4. searchDocs

Performs full-text search across all Flowbite-Svelte documentation.
Use this when you need to find specific information that might span multiple components or when the user asks about features or patterns.
