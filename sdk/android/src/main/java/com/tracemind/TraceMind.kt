package com.tracemind

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.EditText
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.ArrayDeque

private const val DEFAULT_CAPTURE_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
private const val DEFAULT_PRESENCE_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/presence"
private const val DEFAULT_FEEDBACK_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/user-feedback"

private fun derivedEndpoint(endpoint: String, replacement: String, fallback: String): String {
  val pathEnd = listOf(
    endpoint.indexOf('?').takeIf { it >= 0 } ?: endpoint.length,
    endpoint.indexOf('#').takeIf { it >= 0 } ?: endpoint.length
  ).minOrNull() ?: endpoint.length
  val pathValue = endpoint.substring(0, pathEnd)
  return if (pathValue.endsWith("/api/capture")) {
    pathValue.removeSuffix("/api/capture") + replacement
  } else {
    fallback
  }
}

private fun stripQueryPath(value: String?, fallback: String = "Application"): String {
  val text = value.orEmpty().ifBlank { fallback }
  if (Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
    return runCatching {
      val url = URL(text)
      val fragment = url.ref?.let { "#$it" } ?: ""
      "${url.path.ifBlank { "/" }}$fragment".take(500)
    }.getOrDefault(fallback)
  }
  return text.split("?", limit = 2).first().ifBlank { fallback }.take(500)
}

private fun cleanErrorField(value: String?, maxLength: Int): String {
  val text = value.orEmpty().trim().replace(Regex("\\s+"), " ").take(maxLength)
  if (text.isBlank()) return ""
  if (Regex("@|https?:|[?&=]|%40|bearer\\s+|api[_-]?key|access[_-]?token|secret|password", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
    return ""
  }
  return text
}

private fun sanitizeErrorMessageForHash(value: String?): String {
  return value.orEmpty()
    .replace(Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE), "[email]")
    .replace(Regex("https?://\\S+\\?\\S+", RegexOption.IGNORE_CASE), "[url]")
    .replace(Regex("\\b(bearer\\s+\\S+|api[_-]?key\\s*[:=]\\s*\\S+|access[_-]?token\\s*[:=]\\s*\\S+|secret\\S*)\\b", RegexOption.IGNORE_CASE), "[secret]")
    .replace(Regex("\\s+"), " ")
    .trim()
    .take(240)
}

private fun sanitizeErrorMessagePreview(value: String?): String {
  val text = value.orEmpty()
    .replace(Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE), "[email]")
    .replace(Regex("https?://\\S+", RegexOption.IGNORE_CASE), "[url]")
    .replace(Regex("(^|\\s)/[^\\s?]+\\?\\S+"), "$1[url]")
    .replace(Regex("\\b(sk-[A-Za-z0-9_-]+|pk_[A-Za-z0-9_-]+|bearer\\s+\\S+|api[_-]?key\\s*[:=]\\s*\\S+|access[_-]?token\\s*[:=]\\s*\\S+|token\\s*[:=]\\s*\\S+|secret\\s*[:=]\\s*\\S+|password\\s*[:=]\\s*\\S+)\\b", RegexOption.IGNORE_CASE), "[redacted]")
    .replace(Regex("\\b\\d{12,19}\\b"), "[number]")
    .replace(Regex("\\s+"), " ")
    .trim()
    .take(160)
  if (text.isBlank()) return ""
  if (Regex("@|https?:|%40|bearer\\s+|api[_-]?key|access[_-]?token|sk-|pk_|secret|password", RegexOption.IGNORE_CASE).containsMatchIn(text)) return ""
  if (Regex("\\b(raw\\s+prompt|raw\\s+user\\s+content|source\\s+diff|request\\s+body|response\\s+body|authorization\\s*:|set-cookie\\s*:)", RegexOption.IGNORE_CASE).containsMatchIn(text)) return ""
  return text
}

private fun diagnosticFingerprint(prefix: String, value: String?): String {
  var hash = 5381UL
  sanitizeErrorMessageForHash(value).forEach { char ->
    hash = ((hash shl 5) + hash) + char.code.toUInt()
  }
  return prefix + hash.toString(36)
}

private fun messageFingerprint(errorType: String, message: String?): String {
  return diagnosticFingerprint("tm_error_", "$errorType:$message")
}

