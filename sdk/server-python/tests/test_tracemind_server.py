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
            attribution={
                "source": "partner",
                "medium": "referral",
                "campaign": "launch",
                "landingPath": "/invite?token=secret",
                "referrerDomain": "example.com",
                "referrerType": "external",
                "gclidPresent": True,
                "fullUrl": "https://example.com/invite?token=secret",
                "email": "user@example.com",
            },
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
        self.assertEqual(
            event["attribution"],
            {
                "source": "partner",
                "medium": "referral",
                "campaign": "launch",
                "landingPath": "/invite",
                "referrerDomain": "example.com",
                "referrerType": "external",
                "gclidPresent": True,
            },
        )
        self.assertEqual(event["properties"], {"amount": 2900, "success": True, "currency": "USD"})
        self.assertEqual(event["context"], {"source": "stripe_webhook"})
        self.assertNotIn("token=secret", str(event))
        self.assertNotIn("user@example.com", str(event))

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

    def test_captures_sanitized_app_error_summaries(self):
        batches = []
        client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=lambda body: batches.append(body),
        )
        error = RuntimeError("Database timeout for user@example.com")
        error.__cause__ = TypeError("Pool exhausted with token=secret")

        client.capture_error(
            error,
            path="/jobs?token=secret",
            component="InvoiceWorker",
            release="2026.05.25",
            operation="invoice.sync",
            feature="billing",
            route_name="InvoiceJob",
            correlation_id="corr_123",
            request_id="req_456",
            http_status=503,
            stack="raw stack must not be sent",
            handled=True,
            fatal=False,
            properties={
                "headers": "do not send",
                "requestBody": "do not send",
                "inputValue": "do not send",
            },
            context={
                "source": "job_runner",
                "authorization": "Bearer secret",
            },
        )
        client.flush()

        event = batches[0]["events"][0]
        self.assertEqual(event["type"], "app_error")
        self.assertEqual(event["eventName"], "app_error")
        self.assertEqual(event["path"], "/jobs")
        self.assertEqual(event["properties"]["errorType"], "RuntimeError")
        self.assertEqual(event["properties"]["errorKind"], "runtime")
        self.assertEqual(event["properties"]["component"], "InvoiceWorker")
        self.assertEqual(event["properties"]["release"], "2026.05.25")
        self.assertEqual(event["properties"]["handled"], True)
        self.assertEqual(event["properties"]["fatal"], False)
        self.assertEqual(event["properties"]["status"], "error")
        self.assertRegex(event["properties"]["messageFingerprint"], r"^tm_error_[a-f0-9]{24}$")
        self.assertEqual(event["properties"]["messagePreview"], "Database timeout for [email]")
        self.assertRegex(event["properties"]["stackFingerprint"], r"^tm_stack_[a-f0-9]{24}$")
        self.assertRegex(event["properties"]["topFrameFingerprint"], r"^tm_frame_[a-f0-9]{24}$")
        self.assertEqual(event["properties"]["causeType"], "TypeError")
        self.assertRegex(event["properties"]["causeFingerprint"], r"^tm_cause_[a-f0-9]{24}$")
        self.assertEqual(event["properties"]["operation"], "invoice.sync")
        self.assertEqual(event["properties"]["feature"], "billing")
        self.assertEqual(event["properties"]["routeName"], "InvoiceJob")
        self.assertEqual(event["properties"]["correlationId"], "corr_123")
        self.assertEqual(event["properties"]["requestId"], "req_456")
        self.assertEqual(event["properties"]["httpStatus"], 503)
        self.assertEqual(event["context"], {"source": "job_runner"})
        serialized = str(event)
        self.assertNotIn("user@example.com", serialized)
        self.assertNotIn("raw stack", serialized)
        self.assertNotIn("Bearer secret", serialized)
        self.assertNotIn("token=secret", serialized)

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

    def test_singleton_exposes_capture_error(self):
        batches = []
        TraceMindServer.start(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            transport=lambda body: batches.append(body),
        )

        TraceMindServer.capture_error({"errorType": "JobError", "message": "failed"})
        TraceMindServer.flush()

        self.assertEqual(batches[0]["events"][0]["type"], "app_error")
        self.assertEqual(batches[0]["events"][0]["properties"]["errorType"], "JobError")

    def test_submits_structured_user_feedback_through_dedicated_endpoint(self):
        feedback_bodies = []
        client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            source_key="billing-api",
            endpoint="https://tracemind.example.com/api/capture",
            feedback_transport=lambda body: feedback_bodies.append(body),
        )

        client.submit_feedback(
            user_id="user_123",
            path="/billing",
            message={
                "kind": "issue",
                "title": "Invoice export failed",
                "body": "The export button did not finish.",
                "contact": {"email": "buyer@example.com", "consent": True},
                "fields": {
                    "plan": "pro",
                    "accessToken": "do not send",
                    "returnUrl": "Open https://example.com/callback?token=secret to debug",
                },
                "attachments": [{"name": "future.png"}],
            },
        )

        self.assertEqual(len(feedback_bodies), 1)
        self.assertEqual(feedback_bodies[0]["projectKey"], "tm_proj_server_python")
        self.assertEqual(feedback_bodies[0]["source"]["type"], "server_app")
        self.assertEqual(feedback_bodies[0]["path"], "/billing")
        self.assertEqual(feedback_bodies[0]["message"]["kind"], "issue")
        self.assertEqual(feedback_bodies[0]["message"]["contact"]["email"], "buyer@example.com")
        self.assertEqual(feedback_bodies[0]["message"]["fields"], {"plan": "pro"})
        self.assertEqual(feedback_bodies[0]["message"]["attachments"], [])
        self.assertNotIn("do not send", str(feedback_bodies[0]))
        self.assertNotIn("callback?token", str(feedback_bodies[0]))

    def test_uses_default_feedback_endpoint_when_capture_endpoint_cannot_derive(self):
        fallback_client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            endpoint="https://collector.example.com/ingest",
        )
        derived_client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            endpoint="https://collector.example.com/base/api/capture?debug=true",
        )
        similar_path_client = create_tracemind_server_client(
            project_key="tm_proj_server_python",
            endpoint="https://collector.example.com/base/api/capture-v2",
        )

        self.assertEqual(
            fallback_client.feedback_endpoint,
            "https://tracemind.sandbox.galaxycloud.app/api/user-feedback",
        )
        self.assertEqual(
            derived_client.feedback_endpoint,
            "https://collector.example.com/base/api/user-feedback",
        )
        self.assertEqual(
            similar_path_client.feedback_endpoint,
            "https://tracemind.sandbox.galaxycloud.app/api/user-feedback",
        )


if __name__ == "__main__":
    unittest.main()
