import { describe, it, expect } from 'vitest';
import { EventNormalizer } from '../eventNormalizer.js';
import type { RawEvent } from '../../types/calendar.js';

describe('EventNormalizer', () => {
  describe('normalize', () => {
    it('should throw error for unsupported source type', () => {
      const rawEvent: RawEvent = { summary: 'Test Event' };
      expect(() => EventNormalizer.normalize(rawEvent, 'source-1', 'unsupported' as any))
        .toThrow('Unsupported source type: unsupported');
    });
  });

  describe('iCal normalization', () => {
    it('should normalize basic iCal event', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-1',
        summary: 'Test Meeting',
        description: 'A test meeting',
        dtstart: '20240115T100000Z',
        dtend: '20240115T110000Z',
        location: 'Conference Room A',
        categories: 'meeting,work'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.id).toBe('test-event-1');
      expect(result.sourceId).toBe('source-1');
      expect(result.title).toBe('Test Meeting');
      expect(result.description).toBe('A test meeting');
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
      expect(result.location?.name).toBe('Conference Room A');
      expect(result.categories).toEqual(['meeting', 'work']);
    });

    it('should handle iCal event with uppercase properties', () => {
      const rawEvent: RawEvent = {
        UID: 'test-event-2',
        SUMMARY: 'UPPERCASE EVENT',
        DTSTART: '20240115T100000Z',
        DTEND: '20240115T110000Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.id).toBe('test-event-2');
      expect(result.title).toBe('UPPERCASE EVENT');
    });

    it('should handle iCal event with object-style date properties', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-3',
        summary: 'Object Date Event',
        dtstart: {
          val: '20240115T100000',
          tz: 'America/New_York'
        },
        dtend: {
          value: '20240115T110000',
          timezone: 'America/New_York'
        }
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.id).toBe('test-event-3');
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('should handle iCal event with organizer object', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-4',
        summary: 'Event with Organizer',
        dtstart: '20240115T100000Z',
        organizer: {
          cn: 'John Doe',
          val: 'john@example.com'
        }
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.organizer?.name).toBe('John Doe');
      expect(result.organizer?.email).toBe('john@example.com');
    });

    it('should handle iCal event with recurrence rule', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-5',
        summary: 'Recurring Event',
        dtstart: '20240115T100000Z',
        rrule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=10'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.recurrence?.frequency).toBe('weekly');
      expect(result.recurrence?.interval).toBe(2);
      expect(result.recurrence?.count).toBe(10);
    });

    it('should generate default end date when missing', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-6',
        summary: 'No End Date',
        dtstart: '20240115T100000Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.endDate.getTime()).toBe(result.startDate.getTime() + 60 * 60 * 1000);
    });

    it('should generate event ID when missing', () => {
      const rawEvent: RawEvent = {
        summary: 'No UID Event',
        dtstart: '20240115T100000Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.id).toContain('source-1');
      expect(result.id).toContain('no-uid-event');
    });

    it('should throw error when start date is missing', () => {
      const rawEvent: RawEvent = {
        uid: 'test-event-7',
        summary: 'No Start Date'
      };

      expect(() => EventNormalizer.normalize(rawEvent, 'source-1', 'ical'))
        .toThrow('Event must have a start date');
    });
  });

  describe('Google Calendar normalization', () => {
    it('should normalize basic Google Calendar event', () => {
      const rawEvent: RawEvent = {
        id: 'google-event-1',
        summary: 'Google Meeting',
        description: 'A Google Calendar meeting',
        start: {
          dateTime: '2024-01-15T10:00:00-08:00'
        },
        end: {
          dateTime: '2024-01-15T11:00:00-08:00'
        },
        location: 'Google Office',
        organizer: {
          displayName: 'Jane Smith',
          email: 'jane@google.com'
        },
        htmlLink: 'https://calendar.google.com/event?eid=123',
        updated: '2024-01-10T12:00:00Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'google');

      expect(result.id).toBe('google-event-1');
      expect(result.title).toBe('Google Meeting');
      expect(result.description).toBe('A Google Calendar meeting');
      expect(result.location?.name).toBe('Google Office');
      expect(result.organizer?.name).toBe('Jane Smith');
      expect(result.organizer?.email).toBe('jane@google.com');
      expect(result.url).toBe('https://calendar.google.com/event?eid=123');
    });

    it('should handle Google Calendar all-day event', () => {
      const rawEvent: RawEvent = {
        id: 'google-event-2',
        summary: 'All Day Event',
        start: {
          date: '2024-01-15'
        },
        end: {
          date: '2024-01-16'
        }
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'google');

      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('should handle Google Calendar event with recurrence', () => {
      const rawEvent: RawEvent = {
        id: 'google-event-3',
        summary: 'Recurring Google Event',
        start: {
          dateTime: '2024-01-15T10:00:00Z'
        },
        recurrence: [
          'RRULE:FREQ=DAILY;COUNT=5'
        ]
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'google');

      expect(result.recurrence?.frequency).toBe('daily');
      expect(result.recurrence?.count).toBe(5);
    });

    it('should throw error when Google event has no start date', () => {
      const rawEvent: RawEvent = {
        id: 'google-event-4',
        summary: 'No Start Date'
      };

      expect(() => EventNormalizer.normalize(rawEvent, 'source-1', 'google'))
        .toThrow('Event must have a start date');
    });

    it('should throw error for invalid Google date format', () => {
      const rawEvent: RawEvent = {
        id: 'google-event-5',
        summary: 'Invalid Date',
        start: {
          invalidProperty: 'invalid'
        }
      };

      expect(() => EventNormalizer.normalize(rawEvent, 'source-1', 'google'))
        .toThrow('Invalid Google date format');
    });
  });

  describe('CalDAV normalization', () => {
    it('should normalize CalDAV event (delegates to iCal)', () => {
      const rawEvent: RawEvent = {
        calendarData: {
          uid: 'caldav-event-1',
          summary: 'CalDAV Meeting',
          dtstart: '20240115T100000Z',
          dtend: '20240115T110000Z'
        }
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'caldav');

      expect(result.id).toBe('caldav-event-1');
      expect(result.title).toBe('CalDAV Meeting');
    });

    it('should handle CalDAV event without calendarData wrapper', () => {
      const rawEvent: RawEvent = {
        uid: 'caldav-event-2',
        summary: 'Direct CalDAV Event',
        dtstart: '20240115T100000Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'caldav');

      expect(result.id).toBe('caldav-event-2');
      expect(result.title).toBe('Direct CalDAV Event');
    });
  });

  describe('edge cases', () => {
    it('should handle events with minimal data', () => {
      const rawEvent: RawEvent = {
        dtstart: '20240115T100000Z'
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.title).toBe('Untitled Event');
      expect(result.categories).toEqual([]);
      expect(result.startDate).toBeInstanceOf(Date);
    });

    it('should handle events with array categories', () => {
      const rawEvent: RawEvent = {
        uid: 'test-categories',
        summary: 'Event with Array Categories',
        dtstart: '20240115T100000Z',
        categories: [
          { val: 'meeting' },
          { value: 'important' },
          'work'
        ]
      };

      const result = EventNormalizer.normalize(rawEvent, 'source-1', 'ical');

      expect(result.categories).toEqual(['meeting', 'important', 'work']);
    });

    it('should handle invalid date properties gracefully', () => {
      const rawEvent: RawEvent = {
        uid: 'test-invalid-date',
        summary: 'Invalid Date Property',
        dtstart: {
          invalidProperty: 'not-a-date'
        }
      };

      expect(() => EventNormalizer.normalize(rawEvent, 'source-1', 'ical'))
        .toThrow('Invalid date property format');
    });
  });
});