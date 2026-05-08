import unittest

from tracemind_server import TraceMindServer, create_tracemind_server_client


class TraceMindServerTest(unittest.TestCase):
    def test_captures_server_custom_events_with_primitive_fields(self):
        batches = []
        client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=lambda body: batches.append(body),
        )

        client.capture(
            "custom",
            event_name="invoice_paid",
            user_id="user_123",
            properties={"amount": 2900, "success": True, "currency": "USD"},
            context={"source": "stripe_webhook"},
        )
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["platform"], "server")
        self.assertEqual(event["source"]["type"], "server_app")
        self.assertEqual(event["source"]["key"], "billing-api")
        self.assertEqual(event["type"], "custom")
        self.assertEqual(event["eventName"], "invoice_paid")
        self.assertEqual(event["userId"], "user_123")
        self.assertEqual(event["properties"], {"amount": 2900, "success": True, "currency": "USD"})
        self.assertEqual(event["context"], {"source": "stripe_webhook"})

    def test_filters_sensitive_server_fields_and_non_finite_numbers(self):
        batches = []
        client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=lambda body: batches.append(body),
        )

        client.capture(
            "custom",
            event_name="invoice_paid",
            source_details={
                "framework": "fastapi",
                "environment": "production",
                "language": "override",
                "requestBody": "do not store",
                "headers": {"authorization": "do not store"},
                "headers.authorization": "do not store",
            },
            properties={
                "amount": 2900,
                "raw_request_body": "do not store",
                "request.body": "do not store",
                "rawResponseBody": "do not store",
                "response.body": "do not store",
                "headers": "do not store",
                "headers.authorization": "do not store",
                "cookies": "do not store",
                "cookies.session": "do not store",
                "authorization": "do not store",
                "access_token": "do not store",
                "userEmail": "user@example.com",
                "callbackUrl": "https://example.com/callback?token=secret",
                "infinite": float("inf"),
                "nested": {"value": True},
            },
            context={
                "source": "stripe_webhook",
                "request.body": "do not store",
                "headers.authorization": "do not store",
            },
        )
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["properties"], {"amount": 2900})
        self.assertEqual(event["context"], {"source": "stripe_webhook"})
        self.assertEqual(event["source"]["details"]["language"], "python")
        self.assertEqual(event["source"]["details"]["framework"], "fastapi")
        self.assertEqual(event["source"]["details"]["environment"], "production")
        self.assertNotIn("do not store", str(event))
        self.assertNotIn("user@example.com", str(event))

    def test_requeues_failed_flushes(self):
        attempts = {"count": 0}

        def transport(_body):
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise RuntimeError("offline")
            return {"ok": True}

        client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=transport,
        )

        client.capture("custom", event_name="invoice_paid")
        with self.assertRaisesRegex(RuntimeError, "offline"):
            client.flush()
        self.assertEqual(len(client.queue), 1)
        client.flush()
        self.assertEqual(len(client.queue), 0)

    def test_singleton_starts_and_flushes(self):
        batches = []
        TraceMindServer.start(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=lambda body: batches.append(body),
        )

        TraceMindServer.capture("custom", event_name="invoice_paid")
        TraceMindServer.flush()

        self.assertEqual(batches[0]["events"][0]["source"]["type"], "server_app")


if __name__ == "__main__":
    unittest.main()
