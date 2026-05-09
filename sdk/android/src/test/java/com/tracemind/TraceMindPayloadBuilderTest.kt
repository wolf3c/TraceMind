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
    assertFalse(payload.properties.containsKey("inputValue"))
    assertEquals("pro", payload.properties["plan"])
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
      title = "Checkout"
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
}
