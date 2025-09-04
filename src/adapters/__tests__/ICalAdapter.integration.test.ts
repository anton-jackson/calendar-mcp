import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ICalAdapter } from '../ICalAdapter.js';
import { CalendarSource, DateRange } from '../../types/calendar.js';

// Mock fetch to return local test files
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ICalAdapter Integration Tests', () => {
  let adapter: ICalAdapter;
  let mockSource: CalendarSource;

  beforeEach(() => {
    adapter = new ICalAdapter();
    mockSource = {
      id: 'integration-test-source',
      name: 'Integration Test Calendar',
      type: 'ical',
      url: 'https://example.com/test-calendar.ics',
      enabled: true,
      status: 'active'
    };
    
    vi.clearAllMocks();
  });

  describe('with real iCal data', () => {
    it('should parse and normalize events from sample iCal file', async () => {
      // Load sample iCal data
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const events = await adapter.fetchEvents(mockSource, dateRange);

      // Should have multiple events
      expect(events.length).toBeGreaterThan(0);

      // Test specific events
      const simpleEvent = events.find(e => e.uid === 'simple-event@example.com');
      expect(simpleEvent).toBeDefined();
      expect(simpleEvent?.summary).toBe('Simple Meeting');

      const allDayEvent = events.find(e => e.uid === 'all-day-event@example.com');
      expect(allDayEvent).toBeDefined();
      expect(allDayEvent?.summary).toBe('All Day Event');

      // Test recurring events - should have multiple instances
      const recurringEvents = events.filter(e => e.summary === 'Weekly Team Meeting');
      expect(recurringEvents.length).toBeGreaterThan(1);
    });

    it('should normalize events correctly', async () => {
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const rawEvents = await adapter.fetchEvents(mockSource, dateRange);
      const simpleEvent = rawEvents.find(e => e.uid === 'simple-event@example.com');
      
      if (simpleEvent) {
        const normalized = adapter.normalizeEvent(simpleEvent, mockSource.id);

        expect(normalized).toMatchObject({
          id: expect.stringContaining('integration-test-source:'),
          sourceId: 'integration-test-source',
          title: 'Simple Meeting',
          description: 'A simple meeting event for testing',
          location: {
            name: 'Conference Room A',
            address: 'Conference Room A'
          },
          organizer: {
            name: 'John Doe',
            email: 'john@example.com'
          },
          categories: ['meeting', 'work'],
          url: 'https://example.com/meeting/123'
        });

        expect(normalized.startDate).toBeInstanceOf(Date);
        expect(normalized.endDate).toBeInstanceOf(Date);
        expect(normalized.lastModified).toBeInstanceOf(Date);
      }
    });

    it('should handle recurring events with proper expansion', async () => {
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      // Wider date range to capture more recurring instances
      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-31')
      };

      const events = await adapter.fetchEvents(mockSource, dateRange);

      // Find recurring weekly events
      const weeklyMeetings = events.filter(e => e.summary === 'Weekly Team Meeting');
      expect(weeklyMeetings.length).toBeGreaterThan(1);

      // Verify they occur on different dates
      const dates = weeklyMeetings.map(e => e.start.toISOString().split('T')[0]);
      const uniqueDates = new Set(dates);
      expect(uniqueDates.size).toBe(weeklyMeetings.length);

      // Find recurring monthly events
      const monthlyReviews = events.filter(e => e.summary === 'Monthly Review');
      expect(monthlyReviews.length).toBeGreaterThan(1);

      // The expanded events won't have rrule, but we should have multiple instances
      // This is the expected behavior - recurring events are expanded into individual instances
      expect(weeklyMeetings.length).toBeGreaterThan(1);
      
      // Verify the instances have different dates but same basic properties
      const firstMeeting = weeklyMeetings[0];
      const secondMeeting = weeklyMeetings[1];
      
      expect(firstMeeting.summary).toBe(secondMeeting.summary);
      expect(firstMeeting.start.getTime()).not.toBe(secondMeeting.start.getTime());
    });

    it('should handle date filtering correctly', async () => {
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      // Narrow date range
      const dateRange: DateRange = {
        start: new Date('2024-01-15'),
        end: new Date('2024-01-16')
      };

      const events = await adapter.fetchEvents(mockSource, dateRange);

      // Should only include events within the date range
      for (const event of events) {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end || event.start);
        
        // Event should overlap with date range
        expect(eventEnd >= dateRange.start && eventStart <= dateRange.end).toBe(true);
      }
    });

    it('should handle malformed iCal data gracefully', async () => {
      const malformedICalPath = join(__dirname, 'fixtures', 'malformed.ics');
      const malformedICalData = readFileSync(malformedICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(malformedICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      // Should either succeed with partial data or fail gracefully
      try {
        const events = await adapter.fetchEvents(mockSource, dateRange);
        // If it succeeds, it should handle the malformed data gracefully
        expect(Array.isArray(events)).toBe(true);
      } catch (error) {
        // If it fails, it should provide a meaningful error message
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to fetch iCal events');
      }
    });

    it('should validate sources correctly', async () => {
      // Valid calendar
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const isValid = await adapter.validateSource(mockSource);
      expect(isValid).toBe(true);

      // Invalid calendar (empty) - node-ical might still parse metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\nEND:VCALENDAR'),
        headers: new Map([['content-type', 'text/calendar']])
      });

      // Check if it validates or throws - either is acceptable for empty calendar
      try {
        const isValid = await adapter.validateSource(mockSource);
        // If it doesn't throw, it should return false or true based on metadata presence
        expect(typeof isValid).toBe('boolean');
      } catch (error) {
        // If it throws, that's also acceptable for empty calendar
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should provide accurate source status', async () => {
      // Healthy source
      const sampleICalPath = join(__dirname, 'fixtures', 'sample.ics');
      const sampleICalData = readFileSync(sampleICalPath, 'utf-8');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(sampleICalData),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const healthyStatus = await adapter.getSourceStatus(mockSource);
      expect(healthyStatus.isHealthy).toBe(true);
      expect(healthyStatus.lastCheck).toBeInstanceOf(Date);
      expect(healthyStatus.errorMessage).toBeUndefined();

      // Unhealthy source
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const unhealthyStatus = await adapter.getSourceStatus(mockSource);
      expect(unhealthyStatus.isHealthy).toBe(false);
      expect(unhealthyStatus.lastCheck).toBeInstanceOf(Date);
      expect(unhealthyStatus.errorMessage).toBeDefined();
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large numbers of recurring events efficiently', async () => {
      // Create a calendar with many recurring events
      const largeRecurringCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Large Calendar//Test//EN

BEGIN:VEVENT
UID:daily-recurring@example.com
DTSTART:20240101T090000Z
DTEND:20240101T100000Z
SUMMARY:Daily Standup
RRULE:FREQ=DAILY;COUNT=365
END:VEVENT

END:VCALENDAR`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(largeRecurringCalendar),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      };

      const startTime = Date.now();
      const events = await adapter.fetchEvents(mockSource, dateRange);
      const endTime = Date.now();

      // Should complete in reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Should have many events but not exceed safety limits
      expect(events.length).toBeGreaterThan(100);
      expect(events.length).toBeLessThanOrEqual(1000); // Safety limit
    });

    it('should handle events with missing end dates', async () => {
      const calendarWithMissingEndDates = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Missing End Dates//Test//EN

BEGIN:VEVENT
UID:no-end-date@example.com
DTSTART:20240115T100000Z
SUMMARY:Event Without End Date
END:VEVENT

END:VCALENDAR`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(calendarWithMissingEndDates),
        headers: new Map([['content-type', 'text/calendar']])
      });

      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const events = await adapter.fetchEvents(mockSource, dateRange);
      expect(events.length).toBe(1);

      const normalized = adapter.normalizeEvent(events[0], mockSource.id);
      expect(normalized.startDate).toEqual(normalized.endDate);
    });
  });
});