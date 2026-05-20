package com.tracemind

import android.content.SharedPreferences
import java.net.URI
import java.time.Instant
import java.util.UUID

object TraceMindSDK {
  const val VERSION = "0.1.0"
  const val CONTENT_HASH = "sha256:a4a39f8cc0f1001da9c5d627d2213c087f17b44eefe76ddfa6391c250750fba6"
}

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

data class TraceMindTargetIdentity(
  val key: String,
  val source: String,
  val confidence: String
)

data class TraceMindSource(
  val type: String,
  val bundleId: String? = null,
  val packageName: String? = null,
  val label: String,
  val details: Map<String, String> = emptyMap()
)

data class TraceMindAttribution(
  val source: String? = null,
  val medium: String? = null,
  val campaign: String? = null,
  val content: String? = null,
  val referrerDomain: String? = null,
  val referrerType: String? = null,
  val landingPath: String? = null,
  val gclidPresent: Boolean? = null,
  val fbclidPresent: Boolean? = null,
  val msclkidPresent: Boolean? = null
) {
  fun isEmpty(): Boolean {
    return source == null
      && medium == null
      && campaign == null
      && content == null
      && referrerDomain == null
      && referrerType == null
      && landingPath == null
      && gclidPresent != true
      && fbclidPresent != true
      && msclkidPresent != true
  }

  companion object {
    fun sanitized(
      source: String? = null,
      medium: String? = null,
      campaign: String? = null,
      content: String? = null,
      referrerDomain: String? = null,
      referrerType: String? = null,
      landingPath: String? = null,
      gclidPresent: Boolean? = null,
      fbclidPresent: Boolean? = null,
      msclkidPresent: Boolean? = null
    ): TraceMindAttribution {
      return TraceMindAttribution(
        source = cleanValue(source),
        medium = cleanValue(medium),
        campaign = cleanValue(campaign),
        content = cleanValue(content),
        referrerDomain = cleanDomain(referrerDomain),
        referrerType = cleanReferrerType(referrerType),
        landingPath = cleanPath(landingPath),
        gclidPresent = if (gclidPresent == true) true else null,
        fbclidPresent = if (fbclidPresent == true) true else null,
        msclkidPresent = if (msclkidPresent == true) true else null
      )
    }

    fun fromDeepLink(url: String?, referrer: String? = null, sourcePackage: String? = null): TraceMindAttribution {
      if (url.isNullOrBlank() && referrer.isNullOrBlank() && sourcePackage.isNullOrBlank()) {
        return TraceMindAttribution()
      }
      val parsedUrl = parseUri(url)
      val params = queryParams(parsedUrl)
      val scheme = parsedUrl?.scheme?.lowercase().orEmpty()
      val isWebLink = scheme == "http" || scheme == "https"
      val referrerHost = cleanDomain(sourcePackage) ?: cleanDomain(parseUri(referrer)?.host)
      val sourceValue = cleanValue(params["utm_source"]) ?: referrerHost ?: cleanDomain(parsedUrl?.host) ?: if (isWebLink) "direct" else "deeplink"
      val mediumValue = cleanValue(params["utm_medium"]) ?: if (isWebLink) "app_link" else "deeplink"
      return sanitized(
        source = sourceValue,
        medium = mediumValue,
        campaign = params["utm_campaign"],
        content = params["utm_content"],
        referrerDomain = referrerHost ?: cleanDomain(parsedUrl?.host),
        referrerType = "external",
        landingPath = landingPath(parsedUrl),
        gclidPresent = params.containsKey("gclid"),
        fbclidPresent = params.containsKey("fbclid"),
        msclkidPresent = params.containsKey("msclkid")
      )
    }

    private fun parseUri(value: String?): URI? {
      if (value.isNullOrBlank()) return null
      return runCatching { URI(value) }.getOrNull()
    }

    private fun queryParams(uri: URI?): Map<String, String> {
      val query = uri?.rawQuery ?: return emptyMap()
      return query.split("&").mapNotNull { pair ->
        val parts = pair.split("=", limit = 2)
        val key = parts.getOrNull(0)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        key to (parts.getOrNull(1) ?: "")
      }.toMap()
    }

    private fun landingPath(uri: URI?): String? {
      if (uri == null) return null
      val scheme = uri.scheme?.lowercase().orEmpty()
      var path = uri.path.orEmpty()
      if (path.isEmpty() && scheme != "http" && scheme != "https" && !uri.host.isNullOrBlank()) {
        path = "/${uri.host}"
      }
      if (path.isEmpty()) path = "/"
      if (!uri.fragment.isNullOrBlank()) path += "#${uri.fragment}"
      return cleanPath(path)
    }

    private fun cleanValue(value: String?): String? {
      val text = value.orEmpty().trim().replace(Regex("\\s+"), "-").take(120)
      if (text.isBlank() || text.contains("@") || Regex("https?:|[?&=]|%40", RegexOption.IGNORE_CASE).containsMatchIn(text)) return null
      return if (Regex("^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$").matches(text)) text else null
    }

    private fun cleanDomain(value: String?): String? {
      val domain = value.orEmpty().trim().trim('.').lowercase().take(200)
      if (domain.isBlank() || domain.contains("@") || Regex("[/?#&=]").containsMatchIn(domain)) return null
      return if (Regex("^[a-z0-9.-]+$").matches(domain)) domain else null
    }

    private fun cleanPath(value: String?): String? {
      val raw = value.orEmpty().trim().take(500)
      if (raw.isBlank() || !raw.startsWith("/") || raw.contains("@") || Regex("^https?:", RegexOption.IGNORE_CASE).containsMatchIn(raw)) return null
      return raw.split("?", limit = 2).first()
    }

    private fun cleanReferrerType(value: String?): String? {
      val next = value.orEmpty().lowercase()
      return if (next in setOf("direct", "internal", "external", "search", "social")) next else null
    }
  }
}

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
  val targetIdentity: TraceMindTargetIdentity? = null,
  val identitySource: String? = null,
  val identityConfidence: String? = null,
  val actionKey: String? = null,
  val attribution: TraceMindAttribution? = null,
  val properties: Map<String, Any> = emptyMap(),
  val context: Map<String, Any> = emptyMap(),
  val occurredAt: String = Instant.now().toString()
)

