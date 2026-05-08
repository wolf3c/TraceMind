import Foundation

public struct TraceMindConfiguration {
  public let projectKey: String
  public let endpoint: URL
  public let sourceKey: String
  public let sourceLabel: String
  public let framework: String

  public init(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!,
    sourceKey: String = Bundle.main.bundleIdentifier ?? "unknown",
    sourceLabel: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? Bundle.main.bundleIdentifier ?? "unknown",
    framework: String = "swift"
  ) {
    self.projectKey = projectKey
    self.endpoint = endpoint
    self.sourceKey = sourceKey
    self.sourceLabel = sourceLabel
    self.framework = framework
  }
}

public struct TraceMindTarget: Codable {
  public let className: String?
  public let type: String?
  public let accessibilityId: String?
  public let resourceId: String?
  public let testId: String?
  public let label: String?
  public let screen: String?
  public let path: String?

  public init(
    className: String? = nil,
    type: String? = nil,
    accessibilityId: String? = nil,
    resourceId: String? = nil,
    testId: String? = nil,
    label: String? = nil,
    screen: String? = nil,
    path: String? = nil
  ) {
    self.className = className
    self.type = type
    self.accessibilityId = accessibilityId
    self.resourceId = resourceId
    self.testId = testId
    self.label = label
    self.screen = screen
    self.path = path
  }
}

public struct TraceMindSource: Codable {
  public let type: String
  public let bundleId: String?
  public let packageName: String?
  public let label: String
  public let details: [String: String]
}

public struct TraceMindPayload: Codable {
  public let projectKey: String
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String
  public let deviceFingerprint: String
  public let platform: String
  public let deviceInfo: [String: String]
  public let source: TraceMindSource
  public let type: String
  public let eventName: String?
  public let path: String
  public let title: String?
  public let target: TraceMindTarget?
  public let targetHash: String?
  public let properties: [String: String]
  public let context: [String: String]
  public let occurredAt: String
}

public struct TraceMindBatch: Codable {
  public let projectKey: String
  public let events: [TraceMindPayload]
}

public protocol TraceMindIdentityStore {
  var sessionId: String { get }
  var anonymousId: String { get }
  var deviceId: String { get }
}

public final class InMemoryIdentityStore: TraceMindIdentityStore {
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String

  public init(
    sessionId: String = "tm_sess_test",
    anonymousId: String = "tm_anon_test",
    deviceId: String = "tm_dev_test"
  ) {
    self.sessionId = sessionId
    self.anonymousId = anonymousId
    self.deviceId = deviceId
  }
}

public final class UserDefaultsIdentityStore: TraceMindIdentityStore {
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String

  public init(defaults: UserDefaults = .standard) {
    self.sessionId = Self.value(defaults: defaults, key: "tracemind_session_id", prefix: "tm_sess_")
    self.anonymousId = Self.value(defaults: defaults, key: "tracemind_anonymous_id", prefix: "tm_anon_")
    self.deviceId = Self.value(defaults: defaults, key: "tracemind_device_id", prefix: "tm_dev_")
  }

  private static func value(defaults: UserDefaults, key: String, prefix: String) -> String {
    if let existing = defaults.string(forKey: key), !existing.isEmpty {
      return existing
    }
    let next = "\(prefix)\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
    defaults.set(next, forKey: key)
    return next
  }
}

public protocol TraceMindTransport {
  func send(batch: TraceMindBatch, endpoint: URL) async throws
}

public struct URLSessionTraceMindTransport: TraceMindTransport {
  public init() {}

  public func send(batch: TraceMindBatch, endpoint: URL) async throws {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder.traceMind.encode(batch)
    _ = try await URLSession.shared.data(for: request)
  }
}

public final class TraceMindClient {
  public let configuration: TraceMindConfiguration
  private let identityStore: TraceMindIdentityStore
  private let transport: TraceMindTransport
  private let maxQueueSize: Int
  private var queue: [TraceMindPayload] = []

  public init(
    configuration: TraceMindConfiguration,
    identityStore: TraceMindIdentityStore = UserDefaultsIdentityStore(),
    transport: TraceMindTransport = URLSessionTraceMindTransport(),
    maxQueueSize: Int = 100
  ) {
    self.configuration = configuration
    self.identityStore = identityStore
    self.transport = transport
    self.maxQueueSize = maxQueueSize
  }

  public func makePayload(
    type: String,
    eventName: String? = nil,
    path: String,
    title: String? = nil,
    target: TraceMindTarget? = nil,
    properties: [String: String] = [:],
    context: [String: String] = [:]
  ) throws -> TraceMindPayload {
    let targetHash = try target.map { try Self.hashTarget($0) }
    return TraceMindPayload(
      projectKey: configuration.projectKey,
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      deviceFingerprint: Self.hash("ios:\(configuration.sourceKey):\(identityStore.deviceId)", prefix: "tm_fp_"),
      platform: "ios",
      deviceInfo: [
        "os": "iOS",
        "framework": configuration.framework,
      ],
      source: TraceMindSource(
        type: "ios",
        bundleId: configuration.sourceKey,
        packageName: nil,
        label: configuration.sourceLabel,
        details: ["framework": configuration.framework]
      ),
      type: type,
      eventName: eventName,
      path: path,
      title: title,
      target: target,
      targetHash: targetHash,
      properties: Self.sanitize(properties),
      context: Self.sanitize(context),
      occurredAt: ISO8601DateFormatter.traceMind.string(from: Date())
    )
  }