private fun stackText(error: Throwable?): String {
  return error?.stackTrace?.joinToString("\n") { it.toString() }.orEmpty()
}

private fun firstStackFrame(stack: String): String {
  val lines = stack.lines().map { it.trim().replace(Regex("\\s+"), " ") }.filter { it.isNotBlank() }
  return lines.firstOrNull { Regex("^(at\\s+|.*@|.*:\\d+:\\d+)").containsMatchIn(it) && !Regex("^[a-z]*error\\b", RegexOption.IGNORE_CASE).containsMatchIn(it) }
    ?: lines.getOrNull(1)
    ?: lines.firstOrNull()
    ?: ""
}

private fun safeDiagnosticField(properties: Map<String, Any?>, key: String, maxLength: Int = 120): String {
  return cleanErrorField(properties[key] as? String, maxLength)
}

private fun httpStatus(properties: Map<String, Any?>): Int? {
  val value = properties["httpStatus"] ?: properties["statusCode"]
  val status = when (value) {
    is Double -> value.takeIf { it.isFinite() && it % 1.0 == 0.0 }?.toInt()
    is Float -> value.takeIf { it.isFinite() && it % 1f == 0f }?.toInt()
    is Number -> value.toInt()
    is String -> value.toIntOrNull()
    else -> null
  }
  return status?.takeIf { it in 100..599 }
}

private fun sanitizeAppErrorContext(context: Map<String, Any?>): Map<String, Any?> {
  return context.mapNotNull { (key, value) ->
    if (key !in setOf("source", "screen", "release", "component", "status", "occurredAt")) return@mapNotNull null
    val nextValue = when (value) {
      is String -> cleanErrorField(value, 160).takeIf { it.isNotEmpty() }
      is Number -> value
      is Boolean -> value
      else -> null
    } ?: return@mapNotNull null
    key to nextValue
  }.toMap()
}

object TraceMind {
  private var client: TraceMindClient? = null

  @JvmStatic
  fun start(
    application: Application,
    projectKey: String,
    endpoint: String = DEFAULT_CAPTURE_ENDPOINT,
    presenceEndpoint: String = derivedEndpoint(endpoint, "/api/presence", DEFAULT_PRESENCE_ENDPOINT),
    feedbackEndpoint: String = derivedEndpoint(endpoint, "/api/user-feedback", DEFAULT_FEEDBACK_ENDPOINT),
    framework: String = "kotlin",
    sdkVersion: String = TraceMindSDK.VERSION,
    sdkContentHash: String = TraceMindSDK.CONTENT_HASH
  ) {
    client = TraceMindClient(
      projectKey = projectKey,
      endpoint = endpoint,
      presenceEndpoint = presenceEndpoint,
      feedbackEndpoint = feedbackEndpoint,
      packageName = application.packageName,
      appLabel = application.applicationInfo.loadLabel(application.packageManager).toString(),
      framework = framework,
      sdkVersion = sdkVersion,
      sdkContentHash = sdkContentHash,
      identityStore = SharedPreferencesIdentityStore(
        application.getSharedPreferences("tracemind_identity", Context.MODE_PRIVATE)
      )
    )
    application.registerActivityLifecycleCallbacks(TraceMindLifecycleCallbacks(client!!))
  }

  @JvmStatic
  fun setScreen(screen: String) {
    client?.setScreen(screen)
  }

  @JvmStatic
  fun setAttribution(attribution: TraceMindAttribution) {
    client?.setAttribution(attribution)
  }

  @JvmStatic
  fun recordDeepLink(
    url: String?,
    referrer: String? = null,
    sourcePackage: String? = null
  ) {
    client?.recordDeepLink(url = url, referrer = referrer, sourcePackage = sourcePackage)
  }

  @JvmStatic
  fun identify(userId: String, traits: Map<String, Any?> = emptyMap()) {
    client?.identify(userId = userId, traits = traits)
  }

  @JvmStatic
  fun capture(
    type: String,
    eventName: String? = null,
    path: String,
    properties: Map<String, Any?> = emptyMap(),
    context: Map<String, Any?> = emptyMap()
  ) {
    client?.capture(type = type, eventName = eventName, path = path, properties = properties, context = context)
  }

