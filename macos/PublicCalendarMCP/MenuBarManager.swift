import SwiftUI
import Foundation
import Combine

/// Manages the menu bar status indicator and server communication
@MainActor
class MenuBarManager: ObservableObject {
    @Published var serverStatus: LocalServerStatus = .stopped
    @Published var lastStatusUpdate: Date = Date()
    
    private var serverProcess: Process?
    private var statusTimer: Timer?
    private var serverCommunication: ServerCommunication?
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupServerCommunication()
        startStatusMonitoring()
        startServerIfNeeded()
    }
    
    deinit {
        // Note: deinit cannot be isolated to MainActor, so we handle cleanup differently
        serverProcess?.terminate()
        serverProcess = nil
        statusTimer?.invalidate()
    }
    
    private func setupServerCommunication() {
        serverCommunication = ServerCommunication()
        
        // Monitor server communication status
        serverCommunication?.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isConnected in
                if isConnected {
                    self?.serverStatus = .running
                } else if self?.serverStatus == .running {
                    self?.serverStatus = .error
                }
                self?.lastStatusUpdate = Date()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Server Management
    
    func startServer() {
        guard serverStatus != .running && serverStatus != .starting else { return }
        
        serverStatus = .starting
        
        // Start the Node.js MCP server
        let serverPath = Bundle.main.path(forResource: "server", ofType: "js") ?? "../dist/index.js"
        
        serverProcess = Process()
        serverProcess?.executableURL = URL(fileURLWithPath: "/usr/bin/node")
        serverProcess?.arguments = [serverPath]
        
        // Set up environment
        var environment = ProcessInfo.processInfo.environment
        environment["NODE_ENV"] = "production"
        serverProcess?.environment = environment
        
        do {
            try serverProcess?.run()
            
            // Give the server a moment to start
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.checkServerHealth()
            }
        } catch {
            print("Failed to start server: \(error)")
            serverStatus = .error
        }
    }
    
    func stopServer() {
        serverProcess?.terminate()
        serverProcess = nil
        serverStatus = .stopped
    }
    
    func restartServer() {
        serverStatus = .restarting
        stopServer()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.startServer()
        }
    }
    
    // MARK: - Status Monitoring
    
    private func startStatusMonitoring() {
        statusTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { _ in
            self.checkServerHealth()
        }
    }
    
    private func checkServerHealth() {
        // Simple health check - in a real implementation, this would ping the MCP server
        if let process = serverProcess, process.isRunning {
            if serverStatus != .running {
                serverStatus = .running
                lastStatusUpdate = Date()
            }
        } else if serverStatus == .running || serverStatus == .starting {
            serverStatus = .error
            lastStatusUpdate = Date()
        }
    }
    
    private func startServerIfNeeded() {
        // Auto-start server based on user preferences
        let shouldAutoStart = UserDefaults.standard.bool(forKey: "autoStartServer")
        if shouldAutoStart {
            startServer()
        }
    }
}

// MARK: - Local Server Status

enum LocalServerStatus {
    case stopped
    case starting
    case running
    case error
    case restarting
    
    var displayName: String {
        switch self {
        case .stopped:
            return "Stopped"
        case .starting:
            return "Starting..."
        case .running:
            return "Running"
        case .error:
            return "Error"
        case .restarting:
            return "Restarting..."
        }
    }
    
    var color: Color {
        switch self {
        case .stopped:
            return .gray
        case .starting, .restarting:
            return .orange
        case .running:
            return .green
        case .error:
            return .red
        }
    }
}