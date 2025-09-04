import XCTest

final class PublicCalendarMCPUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }
    
    override func tearDownWithError() throws {
        app = nil
    }
    
    func testApplicationLaunch() throws {
        // Test that the application launches successfully
        XCTAssertTrue(app.exists)
        
        // Verify main window elements are present
        let mainWindow = app.windows.firstMatch
        XCTAssertTrue(mainWindow.exists)
        
        // Check for header elements
        XCTAssertTrue(app.staticTexts["Public Calendar MCP Server"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Server Status:'")).firstMatch.exists)
    }
    
    func testMenuBarFunctionality() throws {
        // Test menu bar status indicator
        // Note: Menu bar testing is limited in UI tests, but we can verify the app doesn't crash
        XCTAssertTrue(app.exists)
        
        // Test restart server button in main window
        let restartButton = app.buttons["Restart Server"]
        XCTAssertTrue(restartButton.exists)
        
        // The button should be enabled initially (assuming server is not in restarting state)
        XCTAssertTrue(restartButton.isEnabled)
    }
    
    func testAddCalendarSheet() throws {
        // Test opening the Add Calendar sheet
        let addCalendarButton = app.buttons["Add Calendar Source"]
        XCTAssertTrue(addCalendarButton.exists)
        
        addCalendarButton.tap()
        
        // Verify sheet opens
        let sheet = app.sheets.firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 2.0))
        
        // Verify sheet contents
        XCTAssertTrue(app.staticTexts["Add Calendar Source"].exists)
        XCTAssertTrue(app.textFields["Enter calendar name"].exists)
        XCTAssertTrue(app.textFields["Enter calendar URL"].exists)
        
        // Test form validation - Add button should be disabled initially
        let addButton = app.buttons["Add Calendar"]
        XCTAssertFalse(addButton.isEnabled)
        
        // Fill in form fields
        let nameField = app.textFields["Enter calendar name"]
        nameField.click()
        nameField.typeText("Test Calendar")
        
        let urlField = app.textFields["Enter calendar URL"]
        urlField.click()
        urlField.typeText("https://example.com/calendar.ics")
        
        // Add button should now be enabled
        XCTAssertTrue(addButton.isEnabled)
        
        // Test cancel functionality
        let cancelButton = app.buttons["Cancel"]
        XCTAssertTrue(cancelButton.exists)
        cancelButton.tap()
        
        // Sheet should close
        XCTAssertFalse(sheet.exists)
    }
    
    func testCalendarTypeSelection() throws {
        // Open Add Calendar sheet
        app.buttons["Add Calendar Source"].tap()
        
        let sheet = app.sheets.firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 2.0))
        
        // Test calendar type picker
        let picker = app.segmentedControls.firstMatch
        XCTAssertTrue(picker.exists)
        
        // Verify all calendar types are available
        XCTAssertTrue(picker.buttons["iCal Feed"].exists)
        XCTAssertTrue(picker.buttons["CalDAV"].exists)
        XCTAssertTrue(picker.buttons["Google Calendar"].exists)
        
        // Test selecting different types
        picker.buttons["CalDAV"].tap()
        XCTAssertTrue(picker.buttons["CalDAV"].isSelected)
        
        picker.buttons["Google Calendar"].tap()
        XCTAssertTrue(picker.buttons["Google Calendar"].isSelected)
        
        // Close sheet
        app.buttons["Cancel"].tap()
    }
    
    func testMainWindowLayout() throws {
        // Test that main window has expected layout elements
        let mainWindow = app.windows.firstMatch
        XCTAssertTrue(mainWindow.exists)
        
        // Header section
        XCTAssertTrue(app.staticTexts["Public Calendar MCP Server"].exists)
        XCTAssertTrue(app.buttons["Restart Server"].exists)
        
        // Main content area
        XCTAssertTrue(app.images.matching(NSPredicate(format: "identifier CONTAINS 'calendar'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Calendar Source Management"].exists)
        XCTAssertTrue(app.staticTexts["This interface will manage your public calendar sources"].exists)
        XCTAssertTrue(app.buttons["Add Calendar Source"].exists)
    }
}