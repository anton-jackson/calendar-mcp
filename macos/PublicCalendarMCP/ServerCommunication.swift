/**
 * Server Communication Bridge
 * Handles HTTP communication between SwiftUI GUI and TypeScript MCP server
 */

import Foundation
import Combine

// MARK: - Data Models

struct ServerStatus: Codable {
    let timestamp: Date
    let serverStatus: String
    let sources: [CalendarSourceStatus]
}

struct CalendarSourceStatus: Codable, Identifiable {
    let id: String
    let name: String
    let status: String
    let lastSync: Date?
    let error: String?
}

struct CalendarSourceData: Codable, Identifiable {
    let id: String?
    let name: String
    let type: String
    let url: String
    let enabled: Bool
    let refreshInterval: Int
    
    // Identifiable conformance
    var identifiableId: String {
        return id ?? UUID().uuidString
    }
}

struct AppConfiguration: Codable {
    let server: ServerConfiguration
    let sources: [CalendarSourceData]
}

struct ServerConfiguration: Codable {
    let port: Int
    let autoStart: Bool
    let cacheTimeout: Int
}

struct TestResult: Codable {
    let success: Bool
    let error: String?
    let responseTime: Int?
}

struct APIError: Codable {
    let error: String
}

// MARK: - Server Communication Manager

@MainActor
class ServerCommunication: ObservableObject {
    @Published var serverStatus: ServerStatus?
    @Published var configuration: AppConfiguration?
    @Published var sources: [CalendarSourceData] = []
    @Published var isConnected: Bool = false
    @Published var lastError: String?
    
    private let baseURL: URL
    private var statusTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Helper Methods
    
    private func createJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        
        // Set up flexible date decoding
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            
            // Try ISO8601 first
            if let date = ISO8601DateFormatter().date(from: dateString) {
                return date
            }
            
            // Try custom formatter
            if let date = formatter.date(from: dateString) {
                return date
            }
            
            // Fallback to current date if parsing fails
            print("Warning: Could not parse date string: \(dateString)")
            return Date()
        }
        
        return decoder
    }
    
    init(baseURL: URL = URL(string: "http://localhost:3001")!) {
        self.baseURL = baseURL
        startStatusPolling()
    }
    
    deinit {
        // Note: deinit cannot call main actor methods directly
        // The timer will be cleaned up automatically when the object is deallocated
        statusTimer?.invalidate()
        statusTimer = nil
    }
    
    // MARK: - Status Monitoring
    
    private func startStatusPolling() {
        statusTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            Task { @MainActor in
                await self.fetchServerStatus()
            }
        }
        
        // Initial fetch
        Task { @MainActor in
            await fetchServerStatus()
            await fetchConfiguration()
        }
    }
    
    private func stopStatusPolling() {
        statusTimer?.invalidate()
        statusTimer = nil
    }
    
    func fetchServerStatus() async {
        do {
            let url = baseURL.appendingPathComponent("/api/status")
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                let decoder = createJSONDecoder()
                let status = try decoder.decode(ServerStatus.self, from: data)
                self.serverStatus = status
                self.isConnected = true
                self.lastError = nil
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.isConnected = false
            self.lastError = error.localizedDescription
            print("Failed to fetch server status: \(error)")
        }
    }
    
    // MARK: - Configuration Management
    
    func fetchConfiguration() async {
        do {
            let url = baseURL.appendingPathComponent("/api/config")
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                let decoder = createJSONDecoder()
                let config = try decoder.decode(AppConfiguration.self, from: data)
                self.configuration = config
                self.sources = config.sources
                self.lastError = nil
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to fetch configuration: \(error)")
        }
    }
    
    func updateServerConfiguration(_ serverConfig: ServerConfiguration) async -> Bool {
        do {
            let url = baseURL.appendingPathComponent("/api/config")
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let updateData = ["server": serverConfig]
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            request.httpBody = try encoder.encode(updateData)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                let decoder = createJSONDecoder()
                let config = try decoder.decode(AppConfiguration.self, from: data)
                self.configuration = config
                self.lastError = nil
                return true
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to update server configuration: \(error)")
            return false
        }
    }
    
    // MARK: - Calendar Source Management
    
    func addCalendarSource(_ source: CalendarSourceData) async -> Bool {
        do {
            let url = baseURL.appendingPathComponent("/api/sources")
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            request.httpBody = try encoder.encode(source)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 201 {
                // Refresh sources list
                await fetchConfiguration()
                self.lastError = nil
                return true
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to add calendar source: \(error)")
            return false
        }
    }
    
    func updateCalendarSource(_ sourceId: String, updates: CalendarSourceData) async -> Bool {
        do {
            let url = baseURL.appendingPathComponent("/api/sources/\(sourceId)")
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            request.httpBody = try encoder.encode(updates)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                // Refresh sources list
                await fetchConfiguration()
                self.lastError = nil
                return true
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to update calendar source: \(error)")
            return false
        }
    }
    
    func removeCalendarSource(_ sourceId: String) async -> Bool {
        do {
            let url = baseURL.appendingPathComponent("/api/sources/\(sourceId)")
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 204 {
                // Refresh sources list
                await fetchConfiguration()
                self.lastError = nil
                return true
            } else {
                throw CommunicationError.serverError("Failed to delete source")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to remove calendar source: \(error)")
            return false
        }
    }
    
    func testCalendarSource(_ sourceId: String) async -> TestResult? {
        do {
            let url = baseURL.appendingPathComponent("/api/sources/\(sourceId)/test")
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CommunicationError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                let decoder = createJSONDecoder()
                let result = try decoder.decode(TestResult.self, from: data)
                self.lastError = nil
                return result
            } else {
                let error = try? createJSONDecoder().decode(APIError.self, from: data)
                throw CommunicationError.serverError(error?.error ?? "Unknown error")
            }
        } catch {
            self.lastError = error.localizedDescription
            print("Failed to test calendar source: \(error)")
            return TestResult(success: false, error: error.localizedDescription, responseTime: nil)
        }
    }
}

// MARK: - Error Types

enum CommunicationError: LocalizedError {
    case invalidResponse
    case serverError(String)
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .serverError(let message):
            return "Server error: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}