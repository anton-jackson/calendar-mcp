# Public Calendar MCP Server Setup Guide

This guide covers the setup steps for the Public Calendar MCP Server, including external calendar source configuration and Claude Desktop integration.

## Overview

The MCP server supports three types of calendar sources:
- **iCal (.ics)**: No external setup required
- **CalDAV**: Requires server credentials
- **Google Calendar**: Requires Google Cloud API key

## Quick Start

### 1. Install and Build
```bash
git clone <repository-url>
cd public-calendar-mcp-server
npm install
npm run build
```

### 2. Configure Claude Desktop
Add to your Claude Desktop MCP configuration file (`~/.claude_desktop/mcp_settings.json`):

```json
{
  "mcpServers": {
    "public-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/your/public-calendar-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Replace `/path/to/your/public-calendar-mcp-server` with your actual project path.

### 3. Restart Claude Desktop
Quit and restart Claude Desktop to load the MCP server.

**For detailed Claude Desktop configuration, see [CLAUDE_DESKTOP_CONFIG.md](CLAUDE_DESKTOP_CONFIG.md)**

## iCal Calendar Sources

### ✅ No External Setup Required

iCal sources work with any publicly accessible `.ics` file URL. Common sources include:
- Google Calendar public iCal exports
- Outlook.com calendar exports
- Apple iCloud calendar sharing links
- Any web server hosting `.ics` files

**Example URLs:**
```
https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics
https://outlook.live.com/owa/calendar/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/cid-00000000000000000000000000000000/calendar.ics
```

## CalDAV Calendar Sources

### 🔧 External Setup Required

CalDAV sources require authentication credentials for the CalDAV server.

#### Supported CalDAV Providers
- **Nextcloud/ownCloud**
- **Apple iCloud** (with app-specific passwords)
- **Google Calendar** (via CalDAV interface)
- **Yahoo Calendar**
- **FastMail**
- **SOGo**
- Any RFC 4791 compliant CalDAV server

#### Setup Steps

1. **Enable CalDAV on your calendar provider** (if not enabled by default)
2. **Create app-specific credentials** (recommended for security):
   - **iCloud**: Generate app-specific password in Apple ID settings
   - **Google**: Use app passwords (requires 2FA enabled)
   - **Nextcloud**: Create app password in security settings
3. **Find your CalDAV server URL**:
   - **iCloud**: `https://caldav.icloud.com/`
   - **Google**: `https://apidata.googleusercontent.com/caldav/v2/`
   - **Nextcloud**: `https://your-server.com/remote.php/dav/`

#### Configuration Format
```javascript
{
  "id": "my-caldav-calendar",
  "name": "My CalDAV Calendar",
  "type": "caldav",
  "url": "https://username:password@caldav.server.com/calendars/username/calendar-name/",
  "enabled": true,
  "status": "active"
}
```

## Google Calendar Sources

### 🔧 External Setup Required

Google Calendar sources require a Google Cloud API key for accessing the Calendar API v3.

#### Prerequisites
- Google account
- Access to Google Cloud Console

#### Setup Steps

