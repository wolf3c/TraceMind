## TraceMind Instrumentation Rules

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. For web apps, verify TraceMind Auto Capture before manual custom events by calling `tracemind.capture_setup` and using the returned public project key only as `data-tracemind-token`.
4. Search for an existing event before creating a new event.
5. Use only approved event names and properties returned or validated by the MCP.
6. Do not invent event names.
7. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
8. Never send PII, emails, phone numbers, secrets, access tokens, raw prompts, raw user content, or full URLs with query strings.
9. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.

Skill reference: `/agents/tracemind/SKILL.md`
