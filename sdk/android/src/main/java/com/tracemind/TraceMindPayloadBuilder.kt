package com.tracemind

import java.time.Instant
import java.util.UUID

data class TraceMindTarget(
  val className: String? = null,
  val type: String? = null,
  val accessibilityId: String? = null,
  val resourceId: String? = null,
  val testId: String? = null,
  val label: String? = null,
  val screen: String? = null,
  val path: String? = null
)

data class TraceMindSource(
  val type: String,
  val bundleId: String? = null,
  val packageName: String? = null,
  val label: String,
  val details: Map<String, String> = emptyMap()
)

data class TraceMindPayload(
  val projectKey: String,
  val sessionId: String,
  val anonymousId: String,
  val deviceId: String,
  val deviceFingerprint: String,
  val platform: String,
  val deviceInfo: Map<String, String>,
  val source: TraceMindSource,
  val type: String,
  val eventName: String? = null,
  val path: String,
  val title: String? = null,
  val target: TraceMindTarget? = null,
  val targetHash: String? = null,
  val properties: Map<String, String> = emptyMap(),
  val context: Map<String, String> = emptyMap(),
  val occurredAt: String = Instant.now().toString()
)

data class TraceMindBatch(
  val projectKey: String,
  val events: List<TraceMindPayload>
)

interface TraceMindIdentityStore {
  val sessionId: String
  val anonymousId: String
  val deviceId: String
}

class InMemoryIdentityStore(
  override val sessionId: String = "tm_sess_test",
  override val anonymousId: String = "tm_anon_test",
  override val deviceId: String = "tm_dev_test"
) : TraceMindIdentityStore

class TraceMindPayloadBuilder(
  private val projectKey: String,
  private val packageName: String,
  private val appLabel: String,
  private val framework: String = "kotlin",
  private val identityStore: TraceMindIdentityStore
) {
  fun payload(
    type: String,
    eventName: String? = null,
    path: String,
    title: String? = null,
    target: TraceMindTarget? = null,
    properties: Map<String, String> = emptyMap(),
    context: Map<String, String> = emptyMap()
  ): TraceMindPayload {
    return TraceMindPayload(
      projectKey = projectKey,
      sessionId = identityStore.sessionId,
      anonymousId = identityStore.anonymousId,
      deviceId = identityStore.deviceId,
      deviceFingerprint = hash("android:$packageName:${identityStore.deviceId}", "tm_fp_"),
      platform = "android",
      deviceInfo = mapOf("os" to "Android", "framework" to framework),
      source = TraceMindSource(
        type = "android",
        packageName = packageName,
        label = appLabel,
        details = mapOf("framework" to framework)
      ),
      type = type,
      eventName = eventName,
      path = path,
      title = title,
      target = target,
      targetHash = target?.let { hash(targetHashSource(it), "tm_target_") },
      properties = sanitize(properties),
      context = sanitize(context)
    )
  }

  private fun sanitize(fields: Map<String, String>): Map<String, String> {
    return fields.filterKeys { key ->
      val normalized = key.lowercase()
      !normalized.contains("rawprompt")
        && !normalized.contains("rawusercontent")
        && !normalized.contains("token")
        && !normalized.contains("secret")
        && !normalized.contains("password")
        && !normalized.contains("email")
        && !normalized.contains("phone")
        && !normalized.contains("input")
    }.filterValues { value ->
      !Regex("^https?://\\S+\\?\\S+").containsMatchIn(value)
    }
  }

  private fun targetHashSource(target: TraceMindTarget): String {
    return listOf(
      target.className,
      target.type,
      target.accessibilityId,
      target.resourceId,
      target.testId,
      target.label,
      target.screen,
      target.path
    ).joinToString("|") { it ?: "" }
  }

  private fun hash(value: String, prefix: String): String {
    var h = 5381UL
    value.forEach { char ->
      h = ((h shl 5) + h) + char.code.toUInt()
    }
    return prefix + h.toString(36)
  }
}
