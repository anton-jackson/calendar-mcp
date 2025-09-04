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

describe('CalDAVAdapter', () => {
  let adapter: CalDAVAdapter;
  let mockSource: CalendarSource;
  let mockDateRange: DateRange;

  beforeEach(() => {
    adapter = new CalDAVAdapter();
    mockSource = {
      id: 'test-caldav-source',
      name: 'Test CalDAV Calendar',
      type: 'caldav',
      url: 'https://username:password@caldav.example.com/calendars/user/calendar/',
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

  describe('getSupportedType', () => {
    it('should return caldav as supported type', () => {
      expect(adapter.getSupportedType()).toBe('caldav');
    });
  });

  describe('fetchEvents', () => {
    it('should fetch and parse CalDAV events successfully', async () => {
      const mockCalDAVResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/user/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"12345"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Test CalDAV Event
DESCRIPTION:Test Description
LOCATION:Test Location
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      const mockParsedData = {
        'test-event-1': {
          type: 'VEVENT',
          uid: 'test-event-1',
          start: new Date('2024-01-15T10:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          summary: 'Test CalDAV Event',
          description: 'Test Description',
          location: 'Test Location'
        }
      };

      // Mock OPTIONS request for discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      // Mock REPORT request for calendar data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCalDAVResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue(mockParsedData);

      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(mockParsedData['test-event-1']);
      
      // Verify OPTIONS request was made
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('caldav.example.com'),
        expect.objectContaining({
          method: 'OPTIONS',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic')
          })
        })
      );

      // Verify REPORT request was made
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('caldav.example.com'),
        expect.objectContaining({
          method: 'REPORT',
          headers: expect.objectContaining({
            'Content-Type': 'application/xml; charset=utf-8',
            'Depth': '1',
            'Authorization': expect.stringContaining('Basic')
          }),
          body: expect.stringContaining('calendar-query')
        })
      );
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Authentication failed - check username and password');
    });

    it('should handle server not supporting CalDAV', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2']]) // Missing calendar-access
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Server does not support CalDAV calendar-access');
    });

    it('should handle 403 Forbidden errors', async () => {
      // Mock successful OPTIONS request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      // Mock 403 error on REPORT request
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Access forbidden - check permissions');
    });

    it('should handle 404 Not Found errors', async () => {
      // Mock successful OPTIONS request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      // Mock 404 error on REPORT request
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Calendar not found - check URL');
    });

    it('should handle network errors with retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['DAV', '1, 2, calendar-access']])
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"></D:multistatus>'),
          headers: new Map([['content-type', 'application/xml']])
        });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 3 retries for OPTIONS + 1 for REPORT
    });

    it('should not retry authentication failures', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Authentication failed');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for auth failures
    });

    it('should handle multiple events in CalDAV response', async () => {
      const mockCalDAVResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/user/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-1
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Event 1
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendars/user/calendar/event2.ics</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-2
DTSTART:20240116T100000Z
DTEND:20240116T110000Z
SUMMARY:Event 2
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCalDAVResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS)
        .mockReturnValueOnce({
          'event-1': {
            type: 'VEVENT',
            uid: 'event-1',
            start: new Date('2024-01-15T10:00:00Z'),
            summary: 'Event 1'
          }
        })
        .mockReturnValueOnce({
          'event-2': {
            type: 'VEVENT',
            uid: 'event-2',
            start: new Date('2024-01-16T10:00:00Z'),
            summary: 'Event 2'
          }
        });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(events).toHaveLength(2);
      expect(events[0].uid).toBe('event-1');
      expect(events[1].uid).toBe('event-2');
    });

    it('should handle empty CalDAV response', async () => {
      const mockCalDAVResponse = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockCalDAVResponse),
        headers: new Map([['content-type', 'application/xml']])
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
    });

    it('should build correct calendar query XML', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"></D:multistatus>'),
        headers: new Map([['content-type', 'application/xml']])
      });

      await adapter.fetchEvents(mockSource, mockDateRange);

      const reportCall = mockFetch.mock.calls.find(call => call[1]?.method === 'REPORT');
      expect(reportCall).toBeDefined();
      
      const requestBody = reportCall![1]!.body as string;
      expect(requestBody).toContain('calendar-query');
      expect(requestBody).toContain('time-range');
      expect(requestBody).toContain('2024-01-01T00:00:00Z');
      expect(requestBody).toContain('2024-01-31T00:00:00Z');
    });
  });

  describe('validateSource', () => {
    it('should return true for valid CalDAV source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      const isValid = await adapter.validateSource(mockSource);
      expect(isValid).toBe(true);
    });

    it('should throw error for invalid CalDAV source', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.validateSource(mockSource)).rejects.toThrow();
    });

    it('should throw error for non-CalDAV server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2']]) // Missing calendar-access
      });

      await expect(adapter.validateSource(mockSource))
        .rejects.toThrow('Server does not support CalDAV calendar-access');
    });
  });

  describe('getSourceStatus', () => {
    it('should return healthy status for valid source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      const status = await adapter.getSourceStatus(mockSource);
      
      expect(status.isHealthy).toBe(true);
      expect(status.lastCheck).toBeInstanceOf(Date);
      expect(status.errorMessage).toBeUndefined();
    });

    it('should return unhealthy status with error message for invalid source', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const status = await adapter.getSourceStatus(mockSource);
      
      expect(status.isHealthy).toBe(false);
      expect(status.lastCheck).toBeInstanceOf(Date);
      expect(status.errorMessage).toBeDefined();
      expect(typeof status.errorMessage).toBe('string');
    });
  });

  describe('normalizeEvent', () => {
    it('should normalize a basic CalDAV event correctly', () => {
      const rawEvent = {
        uid: 'caldav-test-event',
        summary: 'CalDAV Test Event',
        description: 'Test Description',
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z'),
        location: 'Test Location',
        organizer: {
          params: { CN: 'Jane Doe' },
          val: 'mailto:jane@example.com'
        },
        categories: ['meeting', 'work'],
        url: 'https://example.com/event',
        lastmodified: new Date('2024-01-01T00:00:00Z')
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-caldav-source');

      expect(normalized).toEqual({
        id: 'test-caldav-source:caldav-test-event',
        sourceId: 'test-caldav-source',
        title: 'CalDAV Test Event',
        description: 'Test Description',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Test Location',
          address: 'Test Location'
        },
        organizer: {
          name: 'Jane Doe',
          email: 'jane@example.com'
        },
        categories: ['meeting', 'work'],
        recurrence: undefined,
        url: 'https://example.com/event',
        lastModified: new Date('2024-01-01T00:00:00Z')
      });
    });

    it('should handle minimal CalDAV event data', () => {
      const rawEvent = {
        uid: 'minimal-caldav-event',
        start: new Date('2024-01-15T10:00:00Z')
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-caldav-source');

      expect(normalized.id).toBe('test-caldav-source:minimal-caldav-event');
      expect(normalized.title).toBe('Untitled Event');
      expect(normalized.startDate).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(normalized.endDate).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(normalized.categories).toEqual([]);
    });

    it('should handle recurring CalDAV events', () => {
      const rawEvent = {
        uid: 'recurring-caldav-event',
        summary: 'Weekly CalDAV Meeting',
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z'),
        rrule: {
          freq: 'WEEKLY',
          interval: 2,
          count: 10
        }
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-caldav-source');

      expect(normalized.recurrence).toEqual({
        frequency: 'weekly',
        interval: 2,
        count: 10,
        until: undefined,
        byDay: undefined,
        byMonth: undefined
      });
    });
  });

  describe('authentication handling', () => {
    it('should extract credentials from URL and add Basic auth header', async () => {
      const sourceWithCreds = {
        ...mockSource,
        url: 'https://user:pass@caldav.example.com/calendar/'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      await adapter.validateSource(sourceWithCreds);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://caldav.example.com/calendar/', // Credentials removed from URL
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dXNlcjpwYXNz' // base64 of 'user:pass'
          })
        })
      );
    });

    it('should handle URLs without credentials', async () => {
      const sourceWithoutCreds = {
        ...mockSource,
        url: 'https://caldav.example.com/calendar/'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      await adapter.validateSource(sourceWithoutCreds);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://caldav.example.com/calendar/',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.anything()
          })
        })
      );
    });
  });

  describe('XML parsing edge cases', () => {
    it('should handle malformed XML response', async () => {
      const malformedXML = 'This is not valid XML';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(malformedXML),
        headers: new Map([['content-type', 'application/xml']])
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]); // Should handle gracefully
    });

    it('should handle XML with no calendar-data elements', async () => {
      const xmlWithoutCalendarData = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/user/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"12345"</D:getetag>
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
        text: () => Promise.resolve(xmlWithoutCalendarData),
        headers: new Map([['content-type', 'application/xml']])
      });

      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
    });

    it('should handle iCal parsing errors within calendar-data', async () => {
      const xmlWithBadIcal = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/user/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-data>INVALID ICAL DATA</C:calendar-data>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['DAV', '1, 2, calendar-access']])
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(xmlWithBadIcal),
        headers: new Map([['content-type', 'application/xml']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockImplementation(() => {
        throw new Error('Parse error');
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to parse CalDAV response');
    });
  });

  describe('timeout handling', () => {
    it('should handle timeout scenarios', async () => {
      const mockAbortController = {
        abort: vi.fn(),
        signal: { aborted: false }
      };
      
      vi.stubGlobal('AbortController', vi.fn(() => mockAbortController));
      
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch CalDAV events');
    }, 10000);
  });
});