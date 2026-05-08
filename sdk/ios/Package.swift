// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "TraceMind",
  platforms: [
    .iOS(.v13),
    .macOS(.v12),
  ],
  products: [
    .library(name: "TraceMind", targets: ["TraceMind"]),
  ],
  targets: [
    .target(name: "TraceMind"),
    .testTarget(name: "TraceMindTests", dependencies: ["TraceMind"]),
  ]
)