  @JvmStatic
  fun captureError(
    error: Throwable? = null,
    errorType: String? = null,
    message: String? = null,
    path: String = "Application",
    component: String? = null,
    release: String? = null,
    handled: Boolean = true,
    fatal: Boolean = false,
    properties: Map<String, Any?> = emptyMap(),
    context: Map<String, Any?> = emptyMap()
  ) {
    client?.captureError(
      error = error,
      errorType = errorType,
      message = message,
      path = path,
      component = component,
      release = release,
      handled = handled,
      fatal = fatal,
      properties = properties,
      context = context
    )
  }

  @JvmStatic
  fun submitFeedback(
    message: TraceMindFeedbackMessage,
    path: String = "Application",
    title: String? = null
  ) {
    client?.submitFeedback(message = message, path = path, title = title)
  }
}

class TraceMindClient(
  projectKey: String,
  private val endpoint: String,
  private val presenceEndpoint: String = derivedEndpoint(endpoint, "/api/presence", DEFAULT_PRESENCE_ENDPOINT),
  private val feedbackEndpoint: String = derivedEndpoint(endpoint, "/api/user-feedback", DEFAULT_FEEDBACK_ENDPOINT),
  packageName: String,
  appLabel: String,
  framework: String = "kotlin",
  sdkVersion: String = TraceMindSDK.VERSION,
  sdkContentHash: String = TraceMindSDK.CONTENT_HASH,
  identityStore: TraceMindIdentityStore? = null,
  private val maxQueueSize: Int = 100,
  private val presenceSender: ((TraceMindPresencePayload) -> Unit)? = null,
  private val feedbackSender: ((TraceMindUserFeedbackPayload) -> Unit)? = null,
  private val clock: () -> Long = { System.currentTimeMillis() }
) {
  private val queue = ArrayDeque<TraceMindPayload>()
  private val transport = TraceMindHttpTransport(endpoint)
  private val presenceTransport = TraceMindHttpTransport(presenceEndpoint)
  private val feedbackTransport = TraceMindHttpTransport(feedbackEndpoint)
  private val builder = TraceMindPayloadBuilder(
    projectKey = projectKey,
    packageName = packageName,
    appLabel = appLabel,
    framework = framework,
    sdkVersion = sdkVersion,
    sdkContentHash = sdkContentHash,
    identityStore = identityStore ?: InMemoryIdentityStore(
      sessionId = "tm_sess_${uuid()}",
      anonymousId = "tm_anon_${uuid()}",
      deviceId = "tm_dev_${uuid()}"
    )
  )
  private val handler: Handler? = runCatching { Handler(Looper.getMainLooper()) }.getOrNull()
  private var presenceId: String? = null
  private var currentScreen = "Application"
  private val heartbeatIntervalMs = 5000L
  private val activeIdleTimeoutMs = 60_000L
  private var activeDurationMs = 0L
  private var activeStartedAt: Long? = null
  private var lastActiveAt: Long? = null
  private val heartbeatRunnable = object : Runnable {
    override fun run() {
      sendPresence("heartbeat", currentScreen, currentScreen)
      handler?.postDelayed(this, heartbeatIntervalMs)
    }
  }

  fun capture(
    type: String,
    eventName: String? = null,
    path: String,
    title: String? = null,
    target: TraceMindTarget? = null,
    properties: Map<String, Any?> = emptyMap(),
    context: Map<String, Any?> = emptyMap()
  ) {
    recordActivity()
    queue.addLast(builder.payload(type, eventName, path, title, target, properties, context))
    while (queue.size > maxQueueSize) queue.removeFirst()
  }

  fun captureError(
    error: Throwable? = null,
    errorType: String? = null,
    message: String? = null,
    path: String = currentScreen,
    component: String? = null,
    release: String? = null,
    handled: Boolean = true,
    fatal: Boolean = false,
    properties: Map<String, Any?> = emptyMap(),
    context: Map<String, Any?> = emptyMap()
  ) {
    val type = cleanErrorField(errorType ?: error?.javaClass?.simpleName ?: "Error", 80).ifEmpty { "Error" }
    val fingerprint = messageFingerprint(type, message ?: error?.message ?: type)
    val appErrorProperties = mutableMapOf<String, Any?>(
      "errorKind" to "runtime",
      "errorType" to type,
      "messageFingerprint" to fingerprint,
      "fatal" to fatal,
      "handled" to handled,
      "source" to "android",
      "status" to "error"
    )
    cleanErrorField(release ?: properties["release"] as? String, 80).takeIf { it.isNotEmpty() }?.let { appErrorProperties["release"] = it }
    cleanErrorField(component ?: properties["component"] as? String, 120).takeIf { it.isNotEmpty() }?.let { appErrorProperties["component"] = it }
    sanitizeErrorMessagePreview(properties["messagePreview"] as? String ?: message ?: error?.message ?: type).takeIf { it.isNotEmpty() }?.let { appErrorProperties["messagePreview"] = it }
    val stack = (properties["stack"] as? String) ?: (properties["stackTrace"] as? String) ?: stackText(error)
    if (stack.isNotBlank()) {
      appErrorProperties["stackFingerprint"] = diagnosticFingerprint("tm_stack_", stack)
      firstStackFrame(stack).takeIf { it.isNotEmpty() }?.let { appErrorProperties["topFrameFingerprint"] = diagnosticFingerprint("tm_frame_", it) }
    }
    val cause = error?.cause
    cleanErrorField(properties["causeType"] as? String ?: cause?.javaClass?.simpleName, 80).takeIf { it.isNotEmpty() }?.let { appErrorProperties["causeType"] = it }
    val causeMessage = properties["causeMessage"] as? String ?: cause?.message
    if (appErrorProperties.containsKey("causeType") || !causeMessage.isNullOrBlank()) {
      val causeTypeValue = appErrorProperties["causeType"] as? String ?: ""
      appErrorProperties["causeFingerprint"] = diagnosticFingerprint("tm_cause_", "$causeTypeValue:$causeMessage")
    }
    listOf("operation", "feature", "routeName", "correlationId", "requestId").forEach { key ->
      safeDiagnosticField(properties, key).takeIf { it.isNotEmpty() }?.let { appErrorProperties[key] = it }
    }
    httpStatus(properties)?.let { appErrorProperties["httpStatus"] = it }
    capture(
      type = "app_error",
      eventName = "app_error",
      path = stripQueryPath(path, currentScreen),
      properties = appErrorProperties,
      context = sanitizeAppErrorContext(context)
    )
  }

  fun identify(userId: String, traits: Map<String, Any?> = emptyMap()) {
    builder.identify(userId)
    val identifyEventName = "identify"
    capture(type = "custom", eventName = identifyEventName, path = "Identity", properties = traits)
  }

  fun flushPayload(): TraceMindBatch {
    val events = queue.toList()
    queue.clear()
    return TraceMindBatch(projectKey = events.firstOrNull()?.projectKey ?: "", events = events)
  }

  fun flush() {
    val batch = flushPayload()
    if (batch.events.isEmpty()) return
    Thread { transport.send(batch) }.start()
  }

  fun endpoint(): String = endpoint

  fun presenceEndpoint(): String = presenceEndpoint

  fun feedbackEndpoint(): String = feedbackEndpoint

  fun submitFeedback(
    message: TraceMindFeedbackMessage,
    path: String = currentScreen,
    title: String? = null
  ) {
    val payload = builder.userFeedbackPayload(
      message = message,
      path = path,
      title = title,
      occurredAt = Instant.ofEpochMilli(clock()).toString()
    )
    feedbackSender?.invoke(payload) ?: Thread { feedbackTransport.sendUserFeedback(payload) }.start()
  }

  fun setScreen(screen: String) {
    val nextScreen = normalizedScreen(screen)
    if (nextScreen == currentScreen) return
    if (presenceId != null) {
      recordActivity()
      stopPresence("end")
      startPresence(nextScreen, nextScreen, "start")
    } else {
      currentScreen = nextScreen
    }
  }

  fun setAttribution(attribution: TraceMindAttribution) {
    builder.setAttribution(attribution)
  }

  fun recordDeepLink(url: String?, referrer: String? = null, sourcePackage: String? = null) {
    builder.recordDeepLink(url = url, referrer = referrer, sourcePackage = sourcePackage)
  }

  fun startPresence(screen: String, title: String? = null, state: String = "start") {
    currentScreen = normalizedScreen(screen)
    if (presenceId == null) presenceId = "tm_pres_${uuid()}"
    handler?.removeCallbacks(heartbeatRunnable)
    sendPresence(state, currentScreen, title)
    handler?.postDelayed(heartbeatRunnable, heartbeatIntervalMs)
  }

  fun stopPresence(state: String = "end") {
    handler?.removeCallbacks(heartbeatRunnable)
    sendPresence(state, currentScreen, currentScreen)
    presenceId = null
    resetActiveClock()
  }

  fun presencePayload(state: String, path: String = currentScreen, title: String? = null): TraceMindPresencePayload {
    if (presenceId == null) {
      presenceId = "tm_pres_${uuid()}"
      resetActiveClock()
    }
    if (state == "end" || state == "background") {
      pauseActiveWindow()
    } else if (state == "start" || state == "foreground") {
      resumeActiveWindow()
    }
    val now = clock()
    settleActiveWindow(now)
    return builder.presencePayload(
      presenceId = presenceId ?: "",
      state = state,
      path = path,
      title = title,
      activeDurationMs = activeDurationInt(),
      lastActiveAt = lastActiveAt?.let { Instant.ofEpochMilli(it).toString() },
      activeState = activeState(state, now),
      idleTimeoutMs = activeIdleTimeoutMs.toInt(),
      occurredAt = Instant.ofEpochMilli(now).toString()
    )
  }

  private fun sendPresence(state: String, path: String, title: String? = null) {
    val payload = presencePayload(state, path, title)
    presenceSender?.invoke(payload) ?: Thread { presenceTransport.sendPresence(payload) }.start()
  }

  private fun normalizedScreen(screen: String): String {
    val next = screen.take(160)
    return next.ifEmpty { "Application" }
  }

  fun recordActivity() {
    val now = clock()
    settleActiveWindow(now)
    lastActiveAt = now
    if (activeStartedAt == null) activeStartedAt = now
  }

  private fun resumeActiveWindow() {
    val now = clock()
    settleActiveWindow(now)
    lastActiveAt = now
    if (activeStartedAt == null) activeStartedAt = now
  }

  private fun pauseActiveWindow() {
    settleActiveWindow(clock())
    activeStartedAt = null
  }

  private fun settleActiveWindow(now: Long) {
    val startedAt = activeStartedAt ?: return
    val activeLastAt = lastActiveAt ?: return
    val endAt = minOf(now, activeLastAt + activeIdleTimeoutMs)
    if (endAt > startedAt) activeDurationMs += endAt - startedAt
    activeStartedAt = if (endAt < now) null else endAt
  }

  private fun resetActiveClock() {
    activeDurationMs = 0
    activeStartedAt = null
    lastActiveAt = null
  }

  private fun activeDurationInt(): Int {
    return activeDurationMs.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
  }

  private fun activeState(state: String, now: Long): String {
    if (state == "end" || state == "background") return "inactive"
    if (activeStartedAt != null) return "active"
    val activeLastAt = lastActiveAt ?: return "inactive"
    return if (now - activeLastAt >= activeIdleTimeoutMs) "idle" else "inactive"
  }

  private fun uuid(): String = java.util.UUID.randomUUID().toString().replace("-", "")
}

