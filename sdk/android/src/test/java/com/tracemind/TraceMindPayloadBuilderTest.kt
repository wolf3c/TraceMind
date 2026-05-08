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
}
