/**
 * Integration tests for CalendarManager with real adapters and cache
 * These tests verify that the CalendarManager correctly integrates with EventCache and adapters
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CalendarManager } from '../CalendarManager.js';
import { EventCache } from '../EventCache.js';
import { CalendarAdapter } from '../../interfaces/CalendarAdapter.js';
import { CalendarSource, DateRange, NormalizedEvent, SourceStatus, RawEvent } from '../../types/calendar.js';
import { CacheConfig } from '../../types/cache.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Simple test adapter for integration testing
class TestCalendarAdapter implements CalendarAdapter {
  private events: RawEvent[] = [];
  private shouldFail = false;

  setEvents(events: RawEvent[]): void {
    this.events = events;
  }

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]> {
    if (this.shouldFail) {
      throw new Error(`Test adapter failure for ${source.id}`);
    }
    return this.events;
  }

  async validateSource(source: CalendarSource): Promise<boolean> {
    return !this.shouldFail;
  }

  async getSourceStatus(source: CalendarSource): Promise<SourceStatus> {
    return {
      isHealthy: !this.shouldFail,
      lastCheck: new Date(),
      errorMessage: this.shouldFail ? 'Test error' : undefined
    };
  }

  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    return {
      id: `${sourceId}:${rawEvent.id}`,
      sourceId,
      title: rawEvent.title || 'Test Event',
      description: rawEvent.description,
      startDate: new Date(rawEvent.start || '2024-01-15T10:00:00Z'),
      endDate: new Date(rawEvent.end || '2024-01-15T11:00:00Z'),
      location: rawEvent.location ? { name: rawEvent.location } : undefined,
      organizer: rawEvent.organizer ? { name: rawEvent.organizer } : undefined,
      categories: rawEvent.categories || [],
      url: rawEvent.url,
      lastModified: new Date()
    };
  }

  getSupportedType(): CalendarSource['type'] {
    return 'ical';
  }
}

describe('CalendarManager Integration Tests', () => {
  let calendarManager: CalendarManager;
  let eventCache: EventCache;
  let testAdapter: TestCalendarAdapter;
  let tempDbPath: string;

  const testDateRange: DateRange = {
    start: new Date('2024-01-01'),
    end: new Date('2024-12-31')
  };

  beforeEach(async () => {
    // Create temporary database
    tempDbPath = join(tmpdir(), `test-calendar-${Date.now()}.db`);
    
    const cacheConfig: CacheConfig = {
      memoryTtl: 300, // 5 minutes
      persistentTtl: 3600, // 1 hour
      maxMemoryEvents: 100,
      cleanupInterval: 60
    };

    eventCache = new EventCache(tempDbPath, cacheConfig);
    calendarManager = new CalendarManager(eventCache, {
      maxConcurrentFetches: 3,
      fetchTimeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    });

    // Create and register test adapter
    testAdapter = new TestCalendarAdapter();
    calendarManager.registerAdapter(testAdapter);
  });

  afterEach(async () => {
    await eventCache.close();
    
    // Clean up temporary database
    try {
      await fs.unlink(tempDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Integration with EventCache', () => {
    it('should cache events and serve from cache on subsequent requests', async () => {
      const source: CalendarSource = {
        id: 'cache-test-source',
        name: 'Cache Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      const testEvents = [
        { id: '1', title: 'Event 1', start: '2024-01-15T10:00:00Z' },
        { id: '2', title: 'Event 2', start: '2024-01-16T14:00:00Z' }
      ];

      testAdapter.setEvents(testEvents);
      calendarManager.addSource(source);

      // First request - should fetch from source
      const result1 = await calendarManager.fetchEvents(testDateRange);
      expect(result1.events.length).toBe(2);
      expect(result1.results[0].fetchTime).toBeGreaterThan(0);

      // Second request - should serve from cache
      const result2 = await calendarManager.fetchEvents(testDateRange);
      expect(result2.events).toEqual(result1.events);
      expect(result2.results[0].fetchTime).toBe(0); // From cache
    });

    it('should invalidate cache when source is refreshed', async () => {
      const source: CalendarSource = {
        id: 'refresh-test-source',
        name: 'Refresh Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      const initialEvents = [
        { id: '1', title: 'Initial Event', start: '2024-01-15T10:00:00Z' }
      ];

      const updatedEvents = [
        { id: '1', title: 'Updated Event', start: '2024-01-15T10:00:00Z' }
      ];

      testAdapter.setEvents(initialEvents);
      calendarManager.addSource(source);

      // Initial fetch
      const initialResult = await calendarManager.fetchEvents(testDateRange);
      expect(initialResult.events[0].title).toBe('Initial Event');

      // Update adapter data and refresh
      testAdapter.setEvents(updatedEvents);
      const refreshResult = await calendarManager.refreshSource('refresh-test-source', testDateRange);
      
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.events[0].title).toBe('Updated Event');
    });
  });

  describe('Multi-Source Integration', () => {
    it('should fetch and deduplicate events from multiple sources', async () => {
      const source1: CalendarSource = {
        id: 'source-1',
        name: 'Calendar 1',
        type: 'ical',
        url: 'https://example.com/calendar1.ics',
        enabled: true,
        status: 'active'
      };

      const source2: CalendarSource = {
        id: 'source-2',
        name: 'Calendar 2',
        type: 'ical',
        url: 'https://example.com/calendar2.ics',
        enabled: true,
        status: 'active'
      };

      // Same event from both sources (should be deduplicated)
      const duplicateEvent = {
        id: 'duplicate',
        title: 'Duplicate Event',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z',
        location: 'Same Location'
      };

      testAdapter.setEvents([duplicateEvent]);
      calendarManager.addSource(source1);
      calendarManager.addSource(source2);

      const result = await calendarManager.fetchEvents(testDateRange);

      expect(result.events.length).toBe(1); // Deduplicated
      expect(result.results).toHaveLength(2); // Both sources processed
      expect(result.results.every(r => r.success)).toBe(true);
    });

    it('should handle mixed success and failure scenarios', async () => {
      const workingSource: CalendarSource = {
        id: 'working-source',
        name: 'Working Calendar',
        type: 'ical',
        url: 'https://example.com/working.ics',
        enabled: true,
        status: 'active'
      };

      const failingSource: CalendarSource = {
        id: 'failing-source',
        name: 'Failing Calendar',
        type: 'ical',
        url: 'https://example.com/failing.ics',
        enabled: true,
        status: 'active'
      };

      const testEvents = [
        { id: '1', title: 'Working Event', start: '2024-01-15T10:00:00Z' }
      ];

      // Set up adapter to succeed for working source, fail for failing source
      testAdapter.setEvents(testEvents);
      
      calendarManager.addSource(workingSource);
      calendarManager.addSource(failingSource);

      // Make failing source fail after adding
      testAdapter.setFailure(true);

      const result = await calendarManager.fetchEvents(testDateRange);

      expect(result.results).toHaveLength(2);
      expect(result.results.some(r => r.success)).toBe(true); // At least one succeeds
      expect(result.results.some(r => !r.success)).toBe(true); // At least one fails
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Source Management Integration', () => {
    it('should handle source addition, update, and removal', async () => {
      const source: CalendarSource = {
        id: 'management-test',
        name: 'Management Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      // Add source
      calendarManager.addSource(source);
      expect(calendarManager.getSources()).toHaveLength(1);

      // Update source
      const updatedSource = { ...source, name: 'Updated Name' };
      calendarManager.updateSource(updatedSource);
      expect(calendarManager.getSource('management-test')?.name).toBe('Updated Name');

      // Remove source
      calendarManager.removeSource('management-test');
      expect(calendarManager.getSources()).toHaveLength(0);
    });

    it('should validate sources correctly', async () => {
      const validSource: CalendarSource = {
        id: 'valid-source',
        name: 'Valid Calendar',
        type: 'ical',
        url: 'https://example.com/valid.ics',
        enabled: true,
        status: 'active'
      };

      const invalidSource: CalendarSource = {
        id: 'invalid-source',
        name: 'Invalid Calendar',
        type: 'ical',
        url: 'https://example.com/invalid.ics',
        enabled: true,
        status: 'active'
      };

      // Valid source
      testAdapter.setFailure(false);
      const validResult = await calendarManager.validateSource(validSource);
      expect(validResult).toBe(true);

      // Invalid source
      testAdapter.setFailure(true);
      const invalidResult = await calendarManager.validateSource(invalidSource);
      expect(invalidResult).toBe(false);
    });

    it('should monitor source health', async () => {
      const source: CalendarSource = {
        id: 'health-test',
        name: 'Health Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source);

      // Healthy source
      testAdapter.setFailure(false);
      const healthyStatus = await calendarManager.getSourceHealth('health-test');
      expect(healthyStatus?.isHealthy).toBe(true);
      expect(healthyStatus?.responseTime).toBeGreaterThan(0);

      // Unhealthy source
      testAdapter.setFailure(true);
      const unhealthyStatus = await calendarManager.getSourceHealth('health-test');
      expect(unhealthyStatus?.isHealthy).toBe(false);
      expect(unhealthyStatus?.errorMessage).toBeDefined();
    });
  });
});