private class TraceMindLifecycleCallbacks(
  private val client: TraceMindClient
) : Application.ActivityLifecycleCallbacks {
  override fun onActivityCreated(activity: Activity, state: Bundle?) {
    activity.window.callback = TraceMindWindowCallback(activity, activity.window.callback, client)
    val deepLinkUrl = activity.intent?.data?.toString()
    val referrer = runCatching { activity.referrer?.toString() }.getOrNull()
    val sourcePackage = activity.callingPackage
    if (!deepLinkUrl.isNullOrBlank() || !referrer.isNullOrBlank() || !sourcePackage.isNullOrBlank()) {
      client.recordDeepLink(url = deepLinkUrl, referrer = referrer, sourcePackage = sourcePackage)
    }
  }

  override fun onActivityResumed(activity: Activity) {
    client.capture(type = "page_view", path = activity.javaClass.simpleName, title = activity.title?.toString())
    client.startPresence(activity.javaClass.simpleName, activity.title?.toString())
  }

  override fun onActivityPaused(activity: Activity) {
    client.stopPresence("background")
    client.flush()
  }

  override fun onActivityStarted(activity: Activity) {}
  override fun onActivityStopped(activity: Activity) {}
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
  override fun onActivityDestroyed(activity: Activity) {}
}

private class TraceMindWindowCallback(
  private val activity: Activity,
  private val delegate: Window.Callback,
  private val client: TraceMindClient
) : Window.Callback by delegate {
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) {
      val target = activity.window.decorView.findDeepestViewAt(event.rawX.toInt(), event.rawY.toInt()) ?: activity.currentFocus
      if (target != null) {
        client.capture(
          type = if (target is EditText) "input" else "click",
          path = activity.javaClass.simpleName,
          target = target.toTraceMindTarget(activity)
        )
      }
    }
    return delegate.dispatchTouchEvent(event)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_UP && event.keyCode == KeyEvent.KEYCODE_ENTER) {
      val target = activity.currentFocus
      if (target is EditText) {
        client.capture(
          type = "submit",
          path = activity.javaClass.simpleName,
          target = target.toTraceMindTarget(activity)
        )
      }
    }
    return delegate.dispatchKeyEvent(event)
  }
}

