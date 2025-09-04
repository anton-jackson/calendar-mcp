# Claude Desktop Configuration

## MCP Server Configuration

Add this configuration to your Claude Desktop MCP settings file:

### Location of MCP Configuration File

**macOS/Linux**: `~/.claude_desktop/mcp_settings.json`
**Windows**: `%APPDATA%\Claude\mcp_settings.json`

### Configuration Code

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/../dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Alternative Configuration (Using npm/npx)

If you've published the package to npm or want to use npx:

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "npx",
      "args": ["public-calendar-mcp-server"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Development Configuration

For development with additional logging:

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/your/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "mcp:*",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Configuration with Custom Port

If you need to specify a custom port for the HTTP bridge:

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/your/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "HTTP_PORT": "3001"
      }
    }
  }
}
```

## Setup Instructions

### 1. Build the MCP Server

First, ensure your MCP server is built:

```bash
cd /path/to/your/public-calendar-mcp-server
npm install
npm run build
```

### 2. Update Configuration Path

Replace `/path/to/your/public-calendar-mcp-server` with the actual path to your project directory.

Example:
```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/Users/username/projects/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After adding the configuration:
1. Save the `mcp_settings.json` file
2. Completely quit Claude Desktop
3. Restart Claude Desktop
4. The MCP server should now be available

## Verification

To verify the MCP server is working in Claude Desktop:

1. Start a new conversation
2. Ask Claude: "What MCP tools do you have available?"
3. You should see tools like:
   - `check_availability`
   - `get_event_details`
   - `list_calendar_sources`
   - `add_calendar_source`
   - `remove_calendar_source`

## Troubleshooting

### Common Issues

1. **Server not starting**: Check the path to `dist/index.js` is correct
2. **Permission errors**: Ensure the Node.js executable and script have proper permissions
3. **Port conflicts**: If using HTTP bridge, ensure the port isn't already in use
4. **Missing dependencies**: Run `npm install` in the project directory

### Debug Mode

Enable debug logging by adding to your configuration:

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/your/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "*",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

Then check Claude Desktop's logs for detailed information about the MCP server startup and operation.

### Log Locations

**macOS**: `~/Library/Logs/Claude/`
**Windows**: `%APPDATA%\Claude\logs\`
**Linux**: `~/.config/Claude/logs/`
