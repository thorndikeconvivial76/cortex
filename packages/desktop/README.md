# Cortex Desktop (SwiftUI)

Native macOS menu bar app built with SwiftUI and Swift Package Manager.

## Requirements

- macOS 13.0+
- Xcode 15+ / Swift 5.9+

## Build & Run

```bash
# Development
make run

# Release build
make build

# Create .app bundle
make bundle

# Create DMG for distribution
make dmg

# Clean build artifacts
make clean
```

## Project Structure

```
├── Package.swift              # SPM manifest
├── Makefile                   # Build automation
├── CortexDesktop/
│   ├── Info.plist             # App metadata
│   ├── CortexDesktop.entitlements
│   ├── Assets.xcassets/       # App icon & accent color
│   └── Sources/               # Swift source files
└── Sources/                   # Main target sources
```

## Distribution

The app is distributed as a DMG outside the App Store. Sandbox is disabled in entitlements for direct distribution. A separate entitlements file with sandbox enabled would be needed for App Store submission.
