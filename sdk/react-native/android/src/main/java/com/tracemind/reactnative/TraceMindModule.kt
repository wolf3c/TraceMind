package com.tracemind.reactnative

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
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
      properties = readPrimitiveMap(payload, "properties"),
      context = readPrimitiveMap(payload, "context")
    )
  }

  @ReactMethod
  fun identify(userId: String, traits: ReadableMap) {
    TraceMind.identify(userId = userId, traits = readPrimitiveMap(traits))
  }

  private fun readPrimitiveMap(payload: ReadableMap, key: String): Map<String, Any?> {
    if (!payload.hasKey(key)) return emptyMap()
    return payload.getMap(key)?.let { readPrimitiveMap(it) } ?: emptyMap()
  }

  private fun readPrimitiveMap(fields: ReadableMap): Map<String, Any?> {
    val next = mutableMapOf<String, Any?>()
    val iterator = fields.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      if (fields.isNull(key)) continue
      when (fields.getType(key)) {
        ReadableType.String -> next[key] = fields.getString(key)
        ReadableType.Number -> next[key] = fields.getDouble(key)
        ReadableType.Boolean -> next[key] = fields.getBoolean(key)
        else -> Unit
      }
    }
    return next
  }

  private companion object {
    const val DEFAULT_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
  }
}
