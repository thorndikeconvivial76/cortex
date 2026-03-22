.PHONY: build run clean archive

SCHEME = CortexDesktop
BUILD_DIR = .build/Release

build:
	swift build -c release

run:
	swift run CortexDesktop

clean:
	swift package clean
	rm -rf .build

# For creating a proper .app bundle from SPM build
bundle: build
	mkdir -p $(BUILD_DIR)/Cortex.app/Contents/MacOS
	mkdir -p $(BUILD_DIR)/Cortex.app/Contents/Resources
	cp $(BUILD_DIR)/CortexDesktop $(BUILD_DIR)/Cortex.app/Contents/MacOS/
	cp CortexDesktop/Info.plist $(BUILD_DIR)/Cortex.app/Contents/
	@echo "App bundle created at $(BUILD_DIR)/Cortex.app"

# DMG creation
dmg: bundle
	hdiutil create -volname "Cortex" -srcfolder $(BUILD_DIR)/Cortex.app -ov -format UDZO $(BUILD_DIR)/Cortex.dmg
	@echo "DMG created at $(BUILD_DIR)/Cortex.dmg"
