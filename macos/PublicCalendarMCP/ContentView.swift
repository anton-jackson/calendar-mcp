import SwiftUI

struct ContentView: View {
    @EnvironmentObject var menuBarManager: MenuBarManager
    @StateObject private var serverCommunication = ServerCommunication()
    @State private var showingAddCalendar = false
    @State private var selectedSource: CalendarSourceData?
    @State private var showingSettings = false
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header with server status
                HeaderView(showingSettings: $showingSettings)
                    .environmentObject(menuBarManager)
                
                Divider()
                
                // Main content area - calendar source management
                if serverCommunication.isConnected {
                    CalendarSourceListView(
                        sources: serverCommunication.sources,
                        serverStatus: serverCommunication.serverStatus,
                        onAddSource: { showingAddCalendar = true },
                        onEditSource: { source in selectedSource = source },
                        onDeleteSource: { sourceId in
                            Task { @MainActor in
                                isLoading = true
                                await serverCommunication.removeCalendarSource(sourceId)
                                isLoading = false
                            }
                        },
                        onTestSource: { sourceId in
                            Task { @MainActor in
                                await serverCommunication.testCalendarSource(sourceId)
                            }
                        }
                    )
                } else {
                    DisconnectedView(
                        error: serverCommunication.lastError,
                        onRetry: {
                            Task { @MainActor in
                                await serverCommunication.fetchServerStatus()
                            }
                        }
                    )
                }
                
                Spacer()
            }
        }
        .sheet(isPresented: $showingAddCalendar) {
            AddCalendarSheet { source in
                Task { @MainActor in
                    await serverCommunication.addCalendarSource(source)
                }
            }
        }
        .sheet(item: $selectedSource) { source in
            EditCalendarSheet(source: source) { updatedSource in
                Task { @MainActor in
                    await serverCommunication.updateCalendarSource(source.id!, updates: updatedSource)
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheet()
        }
    }
}

struct HeaderView: View {
    @EnvironmentObject var menuBarManager: MenuBarManager
    @Binding var showingSettings: Bool
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Public Calendar MCP Server")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                HStack(spacing: 8) {
                    Circle()
                        .fill(menuBarManager.serverStatus.color)
                        .frame(width: 8, height: 8)
                    
                    Text("Server Status: \(menuBarManager.serverStatus.displayName)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            HStack(spacing: 8) {
                Button("Settings") {
                    showingSettings = true
                }
                .buttonStyle(.bordered)
                
                Button("Restart Server") {
                    menuBarManager.restartServer()
                }
                .disabled(menuBarManager.serverStatus == .restarting)
            }
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
    }
}

// MARK: - Calendar Source List View

struct CalendarSourceListView: View {
    let sources: [CalendarSourceData]
    let serverStatus: ServerStatus?
    let onAddSource: () -> Void
    let onEditSource: (CalendarSourceData) -> Void
    let onDeleteSource: (String) -> Void
    let onTestSource: (String) -> Void
    
    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                VStack(alignment: .leading) {
                    Text("Calendar Sources")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    if let status = serverStatus {
                        Text("\(sources.count) sources configured • Server: \(status.serverStatus)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                Button("Add Source", action: onAddSource)
                    .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal)
            .padding(.top)
            
            // Sources list
            if sources.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    
                    Text("No Calendar Sources")
                        .font(.title3)
                        .fontWeight(.medium)
                    
                    Text("Add your first public calendar source to get started")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(sources, id: \.id) { source in
                            CalendarSourceRow(
                                source: source,
                                status: serverStatus?.sources.first { $0.id == source.id },
                                onEdit: { onEditSource(source) },
                                onDelete: { onDeleteSource(source.id!) },
                                onTest: { onTestSource(source.id!) }
                            )
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }
}

// MARK: - Calendar Source Row

struct CalendarSourceRow: View {
    let source: CalendarSourceData
    let status: CalendarSourceStatus?
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onTest: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(source.name)
                        .font(.headline)
                    
                    Spacer()
                    
                    Text(source.type.uppercased())
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.2))
                        .cornerRadius(4)
                }
                
                Text(source.url)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                if let status = status, let error = status.error {
                    Text("Error: \(error)")
                        .font(.caption)
                        .foregroundColor(.red)
                        .lineLimit(2)
                }
            }
            
            Spacer()
            
            // Action buttons
            HStack(spacing: 8) {
                Button("Test", action: onTest)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                
                Button("Edit", action: onEdit)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                
                Button("Delete", action: onDelete)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .foregroundColor(.red)
            }
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }
    
    private var statusColor: Color {
        guard let status = status else { return .gray }
        
        switch status.status {
        case "active":
            return .green
        case "error":
            return .red
        case "syncing":
            return .orange
        default:
            return .gray
        }
    }
}

