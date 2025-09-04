import SwiftUI
import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool {
        return false // Keep app running even when window is closed
    }
    
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            // Show the main window when app is reopened and no windows are visible
            for window in sender.windows {
                if window.isVisible == false {
                    window.makeKeyAndOrderFront(nil)
                    window.orderFrontRegardless()
                }
            }
        }
        return true
    }
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ensure app stays active and doesn't hide windows
        NSApp.setActivationPolicy(.regular)
    }
    
    func applicationDidBecomeActive(_ notification: Notification) {
        // Ensure main window is visible when app becomes active
        var foundWindow = false
        for window in NSApp.windows {
            if window.contentViewController != nil {
                window.makeKeyAndOrderFront(nil)
                window.orderFrontRegardless()
                foundWindow = true
                break
            }
        }
        
        // If no window was found, try again after a short delay
        if !foundWindow {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                for window in NSApp.windows {
                    if window.contentViewController != nil {
                        window.makeKeyAndOrderFront(nil)
                        window.orderFrontRegardless()
                        break
                    }
                }
            }
        }
    }
}

@main
struct PublicCalendarMCPApp: App {
    @StateObject private var menuBarManager = MenuBarManager()
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    @SceneBuilder
    var body: some Scene {
        WindowGroup("Public Calendar MCP") {
            ContentView()
                .environmentObject(menuBarManager)
                .frame(minWidth: 700, minHeight: 500)
                .onAppear {
                    // Ensure window is visible when content appears
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        NSApp.activate(ignoringOtherApps: true)
                        showMainWindow()
                    }
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .windowArrangement) {
                Button("Show Main Window") {
                    showMainWindow()
                }
                .keyboardShortcut("m", modifiers: [.command])
            }
        }
        
        // Menu bar extra for status indicator (macOS 13+ only)
        // For older macOS versions, users can access the app through the dock
        if #available(macOS 13.0, *) {
            MenuBarExtra("Public Calendar MCP", systemImage: "calendar.badge.clock") {
                MenuBarView()
                    .environmentObject(menuBarManager)
            }
            .menuBarExtraStyle(.menu)
        }
    }
    
    private func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        
        // Try to find and show the main window
        for window in NSApp.windows {
            if window.title.contains("Public Calendar") || window.contentViewController != nil {
                window.makeKeyAndOrderFront(nil)
                window.orderFrontRegardless()
                window.center()
                return
            }
        }
        
        // If no window found, try to create one by activating the app
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            for window in NSApp.windows {
                window.makeKeyAndOrderFront(nil)
                window.orderFrontRegardless()
                window.center()
                break
            }
        }
    }
}

struct MenuBarView: View {
    @EnvironmentObject var menuBarManager: MenuBarManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Server status section
            HStack {
                Circle()
                    .fill(menuBarManager.serverStatus.color)
                    .frame(width: 8, height: 8)
                Text("MCP Server: \(menuBarManager.serverStatus.displayName)")
                    .font(.caption)
            }
            
            Divider()
            
            // Quick actions
            Button("Show Calendar Manager") {
                NSApp.activate(ignoringOtherApps: true)
                if let window = NSApp.windows.first {
                    window.makeKeyAndOrderFront(nil)
                }
            }
            
            Button("Restart Server") {
                menuBarManager.restartServer()
            }
            .disabled(menuBarManager.serverStatus == .restarting)
            
            Divider()
            
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding(8)
        .frame(minWidth: 200)
    }
}