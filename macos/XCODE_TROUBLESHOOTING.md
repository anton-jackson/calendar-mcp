# Xcode Project Troubleshooting

## Project File Corruption

If you encounter the error:
```
The project 'PublicCalendarMCP' is damaged and cannot be opened.
Exception: -[PBXFrameworksBuildPhase group]: unrecognized selector sent to instance
```

This indicates the Xcode project file (`.pbxproj`) has been corrupted.

## Quick Fix

The project file has been regenerated with proper unique IDs. Try opening the project again:

```bash
cd macos
open PublicCalendarMCP.xcodeproj
```

## If Issues Persist

### Option 1: Clean and Rebuild
```bash
cd macos
rm -rf build/
rm -rf PublicCalendarMCP.xcodeproj/project.xcworkspace/
rm -rf PublicCalendarMCP.xcodeproj/xcuserdata/
```

### Option 2: Recreate Project from Scratch
If the project still won't open, you can recreate it:

1. **Create New Xcode Project**:
   - Open Xcode
   - File → New → Project
   - macOS → App
   - Product Name: "PublicCalendarMCP"
   - Interface: SwiftUI
   - Language: Swift

2. **Add Existing Files**:
   - Drag and drop the Swift files from the current project:
     - `PublicCalendarMCPApp.swift`
     - `ContentView.swift`
     - `MenuBarManager.swift`
     - `ServerCommunication.swift`
   - Add test files to test targets:
     - `PublicCalendarMCPTests.swift`
     - `ServerCommunicationTests.swift`
     - `SystemIntegrationTests.swift`

3. **Configure Project Settings**:
   - Add `Info.plist` file
   - Add `PublicCalendarMCP.entitlements` file
   - Set deployment target to macOS 12.0
   - Configure app icons and assets

4. **Update Build Settings**:
   - Set bundle identifier: `com.publiccalendarmcp.app`
   - Enable sandboxing with appropriate entitlements
   - Configure code signing

## Project Structure

The project should have this structure:
```
PublicCalendarMCP.xcodeproj/
├── project.pbxproj
└── project.xcworkspace/
    └── contents.xcworkspacedata

PublicCalendarMCP/
├── PublicCalendarMCPApp.swift
├── ContentView.swift
├── MenuBarManager.swift
├── ServerCommunication.swift
├── Info.plist
├── PublicCalendarMCP.entitlements
├── Assets.xcassets/
└── Preview Content/

PublicCalendarMCPTests/
├── PublicCalendarMCPTests.swift
├── ServerCommunicationTests.swift
└── SystemIntegrationTests.swift

PublicCalendarMCPUITests/
└── PublicCalendarMCPUITests.swift
```

## Common Xcode Issues

### Missing Files
If Xcode shows files in red (missing):
1. Right-click the file in Xcode
2. Choose "Show in Finder"
3. If file exists, right-click → "Add Files to Project"
4. If file doesn't exist, remove reference and re-add

### Build Errors
If you get Swift compilation errors:
1. Check that all import statements are correct
2. Verify target membership for each file
3. Clean build folder: Product → Clean Build Folder
4. Restart Xcode

### Entitlements Issues
If you get sandboxing or permission errors:
1. Verify `PublicCalendarMCP.entitlements` is added to project
2. Check Code Signing settings in Build Settings
3. Ensure entitlements file is set in Code Signing Entitlements

## Testing the Fixed Project

Once the project opens successfully:

1. **Build the project**: ⌘+B
2. **Run the app**: ⌘+R
3. **Run tests**: ⌘+U

If all steps work, the project is properly configured.

## Prevention

To avoid future project file corruption:
- Don't manually edit `.pbxproj` files
- Use Xcode's interface for adding/removing files
- Commit project files to version control
- Make backups before major changes