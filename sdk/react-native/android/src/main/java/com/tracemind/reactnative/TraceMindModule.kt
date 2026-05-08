package com.tracemind.reactnative

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.tracemind.TraceMind

class TraceMindModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "TraceMindModule"

  @ReactMethod
  fun start(config: ReadableMap) {
    val projectKey = config.getString("projectKey") ?: return
    TraceMind.start(
      application = reactContext.applicationContext as android.app.Application,
      projectKey = projectKey,
      endpoint = if (config.hasKey("endpoint")) config.getString("endpoint") ?: DEFAULT_ENDPOINT else DEFAULT_ENDPOINT
    )
  }

  @ReactMethod
  fun capture(type: String, payload: ReadableMap) {
    TraceMind.capture(
      type = type,
      eventName = if (payload.hasKey("eventName")) payload.getString("eventName") else null,
      path = if (payload.hasKey("path")) payload.getString("path") ?: "ReactNative" else "ReactNative",
      properties = readStringMap(payload, "properties")
    )
  }

  private fun readStringMap(payload: ReadableMap, key: String): Map<String, String> {
    if (!payload.hasKey(key)) return emptyMap()
    return payload.getMap(key)?.toHashMap()?.mapValues { it.value.toString() } ?: emptyMap()
  }

  private companion object {
    const val DEFAULT_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
  }
}