data class TraceMindBatch(
  val projectKey: String,
  val events: List<TraceMindPayload>
)

data class TraceMindPresencePayload(
  val projectKey: String,
  val presenceId: String,
  val sessionId: String,
  val anonymousId: String,
  val deviceId: String,
  val userId: String? = null,
  val deviceFingerprint: String,
  val platform: String,
  val deviceInfo: Map<String, String>,
  val source: TraceMindSource,
  val path: String,
  val title: String? = null,
  val screen: String? = null,
  val state: String,
  val heartbeatIntervalMs: Int = 5000,
  val activeDurationMs: Int = 0,
  val lastActiveAt: String? = null,
  val activeState: String = "inactive",
  val idleTimeoutMs: Int = 60000,
  val attribution: TraceMindAttribution? = null,
  val occurredAt: String = Instant.now().toString()
)

data class TraceMindFeedbackContact(
  val name: String? = null,
  val email: String? = null,
  val phone: String? = null,
  val preferredChannel: String? = null,
  val consent: Boolean = false
)

data class TraceMindFeedbackAttachment(
  val name: String
)

data class TraceMindFeedbackMessage(
  val formatVersion: Int = 1,
  val kind: String = "other",
  val title: String? = null,
  val body: String,
  val contact: TraceMindFeedbackContact = TraceMindFeedbackContact(),
  val fields: Map<String, Any?> = emptyMap(),
  val attachments: List<TraceMindFeedbackAttachment> = emptyList()
)

