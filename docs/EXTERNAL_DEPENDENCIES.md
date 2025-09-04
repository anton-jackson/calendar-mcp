# External Dependencies Quick Reference

This document provides a quick reference for external setup requirements for each calendar adapter.

## Summary Table

| Calendar Type | External Setup Required | Credentials Needed | Public Access |
|---------------|------------------------|-------------------|---------------|
| **iCal** | ❌ None | ❌ None | ✅ Public URLs only |
| **CalDAV** | ✅ Server credentials | ✅ Username/Password | ✅ Private calendars supported |
| **Google Calendar** | ✅ Google Cloud API key | ✅ API Key | ✅ Public calendars only |

## Quick Setup Checklist

### iCal Sources ✅ Ready to Use
- [x] No external setup required
- [x] Works with any public `.ics` URL
- [x] No authentication needed

### CalDAV Sources 🔧 Setup Required
- [ ] Obtain CalDAV server credentials
- [ ] Create app-specific password (recommended)
- [ ] Find CalDAV server URL
- [ ] Test connection with credentials

**Common CalDAV URLs:**
- iCloud: `https://caldav.icloud.com/`
- Google: `https://apidata.googleusercontent.com/caldav/v2/`
- Nextcloud: `https://server.com/remote.php/dav/`

### Google Calendar Sources 🔧 Setup Required
- [ ] Create Google Cloud project
- [ ] Enable Google Calendar API
- [ ] Generate API key
- [ ] Restrict API key (recommended)
- [ ] Set `GOOGLE_CALENDAR_API_KEY` environment variable

**Quick API Key Setup:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create project → Enable Calendar API → Create API Key
3. `export GOOGLE_CALENDAR_API_KEY="your-key"`

## Environment Variables

```bash
# Required for Google Calendar
GOOGLE_CALENDAR_API_KEY=your-google-api-key-here

# Optional for default CalDAV (not recommended for production)
CALDAV_USERNAME=your-username
CALDAV_PASSWORD=your-app-password
```

## Testing Commands

```bash
# Test iCal URL
curl -I "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"

# Test CalDAV connection
curl -X PROPFIND -u username:password "https://caldav.server.com/calendars/username/"

# Test Google Calendar API
curl "https://www.googleapis.com/calendar/v3/calendars/primary?key=YOUR_API_KEY"

# Run integration tests
npm test -- --run src/adapters/__tests__/GoogleCalendarAdapter.integration.test.ts
```

## Security Notes

⚠️ **Never commit credentials to version control**
✅ **Use environment variables for API keys**
✅ **Use app-specific passwords for CalDAV**
✅ **Restrict API keys to specific APIs and IPs**

## Support Matrix

| Provider | iCal | CalDAV | Google API |
|----------|------|--------|------------|
| Google Calendar | ✅ Public | ✅ Private | ✅ Public |
| Apple iCloud | ✅ Public | ✅ Private | ❌ |
| Outlook.com | ✅ Public | ❌ | ❌ |
| Nextcloud | ✅ Public | ✅ Private | ❌ |
| Yahoo Calendar | ✅ Public | ✅ Private | ❌ |

For detailed setup instructions, see [SETUP.md](../SETUP.md).