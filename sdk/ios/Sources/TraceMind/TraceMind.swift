import Foundation

public struct TraceMindConfiguration {
  public let projectKey: String
  public let endpoint: URL
  public let presenceEndpoint: URL
  public let sourceKey: String
  public let sourceLabel: String
  public let framework: String

  public init(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!,
    presenceEndpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/presence")!,
    sourceKey: String = Bundle.main.bundleIdentifier ?? "unknown",
    sourceLabel: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? Bundle.main.bundleIdentifier ?? "unknown",
    framework: String = "swift"
  ) {
    self.projectKey = projectKey
    self.endpoint = endpoint
    self.presenceEndpoint = presenceEndpoint
    self.sourceKey = sourceKey
    self.sourceLabel = sourceLabel
    self.framework = framework
  }
}

public enum TraceMindValue: Codable, Equatable,
  ExpressibleByStringLiteral,
  ExpressibleByIntegerLiteral,
  ExpressibleByFloatLiteral,
  ExpressibleByBooleanLiteral
{
  case string(String)
  case number(Double)
  case bool(Bool)

  public init(stringLiteral value: String) {
    self = .string(value)
  }

  public init(integerLiteral value: Int) {
    self = .number(Double(value))
  }

  public init(floatLiteral value: Double) {
    self = .number(value)
  }

  public init(booleanLiteral value: Bool) {
    self = .bool(value)
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .bool(let value):
      try container.encode(value)
    }
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let value = try? container.decode(Bool.self) {
      self = .bool(value)
      return
    }
    if let value = try? container.decode(Double.self) {
      self = .number(value)
      return
    }
    self = .string(try container.decode(String.self))
  }
}

public typealias TraceMindFields = [String: TraceMindValue]

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
  public let userId: String?
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
  public let properties: TraceMindFields
  public let context: TraceMindFields
  public let occurredAt: String
}

public struct TraceMindBatch: Codable {
  public let projectKey: String
  public let events: [TraceMindPayload]
}

public struct TraceMindPresencePayload: Codable {
  public let projectKey: String
  public let presenceId: String
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String
  public let userId: String?
  public let deviceFingerprint: String
  public let platform: String
  public let deviceInfo: [String: String]
  public let source: TraceMindSource
  public let path: String
  public let title: String?
  public let screen: String?
  public let state: String
  public let heartbeatIntervalMs: Int
  public let occurredAt: String
}

public protocol TraceMindIdentityStore {
  var sessionId: String { get }
  var anonymousId: String { get }
  var deviceId: String { get }
  var userId: String? { get }

  func identify(userId: String)
}

public final class InMemoryIdentityStore: TraceMindIdentityStore {
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String
  public private(set) var userId: String?

  public init(
    sessionId: String = "tm_sess_test",
    anonymousId: String = "tm_anon_test",
    deviceId: String = "tm_dev_test",
    userId: String? = nil
  ) {
    self.sessionId = sessionId
    self.anonymousId = anonymousId
    self.deviceId = deviceId
    self.userId = userId
  }

  public func identify(userId: String) {
    self.userId = userId
  }
}

public final class UserDefaultsIdentityStore: TraceMindIdentityStore {
  public let sessionId: String
  public let anonymousId: String
  public let deviceId: String
  private let defaults: UserDefaults

  public var userId: String? {
    defaults.string(forKey: "tracemind_user_id")
  }

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    self.sessionId = Self.value(defaults: defaults, key: "tracemind_session_id", prefix: "tm_sess_")
    self.anonymousId = Self.value(defaults: defaults, key: "tracemind_anonymous_id", prefix: "tm_anon_")
    self.deviceId = Self.value(defaults: defaults, key: "tracemind_device_id", prefix: "tm_dev_")
  }

  public func identify(userId: String) {
    defaults.set(userId, forKey: "tracemind_user_id")
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
  func sendPresence(payload: TraceMindPresencePayload, endpoint: URL) async throws
}

