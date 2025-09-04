/**
 * Integration tests for CalendarManager.getEventDetails method
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CalendarManager } from '../CalendarManager.js';
import { EventCache } from '../EventCache.js';
import { NormalizedEvent, CalendarSource } from '../../types/calendar.js';
import { CacheConfig } from '../../types/cache.js';
import { ICalAdapter } from '../../adapters/ICalAdapter.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('CalendarManager.getEventDetails', () => {
  let calendarManager: CalendarManager;
  let eventCache: EventCache;
  let tempDbPath: string;
  let mockAdapter: ICalAdapter;

  beforeEach(async () => {
    // Create temporary database
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'calendar-test-'));
    tempDbPath = path.join(tempDir, 'test.db');

    const cacheConfig: CacheConfig = {
      memoryTtl: 300,
      persistentTtl: 3600,
      maxMemoryEvents: 100,
      cleanupInterval: 60
    };

    eventCache = new EventCache(tempDbPath, cacheConfig);
    calendarManager = new CalendarManager(eventCache);

    // Mock the ICalAdapter
    mockAdapter = {
      getSupportedType: vi.fn().mockReturnValue('ical'),
      fetchEvents: vi.fn(),
      normalizeEvent: vi.fn(),
      validateSource: vi.fn(),
      getSourceStatus: vi.fn()
    } as unknown as ICalAdapter;

    calendarManager.registerAdapter(mockAdapter);
  });

  afterEach(async () => {
    await eventCache.close();
    try {
      await fs.unlink(tempDbPath);
      await fs.rmdir(path.dirname(tempDbPath));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('cached event retrieval', () => {
    it('should return event from cache when available', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'cached-event-123',
        sourceId: 'source-1',
        title: 'Cached Event',
        description: 'Event from cache',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-01-10T09:00:00Z')
      };

      // Pre-populate cache
      await eventCache.setEvents(
        {
          sourceIds: ['source-1'],
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        },
        [mockEvent]
      );

      const result = await calendarManager.getEventDetails('cached-event-123');

      expect(result.found).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.id).toBe('cached-event-123');
      expect(result.event?.title).toBe('Cached Event');
      expect(result.error).toBeUndefined();
    });

    it('should return not found for non-existent event in cache', async () => {
      const result = await calendarManager.getEventDetails('non-existent-event');

      expect(result.found).toBe(false);
      expect(result.event).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('fallback event search', () => {
    it('should search across sources when event not in cache', async () => {
      const source: CalendarSource = {
        id: 'source-1',
        name: 'Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source);

      const mockEvent: NormalizedEvent = {
        id: 'fallback-event-123',
        sourceId: 'source-1',
        title: 'Fallback Event',
        description: 'Event found via fallback search',
        startDate: new Date('2024-02-15T10:00:00Z'),
        endDate: new Date('2024-02-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-02-10T09:00:00Z')
      };

      // Mock adapter to return the event
      vi.mocked(mockAdapter.fetchEvents).mockResolvedValue([{
        id: 'fallback-event-123',
        title: 'Fallback Event',
        description: 'Event found via fallback search',
        startDate: '2024-02-15T10:00:00Z',
        endDate: '2024-02-15T11:00:00Z'
      }]);

      vi.mocked(mockAdapter.normalizeEvent).mockReturnValue(mockEvent);

      const result = await calendarManager.getEventDetails('fallback-event-123');

      expect(result.found).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.id).toBe('fallback-event-123');
      expect(result.event?.title).toBe('Fallback Event');
      expect(vi.mocked(mockAdapter.fetchEvents)).toHaveBeenCalled();
    });

    it('should return not found when event not in any source', async () => {
      const source: CalendarSource = {
        id: 'source-1',
        name: 'Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source);

      // Mock adapter to return empty results
      vi.mocked(mockAdapter.fetchEvents).mockResolvedValue([]);

      const result = await calendarManager.getEventDetails('missing-event-123');

      expect(result.found).toBe(false);
      expect(result.event).toBeNull();
      expect(result.error).toContain('not found in any configured calendar sources');
    });

    it('should handle no enabled sources', async () => {
      const result = await calendarManager.getEventDetails('any-event-123');

      expect(result.found).toBe(false);
      expect(result.event).toBeNull();
      expect(result.error).toBe('No enabled calendar sources available');
    });

    it('should handle adapter errors gracefully', async () => {
      const source: CalendarSource = {
        id: 'source-1',
        name: 'Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source);

      // Mock adapter to throw error
      vi.mocked(mockAdapter.fetchEvents).mockRejectedValue(
        new Error('Network connection failed')
      );

      const result = await calendarManager.getEventDetails('error-event-123');

      expect(result.found).toBe(false);
      expect(result.event).toBeNull();
      expect(result.error).toBe('Network connection failed');
    });
  });

  describe('includeRecurrence parameter', () => {
    it('should pass includeRecurrence parameter correctly', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'recurring-event-123',
        sourceId: 'source-1',
        title: 'Recurring Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-01-10T09:00:00Z'),
        recurrence: {
          frequency: 'weekly',
          interval: 1
        }
      };

      // Pre-populate cache
      await eventCache.setEvents(
        {
          sourceIds: ['source-1'],
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        },
        [mockEvent]
      );

      // Test with includeRecurrence = true (default)
      const resultWithRecurrence = await calendarManager.getEventDetails('recurring-event-123', true);
      expect(resultWithRecurrence.found).toBe(true);
      expect(resultWithRecurrence.event?.recurrence).toBeDefined();

      // Test with includeRecurrence = false
      const resultWithoutRecurrence = await calendarManager.getEventDetails('recurring-event-123', false);
      expect(resultWithoutRecurrence.found).toBe(true);
      expect(resultWithoutRecurrence.event?.recurrence).toBeDefined(); // Event still has recurrence data
    });
  });

  describe('event ID validation', () => {
    it('should handle event IDs with special characters', async () => {
      const specialId = 'event-with-special@chars#123';
      const mockEvent: NormalizedEvent = {
        id: specialId,
        sourceId: 'source-1',
        title: 'Special ID Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-01-10T09:00:00Z')
      };

      await eventCache.setEvents(
        {
          sourceIds: ['source-1'],
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        },
        [mockEvent]
      );

      const result = await calendarManager.getEventDetails(specialId);

      expect(result.found).toBe(true);
      expect(result.event?.id).toBe(specialId);
    });

    it('should handle very long event IDs', async () => {
      const longId = 'a'.repeat(500);
      const mockEvent: NormalizedEvent = {
        id: longId,
        sourceId: 'source-1',
        title: 'Long ID Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-01-10T09:00:00Z')
      };

      await eventCache.setEvents(
        {
          sourceIds: ['source-1'],
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        },
        [mockEvent]
      );

      const result = await calendarManager.getEventDetails(longId);

      expect(result.found).toBe(true);
      expect(result.event?.id).toBe(longId);
    });
  });

  describe('performance considerations', () => {
    it('should prefer cache over fallback search', async () => {
      const source: CalendarSource = {
        id: 'source-1',
        name: 'Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source);

      const mockEvent: NormalizedEvent = {
        id: 'performance-event-123',
        sourceId: 'source-1',
        title: 'Performance Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['test'],
        lastModified: new Date('2024-01-10T09:00:00Z')
      };

      // Pre-populate cache
      await eventCache.setEvents(
        {
          sourceIds: ['source-1'],
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        },
        [mockEvent]
      );

      const result = await calendarManager.getEventDetails('performance-event-123');

      expect(result.found).toBe(true);
      expect(result.event?.id).toBe('performance-event-123');
      
      // Verify that adapter was not called (cache hit)
      expect(vi.mocked(mockAdapter.fetchEvents)).not.toHaveBeenCalled();
    });
  });
});