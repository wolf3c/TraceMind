import XCTest
@testable import TraceMind

final class RecordingTransport: TraceMindTransport {
  var lastBatch: TraceMindBatch?
  var lastPresence: TraceMindPresencePayload?
  var lastFeedback: TraceMindUserFeedbackPayload?
  var presences: [TraceMindPresencePayload] = []
  var lastPresenceEndpoint: URL?
  var lastFeedbackEndpoint: URL?

  func send(batch: TraceMindBatch, endpoint: URL) async throws {
    lastBatch = batch
  }

  func sendPresence(payload: TraceMindPresencePayload, endpoint: URL) async throws {
    lastPresence = payload
    presences.append(payload)
    lastPresenceEndpoint = endpoint
  }

  func sendUserFeedback(payload: TraceMindUserFeedbackPayload, endpoint: URL) async throws {
    lastFeedback = payload
    lastFeedbackEndpoint = endpoint
  }
}

#if canImport(UIKit)
private let expectedSDKPlatform = "ios"
private let expectedSDKOSName = "iOS"
#elseif canImport(AppKit)
private let expectedSDKPlatform = "macos"
private let expectedSDKOSName = "macOS"
#else
private let expectedSDKPlatform = "ios"
private let expectedSDKOSName = "iOS"
#endif

final class TraceMindTests: XCTestCase {
  func testBuildsIosPayloadWithoutInputValues() throws {
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore()
    )
    let target = TraceMindTarget(
      className: "UIButton",
      accessibilityId: "checkout-primary",
      label: "Pay now",
      screen: "CheckoutViewController",
      path: "UIWindow>CheckoutViewController>UIButton[0]"
    )

    let payload = try client.makePayload(
      type: "click",
      path: "CheckoutViewController",
      title: "Checkout",
      target: target,
      properties: ["enteredText": "4111111111111111", "plan": "pro"],
      context: ["source": "auto"]
    )

