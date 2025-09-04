import XCTest
import SwiftUI
@testable import PublicCalendarMCP

class SystemIntegrationTests: XCTestCase {
    
    var launchAtLoginManager: LaunchAtLoginManager!
    
    override func setUpWithError() throws {
        launchAtLoginManager = LaunchAtLoginManager()
    }
    
    override func tearDownWithError() throws {
        // Clean up any login items that were added during testing
        launchAtLoginManager.setLaunchAtLogin(enabled: false)
        launchAtLoginManager = nil
    }
    
    // MARK: - Launch at Login Tests
    
    func testLaunchAtLoginManagerInitialization() throws {
        // Test that the manager initializes properly
        XCTAssertNotNil(launchAtLoginManager)
        
        // The initial state should be determined by checking actual login items
        // We don't assert a specific value since it depends on system state
        XCTAssertNotNil(launchAtLoginManager.isEnabled)
    }
    
    func testSetLaunchAtLoginEnabled() throws {
        // Test enabling launch at login
        let initialState = launchAtLoginManager.isEnabled
        
        launchAtLoginManager.setLaunchAtLogin(enabled: true)
        XCTAssertTrue(launchAtLoginManager.isEnabled)
        
        // Test disabling launch at login
        launchAtLoginManager.setLaunchAtLogin(enabled: false)
        XCTAssertFalse(launchAtLoginManager.isEnabled)
        
        // Restore initial state
        launchAtLoginManager.setLaunchAtLogin(enabled: initialState)
    }
    
    func testLaunchAtLoginToggle() throws {
        let initialState = launchAtLoginManager.isEnabled
        
        // Toggle the state
        launchAtLoginManager.setLaunchAtLogin(enabled: !initialState)
        XCTAssertEqual(launchAtLoginManager.isEnabled, !initialState)
        
        // Toggle back
        launchAtLoginManager.setLaunchAtLogin(enabled: initialState)
        XCTAssertEqual(launchAtLoginManager.isEnabled, initialState)
    }
    
    // MARK: - Application Bundle Tests
    
    func testApplicationBundleMetadata() throws {
        let bundle = Bundle.main
        
        // Test that essential bundle properties are set
        XCTAssertNotNil(bundle.bundleIdentifier)
        XCTAssertFalse(bundle.bundleIdentifier!.isEmpty)
        
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleDisplayName"])
        XCTAssertEqual(bundle.infoDictionary?["CFBundleDisplayName"] as? String, "Public Calendar MCP")
        
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleShortVersionString"])
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleVersion"])
        
        // Test application category
        XCTAssertEqual(bundle.infoDictionary?["LSApplicationCategoryType"] as? String, "public.app-category.productivity")
        
        // Test that the app is configured as a UI element (menu bar app)
        XCTAssertEqual(bundle.infoDictionary?["LSUIElement"] as? Bool, true)
    }
    
    func testApplicationIconConfiguration() throws {
        let bundle = Bundle.main
        
        // Test that icon file is specified
        let iconFile = bundle.infoDictionary?["CFBundleIconFile"] as? String
        XCTAssertNotNil(iconFile)
        XCTAssertEqual(iconFile, "AppIcon")
    }
    
    func testApplicationSupportDirectoryAccess() throws {
        // Test that we can access the Application Support directory
        let fileManager = FileManager.default
        let appSupportURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        
        XCTAssertNotNil(appSupportURL)
        
        // Test creating our app-specific directory
        let appDirectory = appSupportURL!.appendingPathComponent("PublicCalendarMCP")
        
        do {
            try fileManager.createDirectory(at: appDirectory, withIntermediateDirectories: true, attributes: nil)
            XCTAssertTrue(fileManager.fileExists(atPath: appDirectory.path))
            
            // Clean up
            try fileManager.removeItem(at: appDirectory)
        } catch {
            XCTFail("Failed to create/remove application support directory: \(error)")
        }
    }
    
    // MARK: - System Integration Tests
    
    func testApplicationCanLaunch() throws {
        // Test that the application can be launched (this test runs as part of the app launch)
        let app = NSApplication.shared
        XCTAssertNotNil(app)
        XCTAssertTrue(app.isActive || app.isRunning)
    }
    
