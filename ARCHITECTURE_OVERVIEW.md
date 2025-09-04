# Architecture Overview: How Claude Desktop + macOS App Work Together

## The Complete Picture

You're absolutely right - **Claude Desktop launches the MCP server**. The macOS app is a separate GUI management tool that communicates with the same server. Here's how it all works together:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude Desktop │    │   MCP Server     │    │   macOS App     │
│                 │    │  (Node.js)       │    │   (SwiftUI)     │
│                 │    │                  │    │                 │
│  Launches ────────────► MCP Protocol    │    │  HTTP API ──────┤
│  Communicates   │    │  (stdio)         │    │  (Port 3001)    │
│  via MCP        │    │                  │    │                 │
│                 │    │  HTTP Bridge ────────► GUI Management  │
└─────────────────┘    │  (Port 3001)     │    │                 │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Configuration   │
                       │     Storage      │
                       │                  │
                       │ ~/Library/       │
                       │ Application      │
                       │ Support/         │
                       │ PublicCalendarMCP│
                       │ /config.json     │
                       └──────────────────┘
```

## Where Calendar Feeds Are Saved

The GUI app saves calendar feeds to:

**Location**: `~/Library/Application Support/PublicCalendarMCP/config.json`

**Format**:
```json
{
  "server": {
    "port": 3000,
    "autoStart": true,
    "cacheTimeout": 3600
  },
  "sources": [
    {
      "id": "my-calendar-1",
      "name": "Company Events",
      "type": "ical",
      "url": "https://calendar.company.com/events.ics",
      "enabled": true,
      "refreshInterval": 1800
    },
    {
      "id": "my-calendar-2", 
      "name": "Personal Calendar",
      "type": "google",
      "url": "https://calendar.google.com/calendar/ical/user@gmail.com/public/basic.ics",
      "enabled": true,
      "refreshInterval": 3600
    }
  ]
}
```

## How It All Works Together

### 1. Claude Desktop Launches MCP Server
```json
// ~/.claude_desktop/mcp_settings.json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 2. MCP Server Starts Two Interfaces

**A. MCP Protocol Interface (for Claude Desktop)**
- Uses stdio communication
- Provides MCP tools like `check_availability`, `get_event_details`
- Claude Desktop communicates directly with this

**B. HTTP Bridge Interface (for macOS App)**
- Runs on port 3001 (configurable)
- Provides REST API for GUI management
- macOS app communicates via HTTP

### 3. Shared Configuration Storage

Both interfaces read/write to the same configuration file:
- **MCP Server**: Reads calendar sources from `~/Library/Application Support/PublicCalendarMCP/config.json`
- **macOS App**: Writes calendar sources to the same file via HTTP API

### 4. Real-time Synchronization

When you add a calendar source in the macOS app:
1. App sends HTTP POST to `/api/sources`
2. MCP server updates `config.json`
3. MCP server reloads calendar sources
4. Changes are immediately available to Claude Desktop

## Benefits of This Architecture

### ✅ Best of Both Worlds
- **Claude Desktop**: Standard MCP integration, works cross-platform
- **macOS App**: Native GUI experience for managing calendar sources

### ✅ Shared State
- Both interfaces work with the same calendar sources
- Changes in GUI app are immediately available to Claude
- No duplicate configuration or sync issues

### ✅ Optional GUI
- MCP server works perfectly without the macOS app
- macOS app is purely an enhancement for easier management
- Users can choose their preferred management method

### ✅ Standard MCP Pattern
- Follows established MCP server conventions
- Claude Desktop handles server lifecycle
- No custom server management needed

## User Workflows

### Workflow 1: Claude Desktop Only
1. User adds MCP server to Claude Desktop config
2. User manually edits `config.json` to add calendar sources
3. Claude Desktop launches server and provides calendar tools

### Workflow 2: Claude Desktop + macOS App
1. User adds MCP server to Claude Desktop config
2. User runs macOS app to visually manage calendar sources
3. Claude Desktop launches server and provides calendar tools
4. User can add/edit/remove sources via GUI app
5. Changes are immediately available in Claude

### Workflow 3: Development/Testing
1. Developer runs `npm run dev` to start server manually
2. Developer uses macOS app to test GUI functionality
3. Developer uses Claude Desktop to test MCP functionality
4. Both work with the same configuration and data

## Configuration File Details

The configuration file at `~/Library/Application Support/PublicCalendarMCP/config.json` contains:

### Server Settings
- `port`: HTTP bridge port (default: 3001)
- `autoStart`: Whether to start HTTP bridge automatically
- `cacheTimeout`: How long to cache calendar data (seconds)

### Calendar Sources Array
Each source has:
- `id`: Unique identifier
- `name`: Display name
- `type`: "ical", "caldav", or "google"
- `url`: Calendar URL or endpoint
- `enabled`: Whether source is active
- `refreshInterval`: How often to refresh data (seconds)

## This Architecture Solves Your Question

**Q: "Where is the GUI app saving the calendar feeds?"**

**A**: The GUI app saves calendar feeds to `~/Library/Application Support/PublicCalendarMCP/config.json` via HTTP API calls to the MCP server. The MCP server (launched by Claude Desktop) reads from this same file, so both the GUI app and Claude Desktop work with the same calendar sources.

This gives users the flexibility to:
- Use Claude Desktop's standard MCP integration (most users)
- Optionally use the macOS app for easier calendar source management
- Have both work seamlessly together with shared configuration

The key insight is that the MCP server acts as the central hub that both Claude Desktop and the macOS app communicate with, ensuring consistent state and functionality.