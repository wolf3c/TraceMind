## TraceMind Instrumentation Rules

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` or inspect MCP tool descriptions to confirm the project.
4. Verify TraceMind Auto Capture before manual custom events by calling `tracemind.capture_setup`; Web uses the returned `captureSnippet`, while iOS, Android, and React Native pass the matching `platform` and follow the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, and one-line `initSnippet`. The public project key is only for capture writes.
5. Search for an existing event before creating a new event.
6. Use only approved event names and properties returned or validated by the MCP.
7. Do not invent event names.
8. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
9. For manual capture, follow the returned `manualCaptureWorkflow`, use `identifySnippet` after login when a stable internal `userId` exists, and keep `properties`/`context` values to supported primitives: string, number, and boolean.
10. Never send PII, personal contact fields, secrets, credential values, raw prompts, raw user content, input values, or full URLs with query strings.
11. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.

For native SDK setup, do not duplicate existing dependencies or `TraceMind.start(...)` calls. iOS initializes from `App.swift` or `AppDelegate`, Android initializes from `Application.onCreate()`, and React Native initializes from the app bootstrap while keeping event `platform` as `ios` or `android` and marking `react_native` in framework metadata.

Manual native events are for stable business outcomes that Auto Capture cannot infer. The SDKs sanitize and omit nulls, nested objects, arrays, PII-like keys, credential values, raw prompts/content, input values, and full query URLs.

Skill reference: `/agents/tracemind/SKILL.md`
