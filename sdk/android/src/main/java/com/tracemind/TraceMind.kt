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
import android.view.Window
import android.widget.EditText
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayDeque

object TraceMind {
  private var client: TraceMindClient? = null

  @JvmStatic
  fun start(
    application: Application,
    projectKey: String,
    endpoint: String = "https://tracemind.sandbox.galaxycloud.app/api/capture",
    presenceEndpoint: String = endpoint.replace("/api/capture", "/api/presence")
  ) {
    client = TraceMindClient(
      projectKey = projectKey,
      endpoint = endpoint,
      presenceEndpoint = presenceEndpoint,
      packageName = application.packageName,
      appLabel = application.applicationInfo.loadLabel(application.packageManager).toString(),
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
}

class TraceMindClient(
  projectKey: String,
  private val endpoint: String,
  private val presenceEndpoint: String = endpoint.replace("/api/capture", "/api/presence"),
  packageName: String,
  appLabel: String,
  identityStore: TraceMindIdentityStore? = null,
  private val maxQueueSize: Int = 100,
  private val presenceSender: ((TraceMindPresencePayload) -> Unit)? = null
) {
  private val queue = ArrayDeque<TraceMindPayload>()
  private val transport = TraceMindHttpTransport(endpoint)
  private val presenceTransport = TraceMindHttpTransport(presenceEndpoint)
  private val builder = TraceMindPayloadBuilder(
    projectKey = projectKey,
    packageName = packageName,
    appLabel = appLabel,
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
    queue.addLast(builder.payload(type, eventName, path, title, target, properties, context))
    while (queue.size > maxQueueSize) queue.removeFirst()
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

  fun setScreen(screen: String) {
    val nextScreen = normalizedScreen(screen)
    if (nextScreen == currentScreen) return
    if (presenceId != null) {
      stopPresence("end")
      startPresence(nextScreen, nextScreen, "start")
    } else {
      currentScreen = nextScreen
    }
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
  }

  fun presencePayload(state: String, path: String = currentScreen, title: String? = null): TraceMindPresencePayload {
    if (presenceId == null) presenceId = "tm_pres_${uuid()}"
    return builder.presencePayload(
      presenceId = presenceId ?: "",
      state = state,
      path = path,
      title = title
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

  private fun uuid(): String = java.util.UUID.randomUUID().toString().replace("-", "")
}

private class TraceMindLifecycleCallbacks(
  private val client: TraceMindClient
) : Application.ActivityLifecycleCallbacks {
  override fun onActivityCreated(activity: Activity, state: Bundle?) {
    activity.window.callback = TraceMindWindowCallback(activity, activity.window.callback, client)
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
      val target = activity.currentFocus
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
    """"occurredAt":"${occurredAt.escapeJson()}"""",
    """"deviceInfo":${deviceInfo.toJson()}""",
    """"source":${source.toJson()}"""
  )
  userId?.let { fields.add(""""userId":"${it.escapeJson()}"""") }
  title?.let { fields.add(""""title":"${it.escapeJson()}"""") }
  screen?.let { fields.add(""""screen":"${it.escapeJson()}"""") }
  return "{${fields.joinToString(",")}}"
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
