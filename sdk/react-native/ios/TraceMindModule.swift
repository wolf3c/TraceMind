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
    let properties = payload["properties"] as? [String: String] ?? [:]
    let context = payload["context"] as? [String: String] ?? [:]
    try? TraceMind.capture(type, eventName: eventName, path: path, properties: properties, context: context)
  }
}
#endif
