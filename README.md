# Public Calendar MCP Server

A Model Context Protocol (MCP) server that enables AI agents to search and access public calendar data. Works with Claude Desktop and includes an optional native macOS management app.

## Quick Start

### 1. Install and Build
```bash
git clone <repository-url>
cd public-calendar-mcp-server
npm install
npm run build
```

### 2. Configure Claude Desktop
Add to your Claude Desktop MCP settings (`~/.claude_desktop/mcp_settings.json`):

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. Restart Claude Desktop
Quit and restart Claude Desktop. You should now have access to calendar tools in Claude!

## Features

- **🔍 Event Search**: Search public events by date range, location, and keywords
- **📅 Event Details**: Retrieve detailed information about specific events
- **⏰ Availability Check**: Check time slot availability across calendars
- **🔗 Multiple Sources**: Support for iCal, CalDAV, and Google Calendar sources
- **🖥️ macOS App**: Optional native GUI for managing calendar sources (macOS only)
- **⚡ Fast Caching**: Intelligent caching for improved performance

## Available Tools in Claude

Once configured, you'll have access to these tools in Claude Desktop:

- `check_availability` - Check if time slots are free across calendars
- `get_event_details` - Get detailed information about specific events
- `list_calendar_sources` - View configured calendar sources
- `add_calendar_source` - Add new calendar sources
- `remove_calendar_source` - Remove calendar sources

## How It Works

**Claude Desktop launches the MCP server** (standard MCP pattern). The server provides:
- **MCP Protocol Interface**: For Claude Desktop communication
- **HTTP API Interface**: For optional GUI management

Calendar sources are stored in: `~/Library/Application Support/PublicCalendarMCP/config.json`

## Setup Options

### Option 1: Claude Desktop Only (Recommended)
Perfect for most users - just add the MCP configuration above and you're ready to go!

**Managing Calendar Sources**: Edit `~/Library/Application Support/PublicCalendarMCP/config.json` directly or use the MCP tools in Claude.

### Option 2: Claude Desktop + macOS GUI App
For macOS users who want a visual interface for managing calendar sources:

1. Follow the Claude Desktop setup above
2. Build and run the macOS app: `cd macos && ./build.sh`  
3. Use the app to visually add/edit/remove calendar sources
4. Changes are immediately available in Claude Desktop

**Both options work with the same calendar sources** - the GUI app just provides an easier way to manage them.

**📖 See [CLAUDE_DESKTOP_CONFIG.md](CLAUDE_DESKTOP_CONFIG.md) for detailed Claude Desktop setup**
**📖 See [SETUP.md](SETUP.md) for calendar source configuration**  
**📖 See [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) for how Claude Desktop + macOS app work together**

## Calendar Source Types

- **iCal (.ics)**: ✅ No setup required - works with any public iCal URL
- **CalDAV**: 🔧 Requires server credentials and authentication setup  
- **Google Calendar**: 🔧 Requires Google Cloud API key

## Development

### Prerequisites

- Node.js 18+
- TypeScript
- macOS (for GUI components)

### Setup

```bash
npm install
npm run build
```

### Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

## Project Structure

```
src/
├── adapters/          # Calendar source adapters
├── interfaces/        # Core interfaces
├── services/          # Business logic services
├── tools/             # MCP tool implementations
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
└── index.ts           # Main entry point
```

## License

MIT