private fun View.toTraceMindTarget(activity: Activity): TraceMindTarget {
  return TraceMindTarget(
    className = javaClass.simpleName,
    resourceId = runCatching { resources.getResourceEntryName(id) }.getOrNull(),
    label = contentDescription?.toString(),
    screen = activity.javaClass.simpleName,
    path = viewPath()
  )
}

private fun View.viewPath(): String {
  val parts = mutableListOf<String>()
  var node: View? = this
  while (node != null && parts.size < 6) {
    parts.add(0, node.javaClass.simpleName)
    node = node.parent as? View
  }
  return parts.joinToString(">")
}

private class TraceMindHttpTransport(private val endpoint: String) {
  fun send(batch: TraceMindBatch) {
    val connection = (URL(endpoint).openConnection() as HttpURLConnection)
    try {
      connection.requestMethod = "POST"
      connection.setRequestProperty("Content-Type", "application/json")
      connection.doOutput = true
      connection.outputStream.use { stream ->
        stream.write(batch.toJson().toByteArray(Charsets.UTF_8))
      }
      connection.inputStream.close()
    } finally {
      connection.disconnect()
    }
  }

  fun sendPresence(payload: TraceMindPresencePayload) {
    val connection = (URL(endpoint).openConnection() as HttpURLConnection)
    try {
      connection.requestMethod = "POST"
      connection.setRequestProperty("Content-Type", "application/json")
      connection.doOutput = true
      connection.outputStream.use { stream ->
        stream.write(payload.toJson().toByteArray(Charsets.UTF_8))
      }
      connection.inputStream.close()
    } finally {
      connection.disconnect()
    }
  }

