import XCTest
@testable import TraceMind

final class RecordingTransport: TraceMindTransport {
  var lastBatch: TraceMindBatch?

  func send(batch: TraceMindBatch, endpoint: URL) async throws {
    lastBatch = batch
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
    XCTAssertEqual(payload.properties["plan"], "pro")
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
}
