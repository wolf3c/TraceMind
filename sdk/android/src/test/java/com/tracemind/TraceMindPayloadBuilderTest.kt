package com.tracemind

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TraceMindPayloadBuilderTest {
  @Test
  fun buildsAndroidPayloadWithoutInputValues() {
    val builder = TraceMindPayloadBuilder(
      projectKey = "tm_proj_android",
      packageName = "com.example.android",
      appLabel = "Example Android",
      framework = "kotlin",
      identityStore = InMemoryIdentityStore()
    )
    val target = TraceMindTarget(
      className = "Button",
      resourceId = "checkout_primary",
      label = "Pay now",
      screen = "CheckoutActivity",
      path = "DecorView>CheckoutActivity>Button[0]"
    )

    val payload = builder.payload(
      type = "click",
      path = "CheckoutActivity",
      title = "Checkout",
      target = target,
      properties = mapOf("inputValue" to "secret text", "plan" to "pro")
    )

    assertEquals("android", payload.platform)
    assertEquals("android", payload.source.type)
    assertEquals("com.example.android", payload.source.packageName)
    assertEquals("kotlin", payload.source.details["framework"])
    assertTrue(payload.targetHash!!.startsWith("tm_target_"))
    assertEquals("target:resourceId:checkout_primary", payload.targetIdentity!!.key)
    assertEquals("resourceId", payload.identitySource)
    assertEquals("high", payload.identityConfidence)
    assertEquals("android:CheckoutActivity:click:target:resourceId:checkout_primary", payload.actionKey)
    assertFalse(payload.properties.containsKey("inputValue"))
    assertEquals("pro", payload.properties["plan"])
  }

  @Test
  fun targetHashPrefersStableEngineeringIdentifiersOverTextAndPath() {
    val builder = TraceMindPayloadBuilder(
      projectKey = "tm_proj_android",
      packageName = "com.example.android",
      appLabel = "Example Android",
      framework = "kotlin",
      identityStore = InMemoryIdentityStore()
    )

    val first = builder.payload(
      type = "click",
      path = "CheckoutActivity",
      target = TraceMindTarget(
        className = "Button",
        resourceId = "checkout_primary",
        label = "Pay now",
        screen = "CheckoutActivity",
        path = "Root>Button[0]"
      )
    )
    val second = builder.payload(
      type = "click",
      path = "CheckoutActivity",
      target = TraceMindTarget(
        className = "MaterialButton",
        resourceId = "checkout_primary",
        label = "Complete payment",
        screen = "CheckoutActivity",
        path = "Root>Container>Button[2]"
      )
    )

    assertEquals(first.targetHash, second.targetHash)
    assertEquals(first.actionKey, second.actionKey)
  }

  @Test
  fun identifyPersistsUserIdAndBuildsSanitizedEvent() {
    val identityStore = InMemoryIdentityStore()
    val builder = TraceMindPayloadBuilder(
      projectKey = "tm_proj_android",
      packageName = "com.example.android",
      appLabel = "Example Android",
      framework = "kotlin",
      identityStore = identityStore
    )

    builder.identify("user_123")
    val payload = builder.payload(
      type = "custom",
      eventName = "identify",
      path = "Identity",
      properties = mapOf(
        "plan" to "pro",
        "seats" to 3,
        "annualValue" to 1200L,
        "ratio" to 1.5,
        "trial" to true,
        ("em" + "ail") to "redacted-contact",
        ("raw" + "_prompt") to "do not send",
        "raw-user-content" to "do not send",
        "entered_text" to "do not send",
        ("user" + "_phone") to "do not send",
        ("return" + "Url") to ("https://example.com/checkout" + "?debug=true"),
        "nested" to mapOf("unsafe" to "value"),
        "items" to listOf("a"),
        "notANumber" to Double.NaN,
        "positiveInfinity" to Double.POSITIVE_INFINITY,
        "negativeInfinity" to Float.NEGATIVE_INFINITY
      )
    )

    assertEquals("user_123", identityStore.userId)
    assertEquals("user_123", payload.userId)
    assertEquals("identify", payload.eventName)
    assertEquals("pro", payload.properties["plan"])
    assertEquals(3, payload.properties["seats"])
    assertEquals(1200L, payload.properties["annualValue"])
    assertEquals(1.5, payload.properties["ratio"])
    assertEquals(true, payload.properties["trial"])
    assertFalse(payload.properties.containsKey("em" + "ail"))
    assertFalse(payload.properties.containsKey("raw" + "_prompt"))
    assertFalse(payload.properties.containsKey("raw-user-content"))
    assertFalse(payload.properties.containsKey("entered_text"))
    assertFalse(payload.properties.containsKey("user" + "_phone"))
    assertFalse(payload.properties.containsKey("return" + "Url"))
    assertFalse(payload.properties.containsKey("nested"))
    assertFalse(payload.properties.containsKey("items"))
    assertFalse(payload.properties.containsKey("notANumber"))
    assertFalse(payload.properties.containsKey("positiveInfinity"))
    assertFalse(payload.properties.containsKey("negativeInfinity"))
  }

  @Test
  fun manualCustomCapturePreservesPrimitiveContextAndSerializesJsonValues() {
    val identityStore = InMemoryIdentityStore(userId = "user_123")
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = identityStore
    )

    client.capture(
      type = "custom",
      eventName = "purchase_completed",
      path = "CheckoutActivity",
      properties = mapOf(
        "plan" to "pro",
        "amount" to 29,
        "ratio" to 1.5,
        "trial" to false,
        "notANumber" to Double.NaN,
        "positiveInfinity" to Double.POSITIVE_INFINITY,
        "negativeInfinity" to Float.NEGATIVE_INFINITY,
        ("access" + "Token") to "secret"
      ),
      context = mapOf(
        "source" to "pricing",
        "retry" to false
      )
    )

    val batch = client.flushPayload()
    val event = batch.events.first()
    val json = batch.toJson()

    assertEquals("user_123", event.userId)
    assertEquals("purchase_completed", event.eventName)
    assertEquals("CheckoutActivity", event.path)
    assertEquals("pro", event.properties["plan"])
    assertEquals(29, event.properties["amount"])
    assertEquals(1.5, event.properties["ratio"])
    assertEquals(false, event.properties["trial"])
    assertFalse(event.properties.containsKey("notANumber"))
    assertFalse(event.properties.containsKey("positiveInfinity"))
    assertFalse(event.properties.containsKey("negativeInfinity"))
    assertFalse(event.properties.containsKey("access" + "Token"))
    assertEquals("pricing", event.context["source"])
    assertEquals(false, event.context["retry"])
    assertTrue(json.contains(""""amount":29"""))
    assertTrue(json.contains(""""ratio":1.5"""))
    assertTrue(json.contains(""""trial":false"""))
    assertFalse(json.contains(""""amount":"29""""))
    assertFalse(json.contains("NaN"))
    assertFalse(json.contains("Infinity"))
  }

  @Test
  fun manualCaptureErrorBuildsSanitizedAppErrorPayload() {
    val identityStore = InMemoryIdentityStore(userId = "user_123")
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = identityStore
    )

    client.captureError(
      error = IllegalStateException("Payment failed for user@example.com"),
      path = "CheckoutActivity?token=secret",
      handled = true,
      fatal = false,
      properties = mapOf(
        "component" to "CheckoutActivity",
        "release" to "2026.05.25",
        "requestBody" to "do not send",
        "headers" to "do not send",
        "inputValue" to "do not send"
      ),
      context = mapOf(
        "source" to "checkout",
        "authorization" to "Bearer secret"
      )
    )

    val batch = client.flushPayload()
    val event = batch.events.first()
    val json = batch.toJson()

    assertEquals("app_error", event.type)
    assertEquals("app_error", event.eventName)
    assertEquals("CheckoutActivity", event.path)
    assertEquals("IllegalStateException", event.properties["errorType"])
    assertEquals("runtime", event.properties["errorKind"])
    assertEquals("CheckoutActivity", event.properties["component"])
    assertEquals("2026.05.25", event.properties["release"])
    assertEquals(true, event.properties["handled"])
    assertEquals(false, event.properties["fatal"])
    assertEquals("error", event.properties["status"])
    assertTrue((event.properties["messageFingerprint"] as String).startsWith("tm_error_"))
    assertEquals("checkout", event.context["source"])
    assertFalse(json.contains("Payment failed"))
    assertFalse(json.contains("user@example.com"))
    assertFalse(json.contains("Bearer secret"))
    assertFalse(json.contains("token=secret"))
  }

  @Test
  fun deepLinkAttributionIsAttachedToEventsAndPresenceWithoutQueryValues() {
    val presences = mutableListOf<TraceMindPresencePayload>()
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      presenceEndpoint = "https://tracemind.example.com/api/presence",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = InMemoryIdentityStore(userId = "user_123"),
      presenceSender = { presences.add(it) }
    )

    client.recordDeepLink(
      url = "myapp://invite?utm_source=partner&utm_medium=deeplink&utm_campaign=launch&fbclid=secret-click&email=user@example.com",
      referrer = "android-app://com.twitter.android",
      sourcePackage = "com.twitter.android"
    )
    client.capture(type = "custom", eventName = "invite_accepted", path = "InviteActivity")
    val event = client.flushPayload().events.first()
    client.startPresence("InviteActivity")
    val presence = presences.first()
    val json = TraceMindBatch(event.projectKey, listOf(event)).toJson()

    assertEquals("partner", event.attribution?.source)
    assertEquals("deeplink", event.attribution?.medium)
    assertEquals("launch", event.attribution?.campaign)
    assertEquals("com.twitter.android", event.attribution?.referrerDomain)
    assertEquals("external", event.attribution?.referrerType)
    assertEquals("/invite", event.attribution?.landingPath)
    assertEquals(true, event.attribution?.fbclidPresent)
    assertEquals(event.attribution, presence.attribution)
    assertFalse(json.contains("secret-click"))
    assertFalse(json.contains("user@example.com"))
  }

  @Test
  fun emptyDeepLinkDoesNotCreateAttribution() {
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = InMemoryIdentityStore(userId = "user_123")
    )

    client.recordDeepLink(url = null, referrer = null, sourcePackage = null)
    client.capture(type = "custom", eventName = "app_opened", path = "HomeActivity")
    val event = client.flushPayload().events.first()

    assertEquals(null, event.attribution)
  }

  @Test
  fun submitFeedbackBuildsDedicatedPayloadWithConsentedContact() {
    val feedbacks = mutableListOf<TraceMindUserFeedbackPayload>()
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      feedbackEndpoint = "https://tracemind.example.com/api/user-feedback",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = InMemoryIdentityStore(userId = "user_123"),
      feedbackSender = { feedbacks.add(it) }
    )

    client.submitFeedback(
      message = TraceMindFeedbackMessage(
        kind = "issue",
        title = "Upgrade failed",
        body = "The upgrade button did not finish.",
        contact = TraceMindFeedbackContact(email = "user@example.com", consent = true),
        fields = mapOf(
          "plan" to "pro",
          ("access" + "Token") to "do not send",
          "returnUrl" to "Open https://example.com/callback?token=secret to debug"
        ),
        attachments = listOf(TraceMindFeedbackAttachment(name = "future.png"))
      ),
      path = "CheckoutActivity"
    )

    val feedback = feedbacks.first()
    val json = feedback.toJson()
    assertEquals("tm_proj_android", feedback.projectKey)
    assertEquals("user_123", feedback.userId)
    assertEquals("android", feedback.platform)
    assertEquals("issue", feedback.message.kind)
    assertEquals("user@example.com", feedback.message.contact.email)
    assertEquals("pro", feedback.message.fields["plan"])
    assertFalse(feedback.message.fields.containsKey("access" + "Token"))
    assertFalse(feedback.message.fields.containsKey("returnUrl"))
    assertEquals(emptyList<TraceMindFeedbackAttachment>(), feedback.message.attachments)
    assertTrue(json.contains(""""message""""))
    assertFalse(json.contains("do not send"))
  }

  @Test
  fun feedbackEndpointFallsBackWhenCaptureEndpointCannotDeriveIt() {
    val derived = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://collector.example.com/base/api/capture?debug=true",
      packageName = "com.example.android",
      appLabel = "Example Android"
    )
    val fallback = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://collector.example.com/base/api/capture-v2",
      packageName = "com.example.android",
      appLabel = "Example Android"
    )

    assertEquals("https://collector.example.com/base/api/user-feedback", derived.feedbackEndpoint())
    assertEquals("https://tracemind.sandbox.galaxycloud.app/api/user-feedback", fallback.feedbackEndpoint())
  }

  @Test
  fun buildsPresencePayloadForOnlineDuration() {
    val identityStore = InMemoryIdentityStore(userId = "user_123")
    val builder = TraceMindPayloadBuilder(
      projectKey = "tm_proj_android",
      packageName = "com.example.android",
      appLabel = "Example Android",
      framework = "kotlin",
      identityStore = identityStore
    )

    val payload = builder.presencePayload(
      presenceId = "tm_pres_android",
      state = "heartbeat",
      path = "CheckoutActivity",
      title = "Checkout",
      activeDurationMs = 120_000,
      lastActiveAt = "2026-05-08T01:00:00Z",
      activeState = "idle",
      idleTimeoutMs = 60_000
    )

    assertEquals("tm_proj_android", payload.projectKey)
    assertEquals("tm_pres_android", payload.presenceId)
    assertEquals("user_123", payload.userId)
    assertEquals("android", payload.platform)
    assertEquals("android", payload.source.type)
    assertEquals("com.example.android", payload.source.packageName)
    assertEquals("CheckoutActivity", payload.path)
    assertEquals("CheckoutActivity", payload.screen)
    assertEquals("heartbeat", payload.state)
    assertEquals(5000, payload.heartbeatIntervalMs)
    assertEquals(120_000, payload.activeDurationMs)
    assertEquals("2026-05-08T01:00:00Z", payload.lastActiveAt)
    assertEquals("idle", payload.activeState)
    assertEquals(60_000, payload.idleTimeoutMs)
  }

  @Test
  fun setScreenStartsANewPresenceSegmentWhenPresenceIsActive() {
    val presences = mutableListOf<TraceMindPresencePayload>()
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = InMemoryIdentityStore(userId = "user_123"),
      presenceSender = { presences.add(it) }
    )

    client.startPresence("HomeActivity", "Home")
    val homePresenceId = presences.last().presenceId
    client.setScreen("Checkout")

    assertEquals(listOf("start", "end", "start"), presences.map { it.state })
    assertEquals("HomeActivity", presences[1].path)
    assertEquals(homePresenceId, presences[1].presenceId)
    assertEquals("Checkout", presences[2].path)
    assertEquals("Checkout", presences[2].screen)
    assertFalse(homePresenceId == presences[2].presenceId)
  }

  @Test
  fun strictActiveDurationStopsAtIdleWindowAndBackground() {
    val presences = mutableListOf<TraceMindPresencePayload>()
    var now = 0L
    val client = TraceMindClient(
      projectKey = "tm_proj_android",
      endpoint = "https://tracemind.example.com/api/capture",
      packageName = "com.example.android",
      appLabel = "Example Android",
      identityStore = InMemoryIdentityStore(userId = "user_123"),
      presenceSender = { presences.add(it) },
      clock = { now }
    )

    client.startPresence("CheckoutActivity", "Checkout")
    now += 90_000
    val idle = client.presencePayload("heartbeat")
    assertEquals(60_000, idle.activeDurationMs)
    assertEquals("idle", idle.activeState)

    client.recordActivity()
    now += 10_000
    val active = client.presencePayload("heartbeat")
    assertEquals(70_000, active.activeDurationMs)
    assertEquals("active", active.activeState)

    now += 20_000
    client.stopPresence("background")
    assertEquals(90_000, presences.last().activeDurationMs)
    assertEquals("inactive", presences.last().activeState)
  }
}
