// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "InterviewNative",
    platforms: [.iOS(.v16)],
    products: [.library(name: "InterviewNative", targets: ["InterviewNative"])],
    targets: [
        .target(name: "InterviewNative", dependencies: ["WebRTC"]),
        // Pinned upstream Jitsi binary and checksum; no floating dependency.
        .binaryTarget(name: "WebRTC",
            url: "https://github.com/jitsi/webrtc/releases/download/v155.0.0/WebRTC.xcframework.zip",
            checksum: "bfc104ed2d3afb4285f4502aa949f1b44a0435d6e29c377094b24ed421578f59")
    ]
)