// MARK: - Disconnected View

struct DisconnectedView: View {
    let error: String?
    let onRetry: () -> Void
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text("Server Disconnected")
                .font(.title2)
                .fontWeight(.medium)
            
            if let error = error {
                Text(error)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Button("Retry Connection", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Add Calendar Sheet

struct AddCalendarSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var calendarName = ""
    @State private var calendarURL = ""
    @State private var calendarType = CalendarSourceType.ical
    @State private var refreshInterval = 1800
    @State private var isSubmitting = false
    
    let onAdd: (CalendarSourceData) -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Add Calendar Source")
                .font(.title2)
                .fontWeight(.semibold)
            
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Name")
                        .font(.headline)
                    TextField("Enter calendar name", text: $calendarName)
                        .textFieldStyle(.roundedBorder)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("URL")
                        .font(.headline)
                    TextField("Enter calendar URL", text: $calendarURL)
                        .textFieldStyle(.roundedBorder)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Type")
                        .font(.headline)
                    Picker("Calendar Type", selection: $calendarType) {
                        ForEach(CalendarSourceType.allCases, id: \.self) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Refresh Interval (seconds)")
                        .font(.headline)
                    TextField("1800", value: $refreshInterval, format: .number)
                        .textFieldStyle(.roundedBorder)
                }
            }
            .padding()
            
            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .buttonStyle(.bordered)
                .disabled(isSubmitting)
                
                Spacer()
                
                Button("Add Calendar") {
                    isSubmitting = true
                    let source = CalendarSourceData(
                        id: nil,
                        name: calendarName,
                        type: calendarType.rawValue,
                        url: calendarURL,
                        enabled: true,
                        refreshInterval: refreshInterval
                    )
                    onAdd(source)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(calendarName.isEmpty || calendarURL.isEmpty || isSubmitting)
            }
            .padding()
        }
        .frame(width: 450, height: 350)
    }
}

// MARK: - Edit Calendar Sheet

struct EditCalendarSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var calendarName: String
    @State private var calendarURL: String
    @State private var calendarType: CalendarSourceType
    @State private var refreshInterval: Int
    @State private var isSubmitting = false
    
    let source: CalendarSourceData
    let onUpdate: (CalendarSourceData) -> Void
    
    init(source: CalendarSourceData, onUpdate: @escaping (CalendarSourceData) -> Void) {
        self.source = source
        self.onUpdate = onUpdate
        self._calendarName = State(initialValue: source.name)
        self._calendarURL = State(initialValue: source.url)
        self._calendarType = State(initialValue: CalendarSourceType(rawValue: source.type) ?? .ical)
        self._refreshInterval = State(initialValue: source.refreshInterval)
    }
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Edit Calendar Source")
                .font(.title2)
                .fontWeight(.semibold)
            
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Name")
                        .font(.headline)
                    TextField("Enter calendar name", text: $calendarName)
                        .textFieldStyle(.roundedBorder)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("URL")
                        .font(.headline)
                    TextField("Enter calendar URL", text: $calendarURL)
                        .textFieldStyle(.roundedBorder)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Type")
                        .font(.headline)
                    Picker("Calendar Type", selection: $calendarType) {
                        ForEach(CalendarSourceType.allCases, id: \.self) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Refresh Interval (seconds)")
                        .font(.headline)
                    TextField("1800", value: $refreshInterval, format: .number)
                        .textFieldStyle(.roundedBorder)
                }
            }
            .padding()
            
            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .buttonStyle(.bordered)
                .disabled(isSubmitting)
                
                Spacer()
                
                Button("Update Calendar") {
                    isSubmitting = true
                    let updatedSource = CalendarSourceData(
                        id: source.id,
                        name: calendarName,
                        type: calendarType.rawValue,
                        url: calendarURL,
                        enabled: source.enabled,
                        refreshInterval: refreshInterval
                    )
                    onUpdate(updatedSource)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(calendarName.isEmpty || calendarURL.isEmpty || isSubmitting)
            }
            .padding()
        }
        .frame(width: 450, height: 350)
    }
}

enum CalendarSourceType: String, CaseIterable {
    case ical = "ical"
    case caldav = "caldav"
    case google = "google"
    
    var displayName: String {
        switch self {
        case .ical:
            return "iCal Feed"
        case .caldav:
            return "CalDAV"
        case .google:
            return "Google Calendar"
        }
    }
}

