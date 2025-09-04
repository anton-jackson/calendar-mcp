import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarAdapter } from '../GoogleCalendarAdapter.js';
import { CalendarSource, DateRange } from '../../types/calendar.js';
import { google } from 'googleapis';

// Mock the googleapis library
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn()
      },
      calendars: {
        get: vi.fn()
      }
    }))
  }
}));

describe('GoogleCalendarAdapter', () => {
  let adapter: GoogleCalendarAdapter;
  let mockCalendar: any;
  let mockSource: CalendarSource;
  let mockDateRange: DateRange;

  beforeEach(() => {
    adapter = new GoogleCalendarAdapter();
    mockCalendar = {
      events: {
        list: vi.fn()
      },
      calendars: {
        get: vi.fn()
      }
    };
    (google.calendar as any).mockReturnValue(mockCalendar);

    mockSource = {
      id: 'test-source',
      name: 'Test Google Calendar',
      type: 'google',
      url: 'https://calendar.google.com/calendar/embed?src=test@gmail.com',
      enabled: true,
      status: 'active'
    };

    mockDateRange = {
      start: new Date('2024-01-01T00:00:00Z'),
      end: new Date('2024-01-31T23:59:59Z')
    };

    // Mock environment variable
    process.env.GOOGLE_CALENDAR_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_CALENDAR_API_KEY;
  });

  describe('getSupportedType', () => {
    it('should return google as supported type', () => {
      expect(adapter.getSupportedType()).toBe('google');
    });
  });

  describe('fetchEvents', () => {
    it('should fetch events successfully', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Test Event 1',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          description: 'Test description',
          location: 'Test Location',
          organizer: {
            displayName: 'Test Organizer',
            email: 'organizer@test.com'
          },
          htmlLink: 'https://calendar.google.com/event?eid=test',
          updated: '2024-01-01T00:00:00Z'
        }
      ];

      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents }
      });

      const result = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(result).toEqual(mockEvents);
      expect(mockCalendar.events.list).toHaveBeenCalledWith({
        calendarId: 'test@gmail.com',
        timeMin: mockDateRange.start.toISOString(),
        timeMax: mockDateRange.end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500
      });
    });

    it('should handle empty events list', async () => {
      mockCalendar.events.list.mockResolvedValue({
        data: { items: null }
      });

      const result = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(result).toEqual([]);
    });

    it('should throw error when API call fails', async () => {
      const error = new Error('API Error');
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Failed to fetch Google Calendar events from https://calendar.google.com/calendar/embed?src=test@gmail.com: API Error');
    });

    it('should throw error when API key is missing', async () => {
      delete process.env.GOOGLE_CALENDAR_API_KEY;
      
      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Google Calendar API key is required');
    });

    it('should retry on rate limit errors', async () => {
      const rateLimitError = { code: 429, message: 'Rate limit exceeded' };
      mockCalendar.events.list
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({ data: { items: [] } });

      const result = await adapter.fetchEvents(mockSource, mockDateRange);

      expect(result).toEqual([]);
      expect(mockCalendar.events.list).toHaveBeenCalledTimes(3);
    });
  });

  describe('validateSource', () => {
    it('should validate source successfully', async () => {
      mockCalendar.calendars.get.mockResolvedValue({
        data: { id: 'test@gmail.com' }
      });

      const result = await adapter.validateSource(mockSource);

      expect(result).toBe(true);
      expect(mockCalendar.calendars.get).toHaveBeenCalledWith({
        calendarId: 'test@gmail.com'
      });
    });

    it('should throw error when validation fails', async () => {
      const error = new Error('Calendar not found');
      mockCalendar.calendars.get.mockRejectedValue(error);

      await expect(adapter.validateSource(mockSource))
        .rejects.toThrow('Calendar not found');
    });
  });

  describe('getSourceStatus', () => {
    it('should return healthy status when validation succeeds', async () => {
      mockCalendar.calendars.get.mockResolvedValue({
        data: { id: 'test@gmail.com' }
      });

      const result = await adapter.getSourceStatus(mockSource);

      expect(result.isHealthy).toBe(true);
      expect(result.lastCheck).toBeInstanceOf(Date);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should return unhealthy status when validation fails', async () => {
      const error = { code: 404, message: 'Not found' };
      mockCalendar.calendars.get.mockRejectedValue(error);

      const result = await adapter.getSourceStatus(mockSource);

      expect(result.isHealthy).toBe(false);
      expect(result.lastCheck).toBeInstanceOf(Date);
      expect(result.errorMessage).toBe('Calendar not found or not publicly accessible');
    });
  });

  describe('normalizeEvent', () => {
    it('should normalize Google Calendar event correctly', () => {
      const rawEvent = {
        id: 'event1',
        summary: 'Test Event',
        description: 'Test description',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
        location: 'Test Location',
        organizer: {
          displayName: 'Test Organizer',
          email: 'organizer@test.com'
        },
        eventType: 'default',
        htmlLink: 'https://calendar.google.com/event?eid=test',
        updated: '2024-01-01T00:00:00Z',
        recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=1']
      };

      const result = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(result).toEqual({
        id: 'test-source:event1',
        sourceId: 'test-source',
        title: 'Test Event',
        description: 'Test description',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Test Location',
          address: 'Test Location'
        },
        organizer: {
          name: 'Test Organizer',
          email: 'organizer@test.com'
        },
        categories: ['default'],
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          until: undefined,
          count: undefined,
          byDay: undefined,
          byMonth: undefined
        },
        url: 'https://calendar.google.com/event?eid=test',
        lastModified: new Date('2024-01-01T00:00:00Z')
      });
    });

    it('should handle all-day events', () => {
      const rawEvent = {
        id: 'event1',
        summary: 'All Day Event',
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' }
      };

      const result = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(result.title).toBe('All Day Event');
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('should handle events without optional fields', () => {
      const rawEvent = {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' }
      };

      const result = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(result.title).toBe('Untitled Event');
      expect(result.description).toBeUndefined();
      expect(result.location).toBeUndefined();
      expect(result.organizer).toBeUndefined();
      expect(result.categories).toEqual([]);
      expect(result.recurrence).toBeUndefined();
    });

    it('should handle complex recurrence rules', () => {
      const rawEvent = {
        id: 'event1',
        summary: 'Recurring Event',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        recurrence: ['RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR']
      };

      const result = adapter.normalizeEvent(rawEvent, 'test-source');

      expect(result.recurrence).toEqual({
        frequency: 'monthly',
        interval: 2,
        until: undefined,
        count: 10,
        byDay: ['MO', 'WE', 'FR'],
        byMonth: undefined
      });
    });
  });

  describe('calendar ID extraction', () => {
    it('should extract calendar ID from embed URL', async () => {
      const source = {
        ...mockSource,
        url: 'https://calendar.google.com/calendar/embed?src=test%40gmail.com&ctz=America%2FNew_York'
      };

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(source, mockDateRange);

      expect(mockCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'test@gmail.com'
        })
      );
    });

    it('should extract calendar ID from calendars URL', async () => {
      const source = {
        ...mockSource,
        url: 'https://www.google.com/calendar/calendars/test@gmail.com'
      };

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(source, mockDateRange);

      expect(mockCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'test@gmail.com'
        })
      );
    });

    it('should handle group calendar format', async () => {
      const source = {
        ...mockSource,
        url: 'https://calendar.google.com/calendar/embed?src=abcd1234@group.calendar.google.com'
      };

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(source, mockDateRange);

      expect(mockCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'abcd1234@group.calendar.google.com'
        })
      );
    });

    it('should use URL as calendar ID if no pattern matches', async () => {
      const source = {
        ...mockSource,
        url: 'custom-calendar-id'
      };

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(source, mockDateRange);

      expect(mockCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'custom-calendar-id'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should format 400 error correctly', async () => {
      const error = { code: 400, message: 'Bad Request' };
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Invalid calendar ID or request parameters');
    });

    it('should format 401 error correctly', async () => {
      const error = { code: 401, message: 'Unauthorized' };
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Invalid or missing API key');
    });

    it('should format 403 error correctly', async () => {
      const error = { code: 403, message: 'Forbidden' };
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Access denied - check API key permissions or calendar visibility');
    });

    it('should format 404 error correctly', async () => {
      const error = { code: 404, message: 'Not Found' };
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow('Calendar not found or not publicly accessible');
    });

    it('should not retry non-retryable errors', async () => {
      const error = { code: 404, message: 'Not Found' };
      mockCalendar.events.list.mockRejectedValue(error);

      await expect(adapter.fetchEvents(mockSource, mockDateRange))
        .rejects.toThrow();

      expect(mockCalendar.events.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('API key management', () => {
    it('should use API key from environment variable', async () => {
      process.env.GOOGLE_CALENDAR_API_KEY = 'env-api-key';
      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(mockSource, mockDateRange);

      expect(google.calendar).toHaveBeenCalledWith({
        version: 'v3',
        auth: 'env-api-key'
      });
    });

    it('should use API key from source configuration', async () => {
      delete process.env.GOOGLE_CALENDAR_API_KEY;
      const sourceWithApiKey = {
        ...mockSource,
        apiKey: 'source-api-key'
      } as any;

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(sourceWithApiKey, mockDateRange);

      expect(google.calendar).toHaveBeenCalledWith({
        version: 'v3',
        auth: 'source-api-key'
      });
    });

    it('should use API key from credentials object', async () => {
      delete process.env.GOOGLE_CALENDAR_API_KEY;
      const sourceWithCredentials = {
        ...mockSource,
        credentials: { apiKey: 'credentials-api-key' }
      } as any;

      mockCalendar.events.list.mockResolvedValue({ data: { items: [] } });

      await adapter.fetchEvents(sourceWithCredentials, mockDateRange);

      expect(google.calendar).toHaveBeenCalledWith({
        version: 'v3',
        auth: 'credentials-api-key'
      });
    });
  });
});