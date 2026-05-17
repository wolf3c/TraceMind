import Foundation

public enum TraceMindSDK {
  public static let version = "0.1.0"
  public static let contentHash = "sha256:d0a917437df6b2525574bf4913151eb21bacf6abd99f56d25ba00fb155017185"
}

public struct TraceMindConfiguration {
  public let projectKey: String
  public let endpoint: URL
  public let presenceEndpoint: URL
  public let feedbackEndpoint: URL
  public let sourceKey: String
  public let sourceLabel: String
  public let framework: String
  public let sdkVersion: String
  public let sdkContentHash: String

  public init(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!,
    presenceEndpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/presence")!,
    feedbackEndpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/user-feedback")!,
    sourceKey: String = Bundle.main.bundleIdentifier ?? "unknown",
    sourceLabel: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? Bundle.main.bundleIdentifier ?? "unknown",
    framework: String = "swift",
    sdkVersion: String = TraceMindSDK.version,
    sdkContentHash: String = TraceMindSDK.contentHash
  ) {
    self.projectKey = projectKey
    self.endpoint = endpoint
    self.presenceEndpoint = presenceEndpoint
    self.feedbackEndpoint = feedbackEndpoint
    self.sourceKey = sourceKey
    self.sourceLabel = sourceLabel
    self.framework = framework
    self.sdkVersion = sdkVersion
    self.sdkContentHash = sdkContentHash
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

public struct TraceMindTargetIdentity: Codable, Equatable {
  public let key: String
  public let source: String
  public let confidence: String

  public init(key: String, source: String, confidence: String) {
    self.key = key
    self.source = source
    self.confidence = confidence
  }
}

public struct TraceMindSource: Codable {
  public let type: String
  public let bundleId: String?
  public let packageName: String?
  public let label: String
  public let details: [String: String]
}

public struct TraceMindAttribution: Codable, Equatable {
  public let source: String?
  public let medium: String?
  public let campaign: String?
  public let content: String?
  public let referrerDomain: String?
  public let referrerType: String?
  public let landingPath: String?
  public let gclidPresent: Bool?
  public let fbclidPresent: Bool?
  public let msclkidPresent: Bool?

  public init(
    source: String? = nil,
    medium: String? = nil,
    campaign: String? = nil,
    content: String? = nil,
    referrerDomain: String? = nil,
    referrerType: String? = nil,
    landingPath: String? = nil,
    gclidPresent: Bool? = nil,
    fbclidPresent: Bool? = nil,
    msclkidPresent: Bool? = nil
  ) {
    self.source = Self.cleanValue(source)
    self.medium = Self.cleanValue(medium)
    self.campaign = Self.cleanValue(campaign)
    self.content = Self.cleanValue(content)
    self.referrerDomain = Self.cleanDomain(referrerDomain)
    self.referrerType = Self.cleanReferrerType(referrerType)
    self.landingPath = Self.cleanPath(landingPath)
    self.gclidPresent = gclidPresent == true ? true : nil
    self.fbclidPresent = fbclidPresent == true ? true : nil
    self.msclkidPresent = msclkidPresent == true ? true : nil
  }

  public static func fromOpenURL(_ url: URL, sourceApplication: String? = nil) -> TraceMindAttribution {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let params = Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).compactMap { item in
      item.value.map { (item.name, $0) }
    })
    let scheme = (components?.scheme ?? url.scheme ?? "").lowercased()
    let isWebLink = scheme == "http" || scheme == "https"
    let urlHost = cleanDomain(components?.host)
    let referrerDomain = isWebLink ? urlHost : (cleanDomain(sourceApplication) ?? urlHost)
    let source = cleanValue(params["utm_source"]) ?? cleanValue(sourceApplication) ?? urlHost ?? (isWebLink ? "direct" : "deeplink")
    let medium = cleanValue(params["utm_medium"]) ?? (isWebLink ? "universal_link" : "deeplink")

    return TraceMindAttribution(
      source: source,
      medium: medium,
      campaign: params["utm_campaign"],
      content: params["utm_content"],
      referrerDomain: referrerDomain,
      referrerType: sourceApplication == Bundle.main.bundleIdentifier ? "internal" : "external",
      landingPath: landingPath(from: url),
      gclidPresent: params.keys.contains("gclid"),
      fbclidPresent: params.keys.contains("fbclid"),
      msclkidPresent: params.keys.contains("msclkid")
    )
  }

