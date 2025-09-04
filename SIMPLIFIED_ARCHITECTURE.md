# Simplified Architecture: File-Based Communication

## The Simpler Approach

Instead of HTTP API communication, we can use a much simpler file-based approach where:

1. **macOS App** directly edits the config file
2. **MCP Server** watches the config file for changes
3. **File system** handles the communication layer

This eliminates the HTTP bridge complexity and potential networking issues.

## Architecture Comparison

### Current (Complex)
```
macOS App ──HTTP API──► MCP Server ──writes──► config.json
                           │
                           └──MCP Protocol──► Claude Desktop
```

### Simplified (Recommended)
```
macOS App ──writes──► config.json ◄──watches── MCP Server ──MCP Protocol──► Claude Desktop
```

## Implementation Changes Needed

### 1. Remove HTTP Bridge
- Remove `HTTPBridge.ts` entirely
- Remove HTTP server startup from `index.ts`
- Simplify the main server to just MCP protocol + file watching

### 2. Add File Watching to MCP Server
```typescript
// In index.ts
import { watch } from 'fs';

// Watch config file for changes
const configPath = join(homedir(), 'Library', 'Application Support', 'PublicCalendarMCP', 'config.json');
watch(configPath, async (eventType) => {
  if (eventType === 'change') {
    console.log('Config file changed, reloading...');
    const config = await configManager.loadConfig();
    // Reload calendar sources
    calendarManager.reloadSources(config.sources);
  }
});
```

### 3. Simplify macOS App Communication
```swift
// In ServerCommunication.swift - replace HTTP calls with direct file operations
func addCalendarSource(_ source: CalendarSourceData) async -> Bool {
    do {
        // Read current config
        let configURL = getConfigFileURL()
        let data = try Data(contentsOf: configURL)
        var config = try JSONDecoder().decode(AppConfiguration.self, from: data)
        
        // Add new source
        var newSource = source
        newSource.id = UUID().uuidString
        config.sources.append(newSource)
        
        // Write back to file
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let updatedData = try encoder.encode(config)
        try updatedData.write(to: configURL)
        
        return true
    } catch {
        print("Failed to add calendar source: \(error)")
        return false
    }
}
```

## Benefits of Simplified Approach

### ✅ Much Simpler
- No HTTP server to manage
- No network ports or CORS issues
- No HTTP request/response handling
- Just file read/write operations

### ✅ More Reliable
- File system operations are atomic
- No network connectivity issues
- No port conflicts
- Works offline

### ✅ Easier Debugging
- Can inspect config file directly
- No HTTP logs to parse
- Simple file modification timestamps
- Clear error messages

### ✅ Better Performance
- No HTTP overhead
- No JSON serialization over network
- Direct file system operations
- Immediate file system notifications

### ✅ Simpler Testing
- Easy to test with file fixtures
- No need to mock HTTP servers
- Can manually edit config files for testing
- Clear separation of concerns

## Implementation Details

### File Watching Strategy
```typescript
import { FSWatcher, watch } from 'fs';
import { debounce } from 'lodash';

class ConfigFileWatcher {
  private watcher: FSWatcher | null = null;
  private reloadConfig: () => Promise<void>;

  constructor(configPath: string, reloadCallback: () => Promise<void>) {
    this.reloadConfig = debounce(reloadCallback, 500); // Debounce rapid changes
  }

  start(): void {
    this.watcher = watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        this.reloadConfig();
      }
    });
  }

  stop(): void {
    this.watcher?.close();
  }
}
```

### Atomic File Operations
```swift
// In macOS app - ensure atomic writes
func writeConfigSafely(_ config: AppConfiguration) throws {
    let configURL = getConfigFileURL()
    let tempURL = configURL.appendingPathExtension("tmp")
    
    // Write to temp file first
    let data = try JSONEncoder().encode(config)
    try data.write(to: tempURL)
    
    // Atomic move to final location
    _ = try FileManager.default.replaceItem(at: configURL, withItemAt: tempURL, 
                                           backupItemName: nil, options: [], 
                                           resultingItemURL: nil)
}
```

### Error Handling
```swift
// Robust error handling for file operations
func updateConfigFile<T>(_ operation: (inout AppConfiguration) throws -> T) async -> Result<T, ConfigError> {
    do {
        let configURL = getConfigFileURL()
        
        // Read with retry logic
        var config = try await readConfigWithRetry(from: configURL)
        
        // Apply operation
        let result = try operation(&config)
        
        // Write with atomic operation
        try await writeConfigSafely(config, to: configURL)
        
        return .success(result)
    } catch {
        return .failure(.fileOperationFailed(error))
    }
}
```

## Migration Path

If we need to switch to this simpler approach:

### Phase 1: Keep Both (Fallback)
- Keep HTTP bridge as fallback
- Add file watching capability
- macOS app tries HTTP first, falls back to file operations

### Phase 2: Switch to File-Only
- Remove HTTP bridge entirely
- Update macOS app to only use file operations
- Simplify server to just MCP + file watching

### Phase 3: Optimize
- Add file locking for concurrent access
- Implement config validation
- Add backup/recovery mechanisms

## When to Use This Approach

**Use simplified file-based approach when:**
- ✅ Simplicity is more important than real-time features
- ✅ You want to minimize dependencies and complexity
- ✅ File system reliability is sufficient
- ✅ You don't need advanced server-side validation

**Keep HTTP API approach when:**
- ❌ You need real-time status updates
- ❌ You want server-side validation and business logic
- ❌ You need to support multiple concurrent GUI clients
- ❌ You want to add web-based management in the future

## Recommendation

For this MCP server project, **the simplified file-based approach is probably better** because:

1. **MCP servers should be simple and reliable**
2. **File operations are more predictable than HTTP**
3. **Easier for users to debug and understand**
4. **Follows the principle of least complexity**

The HTTP bridge adds significant complexity for minimal benefit in this use case. File-based communication is simpler, more reliable, and easier to maintain.