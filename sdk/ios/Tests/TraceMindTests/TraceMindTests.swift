import XCTest
@testable import TraceMind

final class RecordingTransport: TraceMindTransport {
  var lastBatch: TraceMindBatch?
  var lastPresence: TraceMindPresencePayload?
  var presences: [TraceMindPresencePayload] = []
  var lastPresenceEndpoint: URL?

  func send(batch: TraceMindBatch, endpoint: URL) async throws {
    lastBatch = batch
  }

  func sendPresence(payload: TraceMindPresencePayload, endpoint: URL) async throws {
    lastPresence = payload
    presences.append(payload)
    lastPresenceEndpoint = endpoint
  }
}

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
    XCTAssertEqual(payload.platform, "ios")
    XCTAssertEqual(payload.source.type, "ios")
    XCTAssertEqual(payload.source.bundleId, "com.example.ios")
    XCTAssertEqual(payload.source.details["framework"], "swift")
    XCTAssertEqual(payload.targetHash?.hasPrefix("tm_target_"), true)
    XCTAssertNil(payload.properties["enteredText"])
    XCTAssertEqual(payload.properties["plan"], .string("pro"))
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
    XCTAssertEqual(presence.platform, "ios")
    XCTAssertEqual(presence.source.type, "ios")
    XCTAssertEqual(presence.path, "CheckoutViewController")
    XCTAssertEqual(presence.screen, "CheckoutViewController")
    XCTAssertEqual(presence.state, "heartbeat")
    XCTAssertEqual(presence.heartbeatIntervalMs, 5000)
  }

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
}