data class TraceMindUserFeedbackPayload(
  val projectKey: String,
  val sessionId: String,
  val anonymousId: String,
  val deviceId: String,
  val userId: String? = null,
  val deviceFingerprint: String,
  val platform: String,
  val deviceInfo: Map<String, String>,
  val source: TraceMindSource,
  val path: String,
  val title: String? = null,
  val message: TraceMindFeedbackMessage,
  val occurredAt: String = Instant.now().toString()
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
  private val sdkVersion: String = TraceMindSDK.VERSION,
  private val sdkContentHash: String = TraceMindSDK.CONTENT_HASH,
  private val identityStore: TraceMindIdentityStore
) {
  private var attribution: TraceMindAttribution? = null

  private fun sourceDetails(): Map<String, String> {
    return mapOf(
      "framework" to framework,
      "sdkVersion" to sdkVersion,
      "sdkContentHash" to sdkContentHash
    )
  }

  fun identify(userId: String) {
    identityStore.identify(userId)
  }

  fun setAttribution(nextAttribution: TraceMindAttribution) {
    attribution = nextAttribution.takeUnless { it.isEmpty() }
  }

  fun recordDeepLink(url: String?, referrer: String? = null, sourcePackage: String? = null) {
    setAttribution(TraceMindAttribution.fromDeepLink(url, referrer, sourcePackage))
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
    val targetIdentity = target?.let { targetIdentity(it) }
    val actionKey = targetIdentity?.let { actionKey(path, type, it) }
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
        details = sourceDetails()
      ),
      type = type,
      eventName = eventName,
      path = path,
      title = title,
      target = target,
      targetHash = target?.let { hash(targetIdentity?.key ?: targetHashSource(it), "tm_target_") },
      targetIdentity = targetIdentity,
      identitySource = targetIdentity?.source,
      identityConfidence = targetIdentity?.confidence,
      actionKey = actionKey,
      attribution = attribution,
      properties = sanitize(properties),
      context = sanitize(context)
    )
  }

  fun presencePayload(
    presenceId: String,
    state: String,
    path: String,
    title: String? = null,
    activeDurationMs: Int = 0,
    lastActiveAt: String? = null,
    activeState: String = "inactive",
    idleTimeoutMs: Int = 60000,
    occurredAt: String = Instant.now().toString()
  ): TraceMindPresencePayload {
    return TraceMindPresencePayload(
      projectKey = projectKey,
      presenceId = presenceId,
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
        details = sourceDetails()
      ),
      path = path,
      title = title,
      screen = path,
      state = state,
      activeDurationMs = activeDurationMs,
      lastActiveAt = lastActiveAt,
      activeState = activeState,
      idleTimeoutMs = idleTimeoutMs,
      attribution = attribution,
      occurredAt = occurredAt
    )
  }

  fun userFeedbackPayload(
    message: TraceMindFeedbackMessage,
    path: String,
    title: String? = null,
    occurredAt: String = Instant.now().toString()
  ): TraceMindUserFeedbackPayload {
    return TraceMindUserFeedbackPayload(
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
        details = sourceDetails()
      ),
      path = path,
      title = title,
      message = sanitizeFeedbackMessage(message),
      occurredAt = occurredAt
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

  private fun sanitizeFeedbackMessage(message: TraceMindFeedbackMessage): TraceMindFeedbackMessage {
    val kind = if (message.kind in setOf("issue", "idea", "question", "other")) message.kind else "other"
    return message.copy(
      kind = kind,
      title = message.title?.take(160),
      body = message.body.take(4000),
      contact = if (message.contact.consent) message.contact else TraceMindFeedbackContact(consent = false),
      fields = sanitizeFeedbackFields(message.fields),
      attachments = emptyList()
    )
  }

  private fun sanitizeFeedbackFields(fields: Map<String, Any?>): Map<String, Any> {
    return fields.mapNotNull { (key, value) ->
      val normalized = normalizeFieldKey(key)
      if (normalized.contains("rawprompt")
        || normalized.contains("rawusercontent")
        || normalized.contains("rawrequestbody")
        || normalized.contains("requestbody")
        || normalized.contains("rawresponsebody")
        || normalized.contains("responsebody")
        || normalized.contains("headers")
        || normalized.contains("cookies")
        || normalized.contains("authorization")
        || normalized.contains("tok" + "en")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("sourcecode")
        || normalized.contains("sourcediff")
        || normalized.contains("codediff")
        || normalized.contains("toolarguments")
        || normalized.contains("toolresult")
        || normalized.contains("resourcecontent")) {
        return@mapNotNull null
      }
      val nextValue = sanitizeValue(value) ?: return@mapNotNull null
      if (nextValue is String && Regex("""https?://[^\s?#]+[^\s]*\?[^\s"'<>)]*|\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token|raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body)\b""", RegexOption.IGNORE_CASE).containsMatchIn(nextValue)) {
        return@mapNotNull null
      }
      key to nextValue
    }.toMap()
  }

  private fun sanitizeValue(value: Any?): Any? {
    return when (value) {
      is String -> if (Regex("""https?://[^\s?#]+[^\s]*\?[^\s"'<>)]*""").containsMatchIn(value)) null else value
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

  private fun targetIdentity(target: TraceMindTarget): TraceMindTargetIdentity {
    return when {
      !target.testId.isNullOrBlank() -> TraceMindTargetIdentity("target:testId:${target.testId}", "testId", "high")
      !target.accessibilityId.isNullOrBlank() -> TraceMindTargetIdentity("target:accessibilityId:${target.accessibilityId}", "accessibilityId", "high")
      !target.resourceId.isNullOrBlank() -> TraceMindTargetIdentity("target:resourceId:${target.resourceId}", "resourceId", "high")
      !target.label.isNullOrBlank() -> TraceMindTargetIdentity("target:label:${target.screen.orEmpty()}:${target.label}", "label", "medium")
      !target.path.isNullOrBlank() -> TraceMindTargetIdentity("target:path:${target.screen.orEmpty()}:${target.path}", "path", "low")
      else -> TraceMindTargetIdentity("target:class:${target.screen.orEmpty()}:${target.className.orEmpty()}", "className", "low")
    }
  }

  private fun actionKey(path: String, type: String, identity: TraceMindTargetIdentity): String {
    return listOf("android", path, type, identity.key).joinToString(":")
  }

  private fun hash(value: String, prefix: String): String {
    var h = 5381UL
    value.forEach { char ->
      h = ((h shl 5) + h) + char.code.toUInt()
    }
    return prefix + h.toString(36)
  }
}
