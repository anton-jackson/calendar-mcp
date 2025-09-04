import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ICalAdapter } from '../ICalAdapter.js';
import { CalendarSource, DateRange } from '../../types/calendar.js';

// Mock node-ical
vi.mock('node-ical', () => ({
  parseICS: vi.fn()
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ICalAdapter', () => {
  let adapter: ICalAdapter;
  let mockSource: CalendarSource;
  let mockDateRange: DateRange;

  beforeEach(() => {
    adapter = new ICalAdapter();
    mockSource = {
      id: 'test-source',
      name: 'Test Calendar',
      type: 'ical',
      url: 'https://example.com/calendar.ics',
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
    it('should return ical as supported type', () => {
      expect(adapter.getSupportedType()).toBe('ical');
    });
  });

  describe('fetchEvents', () => {
    it('should fetch and parse iCal events successfully', async () => {
      const mockICalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Test Event
DESCRIPTION:Test Description
LOCATION:Test Location
END:VEVENT
END:VCALENDAR`;

      const mockParsedData = {
        'test-event-1': {
          type: 'VEVENT',
          uid: 'test-event-1',
          start: new Date('2024-01-15T10:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          summary: 'Test Event',
          description: 'Test Description',
          location: 'Test Location'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue(mockParsedData);

      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(mockParsedData['test-event-1']);
    });

    it('should handle HTTP errors with retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
          headers: new Map([['content-type', 'text/calendar']])
        });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      await expect(adapter.fetchEvents(mockSource, mockDateRange)).resolves.toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch iCal events');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle non-200 HTTP responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch iCal events');
    });

    it('should filter events by date range', async () => {
      const mockICalData = 'mock-ical-data';
      const mockParsedData = {
        'event-1': {
          type: 'VEVENT',
          uid: 'event-1',
          start: new Date('2024-01-15T10:00:00Z'), // Within range
          end: new Date('2024-01-15T11:00:00Z'),
          summary: 'Event 1'
        },
        'event-2': {
          type: 'VEVENT',
          uid: 'event-2',
          start: new Date('2023-12-15T10:00:00Z'), // Before range
          end: new Date('2023-12-15T11:00:00Z'),
          summary: 'Event 2'
        },
        'event-3': {
          type: 'VEVENT',
          uid: 'event-3',
          start: new Date('2024-02-15T10:00:00Z'), // After range
          end: new Date('2024-02-15T11:00:00Z'),
          summary: 'Event 3'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue(mockParsedData);

      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('event-1');
    });

    it('should expand recurring events', async () => {
      const mockICalData = 'mock-ical-data';
      const mockParsedData = {
        'recurring-event': {
          type: 'VEVENT',
          uid: 'recurring-event',
          start: new Date('2024-01-01T10:00:00Z'),
          end: new Date('2024-01-01T11:00:00Z'),
          summary: 'Weekly Meeting',
          rrule: {
            freq: 'WEEKLY',
            interval: 1,
            count: 4
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue(mockParsedData);

      const events = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(events.length).toBeGreaterThan(1);
      // Should have multiple instances of the recurring event
      expect(events.every(event => event.summary === 'Weekly Meeting')).toBe(true);
    });
  });

  describe('validateSource', () => {
    it('should return true for valid iCal source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({ 'some-event': {} });

      const isValid = await adapter.validateSource(mockSource);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid iCal source', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.validateSource(mockSource)).rejects.toThrow();
    });

    it('should throw error for empty calendar', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      await expect(adapter.validateSource(mockSource)).rejects.toThrow('Calendar contains no events');
    });
  });

  describe('getSourceStatus', () => {
    it('should return healthy status for valid source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({ 'some-event': {} });

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
    it('should normalize a basic event correctly', () => {
      const rawEvent = {
        uid: 'test-event',
        summary: 'Test Event',
        description: 'Test Description',
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z'),
        location: 'Test Location',
        organizer: {
          params: { CN: 'John Doe' },
          val: 'mailto:john@example.com'
        },
        categories: ['meeting', 'work'],
        url: 'https://example.com/event',
        lastmodified: new Date('2024-01-01T00:00:00Z')
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized).toEqual({
        id: 'test-source:test-event',
        sourceId: 'test-source',
        title: 'Test Event',
        description: 'Test Description',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Test Location',
          address: 'Test Location'
        },
        organizer: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        categories: ['meeting', 'work'],
        recurrence: undefined,
        url: 'https://example.com/event',
        lastModified: new Date('2024-01-01T00:00:00Z')
      });
    });

    it('should handle minimal event data', () => {
      const rawEvent = {
        uid: 'minimal-event',
        start: new Date('2024-01-15T10:00:00Z')
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized.id).toBe('test-source:minimal-event');
      expect(normalized.title).toBe('Untitled Event');
      expect(normalized.startDate).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(normalized.endDate).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(normalized.categories).toEqual([]);
    });

    it('should handle recurring events', () => {
      const rawEvent = {
        uid: 'recurring-event',
        summary: 'Weekly Meeting',
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z'),
        rrule: {
          freq: 'WEEKLY',
          interval: 2,
          count: 10
        }
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized.recurrence).toEqual({
        frequency: 'weekly',
        interval: 2,
        count: 10,
        until: undefined,
        byDay: undefined,
        byMonth: undefined
      });
    });

    it('should handle events without UID', () => {
      const rawEvent = {
        summary: 'No UID Event',
        start: new Date('2024-01-15T10:00:00Z')
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized.id).toMatch(/^test-source:/);
      expect(normalized.title).toBe('No UID Event');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed iCal data', async () => {
      const malformedICalData = 'This is not valid iCal data';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(malformedICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockImplementation(() => {
        throw new Error('Parse error');
      });

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch iCal events');
    });

    it('should handle timeout scenarios', async () => {
      // Mock AbortController to simulate timeout
      const mockAbortController = {
        abort: vi.fn(),
        signal: { aborted: false }
      };
      
      vi.stubGlobal('AbortController', vi.fn(() => mockAbortController));
      
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch iCal events');
    }, 10000);

    it('should handle unexpected content types', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/html']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      // Should still work but log a warning
      const events = await adapter.fetchEvents(mockSource, mockDateRange);
      expect(events).toEqual([]);
    });

    it('should handle various date formats in events', () => {
      const rawEvent = {
        uid: 'date-test',
        summary: 'Date Test',
        start: '20240115T100000Z', // String format
        end: { toJSDate: () => new Date('2024-01-15T11:00:00Z') } // Object with toJSDate method
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized.startDate).toBeInstanceOf(Date);
      expect(normalized.endDate).toBeInstanceOf(Date);
    });

    it('should handle complex recurrence rules', () => {
      const rawEvent = {
        uid: 'complex-recurring',
        summary: 'Complex Recurring Event',
        start: new Date('2024-01-15T10:00:00Z'),
        rrule: {
          freq: 'MONTHLY',
          interval: 1,
          until: new Date('2024-12-31T23:59:59Z'),
          byday: ['MO', 'WE', 'FR'],
          bymonth: [1, 3, 5, 7, 9, 11]
        }
      };

      const normalized = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(normalized.recurrence).toEqual({
        frequency: 'monthly',
        interval: 1,
        until: new Date('2024-12-31T23:59:59Z'),
        count: undefined,
        byDay: ['MO', 'WE', 'FR'],
        byMonth: [1, 3, 5, 7, 9, 11]
      });
    });
  });
}); 
 describe('webcal URL support', () => {
    it('should normalize webcal:// URLs to https://', async () => {
      const webcalSource = {
        ...mockSource,
        url: 'webcal://example.com/calendar.ics'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      await adapter.fetchEvents(webcalSource, mockDateRange);

      // Verify that fetch was called with https:// URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/calendar.ics',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'PublicCalendarMCP/1.0',
            'Accept': 'text/calendar, text/plain, */*'
          })
        })
      );
    });

    it('should normalize webcals:// URLs to https://', async () => {
      const webcalsSource = {
        ...mockSource,
        url: 'webcals://example.com/calendar.ics'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      await adapter.fetchEvents(webcalsSource, mockDateRange);

      // Verify that fetch was called with https:// URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/calendar.ics',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'PublicCalendarMCP/1.0',
            'Accept': 'text/calendar, text/plain, */*'
          })
        })
      );
    });

    it('should leave https:// URLs unchanged', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const { parseICS } = await import('node-ical');
      vi.mocked(parseICS).mockReturnValue({});

      await adapter.fetchEvents(mockSource, mockDateRange);

      // Verify that https:// URL was not modified
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/calendar.ics',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'PublicCalendarMCP/1.0',
            'Accept': 'text/calendar, text/plain, */*'
          })
        })
      );
    });
  });