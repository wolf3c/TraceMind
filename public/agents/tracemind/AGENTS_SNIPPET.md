## TraceMind Instrumentation Rules

## TraceMind Project Binding

When this snippet is installed from the TraceMind console, add the repository-specific binding values from the install prompt to this project instruction file:

- Project name: `<TraceMind project name>`
- Project ID: `<TraceMind project id>`
- Expected MCP server: `<tracemind-project-code>`

Before using any TraceMind MCP tool in this repository, use the expected MCP server, call `tracemind.project_info`, and continue only if the returned `projectId` matches the Project ID above. If it does not match, stop and ask the user to configure the correct TraceMind MCP server. Do not use another `tracemind-*` MCP server for this repository unless the user explicitly confirms the project switch.

For product behavior analysis, call `tracemind.project_health` first to read the selected day's project health report. Use it to answer whether the product is healthy today, what changed versus the previous day, and which attention item should be inspected first. Then use `tracemind.summary` and `tracemind.query_events` for feature usage analysis or anomaly/drop investigation. Use `tracemind.query_raw_behaviors` only when semantic evidence is insufficient.

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` or inspect MCP tool descriptions to confirm the project.
4. Verify TraceMind setup before manual custom events by calling `tracemind.capture_setup`; Web uses the returned `captureSnippet`, while iOS, macOS, Android, React Native, MCP Node, MCP Python, Agent Skill, and server application targets pass the matching `platform` (`ios`, `macos`, `android`, `react_native`, `mcp_node`, `mcp_python`, `agent_skill`, `server_node`, `server_python`, or `server_http`) and follow the returned `installCommands`, `filesToEdit`, `initLocation`, `idempotencyChecks`, and one-line `initSnippet`. The public project key is only for capture writes.
5. Search for an existing event before creating a new event.
6. Use only approved event names and properties returned or validated by the MCP.
7. Do not invent event names.
8. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
9. For manual capture, follow the returned `manualCaptureWorkflow`, use `identifySnippet` after login when a stable internal `userId` exists, and keep `properties`/`context` values to supported primitives: string, number, and boolean.
10. Never send PII, personal contact fields, secrets, credential values, raw prompts, raw user content, input values, or full URLs with query strings.
11. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.
12. When the developer finds a product issue or idea, ask whether they want to submit feedback unless they explicitly requested submission; if yes, call `tracemind.submit_feedback` with a sanitized summary and evidence references.

For product app and MCP targets, verify Auto Capture before manual custom events. Ordinary server applications are the exception in v1: use manual capture only.

For native SDK setup, do not duplicate existing dependencies or `TraceMind.start(...)` calls. iOS and macOS initialize from `App.swift` or `AppDelegate`, Android initializes from `Application.onCreate()`, and React Native initializes from the app bootstrap while keeping event `platform` as `ios` or `android` and marking `react_native` in framework metadata. macOS uses the existing Swift package and records window or screen level Auto Capture with `platform: "macos"` and `sourceType: "macos"`.

Manual native events are for stable business outcomes that Auto Capture cannot infer. The SDKs sanitize and omit nulls, nested objects, arrays, PII-like keys, credential values, raw prompts/content, input values, and full query URLs.

For third-party MCP servers, use `mcp_node` or `mcp_python`. Auto Capture records safe server metadata for tool calls, resource reads, and prompt requests with `platform: "server"` and `sourceType: "mcp_server"`. Do not capture raw prompts, tool arguments, tool results, resource content, source code, diffs, secrets, tokens, or full query URLs.

For Agent Skills, use `agent_skill`. A static Skill file cannot auto-capture by itself; only instrument executable host agent runtime lifecycle hooks, or keep the Skill as a tutorial and place manual capture in the MCP server/runtime that performs the work.

For ordinary server applications, use `server_node`, `server_python`, or `server_http`. The first version is manual capture only, not request Auto Capture. Add events only for stable server-side business outcomes such as payment succeeded, invoice paid, workspace created, job completed, or sync completed. Use `platform: "server"` and `sourceType: "server_app"`, and never capture request bodies, response bodies, headers, cookies, authorization values, raw logs, secrets, tokens, prompts, or full query URLs.

For developer feedback, use `tracemind.submit_feedback`; do not send feedback through `/api/capture` or manual `custom` events. Prefer event IDs, raw behavior IDs, paths, `actionKey`, `targetHash`, session/device IDs, time windows, and short sanitized examples over raw copied content. Never submit PII, secrets, tokens, raw prompts, raw user content, source code, diffs, request/response bodies, headers, cookies, authorization values, tool arguments/results, resource content, or full query URLs.

Skill reference: `/agents/tracemind/SKILL.md`
