// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CortexDesktop",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "CortexDesktop", targets: ["CortexDesktop"])
    ],
    targets: [
        .executableTarget(
            name: "CortexDesktop",
            path: "Sources",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