  public func capture(
    type: String,
    eventName: String? = nil,
    path: String,
    title: String? = nil,
    target: TraceMindTarget? = nil,
    properties: [String: String] = [:],
    context: [String: String] = [:]
  ) throws {
    queue.append(try makePayload(
      type: type,
      eventName: eventName,
      path: path,
      title: title,
      target: target,
      properties: properties,
      context: context
    ))
    if queue.count > maxQueueSize {
      queue.removeFirst(queue.count - maxQueueSize)
    }
  }

  public func flush() async throws {
    let events = queue
    queue.removeAll(keepingCapacity: true)
    if events.isEmpty { return }
    try await transport.send(
      batch: TraceMindBatch(projectKey: configuration.projectKey, events: events),
      endpoint: configuration.endpoint
    )
  }

  private static func hashTarget(_ target: TraceMindTarget) throws -> String {
    let data = try JSONEncoder.traceMind.encode(target)
    return hash(String(decoding: data, as: UTF8.self), prefix: "tm_target_")
  }

  static func hash(_ value: String, prefix: String) -> String {
    var h: UInt32 = 5381
    for scalar in value.unicodeScalars {
      h = h &* 33 &+ UInt32(scalar.value)
    }
    return "\(prefix)\(String(h, radix: 36))"
  }

  static func sanitize(_ fields: [String: String]) -> [String: String] {
    fields.filter { key, value in
      let normalized = key.lowercased()
      if normalized.contains("rawprompt")
        || normalized.contains("rawusercontent")
        || normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("email")
        || normalized.contains("phone")
        || normalized.contains("input")
        || normalized.contains("enteredtext") {
        return false
      }
      return value.range(of: #"^https?://\S+\?\S+"#, options: .regularExpression) == nil
    }
  }
}

public enum TraceMind {
  private static var client: TraceMindClient?

  public static func start(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!
  ) {
    let nextClient = TraceMindClient(configuration: TraceMindConfiguration(projectKey: projectKey, endpoint: endpoint))
    client = nextClient
    TraceMindAutoCapture.start(client: nextClient)
  }

  public static func capture(
    _ type: String,
    eventName: String? = nil,
    path: String,
    properties: [String: String] = [:],
    context: [String: String] = [:]
  ) throws {
    try client?.capture(type: type, eventName: eventName, path: path, properties: properties, context: context)
  }
}

private extension JSONEncoder {
  static let traceMind: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return encoder
  }()
}

private extension ISO8601DateFormatter {
  static let traceMind = ISO8601DateFormatter()
}

#if canImport(UIKit)
import UIKit

final class TraceMindAutoCapture {
  private static weak var client: TraceMindClient?

  static func start(client: TraceMindClient) {
    self.client = client
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(textDidChange(_:)),
      name: UITextField.textDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(textDidChange(_:)),
      name: UITextView.textDidChangeNotification,
      object: nil
    )
  }

  @objc private static func appDidBecomeActive() {
    try? client?.capture(type: "page_view", path: "Application", title: "Application")
  }

  @objc private static func textDidChange(_ notification: Notification) {
    guard let view = notification.object as? UIView else { return }
    try? client?.capture(
      type: "input",
      path: screenName(for: view),
      target: target(for: view)
    )
  }

  static func recordTap(view: UIView) {
    try? client?.capture(
      type: "click",
      path: screenName(for: view),
      target: target(for: view)
    )
  }

  private static func target(for view: UIView) -> TraceMindTarget {
    TraceMindTarget(
      className: String(describing: type(of: view)),
      accessibilityId: view.accessibilityIdentifier,
      label: view.accessibilityLabel,
      screen: screenName(for: view),
      path: viewPath(view)
    )
  }

  private static func screenName(for view: UIView) -> String {
    var responder: UIResponder? = view
    while let current = responder {
      if let controller = current as? UIViewController {
        return String(describing: type(of: controller))
      }
      responder = current.next
    }
    return "Application"
  }

  private static func viewPath(_ view: UIView) -> String {
    var parts: [String] = []
    var current: UIView? = view
    while let item = current, parts.count < 6 {
      let index = item.superview?.subviews.firstIndex(of: item) ?? 0
      parts.insert("\(String(describing: type(of: item)))[\(index)]", at: 0)
      current = item.superview
    }
    return parts.joined(separator: ">")
  }
}
#else
final class TraceMindAutoCapture {
  static func start(client: TraceMindClient) {}
}
#endif