1. **Go to Google Cloud Console**
   - Visit [console.cloud.google.com](https://console.cloud.google.com/)
   - Sign in with your Google account

2. **Create or Select a Project**
   - Click "Create Project" or select existing project
   - Name: "Calendar MCP Server" (or your preferred name)

3. **Enable Google Calendar API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Google Calendar API" → "Enable"

4. **Create API Key**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the generated API key immediately

5. **Secure the API Key (Recommended)**
   - Click on the API key to edit
   - Under "API restrictions": Select "Restrict key"
   - Choose "Google Calendar API"
   - Under "Application restrictions": 
     - For development: "None"
     - For production: "IP addresses" or "HTTP referrers"

6. **Configure API Key in Application**

   **Option 1: Environment Variable (Recommended)**
   ```bash
   export GOOGLE_CALENDAR_API_KEY="your-api-key-here"
   ```

   **Option 2: Source Configuration**
   ```javascript
   {
     "id": "my-google-calendar",
     "name": "My Google Calendar",
     "type": "google",
     "url": "https://calendar.google.com/calendar/embed?src=calendar-id@gmail.com",
     "enabled": true,
     "status": "active",
     "apiKey": "your-api-key-here"
   }
   ```

#### Finding Google Calendar URLs

1. **Public Calendar Embed URL**:
   - Go to Google Calendar web interface
   - Click on calendar settings (three dots menu)
   - Select "Settings and sharing"
   - Make calendar public if needed
   - Copy the "Public URL to this calendar" or "Embed code" URL

2. **Calendar ID Format**:
   - Personal calendars: `your-email@gmail.com`
   - Public calendars: `calendar-id@group.calendar.google.com`
   - Holiday calendars: `en.usa#holiday@group.v.calendar.google.com`

#### Important Limitations
- **Public calendars only**: API keys only work with publicly accessible calendars
- **Rate limits**: 1,000,000 requests/day, 100 requests/100 seconds per user
- **No private calendar access**: For private calendars, OAuth 2.0 would be required

## Security Best Practices

### API Keys and Credentials
- ✅ **Use environment variables** for API keys in production
- ✅ **Never commit credentials** to version control
- ✅ **Restrict API keys** to specific APIs and IP addresses when possible
- ✅ **Use app-specific passwords** instead of main account passwords
- ✅ **Rotate credentials regularly**

### CalDAV Security
- ✅ **Use HTTPS URLs** for CalDAV connections
- ✅ **Create dedicated app passwords** rather than using main account passwords
- ✅ **Limit calendar permissions** to read-only when possible

### Environment Variables Template
Create a `.env` file (don't commit to git):
```bash
# Google Calendar API
GOOGLE_CALENDAR_API_KEY=your-google-api-key-here

# Optional: Default CalDAV credentials (not recommended for production)
# CALDAV_USERNAME=your-username
# CALDAV_PASSWORD=your-app-password
```

## Testing Your Setup

### Verify iCal Sources
```bash
curl -I "https://your-ical-url.ics"
# Should return 200 OK with content-type: text/calendar
```

### Verify CalDAV Sources
```bash
curl -X PROPFIND -u username:password "https://your-caldav-server/calendars/username/"
# Should return calendar collection information
```

### Verify Google Calendar API
```bash
curl "https://www.googleapis.com/calendar/v3/calendars/primary?key=YOUR_API_KEY"
# Should return calendar metadata (for public calendars)
```

### Run Integration Tests
```bash
# Set your API key
export GOOGLE_CALENDAR_API_KEY="your-api-key"

# Run tests
npm test -- --run src/adapters/__tests__/GoogleCalendarAdapter.integration.test.ts
```

## Troubleshooting

### Common Issues

#### iCal Sources
- **CORS errors**: Server must allow cross-origin requests
- **SSL certificate issues**: Ensure valid HTTPS certificates
- **Content-Type**: Server should return `text/calendar` content type

#### CalDAV Sources
- **Authentication failures**: Verify username/password and app-specific passwords
- **URL format**: Ensure proper CalDAV URL format with trailing slash
- **Server discovery**: Some servers require specific discovery URLs

#### Google Calendar Sources
- **API key errors**: Verify key is enabled for Calendar API
- **Calendar not found**: Ensure calendar is public and URL is correct
- **Rate limiting**: Implement proper backoff strategies (built into adapter)

### Getting Help
- Check server logs for detailed error messages
- Verify network connectivity to calendar servers
- Test credentials manually using curl or similar tools
- Consult calendar provider documentation for specific setup requirements

## Next Steps

After completing the external setup:
1. Configure your calendar sources in the MCP server
2. Test connectivity using the built-in validation tools
3. Monitor logs for any authentication or connectivity issues
4. Set up monitoring for API rate limits and quota usage