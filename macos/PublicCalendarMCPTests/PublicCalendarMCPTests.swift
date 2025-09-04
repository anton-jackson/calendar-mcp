import XCTest
@testable import PublicCalendarMCP

final class PublicCalendarMCPTests: XCTestCase {
    
    var menuBarManager: MenuBarManager!
    
    override func setUpWithError() throws {
        menuBarManager = MenuBarManager()
    }
    
    override func tearDownWithError() throws {
        menuBarManager = nil
    }
    
    func testMenuBarManagerInitialization() throws {
        // Test that MenuBarManager initializes with correct default state
        XCTAssertEqual(menuBarManager.serverStatus, .stopped)
        XCTAssertNotNil(menuBarManager.lastStatusUpdate)
    }
    
    func testServerStatusDisplayNames() throws {
        // Test that all server status cases have proper display names
        XCTAssertEqual(ServerStatus.stopped.displayName, "Stopped")
        XCTAssertEqual(ServerStatus.starting.displayName, "Starting...")
        XCTAssertEqual(ServerStatus.running.displayName, "Running")
        XCTAssertEqual(ServerStatus.error.displayName, "Error")
        XCTAssertEqual(ServerStatus.restarting.displayName, "Restarting...")
    }
    
    func testServerStatusColors() throws {
        // Test that all server status cases have appropriate colors
        XCTAssertEqual(ServerStatus.stopped.color, .gray)
        XCTAssertEqual(ServerStatus.starting.color, .orange)
        XCTAssertEqual(ServerStatus.running.color, .green)
        XCTAssertEqual(ServerStatus.error.color, .red)
        XCTAssertEqual(ServerStatus.restarting.color, .orange)
    }
    
    func testCalendarSourceTypeDisplayNames() throws {
        // Test that calendar source types have proper display names
        XCTAssertEqual(CalendarSourceType.ical.displayName, "iCal Feed")
        XCTAssertEqual(CalendarSourceType.caldav.displayName, "CalDAV")
        XCTAssertEqual(CalendarSourceType.google.displayName, "Google Calendar")
    }
    
    func testCalendarSourceTypeRawValues() throws {
        // Test that calendar source types have correct raw values
        XCTAssertEqual(CalendarSourceType.ical.rawValue, "ical")
        XCTAssertEqual(CalendarSourceType.caldav.rawValue, "caldav")
        XCTAssertEqual(CalendarSourceType.google.rawValue, "google")
    }
}