# Public Calendar MCP - macOS Application

This is the native macOS application component of the Public Calendar MCP Server. It provides a SwiftUI-based GUI for managing calendar sources and monitoring the MCP server status.

## Features

- **Menu Bar Status Indicator**: Shows real-time server status with color-coded indicators
- **Server Management**: Start, stop, and restart the MCP server from the GUI
- **Calendar Source Management**: Add, edit, and remove public calendar sources
- **System Integration**: Launch at login, Spotlight integration, and proper macOS metadata
- **Settings Management**: User-friendly settings interface for system preferences
- **Native macOS Integration**: Follows macOS Human Interface Guidelines

## Architecture

The macOS app consists of:

- `PublicCalendarMCPApp.swift`: Main app entry point with SwiftUI App lifecycle
- `ContentView.swift`: Main window interface with calendar management placeholder
- `MenuBarManager.swift`: Manages server status monitoring and menu bar integration

## Requirements

- macOS 12.0 or later (some features require macOS 13.0+)
- Xcode 15.0 or later for development
- Node.js runtime for the MCP server backend

## Building

### Using Build Script (Recommended)

```bash
cd macos
./build.sh
```

The build script will:
- Generate application icons automatically
- Build the project with proper configuration
- Create the application bundle in `./build/Build/Products/Release/`

### Using Xcode

1. Open `PublicCalendarMCP.xcodeproj` in Xcode
2. Select the "PublicCalendarMCP" scheme
3. Build and run (⌘+R)

### Icon Generation

To regenerate application icons:

```bash
cd macos
./generate_icons.sh
```

## Testing

The project includes comprehensive testing:

- **Unit Tests**: Test core functionality like status management and data models
- **System Integration Tests**: Test launch at login, bundle metadata, and system features
- **UI Tests**: Test application launch, menu bar functionality, and user interactions

### Running Tests

**In Xcode**: Use ⌘+U or the Test navigator

**Command Line**: 
```bash
cd macos
xcodebuild -project PublicCalendarMCP.xcodeproj -scheme PublicCalendarMCP -destination 'platform=macOS' test
```

**System Integration Test**:
```bash
cd macos
swift test_system_integration.swift
```

## Server Integration

The macOS app communicates with the Node.js MCP server by:

1. Starting the server process using the built JavaScript bundle
2. Monitoring server health through process status
3. Managing server lifecycle (start/stop/restart)

The server executable should be bundled with the app or available in the expected location (`../dist/index.js`).

## System Integration Features

The application includes comprehensive macOS system integration:

- **Launch at Login**: Optional automatic startup when user logs in
- **Application Bundle**: Proper metadata for Spotlight and system integration
- **Menu Bar Integration**: Native status indicator with server controls
- **Settings Interface**: User-friendly configuration management
- **Icon Set**: Complete application icons for all macOS sizes
- **Entitlements**: Proper security permissions for system features

See [SYSTEM_INTEGRATION.md](SYSTEM_INTEGRATION.md) for detailed documentation.

## Status

✅ **Task 12**: Xcode project with SwiftUI for native macOS interface  
✅ **Task 13**: Calendar source management GUI with add/edit/remove functionality  
✅ **Task 14**: GUI-server communication with real-time status updates  
✅ **Task 18**: System integration features with launch at login and proper metadata  

The application provides a complete macOS experience for managing the Public Calendar MCP server.