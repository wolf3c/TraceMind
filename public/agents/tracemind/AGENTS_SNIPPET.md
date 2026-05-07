## TraceMind Instrumentation Rules

When adding or modifying TraceMind analytics instrumentation in this project:

1. Use the TraceMind MCP before writing analytics code.
2. Call `tracemind.agent_guidance` to check the current guidance version.
3. Search for an existing event before creating a new event.
4. Use only approved event names and properties returned or validated by the MCP.
5. Do not invent event names.
6. If no existing event matches, create a draft custom event proposal instead of treating it as approved.
7. Never send PII, emails, phone numbers, secrets, access tokens, raw prompts, raw user content, or full URLs with query strings.
8. After changing analytics code, validate the diff or project instrumentation through the TraceMind MCP before finishing.

Skill reference: `/agents/tracemind/SKILL.md`
