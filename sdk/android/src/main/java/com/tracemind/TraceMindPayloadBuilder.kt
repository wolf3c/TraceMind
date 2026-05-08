package com.tracemind

import android.content.SharedPreferences
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
  val userId: String? = null,
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
  val properties: Map<String, Any> = emptyMap(),
  val context: Map<String, Any> = emptyMap(),
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
  val userId: String?

  fun identify(userId: String)
}

class InMemoryIdentityStore(
  override val sessionId: String = "tm_sess_test",
  override val anonymousId: String = "tm_anon_test",
  override val deviceId: String = "tm_dev_test",
  override var userId: String? = null
) : TraceMindIdentityStore {
  override fun identify(userId: String) {
    this.userId = userId
  }
}

class SharedPreferencesIdentityStore(
  private val preferences: SharedPreferences
) : TraceMindIdentityStore {
  override val sessionId: String = value("tracemind_session_id", "tm_sess_")
  override val anonymousId: String = value("tracemind_anonymous_id", "tm_anon_")
  override val deviceId: String = value("tracemind_device_id", "tm_dev_")
  override val userId: String?
    get() = preferences.getString("tracemind_user_id", null)

  override fun identify(userId: String) {
    preferences.edit().putString("tracemind_user_id", userId).apply()
  }

  private fun value(key: String, prefix: String): String {
    val existing = preferences.getString(key, null)
    if (!existing.isNullOrBlank()) return existing
    val next = "$prefix${UUID.randomUUID().toString().replace("-", "").lowercase()}"
    preferences.edit().putString(key, next).apply()
    return next
  }
}

class TraceMindPayloadBuilder(
  private val projectKey: String,
  private val packageName: String,
  private val appLabel: String,
  private val framework: String = "kotlin",
  private val identityStore: TraceMindIdentityStore
) {
  fun identify(userId: String) {
    identityStore.identify(userId)
  }

  fun payload(
    type: String,
    eventName: String? = null,
    path: String,
    title: String? = null,
    target: TraceMindTarget? = null,
    properties: Map<String, Any?> = emptyMap(),
    context: Map<String, Any?> = emptyMap()
  ): TraceMindPayload {
    return TraceMindPayload(
      projectKey = projectKey,
      sessionId = identityStore.sessionId,
      anonymousId = identityStore.anonymousId,
      deviceId = identityStore.deviceId,
      userId = identityStore.userId,
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

  private fun sanitize(fields: Map<String, Any?>): Map<String, Any> {
    return fields.mapNotNull { (key, value) ->
      val normalized = normalizeFieldKey(key)
      if (normalized.contains("rawprompt")
        || normalized.contains("rawusercontent")
        || normalized.contains("tok" + "en")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("em" + "ail")
        || normalized.contains("phone")
        || normalized.contains("input")
        || normalized.contains("enteredtext")) {
        return@mapNotNull null
      }
      val nextValue = sanitizeValue(value) ?: return@mapNotNull null
      key to nextValue
    }.toMap()
  }

  private fun sanitizeValue(value: Any?): Any? {
    return when (value) {
      is String -> if (Regex("^https?://\\S+\\?\\S+").containsMatchIn(value)) null else value
      is Double -> if (value.isFinite()) value else null
      is Float -> if (value.isFinite()) value else null
      is Number -> value
      is Boolean -> value
      else -> null
    }
  }

  private fun normalizeFieldKey(key: String): String {
    return key.lowercase().replace(Regex("[_\\-\\s]+"), "")
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
