#if canImport(React)
import Foundation
import React
import TraceMind

@objc(TraceMindModule)
final class TraceMindModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func start(_ config: NSDictionary) {
    guard let projectKey = config["projectKey"] as? String else { return }
    if let endpointValue = config["endpoint"] as? String, let endpoint = URL(string: endpointValue) {
      TraceMind.start(projectKey: projectKey, endpoint: endpoint)
    } else {
      TraceMind.start(projectKey: projectKey)
    }
  }

  @objc func capture(_ type: String, payload: NSDictionary) {
    let eventName = payload["eventName"] as? String
    let path = payload["path"] as? String ?? "ReactNative"
    let properties = Self.traceMindFields(payload["properties"])
    let context = Self.traceMindFields(payload["context"])
    try? TraceMind.capture(type, eventName: eventName, path: path, properties: properties, context: context)
  }

  @objc func identify(_ userId: String, traits: NSDictionary) {
    try? TraceMind.identify(userId, traits: Self.traceMindFields(traits))
  }

  private static func traceMindFields(_ value: Any?) -> TraceMindFields {
    guard let fields = value as? NSDictionary else { return [:] }
    var next: TraceMindFields = [:]
    fields.forEach { key, value in
      guard let key = key as? String else { return }
      if let stringValue = value as? String {
        next[key] = .string(stringValue)
        return
      }
      if let numberValue = value as? NSNumber {
        if CFGetTypeID(numberValue) == CFBooleanGetTypeID() {
          next[key] = .bool(numberValue.boolValue)
        } else {
          next[key] = .number(numberValue.doubleValue)
        }
      }
    }
    return next
  }
}
#endif