// MARK: - Settings Sheet

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var launchAtLoginManager = LaunchAtLoginManager()
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Settings")
                .font(.title2)
                .fontWeight(.semibold)
            
            VStack(alignment: .leading, spacing: 16) {
                GroupBox("System Integration") {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("Launch at Login", isOn: $launchAtLoginManager.isEnabled)
                            .onChange(of: launchAtLoginManager.isEnabled) { newValue in
                                launchAtLoginManager.setLaunchAtLogin(enabled: newValue)
                            }
                        
                        Text("Automatically start Public Calendar MCP when you log in to macOS")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                }
                
                GroupBox("Application Info") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Version:")
                                .fontWeight(.medium)
                            Spacer()
                            Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown")
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Build:")
                                .fontWeight(.medium)
                            Spacer()
                            Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown")
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Bundle ID:")
                                .fontWeight(.medium)
                            Spacer()
                            Text(Bundle.main.bundleIdentifier ?? "Unknown")
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }
                    }
                    .padding()
                }
            }
            .padding()
            
            HStack {
                Spacer()
                
                Button("Done") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
        .frame(width: 450, height: 350)
    }
}

// MARK: - Launch at Login Manager

class LaunchAtLoginManager: ObservableObject {
    @Published var isEnabled: Bool = false
    
    private let launcherBundleId = "com.publiccalendarmcp.launcher"
    
    init() {
        checkLaunchAtLoginStatus()
    }
    
    func checkLaunchAtLoginStatus() {
        let runningApps = NSWorkspace.shared.runningApplications
        isEnabled = runningApps.contains { app in
            app.bundleIdentifier == launcherBundleId
        }
        
        // Also check login items
        if !isEnabled {
            isEnabled = isAppInLoginItems()
        }
    }
    
    func setLaunchAtLogin(enabled: Bool) {
        if enabled {
            addToLoginItems()
        } else {
            removeFromLoginItems()
        }
        isEnabled = enabled
    }
    
    private func addToLoginItems() {
        // Use legacy method for macOS 12 compatibility
        addToLoginItemsLegacy()
    }
    
    private func removeFromLoginItems() {
        // Use legacy method for macOS 12 compatibility
        removeFromLoginItemsLegacy()
    }
    
    private func addToLoginItemsLegacy() {
        let appURL = Bundle.main.bundleURL
        
        let loginItems = LSSharedFileListCreate(nil, kLSSharedFileListSessionLoginItems.takeRetainedValue(), nil)
        if let loginItems = loginItems?.takeRetainedValue() {
            LSSharedFileListInsertItemURL(
                loginItems,
                kLSSharedFileListItemBeforeFirst.takeRetainedValue(),
                nil,
                nil,
                appURL as CFURL,
                nil,
                nil
            )
        }
    }
    
    private func removeFromLoginItemsLegacy() {
        let appURL = Bundle.main.bundleURL
        
        let loginItems = LSSharedFileListCreate(nil, kLSSharedFileListSessionLoginItems.takeRetainedValue(), nil)
        if let loginItems = loginItems?.takeRetainedValue() {
            let loginItemsArray = LSSharedFileListCopySnapshot(loginItems, nil)
            if let loginItemsArray = loginItemsArray?.takeRetainedValue() as? [LSSharedFileListItem] {
                for item in loginItemsArray {
                    let itemURL = LSSharedFileListItemCopyResolvedURL(item, 0, nil)
                    if let itemURL = itemURL?.takeRetainedValue() as URL?,
                       itemURL == appURL {
                        LSSharedFileListItemRemove(loginItems, item)
                    }
                }
            }
        }
    }
    
    private func isAppInLoginItems() -> Bool {
        // Use legacy method for macOS 12 compatibility
        return isAppInLoginItemsLegacy()
    }
    
    private func isAppInLoginItemsLegacy() -> Bool {
        let appURL = Bundle.main.bundleURL
        
        let loginItems = LSSharedFileListCreate(nil, kLSSharedFileListSessionLoginItems.takeRetainedValue(), nil)
        if let loginItems = loginItems?.takeRetainedValue() {
            let loginItemsArray = LSSharedFileListCopySnapshot(loginItems, nil)
            if let loginItemsArray = loginItemsArray?.takeRetainedValue() as? [LSSharedFileListItem] {
                for item in loginItemsArray {
                    let itemURL = LSSharedFileListItemCopyResolvedURL(item, 0, nil)
                    if let itemURL = itemURL?.takeRetainedValue() as URL?,
                       itemURL == appURL {
                        return true
                    }
                }
            }
        }
        return false
    }
}

#Preview {
    ContentView()
        .environmentObject(MenuBarManager())
}