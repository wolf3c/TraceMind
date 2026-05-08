## TraceMind Instrumentation Rules

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. If multiple TraceMind MCP servers exist or the project is unclear, call `tracemind.project_info` or inspect MCP tool descriptions to confirm the project.
4. Verify TraceMind Auto Capture before manual custom events by calling `tracemind.capture_setup`; Web uses the returned `captureSnippet`, while iOS, Android, and React Native pass the matching `platform` and use the returned one-line SDK initialization. The public project key is only for capture writes.
5. Search for an existing event before creating a new event.
6. Use only approved event names and properties returned or validated by the MCP.
7. Do not invent event names.
8. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
9. Never send PII, emails, phone numbers, secrets, access tokens, raw prompts, raw user content, or full URLs with query strings.
10. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.

Skill reference: `/agents/tracemind/SKILL.md`
