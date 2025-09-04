/**
 * Unit tests for CalendarManager checkAvailability method
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalendarManager } from '../CalendarManager.js';
import { EventCache } from '../EventCache.js';
import { NormalizedEvent } from '../../types/calendar.js';

describe('CalendarManager.checkAvailability', () => {
  let calendarManager: CalendarManager;
  let mockEventCache: EventCache;

  beforeEach(() => {
    mockEventCache = {
      getEvents: vi.fn(),
      setEvents: vi.fn(),
      invalidateSource: vi.fn(),
      getEventById: vi.fn()
    } as any;

    calendarManager = new CalendarManager(mockEventCache);
  });

  describe('basic functionality', () => {
    it('should return empty results for empty time slots', async () => {
      const result = await calendarManager.checkAvailability([]);

      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return available when no events conflict', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      // Mock fetchEvents to return no events
      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].available).toBe(true);
      expect(result.results[0].conflicts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect conflicts when events overlap', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const conflictingEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Team Meeting',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T15:00:00Z'),
        location: {
          name: 'Conference Room A'
        },
        categories: ['meeting'],
        lastModified: new Date()
      };

      // Mock fetchEvents to return conflicting event
      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [conflictingEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
      expect(result.results[0].conflicts[0].id).toBe('event-1');
    });

    it('should handle multiple time slots', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T09:00:00Z'),
          end: new Date('2024-01-15T10:00:00Z')
        },
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const conflictingEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Lunch Meeting',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T14:30:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [conflictingEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].available).toBe(true);  // 9-10 AM slot
      expect(result.results[1].available).toBe(false); // 12-2 PM slot conflicts
      expect(result.results[1].conflicts).toHaveLength(1);
    });
  });

  describe('time overlap detection', () => {
    it('should detect exact overlap', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const exactOverlapEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Exact Overlap',
        startDate: new Date('2024-01-15T12:00:00Z'),
        endDate: new Date('2024-01-15T14:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [exactOverlapEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
    });

    it('should detect partial overlap at start', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const partialOverlapEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Partial Overlap',
        startDate: new Date('2024-01-15T11:00:00Z'),
        endDate: new Date('2024-01-15T13:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [partialOverlapEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
    });

    it('should detect partial overlap at end', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const partialOverlapEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Partial Overlap',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T15:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [partialOverlapEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
    });

    it('should detect event completely contained within slot', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T16:00:00Z')
        }
      ];

      const containedEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Contained Event',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T15:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [containedEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
    });

    it('should detect slot completely contained within event', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T13:00:00Z'),
          end: new Date('2024-01-15T15:00:00Z')
        }
      ];

      const containingEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Containing Event',
        startDate: new Date('2024-01-15T12:00:00Z'),
        endDate: new Date('2024-01-15T16:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [containingEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(false);
      expect(result.results[0].conflicts).toHaveLength(1);
    });

    it('should not detect adjacent events as conflicts', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const beforeEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Before Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T12:00:00Z'), // Ends exactly when slot starts
        categories: ['meeting'],
        lastModified: new Date()
      };

      const afterEvent: NormalizedEvent = {
        id: 'event-2',
        sourceId: 'source-1',
        title: 'After Event',
        startDate: new Date('2024-01-15T14:00:00Z'), // Starts exactly when slot ends
        endDate: new Date('2024-01-15T16:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [beforeEvent, afterEvent],
        results: [],
        errors: []
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.results[0].available).toBe(true);
      expect(result.results[0].conflicts).toHaveLength(0);
    });
  });

  describe('date range optimization', () => {
    it('should fetch events with buffer around time slots', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const fetchEventsSpy = vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      await calendarManager.checkAvailability(timeSlots);

      expect(fetchEventsSpy).toHaveBeenCalledWith({
        start: new Date('2024-01-14T12:00:00Z'), // 24 hours before
        end: new Date('2024-01-16T14:00:00Z')    // 24 hours after
      }, undefined);
    });

    it('should optimize date range for multiple time slots', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T09:00:00Z'),
          end: new Date('2024-01-15T10:00:00Z')
        },
        {
          start: new Date('2024-01-16T14:00:00Z'),
          end: new Date('2024-01-16T16:00:00Z')
        }
      ];

      const fetchEventsSpy = vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      await calendarManager.checkAvailability(timeSlots);

      expect(fetchEventsSpy).toHaveBeenCalledWith({
        start: new Date('2024-01-14T09:00:00Z'), // 24 hours before earliest
        end: new Date('2024-01-17T16:00:00Z')    // 24 hours after latest
      }, undefined);
    });
  });

  describe('source filtering', () => {
    it('should pass source IDs to fetchEvents when specified', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      const fetchEventsSpy = vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      await calendarManager.checkAvailability(timeSlots, ['source-1', 'source-2']);

      expect(fetchEventsSpy).toHaveBeenCalledWith(
        expect.any(Object),
        ['source-1', 'source-2']
      );
    });
  });

  describe('error handling', () => {
    it('should propagate fetch errors', async () => {
      const timeSlots = [
        {
          start: new Date('2024-01-15T12:00:00Z'),
          end: new Date('2024-01-15T14:00:00Z')
        }
      ];

      vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
        events: [],
        results: [],
        errors: ['Calendar source unavailable']
      });

      const result = await calendarManager.checkAvailability(timeSlots);

      expect(result.errors).toContain('Calendar source unavailable');
    });
  });
});