    XCTAssertEqual(payload.projectKey, "tm_proj_ios")
    XCTAssertEqual(payload.platform, expectedSDKPlatform)
    XCTAssertEqual(payload.deviceInfo["os"], expectedSDKOSName)
    XCTAssertEqual(payload.source.type, expectedSDKPlatform)
    XCTAssertEqual(payload.source.bundleId, "com.example.ios")
    XCTAssertEqual(payload.source.details["framework"], "swift")
    XCTAssertEqual(payload.targetHash?.hasPrefix("tm_target_"), true)
    XCTAssertEqual(payload.targetIdentity?.key, "target:accessibilityId:checkout-primary")
    XCTAssertEqual(payload.identitySource, "accessibilityId")
    XCTAssertEqual(payload.identityConfidence, "high")
    XCTAssertEqual(payload.actionKey, "\(expectedSDKPlatform):CheckoutViewController:click:target:accessibilityId:checkout-primary")
    XCTAssertNil(payload.properties["enteredText"])
    XCTAssertEqual(payload.properties["plan"], .string("pro"))
  }

  func testTargetHashPrefersStableEngineeringIdentifiersOverTextAndPath() throws {
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore()
    )

    let first = try client.makePayload(
      type: "click",
      path: "CheckoutViewController",
      target: TraceMindTarget(
        className: "UIButton",
        accessibilityId: "checkout-primary",
        label: "Pay now",
        screen: "CheckoutViewController",
        path: "UIWindow>UIButton[0]"
      )
    )
    let second = try client.makePayload(
      type: "click",
      path: "CheckoutViewController",
      target: TraceMindTarget(
        className: "PrimaryButton",
        accessibilityId: "checkout-primary",
        label: "Complete payment",
        screen: "CheckoutViewController",
        path: "UIWindow>Stack>UIButton[2]"
      )
    )

    XCTAssertEqual(first.targetHash, second.targetHash)
    XCTAssertEqual(first.actionKey, second.actionKey)
  }

  func testQueueFlushesBatchedEvents() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(),
      transport: transport,
      maxQueueSize: 3
    )

    try client.capture(type: "page_view", path: "HomeViewController")
    try client.capture(type: "click", path: "HomeViewController")
    try await client.flush()

    XCTAssertEqual(transport.lastBatch?.projectKey, "tm_proj_ios")
    XCTAssertEqual(transport.lastBatch?.events.count, 2)
  }

  func testIdentifyPersistsUserIdAndEmitsSanitizedEvent() async throws {
    let transport = RecordingTransport()
    let identityStore = InMemoryIdentityStore()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: identityStore,
      transport: transport
    )

    try client.identify("user_123", traits: [
      "plan": "pro",
      "seats": 3,
      "ratio": 1.5,
      "trial": true,
      ("em" + "ail"): "redacted-contact",
      ("raw" + "_prompt"): "do not send",
      "raw-user-content": "do not send",
      "entered_text": "do not send",
      ("user" + "_phone"): "do not send",
      ("return" + "Url"): .string("https://example.com/checkout" + "?debug=true"),
      "notANumber": .number(.nan),
      "positiveInfinity": .number(.infinity),
    ])
    try await client.flush()

    let event = try XCTUnwrap(transport.lastBatch?.events.first)
    XCTAssertEqual(identityStore.userId, "user_123")
    XCTAssertEqual(event.userId, "user_123")
    XCTAssertEqual(event.eventName, "identify")
    XCTAssertEqual(event.properties["plan"], .string("pro"))
    XCTAssertEqual(event.properties["seats"], .number(3))
    XCTAssertEqual(event.properties["ratio"], .number(1.5))
    XCTAssertEqual(event.properties["trial"], .bool(true))
    XCTAssertNil(event.properties["em" + "ail"])
    XCTAssertNil(event.properties["raw" + "_prompt"])
    XCTAssertNil(event.properties["raw-user-content"])
    XCTAssertNil(event.properties["entered_text"])
    XCTAssertNil(event.properties["user" + "_phone"])
    XCTAssertNil(event.properties["return" + "Url"])
    XCTAssertNil(event.properties["notANumber"])
    XCTAssertNil(event.properties["positiveInfinity"])
  }

  func testManualCustomCaptureIncludesPrimitivePropertiesAndContext() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport
    )

    let approvedEventName = "purchase_completed"
    try client.capture(
      type: "custom",
      eventName: approvedEventName,
      path: "CheckoutViewController",
      properties: [
        "plan": "pro",
        "amount": 29.99,
        "trial": false,
        "notANumber": .number(.nan),
        "positiveInfinity": .number(.infinity),
        ("access" + "Token"): "secret",
      ],
      context: [
        "source": "pricing",
        "retry": false,
      ]
    )
    try await client.flush()

    let event = try XCTUnwrap(transport.lastBatch?.events.first)
    XCTAssertEqual(event.userId, "user_123")
    XCTAssertEqual(event.eventName, approvedEventName)
    XCTAssertEqual(event.path, "CheckoutViewController")
    XCTAssertEqual(event.properties["plan"], .string("pro"))
    XCTAssertEqual(event.properties["amount"], .number(29.99))
    XCTAssertEqual(event.properties["trial"], .bool(false))
    XCTAssertNil(event.properties["notANumber"])
    XCTAssertNil(event.properties["positiveInfinity"])
    XCTAssertNil(event.properties["access" + "Token"])
    XCTAssertEqual(event.context["source"], .string("pricing"))
    XCTAssertEqual(event.context["retry"], .bool(false))
  }

  func testAttributionFromOpenURLIsAttachedToEventsAndPresence() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        presenceEndpoint: URL(string: "https://tracemind.example.com/api/presence")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport
    )

    client.recordOpenURL(
      URL(string: "https://example.com/invite?utm_source=partner&utm_medium=universal_link&utm_campaign=launch&gclid=secret-click&email=user@example.com")!,
      sourceApplication: "com.apple.mobilesafari"
    )
    try client.capture(type: "custom", eventName: "invite_accepted", path: "InviteViewController")
    try await client.flush()
    try await client.sendPresence(state: "heartbeat", path: "InviteViewController")

    let event = try XCTUnwrap(transport.lastBatch?.events.first)
    let presence = try XCTUnwrap(transport.lastPresence)
    XCTAssertEqual(event.attribution?.source, "partner")
    XCTAssertEqual(event.attribution?.medium, "universal_link")
    XCTAssertEqual(event.attribution?.campaign, "launch")
    XCTAssertEqual(event.attribution?.referrerDomain, "example.com")
    XCTAssertEqual(event.attribution?.referrerType, "external")
    XCTAssertEqual(event.attribution?.landingPath, "/invite")
    XCTAssertEqual(event.attribution?.gclidPresent, true)
    XCTAssertEqual(presence.attribution, event.attribution)
    let json = String(data: try JSONEncoder().encode(event), encoding: .utf8) ?? ""
    XCTAssertFalse(json.contains("secret-click"))
    XCTAssertFalse(json.contains("user@example.com"))
  }

  func testAttributionFromCustomSchemeUsesSourceApplicationAsReferrer() throws {
    let attribution = TraceMindAttribution.fromOpenURL(
      URL(string: "tracemind://invite?utm_medium=deeplink&utm_campaign=launch")!,
      sourceApplication: "com.partner.app"
    )

    XCTAssertEqual(attribution.source, "com.partner.app")
    XCTAssertEqual(attribution.medium, "deeplink")
    XCTAssertEqual(attribution.campaign, "launch")
    XCTAssertEqual(attribution.referrerDomain, "com.partner.app")
    XCTAssertEqual(attribution.referrerType, "external")
    XCTAssertEqual(attribution.landingPath, "/invite")
  }

  func testSubmitFeedbackUsesDedicatedPayloadAndAllowsConsentedContact() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        feedbackEndpoint: URL(string: "https://tracemind.example.com/api/user-feedback")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport
    )

    try await client.submitFeedback(message: TraceMindFeedbackMessage(
      kind: "issue",
      title: "Upgrade failed",
      body: "The upgrade button did not finish.",
      contact: TraceMindFeedbackContact(email: "user@example.com", consent: true),
      fields: [
        "plan": "pro",
        ("access" + "Token"): "do not send",
        "returnUrl": "Open https://example.com/callback?token=secret to debug",
      ],
      attachments: [TraceMindFeedbackAttachment(name: "future.png")]
    ), path: "CheckoutViewController")

    let feedback = try XCTUnwrap(transport.lastFeedback)
    XCTAssertEqual(transport.lastFeedbackEndpoint?.absoluteString, "https://tracemind.example.com/api/user-feedback")
    XCTAssertEqual(feedback.projectKey, "tm_proj_ios")
    XCTAssertEqual(feedback.userId, "user_123")
    XCTAssertEqual(feedback.platform, expectedSDKPlatform)
    XCTAssertEqual(feedback.message.kind, "issue")
    XCTAssertEqual(feedback.message.contact.email, "user@example.com")
    XCTAssertEqual(feedback.message.fields["plan"], .string("pro"))
    XCTAssertNil(feedback.message.fields["access" + "Token"])
    XCTAssertNil(feedback.message.fields["returnUrl"])
    XCTAssertEqual(feedback.message.attachments.count, 0)
  }

  func testFeedbackEndpointFallsBackWhenCaptureEndpointCannotDeriveIt() throws {
    let fallback = try XCTUnwrap(URL(string: "https://tracemind.sandbox.galaxycloud.app/api/user-feedback"))
    let derived = TraceMind.derivedEndpoint(
      from: try XCTUnwrap(URL(string: "https://collector.example.com/base/api/capture?debug=true")),
      replacing: "/api/user-feedback",
      fallback: fallback
    )
    let similarPath = TraceMind.derivedEndpoint(
      from: try XCTUnwrap(URL(string: "https://collector.example.com/base/api/capture-v2")),
      replacing: "/api/user-feedback",
      fallback: fallback
    )

    XCTAssertEqual(derived.absoluteString, "https://collector.example.com/base/api/user-feedback")
    XCTAssertEqual(similarPath.absoluteString, fallback.absoluteString)
  }

  func testPresencePayloadUsesDedicatedEndpointAndScreen() async throws {
    let transport = RecordingTransport()
    let identityStore = InMemoryIdentityStore(userId: "user_123")
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        presenceEndpoint: URL(string: "https://tracemind.example.com/api/presence")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: identityStore,
      transport: transport
    )

    client.setScreen("CheckoutViewController")
    try await client.sendPresence(state: "heartbeat")

    let presence = try XCTUnwrap(transport.lastPresence)
    XCTAssertEqual(transport.lastPresenceEndpoint?.absoluteString, "https://tracemind.example.com/api/presence")
    XCTAssertEqual(presence.projectKey, "tm_proj_ios")
    XCTAssertEqual(presence.userId, "user_123")
    XCTAssertEqual(presence.platform, expectedSDKPlatform)
    XCTAssertEqual(presence.deviceInfo["os"], expectedSDKOSName)
    XCTAssertEqual(presence.source.type, expectedSDKPlatform)
    XCTAssertEqual(presence.path, "CheckoutViewController")
    XCTAssertEqual(presence.screen, "CheckoutViewController")
    XCTAssertEqual(presence.state, "heartbeat")
    XCTAssertEqual(presence.heartbeatIntervalMs, 5000)
    XCTAssertEqual(presence.activeDurationMs, 0)
    XCTAssertEqual(presence.activeState, "inactive")
    XCTAssertEqual(presence.idleTimeoutMs, 60_000)
  }

