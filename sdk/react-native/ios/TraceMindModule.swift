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

  @objc func setScreen(_ screen: String) {
    TraceMind.setScreen(screen)
  }

  @objc func setAttribution(_ attribution: NSDictionary) {
    TraceMind.setAttribution(Self.traceMindAttribution(attribution))
  }

  @objc func recordDeepLink(_ payload: NSDictionary) {
    guard let urlValue = payload["url"] as? String, let url = URL(string: urlValue) else { return }
    let sourceApplication = payload["sourceApplication"] as? String
      ?? payload["sourcePackage"] as? String
      ?? payload["referrer"] as? String
    TraceMind.recordOpenURL(url, sourceApplication: sourceApplication)
  }

  @objc func submitFeedback(_ payload: NSDictionary) {
    guard let messageInput = payload["message"] as? NSDictionary else { return }
    let contactInput = messageInput["contact"] as? NSDictionary
    let contact = TraceMindFeedbackContact(
      name: contactInput?["name"] as? String,
      email: contactInput?["email"] as? String,
      phone: contactInput?["phone"] as? String,
      preferredChannel: contactInput?["preferredChannel"] as? String,
      consent: contactInput?["consent"] as? Bool ?? false
    )
    let message = TraceMindFeedbackMessage(
      kind: messageInput["kind"] as? String ?? "other",
      title: messageInput["title"] as? String,
      body: messageInput["body"] as? String ?? "",
      contact: contact,
      fields: Self.traceMindFields(messageInput["fields"])
    )
    Task {
      try? await TraceMind.submitFeedback(
        message: message,
        path: payload["path"] as? String,
        title: payload["title"] as? String
      )
    }
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

  private static func traceMindAttribution(_ value: NSDictionary) -> TraceMindAttribution {
    TraceMindAttribution(
      source: value["source"] as? String,
      medium: value["medium"] as? String,
      campaign: value["campaign"] as? String,
      content: value["content"] as? String,
      referrerDomain: value["referrerDomain"] as? String,
      referrerType: value["referrerType"] as? String,
      landingPath: value["landingPath"] as? String,
      gclidPresent: boolValue(value["gclidPresent"]),
      fbclidPresent: boolValue(value["fbclidPresent"]),
      msclkidPresent: boolValue(value["msclkidPresent"])
    )
  }

  private static func boolValue(_ value: Any?) -> Bool? {
    if let value = value as? Bool { return value }
    if let value = value as? NSNumber { return value.boolValue }
    return nil
  }
}
#endif
