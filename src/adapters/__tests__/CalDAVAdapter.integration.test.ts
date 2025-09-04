import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalDAVAdapter } from '../CalDAVAdapter.js';
import { CalendarSource, DateRange } from '../../types/calendar.js';


// Mock node-ical
vi.mock('node-ical', () => ({
  parseICS: vi.fn()
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CalDAVAdapter Integration Tests', () => {
  let adapter: CalDAVAdapter;
  let mockSource: CalendarSource;
  let mockDateRange: DateRange;

  beforeEach(() => {
    adapter = new CalDAVAdapter();
    mockSource = {
      id: 'integration-caldav-source',
      name: 'Integration Test CalDAV Calendar',
      type: 'caldav',
      url: 'https://testuser:testpass@caldav.example.com/calendars/testuser/calendar/',
      enabled: true,
      status: 'active'
    };
    mockDateRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31')
    };
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('end-to-end CalDAV workflow', () => {
    it('should complete full CalDAV discovery and event fetching workflow', async () => {
      // Use inline CalDAV response instead of file
      const caldavResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/testuser/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"12345-67890"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp//CalDAV Client//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@example.com
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Team Meeting
DESCRIPTION:Weekly team sync meeting
LOCATION:Conference Room A
ORGANIZER;CN=John Doe:mailto:john@example.com
CATEGORIES:MEETING,WORK
URL:https://example.com/meetings/team-sync
CREATED:20240101T000000Z
LAST-MODIFIED:20240101T000000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      // Mock successful OPTIONS request (discovery)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([
          ['DAV', '1, 2, calendar-access'],
          ['Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT']
        ])
      });

      // Mock successful REPORT request (calendar query)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(caldavResponse),
        headers: new Map([
          ['content-type', 'application/xml; charset=utf-8'],
          ['content-length', caldavResponse.length.toString()]
        ])
      });

      // Mock iCal parsing for the event in the response
      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValueOnce({
        'event-1@example.com': {
          type: 'VEVENT',
          uid: 'event-1@example.com',
          start: new Date('2024-01-15T10:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          summary: 'Team Meeting',
          description: 'Weekly team sync meeting',
          location: 'Conference Room A',
          organizer: {
            params: { CN: 'John Doe' },
            val: 'mailto:john@example.com'
          },
          categories: ['MEETING', 'WORK'],
          url: 'https://example.com/meetings/team-sync',
          lastmodified: new Date('2024-01-01T00:00:00Z')
        }
      });

      // Execute the full workflow
      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      // Verify results
      expect(events).toHaveLength(1);
      
      // Verify the event
      expect(events[0]).toEqual(expect.objectContaining({
        uid: 'event-1@example.com',
        summary: 'Team Meeting',
        description: 'Weekly team sync meeting',
        location: 'Conference Room A'
      }));

      // Verify authentication was handled correctly
      const optionsCall = mockFetch.mock.calls[0];
      expect(optionsCall[1]?.headers).toEqual(expect.objectContaining({
        'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=' // base64 of 'testuser:testpass'
      }));

      // Verify REPORT request was properly formatted
      const reportCall = mockFetch.mock.calls[1];
      expect(reportCall[1]?.method).toBe('REPORT');
      expect(reportCall[1]?.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1',
        'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M='
      }));

      // Verify calendar query XML contains correct date range
      const requestBody = reportCall[1]?.body as string;
      expect(requestBody).toContain('calendar-query');
      expect(requestBody).toContain('time-range');
      expect(requestBody).toContain('2024-01-01T00:00:00Z');
      expect(requestBody).toContain('2024-01-31T00:00:00Z');
    });

    it('should handle authentication failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Authentication failed - check username and password');

      // Should not retry authentication failures
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle server errors with proper retry logic', async () => {
      // First attempt fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      // Second attempt fails with network error
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      // Third attempt succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      // REPORT request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"></D:multistatus>'),
        headers: new Map([['content-type', 'application/xml']])
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 3 retries for OPTIONS + 1 for REPORT
    });

    it('should validate source status correctly', async () => {
      // Mock successful validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([
          ['DAV', '1, 2, calendar-access'],
          ['Server', 'CalDAV/1.0']
        ])
      });

      const status = await adapter.getSourceStatus(mockSource);

      expect(status.isHealthy).toBe(true);
      expect(status.lastCheck).toBeInstanceOf(Date);
      expect(status.errorMessage).toBeUndefined();

      // Verify OPTIONS request was made for validation
      expect(mockFetch).toHaveBeenCalledWith(
        'https://caldav.example.com/calendars/testuser/calendar/',
        expect.objectContaining({
          method: 'OPTIONS',
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M='
          })
        })
      );
    });

    it('should normalize events correctly in integration context', async () => {
      const caldavResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/testuser/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"12345-67890"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp//CalDAV Client//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@example.com
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Team Meeting
DESCRIPTION:Weekly team sync meeting
LOCATION:Conference Room A
ORGANIZER;CN=John Doe:mailto:john@example.com
CATEGORIES:MEETING,WORK
URL:https://example.com/meetings/team-sync
CREATED:20240101T000000Z
LAST-MODIFIED:20240101T000000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(caldavResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValueOnce({
        'event-1@example.com': {
          type: 'VEVENT',
          uid: 'event-1@example.com',
          start: new Date('2024-01-15T10:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          summary: 'Team Meeting',
          description: 'Weekly team sync meeting',
          location: 'Conference Room A',
          organizer: {
            params: { CN: 'John Doe' },
            val: 'mailto:john@example.com'
          },
          categories: ['MEETING', 'WORK'],
          url: 'https://example.com/meetings/team-sync',
          lastmodified: new Date('2024-01-01T00:00:00Z')
        }
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      const rawEvent = events[0];

      // Test normalization
      const normalized = adapter.normalizeEvent(rawEvent, mockSource.id);

      expect(normalized).toEqual({
        id: 'integration-caldav-source:event-1@example.com',
        sourceId: 'integration-caldav-source',
        title: 'Team Meeting',
        description: 'Weekly team sync meeting',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Conference Room A',
          address: 'Conference Room A'
        },
        organizer: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        categories: ['MEETING', 'WORK'],
        recurrence: undefined,
        url: 'https://example.com/meetings/team-sync',
        lastModified: new Date('2024-01-01T00:00:00Z')
      });
    });

    it('should handle empty CalDAV responses', async () => {
      const emptyResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(emptyResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
    });

    it('should handle malformed CalDAV responses gracefully', async () => {
      const malformedResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/testuser/calendar/bad-event.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"bad-etag"</D:getetag>
        <C:calendar-data>INVALID ICAL DATA
This is not valid iCal format
BEGIN:VCALENDAR without proper structure</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(malformedResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockImplementation(() => {
        throw new Error('Invalid iCal format');
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to parse CalDAV response');
    });

    it('should handle different CalDAV server implementations', async () => {
      // Test with different DAV header formats
      const testCases = [
        '1, 2, calendar-access',
        '1, 2, 3, calendar-access',
        'calendar-access, 1, 2',
        '1, calendar-access, 2'
      ];

      for (const davHeader of testCases) {
        vi.clearAllMocks();
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map([['DAV', davHeader]])
        });

        const isValid = await adapter.validateSource(mockSource);
        expect(isValid).toBe(true);
      }
    });

    it('should reject servers without CalDAV support', async () => {
      const nonCalDAVHeaders = [
        '1, 2',
        '1, 2, 3',
        'addressbook',
        '1, addressbook, 2'
      ];

      for (const davHeader of nonCalDAVHeaders) {
        vi.clearAllMocks();
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Map([['DAV', davHeader]])
        });

        await expect(adapter.validateSource(mockSource))
          .rejects.toThrow('Server does not support CalDAV calendar-access');
      }
    });
  });

  describe('real-world scenario simulation', () => {
    it('should handle a typical CalDAV server interaction', async () => {
      // Simulate a realistic CalDAV server response sequence
      
      // 1. OPTIONS request for capability discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['DAV', '1, 2, 3, calendar-access'],
          ['Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT'],
          ['Server', 'Apache/2.4.41 (Ubuntu) CalDAV/1.0'],
          ['Content-Length', '0']
        ])
      });

      // 2. REPORT request with calendar-query
      const realisticResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/testuser/calendar/work-meeting-123.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"1234567890-abcdef"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN
CALSCALE:GREGORIAN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:work-meeting-123@example.com
DTSTART;TZID=America/New_York:20240115T100000
DTEND;TZID=America/New_York:20240115T110000
SUMMARY:Weekly Team Standup
DESCRIPTION:Weekly team standup meeting to discuss progress and blockers
LOCATION:Conference Room A - Building 1
ORGANIZER;CN=Team Lead:mailto:lead@example.com
ATTENDEE;CN=Developer 1;PARTSTAT=ACCEPTED:mailto:dev1@example.com
ATTENDEE;CN=Developer 2;PARTSTAT=TENTATIVE:mailto:dev2@example.com
CATEGORIES:MEETING,WORK,STANDUP
STATUS:CONFIRMED
TRANSP:OPAQUE
CREATED:20240101T120000Z
LAST-MODIFIED:20240110T150000Z
DTSTAMP:20240110T150000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 207, // Multi-Status
        text: () => Promise.resolve(realisticResponse),
        headers: new Map([
          ['content-type', 'application/xml; charset=utf-8'],
          ['content-length', realisticResponse.length.toString()],
          ['date', new Date().toUTCString()]
        ])
      });

      // Mock realistic iCal parsing
      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValueOnce({
        'America/New_York': {
          type: 'VTIMEZONE',
          tzid: 'America/New_York'
        },
        'work-meeting-123@example.com': {
          type: 'VEVENT',
          uid: 'work-meeting-123@example.com',
          start: new Date('2024-01-15T15:00:00Z'), // Converted from EST
          end: new Date('2024-01-15T16:00:00Z'),
          summary: 'Weekly Team Standup',
          description: 'Weekly team standup meeting to discuss progress and blockers',
          location: 'Conference Room A - Building 1',
          organizer: {
            params: { CN: 'Team Lead' },
            val: 'mailto:lead@example.com'
          },
          categories: ['MEETING', 'WORK', 'STANDUP'],
          status: 'CONFIRMED',
          created: new Date('2024-01-01T12:00:00Z'),
          lastmodified: new Date('2024-01-10T15:00:00Z')
        }
      });

      // Execute the workflow
      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      // Verify realistic results
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(expect.objectContaining({
        uid: 'work-meeting-123@example.com',
        summary: 'Weekly Team Standup',
        description: 'Weekly team standup meeting to discuss progress and blockers',
        location: 'Conference Room A - Building 1',
        status: 'CONFIRMED'
      }));

      // Verify proper HTTP status handling
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // Verify the REPORT request included proper XML structure
      const reportCall = mockFetch.mock.calls[1];
      const requestBody = reportCall[1]?.body as string;
      expect(requestBody).toContain('<?xml version="1.0" encoding="utf-8" ?>');
      expect(requestBody).toContain('<C:calendar-query');
      expect(requestBody).toContain('<C:comp-filter name="VCALENDAR">');
      expect(requestBody).toContain('<C:comp-filter name="VEVENT">');
      expect(requestBody).toContain('<C:time-range');
    });
  });
});