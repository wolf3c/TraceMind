import asyncio
import unittest

from tracemind_mcp import TraceMindMCP, create_tracemind_mcp_client


class TraceMindMCPTest(unittest.TestCase):
    def test_wraps_tools_and_records_success_without_raw_args_or_result_content(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        def handler(request):
            return {"ok": True, "text": f"indexed {request['arguments']['rawPrompt']}"}

        wrapped = client.wrap_tool("sync_docs", handler)
        result = wrapped({"userId": "user_123", "arguments": {"rawPrompt": "do not store", "token": "secret"}})
        client.flush()

        self.assertEqual(result, {"ok": True, "text": "indexed do not store"})
        event = batches[0]["events"][0]
        self.assertEqual(event["type"], "tool_call")
        self.assertEqual(event["eventName"], "mcp_tool_call")
        self.assertEqual(event["platform"], "server")
        self.assertEqual(event["source"]["type"], "mcp_server")
        self.assertEqual(event["source"]["key"], "docs-mcp")
        self.assertEqual(event["userId"], "user_123")
        self.assertEqual(event["target"]["type"], "mcp_tool")
        self.assertEqual(event["target"]["name"], "sync_docs")
        self.assertEqual(event["properties"]["toolName"], "sync_docs")
        self.assertEqual(event["properties"]["status"], "success")
        self.assertEqual(event["properties"]["resultSizeBucket"], "small")
        self.assertNotIn("rawPrompt", str(event))
        self.assertNotIn("do not store", str(event))
        self.assertTrue(event["targetHash"].startswith("tm_target_"))

    def test_start_patches_decorator_style_tool_registration(self):
        batches = []

        class FakeServer:
            def __init__(self):
                self.registered_name = None
                self.registered_handler = None

            def tool(self, name):
                def register(handler):
                    self.registered_name = name
                    self.registered_handler = handler
                    return handler

                return register

        server = FakeServer()
        client = TraceMindMCP.start(
            server,
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        @server.tool("sync_docs")
        def handler(_request):
            return {"ok": True}

        self.assertEqual(server.registered_name, "sync_docs")
        self.assertEqual(server.registered_handler({}), {"ok": True})
        client.flush()

        self.assertEqual(batches[0]["events"][0]["type"], "tool_call")
        self.assertEqual(batches[0]["events"][0]["properties"]["toolName"], "sync_docs")

    def test_wraps_tools_and_preserves_handler_errors_while_recording_metadata(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        def handler(_request):
            raise ValueError("boom")

        wrapped = client.wrap_tool("sync_docs", handler)
        with self.assertRaisesRegex(ValueError, "boom"):
            wrapped({})
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["properties"]["status"], "error")
        self.assertEqual(event["properties"]["errorType"], "ValueError")
        self.assertNotIn("boom", str(event))

    def test_wraps_async_tool_success_after_handler_completes(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        async def handler(_request):
            await asyncio.sleep(0)
            return {"ok": True}

        wrapped = client.wrap_tool("sync_docs", handler)
        self.assertEqual(asyncio.run(wrapped({})), {"ok": True})
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["properties"]["status"], "success")
        self.assertEqual(event["properties"]["resultSizeBucket"], "small")

    def test_wraps_async_tool_errors_after_handler_fails(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        async def handler(_request):
            await asyncio.sleep(0)
            raise RuntimeError("boom")

        wrapped = client.wrap_tool("sync_docs", handler)
        with self.assertRaisesRegex(RuntimeError, "boom"):
            asyncio.run(wrapped({}))
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["properties"]["status"], "error")
        self.assertEqual(event["properties"]["errorType"], "RuntimeError")
        self.assertNotIn("boom", str(event))

    def test_manual_custom_capture_sanitizes_primitive_properties_and_context(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        client.capture(
            "custom",
            event_name="document_indexed",
            user_id="user_123",
            properties={
                "documentCount": 12,
                "success": True,
                "ratio": 1.5,
                "raw_args": "do not store",
                "rawResult": "do not store",
                "resource_content": "do not store",
                "email": "contact@example.com",
                "infinite": float("inf"),
                "nested": {"value": True},
            },
            context={
                "toolName": "sync_docs",
                "retry": False,
                "returnUrl": "https://example.com/callback?token=secret",
            },
        )
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["type"], "custom")
        self.assertEqual(event["eventName"], "document_indexed")
        self.assertEqual(event["properties"], {"documentCount": 12, "success": True, "ratio": 1.5})
        self.assertEqual(event["context"], {"toolName": "sync_docs", "retry": False})

    def test_wraps_resource_and_prompt_handlers_with_safe_metadata(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        resource = client.wrap_resource("docs", "file:///tmp/private.txt?token=secret", lambda _request: "secret content")
        prompt = client.wrap_prompt("summarize", lambda _request: {"messages": [{"role": "user", "content": "private prompt"}]})

        resource({})
        prompt({})
        client.flush()

        resource_event, prompt_event = batches[0]["events"]
        self.assertEqual(resource_event["type"], "resource_read")
        self.assertEqual(resource_event["eventName"], "mcp_resource_read")
        self.assertEqual(resource_event["properties"]["uriScheme"], "file")
        self.assertNotIn("/tmp/private.txt", str(resource_event))
        self.assertNotIn("secret content", str(resource_event))
        self.assertEqual(prompt_event["type"], "prompt_request")
        self.assertEqual(prompt_event["eventName"], "mcp_prompt_request")
        self.assertEqual(prompt_event["properties"]["promptName"], "summarize")
        self.assertNotIn("private prompt", str(prompt_event))

    def test_records_optional_agent_skill_lifecycle_events(self):
        batches = []
        client = create_tracemind_mcp_client(
            project_key="tm_proj_mcp_python",
            source_key="docs-mcp",
            transport=lambda body: batches.append(body),
        )

        client.capture_skill_lifecycle(
            skill_name="docs-indexer",
            version="1.2.0",
            phase="completed",
            success=True,
        )
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["type"], "skill_lifecycle")
        self.assertEqual(event["eventName"], "agent_skill_lifecycle")
        self.assertEqual(event["source"]["type"], "agent_skill")
        self.assertEqual(event["source"]["key"], "docs-indexer")
        self.assertEqual(event["target"], {"type": "agent_skill", "name": "docs-indexer", "version": "1.2.0"})
        self.assertEqual(event["properties"]["phase"], "completed")
        self.assertEqual(event["properties"]["success"], True)


if __name__ == "__main__":
    unittest.main()