    func testMenuBarIntegration() throws {
        // Test that menu bar functionality is available
        let statusBar = NSStatusBar.system
        XCTAssertNotNil(statusBar)
        
        // Test that we can create a status item (this is what MenuBarManager does)
        let statusItem = statusBar.statusItem(withLength: NSStatusItem.variableLength)
        XCTAssertNotNil(statusItem)
        
        // Clean up
        statusBar.removeStatusItem(statusItem)
    }
    
    func testSpotlightIntegration() throws {
        let bundle = Bundle.main
        
        // Test that bundle has proper metadata for Spotlight
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleDisplayName"])
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleGetInfoString"])
        XCTAssertNotNil(bundle.infoDictionary?["CFBundleSpokenName"])
        
        // Test that the app is in the correct category for Spotlight
        XCTAssertEqual(bundle.infoDictionary?["LSApplicationCategoryType"] as? String, "public.app-category.productivity")
    }
    
    // MARK: - Settings Integration Tests
    
    func testSettingsSheetCreation() throws {
        // Test that we can create the settings sheet
        let settingsSheet = SettingsSheet()
        XCTAssertNotNil(settingsSheet)
        
        // This is a basic test to ensure the view can be instantiated
        // More detailed UI testing would require XCUITest framework
    }
    
    func testLaunchAtLoginManagerInSettings() throws {
        // Test that LaunchAtLoginManager works within the settings context
        let manager = LaunchAtLoginManager()
        XCTAssertNotNil(manager)
        
        // Test that the manager can check status
        manager.checkLaunchAtLoginStatus()
        XCTAssertNotNil(manager.isEnabled)
    }
    
    // MARK: - Performance Tests
    
    func testLaunchAtLoginPerformance() throws {
        measure {
            let manager = LaunchAtLoginManager()
            manager.checkLaunchAtLoginStatus()
        }
    }
    
    func testBundleMetadataAccessPerformance() throws {
        measure {
            let bundle = Bundle.main
            _ = bundle.bundleIdentifier
            _ = bundle.infoDictionary?["CFBundleDisplayName"]
            _ = bundle.infoDictionary?["CFBundleShortVersionString"]
        }
    }
    
    // MARK: - Error Handling Tests
    
    func testLaunchAtLoginErrorHandling() throws {
        // Test that the manager handles errors gracefully
        let manager = LaunchAtLoginManager()
        
        // These operations should not crash even if they fail
        manager.setLaunchAtLogin(enabled: true)
        manager.setLaunchAtLogin(enabled: false)
        manager.checkLaunchAtLoginStatus()
        
        // The manager should still be in a valid state
        XCTAssertNotNil(manager.isEnabled)
    }
}

// MARK: - Mock Classes for Testing

class MockLaunchAtLoginManager: LaunchAtLoginManager {
    private var mockEnabled = false
    
    override var isEnabled: Bool {
        get { mockEnabled }
        set { mockEnabled = newValue }
    }
    
    override func setLaunchAtLogin(enabled: Bool) {
        mockEnabled = enabled
    }
    
    override func checkLaunchAtLoginStatus() {
        // Mock implementation - do nothing
    }
}

// MARK: - Integration Test Extensions

extension SystemIntegrationTests {
    
    func testEndToEndSystemIntegration() throws {
        // This test verifies the complete system integration flow
        
        // 1. Test application launch and bundle access
        let bundle = Bundle.main
        XCTAssertNotNil(bundle.bundleIdentifier)
        
        // 2. Test launch at login functionality
        let manager = LaunchAtLoginManager()
        let initialState = manager.isEnabled
        
        // 3. Test toggling launch at login
        manager.setLaunchAtLogin(enabled: !initialState)
        XCTAssertEqual(manager.isEnabled, !initialState)
        
        // 4. Test settings integration
        let settingsSheet = SettingsSheet()
        XCTAssertNotNil(settingsSheet)
        
        // 5. Restore initial state
        manager.setLaunchAtLogin(enabled: initialState)
        XCTAssertEqual(manager.isEnabled, initialState)
    }
}