#if canImport(AppKit)
  func testBuildsMacOSPayloadWithMacOSSourceType() throws {
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_macos",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        sourceKey: "com.example.macos",
        sourceLabel: "Example macOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore()
    )

    let payload = try client.makePayload(
      type: "click",
      path: "MainWindow",
      target: TraceMindTarget(accessibilityId: "settings-button", screen: "MainWindow")
    )
    let presence = client.makePresencePayload(state: "heartbeat", path: "MainWindow")

    XCTAssertEqual(payload.platform, "macos")
    XCTAssertEqual(payload.deviceInfo["os"], "macOS")
    XCTAssertEqual(payload.source.type, "macos")
    XCTAssertEqual(payload.source.bundleId, "com.example.macos")
    XCTAssertEqual(payload.actionKey, "macos:MainWindow:click:target:accessibilityId:settings-button")
    XCTAssertEqual(presence.platform, "macos")
    XCTAssertEqual(presence.deviceInfo["os"], "macOS")
    XCTAssertEqual(presence.source.type, "macos")
  }
#endif

  func testSwitchPresenceScreenEndsOldSegmentAndStartsNewSegment() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        presenceEndpoint: URL(string: "https://tracemind.example.com/api/presence")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport
    )

    client.setScreen("HomeViewController")
    try await client.sendPresence(state: "heartbeat")
    let homePresenceId = try XCTUnwrap(transport.presences.last?.presenceId)
    try await client.switchPresenceScreen("CheckoutViewController")

    XCTAssertEqual(transport.presences.map(\.state), ["heartbeat", "end", "start"])
    XCTAssertEqual(transport.presences[1].path, "HomeViewController")
    XCTAssertEqual(transport.presences[1].presenceId, homePresenceId)
    XCTAssertEqual(transport.presences[2].path, "CheckoutViewController")
    XCTAssertNotEqual(transport.presences[2].presenceId, homePresenceId)
  }

  func testPresenceScreenSwitchUsesCurrentClientScreen() async throws {
    let transport = RecordingTransport()
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        presenceEndpoint: URL(string: "https://tracemind.example.com/api/presence")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport
    )

    client.setScreen("MainWindow")
    try await client.sendPresence(state: "foreground", path: "MainWindow", title: "MainWindow")
    try await client.switchPresenceScreen("NextWindow")

    XCTAssertEqual(transport.presences.map(\.state), ["foreground", "end", "start"])
    XCTAssertEqual(transport.presences[0].path, "MainWindow")
    XCTAssertEqual(transport.presences[1].path, "MainWindow")
    XCTAssertEqual(transport.presences[2].path, "NextWindow")
  }

  func testStrictActiveDurationStopsAtIdleWindowAndBackground() async throws {
    let transport = RecordingTransport()
    var now = ISO8601DateFormatter().date(from: "2026-05-08T01:00:00Z")!
    let client = TraceMindClient(
      configuration: TraceMindConfiguration(
        projectKey: "tm_proj_ios",
        endpoint: URL(string: "https://tracemind.example.com/api/capture")!,
        presenceEndpoint: URL(string: "https://tracemind.example.com/api/presence")!,
        sourceKey: "com.example.ios",
        sourceLabel: "Example iOS",
        framework: "swift"
      ),
      identityStore: InMemoryIdentityStore(userId: "user_123"),
      transport: transport,
      clock: { now }
    )

    try await client.sendPresence(state: "start", path: "CheckoutViewController")
    now = now.addingTimeInterval(90)
    try await client.sendPresence(state: "heartbeat", path: "CheckoutViewController")
    XCTAssertEqual(transport.presences.last?.activeDurationMs, 60_000)
    XCTAssertEqual(transport.presences.last?.activeState, "idle")

    client.recordActivity()
    now = now.addingTimeInterval(10)
    try await client.sendPresence(state: "heartbeat", path: "CheckoutViewController")
    XCTAssertEqual(transport.presences.last?.activeDurationMs, 70_000)
    XCTAssertEqual(transport.presences.last?.activeState, "active")

    now = now.addingTimeInterval(20)
    try await client.sendPresence(state: "background", path: "CheckoutViewController")
    XCTAssertEqual(transport.presences.last?.activeDurationMs, 90_000)
    XCTAssertEqual(transport.presences.last?.activeState, "inactive")
    XCTAssertEqual(transport.presences.last?.lastActiveAt, "2026-05-08T01:01:30Z")
  }
}
