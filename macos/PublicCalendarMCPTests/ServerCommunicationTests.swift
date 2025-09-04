/**
 * Tests for ServerCommunication Swift class
 */

import XCTest
@testable import PublicCalendarMCP

@MainActor
final class ServerCommunicationTests: XCTestCase {
    var serverCommunication: ServerCommunication!
    var mockServer: MockHTTPServer!
    
    override func setUp() async throws {
        try await super.setUp()
        
        // Start mock server
        mockServer = MockHTTPServer()
        try await mockServer.start()
        
        // Initialize ServerCommunication with mock server URL
        let baseURL = URL(string: "http://localhost:\(mockServer.port)")!
        serverCommunication = ServerCommunication(baseURL: baseURL)
    }
    
    override func tearDown() async throws {
        await mockServer.stop()
        mockServer = nil
        serverCommunication = nil
        try await super.tearDown()
    }
    
    // MARK: - Status Monitoring Tests
    
    func testFetchServerStatus() async throws {
        // Setup mock response
        let mockStatus = ServerStatus(
            timestamp: Date(),
            serverStatus: "running",
            sources: [
                CalendarSourceStatus(
                    id: "test-1",
                    name: "Test Calendar",
                    status: "active",
                    lastSync: Date(),
                    error: nil
                )
            ]
        )
        
        mockServer.setResponse(for: "/api/status", response: mockStatus)
        
        // Test status fetch
        await serverCommunication.fetchServerStatus()
        
        // Verify results
        XCTAssertTrue(serverCommunication.isConnected)
        XCTAssertNotNil(serverCommunication.serverStatus)
        XCTAssertEqual(serverCommunication.serverStatus?.serverStatus, "running")
        XCTAssertEqual(serverCommunication.serverStatus?.sources.count, 1)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testFetchServerStatusError() async throws {
        // Setup mock error response
        mockServer.setErrorResponse(for: "/api/status", statusCode: 500, error: "Server error")
        
        // Test status fetch
        await serverCommunication.fetchServerStatus()
        
        // Verify error handling
        XCTAssertFalse(serverCommunication.isConnected)
        XCTAssertNotNil(serverCommunication.lastError)
        XCTAssertTrue(serverCommunication.lastError!.contains("Server error"))
    }
    
    func testFetchServerStatusNetworkError() async throws {
        // Stop mock server to simulate network error
        await mockServer.stop()
        
        // Test status fetch
        await serverCommunication.fetchServerStatus()
        
        // Verify error handling
        XCTAssertFalse(serverCommunication.isConnected)
        XCTAssertNotNil(serverCommunication.lastError)
    }
    
    // MARK: - Configuration Management Tests
    
    func testFetchConfiguration() async throws {
        // Setup mock response
        let mockConfig = AppConfiguration(
            server: ServerConfiguration(
                port: 3000,
                autoStart: true,
                cacheTimeout: 3600
            ),
            sources: [
                CalendarSourceData(
                    id: "test-1",
                    name: "Test Calendar",
                    type: "ical",
                    url: "https://example.com/cal.ics",
                    enabled: true,
                    refreshInterval: 1800
                )
            ]
        )
        
        mockServer.setResponse(for: "/api/config", response: mockConfig)
        
        // Test configuration fetch
        await serverCommunication.fetchConfiguration()
        
        // Verify results
        XCTAssertNotNil(serverCommunication.configuration)
        XCTAssertEqual(serverCommunication.configuration?.server.port, 3000)
        XCTAssertEqual(serverCommunication.sources.count, 1)
        XCTAssertEqual(serverCommunication.sources.first?.name, "Test Calendar")
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testUpdateServerConfiguration() async throws {
        // Setup mock response
        let updatedConfig = AppConfiguration(
            server: ServerConfiguration(
                port: 3000,
                autoStart: false,
                cacheTimeout: 7200
            ),
            sources: []
        )
        
        mockServer.setResponse(for: "/api/config", method: "PUT", response: updatedConfig)
        
        // Test configuration update
        let newServerConfig = ServerConfiguration(
            port: 3000,
            autoStart: false,
            cacheTimeout: 7200
        )
        
        let success = await serverCommunication.updateServerConfiguration(newServerConfig)
        
        // Verify results
        XCTAssertTrue(success)
        XCTAssertEqual(serverCommunication.configuration?.server.autoStart, false)
        XCTAssertEqual(serverCommunication.configuration?.server.cacheTimeout, 7200)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    // MARK: - Calendar Source Management Tests
    
    func testAddCalendarSource() async throws {
        // Setup mock response
        let addedSource = CalendarSourceData(
            id: "new-source-1",
            name: "New Calendar",
            type: "ical",
            url: "https://example.com/new.ics",
            enabled: true,
            refreshInterval: 1800
        )
        
        mockServer.setResponse(for: "/api/sources", method: "POST", response: addedSource, statusCode: 201)
        
        // Setup config fetch response for refresh
        let updatedConfig = AppConfiguration(
            server: ServerConfiguration(port: 3000, autoStart: true, cacheTimeout: 3600),
            sources: [addedSource]
        )
        mockServer.setResponse(for: "/api/config", response: updatedConfig)
        
        // Test adding source
        let sourceToAdd = CalendarSourceData(
            id: nil,
            name: "New Calendar",
            type: "ical",
            url: "https://example.com/new.ics",
            enabled: true,
            refreshInterval: 1800
        )
        
        let success = await serverCommunication.addCalendarSource(sourceToAdd)
        
        // Verify results
        XCTAssertTrue(success)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testUpdateCalendarSource() async throws {
        // Setup mock response
        let updatedSource = CalendarSourceData(
            id: "test-1",
            name: "Updated Calendar",
            type: "ical",
            url: "https://example.com/updated.ics",
            enabled: true,
            refreshInterval: 3600
        )
        
        mockServer.setResponse(for: "/api/sources/test-1", method: "PUT", response: updatedSource)
        
        // Setup config fetch response for refresh
        let updatedConfig = AppConfiguration(
            server: ServerConfiguration(port: 3000, autoStart: true, cacheTimeout: 3600),
            sources: [updatedSource]
        )
        mockServer.setResponse(for: "/api/config", response: updatedConfig)
        
        // Test updating source
        let success = await serverCommunication.updateCalendarSource("test-1", updates: updatedSource)
        
        // Verify results
        XCTAssertTrue(success)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testRemoveCalendarSource() async throws {
        // Setup mock response
        mockServer.setResponse(for: "/api/sources/test-1", method: "DELETE", response: EmptyResponse(), statusCode: 204)
        
        // Setup config fetch response for refresh
        let updatedConfig = AppConfiguration(
            server: ServerConfiguration(port: 3000, autoStart: true, cacheTimeout: 3600),
            sources: []
        )
        mockServer.setResponse(for: "/api/config", response: updatedConfig)
        
        // Test removing source
        let success = await serverCommunication.removeCalendarSource("test-1")
        
        // Verify results
        XCTAssertTrue(success)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testTestCalendarSource() async throws {
        // Setup mock response
        let testResult = TestResult(
            success: true,
            error: nil,
            responseTime: 250
        )
        
        mockServer.setResponse(for: "/api/sources/test-1/test", method: "POST", response: testResult)
        
        // Test source testing
        let result = await serverCommunication.testCalendarSource("test-1")
        
        // Verify results
        XCTAssertNotNil(result)
        XCTAssertTrue(result!.success)
        XCTAssertEqual(result!.responseTime, 250)
        XCTAssertNil(result!.error)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    func testTestCalendarSourceFailure() async throws {
        // Setup mock response
        let testResult = TestResult(
            success: false,
            error: "Connection timeout",
            responseTime: nil
        )
        
        mockServer.setResponse(for: "/api/sources/test-1/test", method: "POST", response: testResult)
        
        // Test source testing
        let result = await serverCommunication.testCalendarSource("test-1")
        
        // Verify results
        XCTAssertNotNil(result)
        XCTAssertFalse(result!.success)
        XCTAssertEqual(result!.error, "Connection timeout")
        XCTAssertNil(result!.responseTime)
        XCTAssertNil(serverCommunication.lastError)
    }
    
    // MARK: - Error Handling Tests
    
    func testHandleInvalidJSON() async throws {
        // Setup invalid JSON response
        mockServer.setRawResponse(for: "/api/status", response: "invalid json")
        
        // Test status fetch
        await serverCommunication.fetchServerStatus()
        
        // Verify error handling
        XCTAssertFalse(serverCommunication.isConnected)
        XCTAssertNotNil(serverCommunication.lastError)
    }
    
    func testHandleHTTPError() async throws {
        // Setup HTTP error response
        mockServer.setErrorResponse(for: "/api/config", statusCode: 400, error: "Bad request")
        
        // Test configuration fetch
        await serverCommunication.fetchConfiguration()
        
        // Verify error handling
        XCTAssertNotNil(serverCommunication.lastError)
        XCTAssertTrue(serverCommunication.lastError!.contains("Bad request"))
    }
}

// MARK: - Mock HTTP Server

class MockHTTPServer {
    private var server: HTTPServer?
    private var responses: [String: MockResponse] = [:]
    let port: Int
    
    init() {
        self.port = Int.random(in: 8000...9000)
    }
    
    func start() async throws {
        // This would be implemented with a real HTTP server for testing
        // For now, we'll simulate the server behavior
    }
    
    func stop() async {
        server = nil
        responses.removeAll()
    }
    
    func setResponse<T: Codable>(for path: String, method: String = "GET", response: T, statusCode: Int = 200) {
        let key = "\(method) \(path)"
        responses[key] = MockResponse(data: response, statusCode: statusCode)
    }
    
    func setRawResponse(for path: String, method: String = "GET", response: String, statusCode: Int = 200) {
        let key = "\(method) \(path)"
        responses[key] = MockResponse(rawData: response, statusCode: statusCode)
    }
    
    func setErrorResponse(for path: String, method: String = "GET", statusCode: Int, error: String) {
        let key = "\(method) \(path)"
        let errorResponse = ["error": error]
        responses[key] = MockResponse(data: errorResponse, statusCode: statusCode)
    }
}

struct MockResponse {
    let data: Any?
    let rawData: String?
    let statusCode: Int
    
    init<T: Codable>(data: T, statusCode: Int = 200) {
        self.data = data
        self.rawData = nil
        self.statusCode = statusCode
    }
    
    init(rawData: String, statusCode: Int = 200) {
        self.data = nil
        self.rawData = rawData
        self.statusCode = statusCode
    }
}

struct EmptyResponse: Codable {}

// MARK: - Mock HTTP Server Protocol

protocol HTTPServer {
    func start() async throws
    func stop() async
}