public extension TraceMindTransport {
  func sendPresence(payload: TraceMindPresencePayload, endpoint: URL) async throws {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder.traceMind.encode(payload)
    _ = try await URLSession.shared.data(for: request)
  }
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
  private var presenceId: String?
  private var currentScreen = "Application"
  private let heartbeatIntervalMs = 5_000

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
    properties: TraceMindFields = [:],
    context: TraceMindFields = [:]
  ) throws -> TraceMindPayload {
    let targetHash = try target.map { try Self.hashTarget($0) }
    return TraceMindPayload(
      projectKey: configuration.projectKey,
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      userId: identityStore.userId,
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

  public func makePresencePayload(state: String, path: String? = nil, title: String? = nil) -> TraceMindPresencePayload {
    if presenceId == nil {
      presenceId = "tm_pres_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
    }
    let screen = path ?? currentScreen
    return TraceMindPresencePayload(
      projectKey: configuration.projectKey,
      presenceId: presenceId ?? "",
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      userId: identityStore.userId,
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
      path: screen,
      title: title,
      screen: screen,
      state: state,
      heartbeatIntervalMs: heartbeatIntervalMs,
      occurredAt: ISO8601DateFormatter.traceMind.string(from: Date())
    )
  }

  public func sendPresence(state: String, path: String? = nil, title: String? = nil) async throws {
    let payload = makePresencePayload(state: state, path: path, title: title)
    try await transport.sendPresence(payload: payload, endpoint: configuration.presenceEndpoint)
    if state == "end" || state == "background" {
      presenceId = nil
    }
  }

  public func setScreen(_ screen: String) {
    currentScreen = Self.normalizedScreen(screen)
  }

  func switchPresenceScreen(_ screen: String) async throws {
    let nextScreen = Self.normalizedScreen(screen)
    if nextScreen == currentScreen { return }
    let previousScreen = currentScreen
    if presenceId != nil {
      try await sendPresence(state: "end", path: previousScreen, title: previousScreen)
      currentScreen = nextScreen
      try await sendPresence(state: "start", path: nextScreen, title: nextScreen)
    } else {
      currentScreen = nextScreen
    }
  }

  public func capture(
    type: String,
    eventName: String? = nil,
    path: String,
    title: String? = nil,
    target: TraceMindTarget? = nil,
    properties: TraceMindFields = [:],
    context: TraceMindFields = [:]
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

  public func identify(_ userId: String, traits: TraceMindFields = [:]) throws {
    identityStore.identify(userId: userId)
    let identifyEventName = "identify"
    try capture(
      type: "custom",
      eventName: identifyEventName,
      path: "Identity",
      properties: traits
    )
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

  static func sanitize(_ fields: TraceMindFields) -> TraceMindFields {
    fields.filter { key, value in
      let normalized = normalizeFieldKey(key)
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
      if case .string(let stringValue) = value {
        return stringValue.range(of: #"^https?://\S+\?\S+"#, options: .regularExpression) == nil
      }
      if case .number(let numberValue) = value {
        return numberValue.isFinite
      }
      return true
    }
  }

  private static func normalizeFieldKey(_ key: String) -> String {
    key.lowercased().replacingOccurrences(of: #"[_\-\s]+"#, with: "", options: .regularExpression)
  }

  private static func normalizedScreen(_ screen: String) -> String {
    let next = String(screen.prefix(160))
    return next.isEmpty ? "Application" : next
  }
}

public enum TraceMind {
  private static var client: TraceMindClient?

  public static func start(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!
  ) {
    let presenceEndpoint = URL(string: endpoint.absoluteString.replacingOccurrences(of: "/api/capture", with: "/api/presence"))
      ?? URL(string: "https://tracemind.sandbox.galaxycloud.app/api/presence")!
    let nextClient = TraceMindClient(configuration: TraceMindConfiguration(
      projectKey: projectKey,
      endpoint: endpoint,
      presenceEndpoint: presenceEndpoint
    ))
    client = nextClient
    TraceMindAutoCapture.start(client: nextClient)
  }

  public static func capture(
    _ type: String,
    eventName: String? = nil,
    path: String,
    properties: TraceMindFields = [:],
    context: TraceMindFields = [:]
  ) throws {
    try client?.capture(type: type, eventName: eventName, path: path, properties: properties, context: context)
  }

  public static func setScreen(_ screen: String) {
    client?.setScreen(screen)
    TraceMindAutoCapture.setScreen(screen)
  }

  public static func identify(_ userId: String, traits: TraceMindFields = [:]) throws {
    try client?.identify(userId, traits: traits)
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
  private static var heartbeatTimer: Timer?
  private static var currentScreen = "Application"
  private static var isPresenceActive = false

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
      selector: #selector(appWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
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
    if UIApplication.shared.applicationState == .active {
      appDidBecomeActive()
    }
  }

  @objc private static func appDidBecomeActive() {
    try? client?.capture(type: "page_view", path: "Application", title: "Application")
    isPresenceActive = true
    startPresence("foreground")
  }

  @objc private static func appWillResignActive() {
    stopPresence("background")
  }

  @objc private static func appDidEnterBackground() {
    stopPresence("background")
  }

  static func setScreen(_ screen: String) {
    let nextScreen = normalizedScreen(screen)
    if nextScreen == currentScreen { return }
    currentScreen = nextScreen
    if isPresenceActive {
      Task { try? await client?.switchPresenceScreen(nextScreen) }
    } else {
      client?.setScreen(nextScreen)
    }
  }

  private static func startPresence(_ state: String) {
    heartbeatTimer?.invalidate()
    Task { try? await client?.sendPresence(state: state, path: currentScreen, title: currentScreen) }
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
      Task { try? await client?.sendPresence(state: "heartbeat", path: currentScreen, title: currentScreen) }
    }
  }

  private static func stopPresence(_ state: String) {
    if !isPresenceActive { return }
    isPresenceActive = false
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
    Task { try? await client?.sendPresence(state: state, path: currentScreen, title: currentScreen) }
  }

  private static func normalizedScreen(_ screen: String) -> String {
    let next = String(screen.prefix(160))
    return next.isEmpty ? "Application" : next
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
  static func setScreen(_ screen: String) {}
}
#endif