  fun sendUserFeedback(payload: TraceMindUserFeedbackPayload) {
    val connection = (URL(endpoint).openConnection() as HttpURLConnection)
    try {
      connection.requestMethod = "POST"
      connection.setRequestProperty("Content-Type", "application/json")
      connection.doOutput = true
      connection.outputStream.use { stream ->
        stream.write(payload.toJson().toByteArray(Charsets.UTF_8))
      }
      connection.inputStream.close()
    } finally {
      connection.disconnect()
    }
  }
}

internal fun TraceMindBatch.toJson(): String {
  return """{"projectKey":"${projectKey.escapeJson()}","events":[${events.joinToString(",") { it.toJson() }}]}"""
}

private fun TraceMindPayload.toJson(): String {
  val fields = mutableListOf(
    """"projectKey":"${projectKey.escapeJson()}"""",
    """"sessionId":"${sessionId.escapeJson()}"""",
    """"anonymousId":"${anonymousId.escapeJson()}"""",
    """"deviceId":"${deviceId.escapeJson()}"""",
    """"deviceFingerprint":"${deviceFingerprint.escapeJson()}"""",
    """"platform":"${platform.escapeJson()}"""",
    """"type":"${type.escapeJson()}"""",
    """"path":"${path.escapeJson()}"""",
    """"occurredAt":"${occurredAt.escapeJson()}"""",
    """"deviceInfo":${deviceInfo.toJson()}""",
    """"source":${source.toJson()}""",
    """"properties":${properties.toJson()}""",
    """"context":${context.toJson()}"""
  )
  eventName?.let { fields.add(""""eventName":"${it.escapeJson()}"""") }
  userId?.let { fields.add(""""userId":"${it.escapeJson()}"""") }
  title?.let { fields.add(""""title":"${it.escapeJson()}"""") }
  target?.let { fields.add(""""target":${it.toJson()}""") }
  targetHash?.let { fields.add(""""targetHash":"${it.escapeJson()}"""") }
  targetIdentity?.let { fields.add(""""targetIdentity":${it.toJson()}""") }
  identitySource?.let { fields.add(""""identitySource":"${it.escapeJson()}"""") }
  identityConfidence?.let { fields.add(""""identityConfidence":"${it.escapeJson()}"""") }
  actionKey?.let { fields.add(""""actionKey":"${it.escapeJson()}"""") }
  attribution?.let { fields.add(""""attribution":${it.toJson()}""") }
  return "{${fields.joinToString(",")}}"
}

private fun TraceMindPresencePayload.toJson(): String {
  val fields = mutableListOf(
    """"projectKey":"${projectKey.escapeJson()}"""",
    """"presenceId":"${presenceId.escapeJson()}"""",
    """"sessionId":"${sessionId.escapeJson()}"""",
    """"anonymousId":"${anonymousId.escapeJson()}"""",
    """"deviceId":"${deviceId.escapeJson()}"""",
    """"deviceFingerprint":"${deviceFingerprint.escapeJson()}"""",
    """"platform":"${platform.escapeJson()}"""",
    """"path":"${path.escapeJson()}"""",
    """"state":"${state.escapeJson()}"""",
    """"heartbeatIntervalMs":$heartbeatIntervalMs""",
    """"activeDurationMs":$activeDurationMs""",
    """"activeState":"${activeState.escapeJson()}"""",
    """"idleTimeoutMs":$idleTimeoutMs""",
    """"occurredAt":"${occurredAt.escapeJson()}"""",
    """"deviceInfo":${deviceInfo.toJson()}""",
    """"source":${source.toJson()}"""
  )
  userId?.let { fields.add(""""userId":"${it.escapeJson()}"""") }
  title?.let { fields.add(""""title":"${it.escapeJson()}"""") }
  screen?.let { fields.add(""""screen":"${it.escapeJson()}"""") }
  lastActiveAt?.let { fields.add(""""lastActiveAt":"${it.escapeJson()}"""") }
  attribution?.let { fields.add(""""attribution":${it.toJson()}""") }
  return "{${fields.joinToString(",")}}"
}

internal fun TraceMindUserFeedbackPayload.toJson(): String {
  val fields = mutableListOf(
    """"projectKey":"${projectKey.escapeJson()}"""",
    """"sessionId":"${sessionId.escapeJson()}"""",
    """"anonymousId":"${anonymousId.escapeJson()}"""",
    """"deviceId":"${deviceId.escapeJson()}"""",
    """"deviceFingerprint":"${deviceFingerprint.escapeJson()}"""",
    """"platform":"${platform.escapeJson()}"""",
    """"path":"${path.escapeJson()}"""",
    """"occurredAt":"${occurredAt.escapeJson()}"""",
    """"deviceInfo":${deviceInfo.toJson()}""",
    """"source":${source.toJson()}""",
    """"message":${message.toJson()}"""
  )
  userId?.let { fields.add(""""userId":"${it.escapeJson()}"""") }
  title?.let { fields.add(""""title":"${it.escapeJson()}"""") }
  return "{${fields.joinToString(",")}}"
}

private fun TraceMindFeedbackMessage.toJson(): String {
  val jsonFields = mutableListOf(
    """"formatVersion":$formatVersion""",
    """"kind":"${kind.escapeJson()}"""",
    """"body":"${body.escapeJson()}"""",
    """"contact":${contact.toJson()}""",
    """"fields":${fields.toJson()}""",
    """"attachments":[${attachments.joinToString(",") { it.toJson() }}]"""
  )
  title?.let { jsonFields.add(""""title":"${it.escapeJson()}"""") }
  return "{${jsonFields.joinToString(",")}}"
}

private fun TraceMindFeedbackContact.toJson(): String {
  val fields = mutableListOf(""""consent":$consent""")
  name?.let { fields.add(""""name":"${it.escapeJson()}"""") }
  email?.let { fields.add(""""email":"${it.escapeJson()}"""") }
  phone?.let { fields.add(""""phone":"${it.escapeJson()}"""") }
  preferredChannel?.let { fields.add(""""preferredChannel":"${it.escapeJson()}"""") }
  return "{${fields.joinToString(",")}}"
}

private fun TraceMindFeedbackAttachment.toJson(): String {
  return """{"name":"${name.escapeJson()}"}"""
}

private fun TraceMindSource.toJson(): String {
  val fields = mutableListOf(
    """"type":"${type.escapeJson()}"""",
    """"label":"${label.escapeJson()}"""",
    """"details":${details.toJson()}"""
  )
  bundleId?.let { fields.add(""""bundleId":"${it.escapeJson()}"""") }
  packageName?.let { fields.add(""""packageName":"${it.escapeJson()}"""") }
  return "{${fields.joinToString(",")}}"
}

private fun TraceMindTarget.toJson(): String {
  val fields = mutableListOf<String>()
  className?.let { fields.add(""""className":"${it.escapeJson()}"""") }
  type?.let { fields.add(""""type":"${it.escapeJson()}"""") }
  accessibilityId?.let { fields.add(""""accessibilityId":"${it.escapeJson()}"""") }
  resourceId?.let { fields.add(""""resourceId":"${it.escapeJson()}"""") }
  testId?.let { fields.add(""""testId":"${it.escapeJson()}"""") }
  label?.let { fields.add(""""label":"${it.escapeJson()}"""") }
  screen?.let { fields.add(""""screen":"${it.escapeJson()}"""") }
  path?.let { fields.add(""""path":"${it.escapeJson()}"""") }
  return "{${fields.joinToString(",")}}"
}

private fun TraceMindTargetIdentity.toJson(): String {
  return """{"key":"${key.escapeJson()}","source":"${source.escapeJson()}","confidence":"${confidence.escapeJson()}"}"""
}

private fun TraceMindAttribution.toJson(): String {
  val fields = mutableListOf<String>()
  source?.let { fields.add(""""source":"${it.escapeJson()}"""") }
  medium?.let { fields.add(""""medium":"${it.escapeJson()}"""") }
  campaign?.let { fields.add(""""campaign":"${it.escapeJson()}"""") }
  content?.let { fields.add(""""content":"${it.escapeJson()}"""") }
  referrerDomain?.let { fields.add(""""referrerDomain":"${it.escapeJson()}"""") }
  referrerType?.let { fields.add(""""referrerType":"${it.escapeJson()}"""") }
  landingPath?.let { fields.add(""""landingPath":"${it.escapeJson()}"""") }
  if (gclidPresent == true) fields.add(""""gclidPresent":true""")
  if (fbclidPresent == true) fields.add(""""fbclidPresent":true""")
  if (msclkidPresent == true) fields.add(""""msclkidPresent":true""")
  return "{${fields.joinToString(",")}}"
}

private fun View.findDeepestViewAt(rawX: Int, rawY: Int): View? {
  if (visibility != View.VISIBLE) return null
  val location = IntArray(2)
  getLocationOnScreen(location)
  val left = location[0]
  val top = location[1]
  val right = left + width
  val bottom = top + height
  if (rawX !in left..right || rawY !in top..bottom) return null

  if (this is ViewGroup) {
    for (index in childCount - 1 downTo 0) {
      val childTarget = getChildAt(index).findDeepestViewAt(rawX, rawY)
      if (childTarget != null) return childTarget
    }
  }
  return this
}

private fun Map<String, *>.toJson(): String {
  return "{${entries.joinToString(",") { """"${it.key.escapeJson()}":${it.value.toJsonValue()}""" }}}"
}

private fun Any?.toJsonValue(): String {
  return when (this) {
    is String -> """"${escapeJson()}""""
    is Number -> toString()
    is Boolean -> if (this) "true" else "false"
    else -> "null"
  }
}

private fun String.escapeJson(): String {
  return replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}