  var isEmpty: Bool {
    source == nil
      && medium == nil
      && campaign == nil
      && content == nil
      && referrerDomain == nil
      && referrerType == nil
      && landingPath == nil
      && gclidPresent != true
      && fbclidPresent != true
      && msclkidPresent != true
  }

  private static func cleanValue(_ value: String?) -> String? {
    let text = (value ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: #"\s+"#, with: "-", options: .regularExpression)
      .prefix(120)
    guard !text.isEmpty else { return nil }
    let next = String(text)
    if next.contains("@")
      || next.range(of: #"https?:|[?&=]|%40"#, options: [.regularExpression, .caseInsensitive]) != nil {
      return nil
    }
    return next.range(of: #"^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$"#, options: .regularExpression) == nil ? nil : next
  }

  private static func cleanDomain(_ value: String?) -> String? {
    let domain = (value ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
      .lowercased()
      .prefix(200)
    guard !domain.isEmpty else { return nil }
    let next = String(domain)
    if next.contains("@") || next.range(of: #"[/?#&=]"#, options: .regularExpression) != nil {
      return nil
    }
    return next.range(of: #"^[a-z0-9.-]+$"#, options: .regularExpression) == nil ? nil : next
  }

  private static func cleanReferrerType(_ value: String?) -> String? {
    let next = (value ?? "").lowercased()
    return ["direct", "internal", "external", "search", "social"].contains(next) ? next : nil
  }

  private static func cleanPath(_ value: String?) -> String? {
    let raw = String((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
    guard !raw.isEmpty, raw.hasPrefix("/"), !raw.contains("@"), raw.range(of: #"^https?:"#, options: [.regularExpression, .caseInsensitive]) == nil else {
      return nil
    }
    return raw.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init)
  }

  private static func landingPath(from url: URL) -> String? {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let scheme = (components?.scheme ?? url.scheme ?? "").lowercased()
    var path = components?.path ?? url.path
    if path.isEmpty, scheme != "http", scheme != "https", let host = components?.host, !host.isEmpty {
      path = "/\(host)"
    }
    if path.isEmpty { path = "/" }
    if let fragment = components?.fragment, !fragment.isEmpty {
      path += "#\(fragment)"
    }
    return cleanPath(path)
  }
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
  public let targetIdentity: TraceMindTargetIdentity?
  public let identitySource: String?
  public let identityConfidence: String?
  public let actionKey: String?
  public let attribution: TraceMindAttribution?
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
  public let activeDurationMs: Int
  public let lastActiveAt: String?
  public let activeState: String
  public let idleTimeoutMs: Int
  public let attribution: TraceMindAttribution?
  public let occurredAt: String
}

public struct TraceMindFeedbackContact: Codable, Equatable {
  public let name: String?
  public let email: String?
  public let phone: String?
  public let preferredChannel: String?
  public let consent: Bool

  public init(
    name: String? = nil,
    email: String? = nil,
    phone: String? = nil,
    preferredChannel: String? = nil,
    consent: Bool = false
  ) {
    self.name = name
    self.email = email
    self.phone = phone
    self.preferredChannel = preferredChannel
    self.consent = consent
  }
}

public struct TraceMindFeedbackAttachment: Codable, Equatable {
  public let name: String

  public init(name: String) {
    self.name = name
  }
}

public struct TraceMindFeedbackMessage: Codable, Equatable {
  public let formatVersion: Int
  public let kind: String
  public let title: String?
  public let body: String
  public let contact: TraceMindFeedbackContact
  public let fields: TraceMindFields
  public let attachments: [TraceMindFeedbackAttachment]

  public init(
    formatVersion: Int = 1,
    kind: String = "other",
    title: String? = nil,
    body: String,
    contact: TraceMindFeedbackContact = TraceMindFeedbackContact(),
    fields: TraceMindFields = [:],
    attachments: [TraceMindFeedbackAttachment] = []
  ) {
    self.formatVersion = formatVersion
    self.kind = ["issue", "idea", "question", "other"].contains(kind) ? kind : "other"
    self.title = title.map { String($0.prefix(160)) }
    self.body = String(body.prefix(4000))
    self.contact = contact.consent ? contact : TraceMindFeedbackContact(consent: false)
    self.fields = TraceMindClient.sanitizeFeedbackFields(fields)
    self.attachments = []
  }
}

public struct TraceMindUserFeedbackPayload: Codable {
  public let projectKey: String
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
  public let message: TraceMindFeedbackMessage
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
  func sendUserFeedback(payload: TraceMindUserFeedbackPayload, endpoint: URL) async throws
}

public extension TraceMindTransport {
  func sendPresence(payload: TraceMindPresencePayload, endpoint: URL) async throws {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder.traceMind.encode(payload)
    _ = try await URLSession.shared.data(for: request)
  }

  func sendUserFeedback(payload: TraceMindUserFeedbackPayload, endpoint: URL) async throws {
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
  private let clock: () -> Date
  private var queue: [TraceMindPayload] = []
  private var presenceId: String?
  private var currentScreen = "Application"
  private var currentAttribution: TraceMindAttribution?
  private let heartbeatIntervalMs = 5_000
  private let activeIdleTimeoutMs = 60_000
  private var activeDurationMs = 0
  private var activeStartedAt: Date?
  private var lastActiveAt: Date?

  private var sourceDetails: [String: String] {
    [
      "framework": configuration.framework,
      "sdkVersion": configuration.sdkVersion,
      "sdkContentHash": configuration.sdkContentHash,
    ]
  }

  public init(
    configuration: TraceMindConfiguration,
    identityStore: TraceMindIdentityStore = UserDefaultsIdentityStore(),
    transport: TraceMindTransport = URLSessionTraceMindTransport(),
    maxQueueSize: Int = 100,
    clock: @escaping () -> Date = Date.init
  ) {
    self.configuration = configuration
    self.identityStore = identityStore
    self.transport = transport
    self.maxQueueSize = maxQueueSize
    self.clock = clock
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
    let targetIdentity = target.map { Self.targetIdentity($0) }
    let targetHash = try target.map { try Self.hashTarget($0, identity: targetIdentity) }
    let platform = Self.platformKey
    let actionKey = targetIdentity.map { Self.actionKey(platform: platform, path: path, type: type, identity: $0) }
    return TraceMindPayload(
      projectKey: configuration.projectKey,
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      userId: identityStore.userId,
      deviceFingerprint: Self.hash("\(platform):\(configuration.sourceKey):\(identityStore.deviceId)", prefix: "tm_fp_"),
      platform: platform,
      deviceInfo: [
        "os": Self.osName,
        "framework": configuration.framework,
      ],
      source: TraceMindSource(
        type: platform,
        bundleId: configuration.sourceKey,
        packageName: nil,
        label: configuration.sourceLabel,
        details: sourceDetails
      ),
      type: type,
      eventName: eventName,
      path: path,
      title: title,
      target: target,
      targetHash: targetHash,
      targetIdentity: targetIdentity,
      identitySource: targetIdentity?.source,
      identityConfidence: targetIdentity?.confidence,
      actionKey: actionKey,
      attribution: currentAttribution,
      properties: Self.sanitize(properties),
      context: Self.sanitize(context),
      occurredAt: ISO8601DateFormatter.traceMind.string(from: clock())
    )
  }

  public func makePresencePayload(state: String, path: String? = nil, title: String? = nil) -> TraceMindPresencePayload {
    if presenceId == nil {
      presenceId = "tm_pres_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
      resetActiveClock()
    }
    if state == "end" || state == "background" {
      pauseActiveWindow()
    } else if state == "start" || state == "foreground" {
      resumeActiveWindow()
    }
    let now = clock()
    settleActiveWindow(now)
    let screen = path ?? currentScreen
    return TraceMindPresencePayload(
      projectKey: configuration.projectKey,
      presenceId: presenceId ?? "",
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      userId: identityStore.userId,
      deviceFingerprint: Self.hash("\(Self.platformKey):\(configuration.sourceKey):\(identityStore.deviceId)", prefix: "tm_fp_"),
      platform: Self.platformKey,
      deviceInfo: [
        "os": Self.osName,
        "framework": configuration.framework,
      ],
      source: TraceMindSource(
        type: Self.platformKey,
        bundleId: configuration.sourceKey,
        packageName: nil,
        label: configuration.sourceLabel,
        details: sourceDetails
      ),
      path: screen,
      title: title,
      screen: screen,
      state: state,
      heartbeatIntervalMs: heartbeatIntervalMs,
      activeDurationMs: activeDurationMs,
      lastActiveAt: lastActiveAt.map { ISO8601DateFormatter.traceMind.string(from: $0) },
      activeState: (state == "end" || state == "background") ? "inactive" : activeState(now),
      idleTimeoutMs: activeIdleTimeoutMs,
      attribution: currentAttribution,
      occurredAt: ISO8601DateFormatter.traceMind.string(from: now)
    )
  }

  public func makeUserFeedbackPayload(
    message: TraceMindFeedbackMessage,
    path: String? = nil,
    title: String? = nil
  ) -> TraceMindUserFeedbackPayload {
    let platform = Self.platformKey
    return TraceMindUserFeedbackPayload(
      projectKey: configuration.projectKey,
      sessionId: identityStore.sessionId,
      anonymousId: identityStore.anonymousId,
      deviceId: identityStore.deviceId,
      userId: identityStore.userId,
      deviceFingerprint: Self.hash("\(platform):\(configuration.sourceKey):\(identityStore.deviceId)", prefix: "tm_fp_"),
      platform: platform,
      deviceInfo: [
        "os": Self.osName,
        "framework": configuration.framework,
      ],
      source: TraceMindSource(
        type: platform,
        bundleId: configuration.sourceKey,
        packageName: nil,
        label: configuration.sourceLabel,
        details: sourceDetails
      ),
      path: path ?? currentScreen,
      title: title,
      message: message,
      occurredAt: ISO8601DateFormatter.traceMind.string(from: clock())
    )
  }

  public func submitFeedback(
    message: TraceMindFeedbackMessage,
    path: String? = nil,
    title: String? = nil
  ) async throws {
    let payload = makeUserFeedbackPayload(message: message, path: path, title: title)
    try await transport.sendUserFeedback(payload: payload, endpoint: configuration.feedbackEndpoint)
  }

  public func sendPresence(state: String, path: String? = nil, title: String? = nil) async throws {
    let payload = makePresencePayload(state: state, path: path, title: title)
    try await transport.sendPresence(payload: payload, endpoint: configuration.presenceEndpoint)
    if state == "end" || state == "background" {
      presenceId = nil
      resetActiveClock()
    }
  }

  public func setScreen(_ screen: String) {
    if presenceId != nil {
      recordActivity()
    }
    currentScreen = Self.normalizedScreen(screen)
  }

  public func setAttribution(_ attribution: TraceMindAttribution) {
    currentAttribution = attribution.isEmpty ? nil : attribution
  }

  public func recordOpenURL(_ url: URL, sourceApplication: String? = nil) {
    setAttribution(TraceMindAttribution.fromOpenURL(url, sourceApplication: sourceApplication))
  }

  func switchPresenceScreen(_ screen: String) async throws {
    let nextScreen = Self.normalizedScreen(screen)
    if nextScreen == currentScreen { return }
    let previousScreen = currentScreen
    if presenceId != nil {
      recordActivity()
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
    recordActivity()
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

  func recordActivity() {
    let now = clock()
    settleActiveWindow(now)
    lastActiveAt = now
    if activeStartedAt == nil {
      activeStartedAt = now
    }
  }

  private func resumeActiveWindow() {
    let now = clock()
    settleActiveWindow(now)
    lastActiveAt = now
    if activeStartedAt == nil {
      activeStartedAt = now
    }
  }

  private func pauseActiveWindow() {
    settleActiveWindow(clock())
    activeStartedAt = nil
  }

  private func settleActiveWindow(_ now: Date) {
    guard let activeStartedAt, let lastActiveAt else { return }
    let idleCutoff = lastActiveAt.addingTimeInterval(Double(activeIdleTimeoutMs) / 1000)
    let endAt = min(now, idleCutoff)
    if endAt > activeStartedAt {
      activeDurationMs += Int(endAt.timeIntervalSince(activeStartedAt) * 1000)
    }
    self.activeStartedAt = endAt < now ? nil : endAt
  }

  private func resetActiveClock() {
    activeDurationMs = 0
    activeStartedAt = nil
    lastActiveAt = nil
  }

  private func activeState(_ now: Date) -> String {
    if activeStartedAt != nil { return "active" }
    guard let lastActiveAt else { return "inactive" }
    return now.timeIntervalSince(lastActiveAt) * 1000 >= Double(activeIdleTimeoutMs) ? "idle" : "inactive"
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

  private static func hashTarget(_ target: TraceMindTarget, identity: TraceMindTargetIdentity?) throws -> String {
    if let identity {
      return hash(identity.key, prefix: "tm_target_")
    }
    let data = try JSONEncoder.traceMind.encode(target)
    return hash(String(decoding: data, as: UTF8.self), prefix: "tm_target_")
  }

  private static func targetIdentity(_ target: TraceMindTarget) -> TraceMindTargetIdentity {
    if let testId = nonEmpty(target.testId) {
      return TraceMindTargetIdentity(key: "target:testId:\(testId)", source: "testId", confidence: "high")
    }
    if let accessibilityId = nonEmpty(target.accessibilityId) {
      return TraceMindTargetIdentity(key: "target:accessibilityId:\(accessibilityId)", source: "accessibilityId", confidence: "high")
    }
    if let resourceId = nonEmpty(target.resourceId) {
      return TraceMindTargetIdentity(key: "target:resourceId:\(resourceId)", source: "resourceId", confidence: "high")
    }
    if let label = nonEmpty(target.label) {
      return TraceMindTargetIdentity(key: "target:label:\(target.screen ?? ""):\(label)", source: "label", confidence: "medium")
    }
    if let path = nonEmpty(target.path) {
      return TraceMindTargetIdentity(key: "target:path:\(target.screen ?? ""):\(path)", source: "path", confidence: "low")
    }
    return TraceMindTargetIdentity(key: "target:class:\(target.screen ?? ""):\(target.className ?? "")", source: "className", confidence: "low")
  }

  private static func nonEmpty(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    return value
  }

  private static func actionKey(platform: String, path: String, type: String, identity: TraceMindTargetIdentity) -> String {
    "\(platform):\(path):\(type):\(identity.key)"
  }

  private static var platformKey: String {
#if canImport(UIKit)
    return "ios"
#elseif canImport(AppKit)
    return "macos"
#else
    return "ios"
#endif
  }

  private static var osName: String {
#if canImport(UIKit)
    return "iOS"
#elseif canImport(AppKit)
    return "macOS"
#else
    return "iOS"
#endif
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
        return stringValue.range(of: #"https?://[^\s?#]+[^\s]*\?[^\s"'<>)]*"#, options: .regularExpression) == nil
      }
      if case .number(let numberValue) = value {
        return numberValue.isFinite
      }
      return true
    }
  }

  static func sanitizeFeedbackFields(_ fields: TraceMindFields) -> TraceMindFields {
    fields.filter { key, value in
      let normalized = normalizeFieldKey(key)
      if normalized.contains("rawprompt")
        || normalized.contains("rawusercontent")
        || normalized.contains("rawrequestbody")
        || normalized.contains("requestbody")
        || normalized.contains("rawresponsebody")
        || normalized.contains("responsebody")
        || normalized.contains("headers")
        || normalized.contains("cookies")
        || normalized.contains("authorization")
        || normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("sourcecode")
        || normalized.contains("sourcediff")
        || normalized.contains("codediff")
        || normalized.contains("toolarguments")
        || normalized.contains("toolresult")
        || normalized.contains("resourcecontent") {
        return false
      }
      if case .string(let stringValue) = value {
        return stringValue.range(of: #"https?://[^\s?#]+[^\s]*\?[^\s"'<>)]*|\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token|raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body)\b"#, options: [.regularExpression, .caseInsensitive]) == nil
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
  private static let defaultPresenceEndpoint = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/presence")!
  private static let defaultFeedbackEndpoint = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/user-feedback")!

  static func derivedEndpoint(from endpoint: URL, replacing replacement: String, fallback: URL) -> URL {
    guard endpoint.path.hasSuffix("/api/capture") else { return fallback }
    var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)
    components?.path = String(endpoint.path.dropLast("/api/capture".count)) + replacement
    components?.query = nil
    components?.fragment = nil
    return components?.url ?? fallback
  }

  public static func start(
    projectKey: String,
    endpoint: URL = URL(string: "https://tracemind.sandbox.galaxycloud.app/api/capture")!,
    framework: String = "swift",
    sdkVersion: String = TraceMindSDK.version,
    sdkContentHash: String = TraceMindSDK.contentHash
  ) {
    let presenceEndpoint = derivedEndpoint(from: endpoint, replacing: "/api/presence", fallback: defaultPresenceEndpoint)
    let feedbackEndpoint = derivedEndpoint(from: endpoint, replacing: "/api/user-feedback", fallback: defaultFeedbackEndpoint)
    let nextClient = TraceMindClient(configuration: TraceMindConfiguration(
      projectKey: projectKey,
      endpoint: endpoint,
      presenceEndpoint: presenceEndpoint,
      feedbackEndpoint: feedbackEndpoint,
      framework: framework,
      sdkVersion: sdkVersion,
      sdkContentHash: sdkContentHash
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
#if canImport(UIKit)
    TraceMindAutoCapture.setScreen(screen)
#else
    client?.setScreen(screen)
    TraceMindAutoCapture.setScreen(screen)
#endif
  }

  public static func setAttribution(_ attribution: TraceMindAttribution) {
    client?.setAttribution(attribution)
  }

  public static func recordOpenURL(_ url: URL, sourceApplication: String? = nil) {
    client?.recordOpenURL(url, sourceApplication: sourceApplication)
  }

  public static func identify(_ userId: String, traits: TraceMindFields = [:]) throws {
    try client?.identify(userId, traits: traits)
  }

  public static func submitFeedback(
    message: TraceMindFeedbackMessage,
    path: String? = nil,
    title: String? = nil
  ) async throws {
    try await client?.submitFeedback(message: message, path: path, title: title)
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
import ObjectiveC.runtime

final class TraceMindAutoCapture {
  private static weak var client: TraceMindClient?
  private static var heartbeatTimer: Timer?
  private static var currentScreen = "Application"
  private static var isPresenceActive = false
  private static var didInstallTapHook = false

  static func start(client: TraceMindClient) {
    self.client = client
    installTapAutoCapture()
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

  private static func installTapAutoCapture() {
    if didInstallTapHook { return }
    didInstallTapHook = true
    guard
      let original = class_getInstanceMethod(UIControl.self, #selector(UIControl.sendAction(_:to:for:))),
      let replacement = class_getInstanceMethod(UIControl.self, #selector(UIControl.tracemind_sendAction(_:to:for:)))
    else {
      return
    }
    method_exchangeImplementations(original, replacement)
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

private extension UIControl {
  @objc func tracemind_sendAction(_ action: Selector, to target: Any?, for event: UIEvent?) {
    TraceMindAutoCapture.recordTap(view: self)
    tracemind_sendAction(action, to: target, for: event)
  }
}
#elseif canImport(AppKit)
import AppKit

final class TraceMindAutoCapture {
  private static weak var client: TraceMindClient?
  private static var heartbeatTimer: Timer?
  private static var currentScreen = "Application"
  private static var isPresenceActive = false
  private static var observers: [NSObjectProtocol] = []

  static func start(client: TraceMindClient) {
    self.client = client
    installObservers()
    if NSApplication.shared.isActive {
      appDidBecomeActive()
    }
  }

  static func setScreen(_ screen: String) {
    switchScreen(normalizedScreen(screen))
  }

  private static func installObservers() {
    if !observers.isEmpty { return }
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
        appDidBecomeActive()
      },
      center.addObserver(forName: NSApplication.willResignActiveNotification, object: nil, queue: .main) { _ in
        appWillResignActive()
      },
      center.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { notification in
        guard let window = notification.object as? NSWindow else { return }
        switchScreen(screenName(for: window))
      },
      center.addObserver(forName: NSWindow.didBecomeMainNotification, object: nil, queue: .main) { notification in
        guard let window = notification.object as? NSWindow else { return }
        switchScreen(screenName(for: window))
      },
    ]
  }

  private static func appDidBecomeActive() {
    let screen = screenName(for: NSApplication.shared.keyWindow ?? NSApplication.shared.mainWindow)
    currentScreen = screen
    client?.setScreen(screen)
    try? client?.capture(type: "page_view", path: screen, title: screen)
    isPresenceActive = true
    startPresence("foreground")
  }

  private static func appWillResignActive() {
    stopPresence("background")
  }

  private static func switchScreen(_ screen: String) {
    let nextScreen = normalizedScreen(screen)
    if nextScreen == currentScreen { return }
    currentScreen = nextScreen
    try? client?.capture(type: "route_change", path: nextScreen, title: nextScreen)
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

  private static func screenName(for window: NSWindow?) -> String {
    guard let window else { return "Application" }
    if let title = nonEmpty(window.title) {
      return title
    }
    if let controller = window.contentViewController {
      return String(describing: type(of: controller))
    }
    return "Application"
  }

  private static func nonEmpty(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    return value
  }

  private static func normalizedScreen(_ screen: String) -> String {
    let next = String(screen.prefix(160))
    return next.isEmpty ? "Application" : next
  }
}
#else
final class TraceMindAutoCapture {
  static func start(client: TraceMindClient) {}
  static func setScreen(_ screen: String) {}
}
#endif
