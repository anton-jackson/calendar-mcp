/**
 * Unit tests for CalendarManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CalendarManager } from '../CalendarManager.js';
import { EventCache } from '../EventCache.js';
import { CalendarAdapter } from '../../interfaces/CalendarAdapter.js';
import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, RawEvent } from '../../types/calendar.js';

// Mock EventCache
vi.mock('../EventCache.js');

// Mock adapter for testing
class MockCalendarAdapter implements CalendarAdapter {
  private shouldFail = false;
  private delay = 0;
  private events: RawEvent[] = [];

  constructor(private type: CalendarSource['type'] = 'ical') {}

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  setEvents(events: RawEvent[]): void {
    this.events = events;
  }

  async fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error(`Mock adapter failure for ${source.id}`);
    }

    return this.events;
  }

  async validateSource(source: CalendarSource): Promise<boolean> {
    if (this.shouldFail) {
      throw new Error('Validation failed');
    }
    return true;
  }

  async getSourceStatus(source: CalendarSource): Promise<SourceStatus> {
    return {
      isHealthy: !this.shouldFail,
      lastCheck: new Date(),
      errorMessage: this.shouldFail ? 'Mock error' : undefined
    };
  }

  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    return {
      id: `${sourceId}:${rawEvent.id}`,
      sourceId,
      title: rawEvent.title || 'Test Event',
      description: rawEvent.description,
      startDate: new Date(rawEvent.start || '2024-01-01T10:00:00Z'),
      endDate: new Date(rawEvent.end || '2024-01-01T11:00:00Z'),
      location: rawEvent.location ? { name: rawEvent.location } : undefined,
      organizer: rawEvent.organizer ? { name: rawEvent.organizer } : undefined,
      categories: rawEvent.categories || [],
      url: rawEvent.url,
      lastModified: new Date()
    };
  }

  getSupportedType(): CalendarSource['type'] {
    return this.type;
  }
}

describe('CalendarManager', () => {
  let calendarManager: CalendarManager;
  let mockEventCache: EventCache;
  let mockAdapter1: MockCalendarAdapter;
  let mockAdapter2: MockCalendarAdapter;

  const testSource1: CalendarSource = {
    id: 'source1',
    name: 'Test Source 1',
    type: 'ical',
    url: 'https://example.com/cal1.ics',
    enabled: true,
    status: 'active'
  };

  const testSource2: CalendarSource = {
    id: 'source2',
    name: 'Test Source 2',
    type: 'caldav',
    url: 'https://example.com/cal2',
    enabled: true,
    status: 'active'
  };

  const testDateRange: DateRange = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31')
  };

  beforeEach(() => {
    // Create mock event cache
    mockEventCache = new EventCache(':memory:', {
      memoryTtl: 3600,
      persistentTtl: 86400,
      maxMemoryEvents: 1000,
      cleanupInterval: 300
    });

    // Mock the cache methods
    vi.mocked(mockEventCache.getEvents).mockResolvedValue(null);
    vi.mocked(mockEventCache.setEvents).mockResolvedValue();
    vi.mocked(mockEventCache.invalidateSource).mockResolvedValue();

    // Create calendar manager
    calendarManager = new CalendarManager(mockEventCache, {
      maxConcurrentFetches: 2,
      fetchTimeout: 1000, // Shorter timeout for testing
      retryAttempts: 2,
      retryDelay: 100
    });

    // Create mock adapters
    mockAdapter1 = new MockCalendarAdapter('ical');
    mockAdapter2 = new MockCalendarAdapter('caldav');

    // Register adapters
    calendarManager.registerAdapter(mockAdapter1);
    calendarManager.registerAdapter(mockAdapter2);

    // Add sources
    calendarManager.addSource(testSource1);
    calendarManager.addSource(testSource2);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Source Management', () => {
    it('should add and retrieve sources', () => {
      const sources = calendarManager.getSources();
      expect(sources).toHaveLength(2);
      expect(sources.find(s => s.id === 'source1')).toBeDefined();
      expect(sources.find(s => s.id === 'source2')).toBeDefined();
    });

    it('should get specific source by ID', () => {
      const source = calendarManager.getSource('source1');
      expect(source).toEqual(testSource1);
    });

    it('should return undefined for non-existent source', () => {
      const source = calendarManager.getSource('nonexistent');
      expect(source).toBeUndefined();
    });

    it('should remove source and invalidate cache', async () => {
      calendarManager.removeSource('source1');
      
      const sources = calendarManager.getSources();
      expect(sources).toHaveLength(1);
      expect(sources.find(s => s.id === 'source1')).toBeUndefined();
      
      expect(mockEventCache.invalidateSource).toHaveBeenCalledWith('source1');
    });

    it('should update source and invalidate cache', () => {
      const updatedSource = { ...testSource1, name: 'Updated Name' };
      calendarManager.updateSource(updatedSource);
      
      const source = calendarManager.getSource('source1');
      expect(source?.name).toBe('Updated Name');
      expect(mockEventCache.invalidateSource).toHaveBeenCalledWith('source1');
    });
  });

  describe('Event Fetching', () => {
    it('should return cached events when available', async () => {
      const cachedEvents: NormalizedEvent[] = [
        {
          id: 'cached:1',
          sourceId: 'source1',
          title: 'Cached Event',
          startDate: new Date('2024-01-15T10:00:00Z'),
          endDate: new Date('2024-01-15T11:00:00Z'),
          categories: [],
          lastModified: new Date()
        }
      ];

      vi.mocked(mockEventCache.getEvents).mockResolvedValue(cachedEvents);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toEqual(cachedEvents);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(mockEventCache.getEvents).toHaveBeenCalled();
    });

    it('should fetch from sources when cache is empty', async () => {
      const mockEvents1 = [
        { id: '1', title: 'Event 1', start: '2024-01-15T10:00:00Z' }
      ];
      const mockEvents2 = [
        { id: '2', title: 'Event 2', start: '2024-01-16T14:00:00Z' }
      ];

      mockAdapter1.setEvents(mockEvents1);
      mockAdapter2.setEvents(mockEvents2);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(2);
      expect(result.results).toHaveLength(2);
      expect(result.results.every(r => r.success)).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockEventCache.setEvents).toHaveBeenCalled();
    });

    it('should handle source failures with error isolation', async () => {
      const mockEvents2 = [
        { id: '2', title: 'Event 2', start: '2024-01-16T14:00:00Z' }
      ];

      mockAdapter1.setFailure(true);
      mockAdapter2.setEvents(mockEvents2);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(false);
      expect(result.results[1].success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('source1');
    });

    it('should fetch from specific sources when sourceIds provided', async () => {
      const mockEvents1 = [
        { id: '1', title: 'Event 1', start: '2024-01-15T10:00:00Z' }
      ];

      mockAdapter1.setEvents(mockEvents1);

      const result = await calendarManager.fetchEvents(testDateRange, ['source1']);
      
      expect(result.events).toHaveLength(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].sourceId).toBe('source1');
    });

    it('should return empty result when no enabled sources', async () => {
      // Remove all sources
      calendarManager.removeSource('source1');
      calendarManager.removeSource('source2');

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(0);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No enabled calendar sources');
    });

    it('should handle fetch timeout', async () => {
      mockAdapter1.setDelay(2000); // Longer than timeout (1000ms)

      const result = await calendarManager.fetchEvents(testDateRange, ['source1']);
      
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('timeout');
    }, 5000); // 5 second test timeout

    it('should retry failed requests', async () => {
      let attemptCount = 0;
      const originalFetchEvents = mockAdapter1.fetchEvents.bind(mockAdapter1);
      
      vi.spyOn(mockAdapter1, 'fetchEvents').mockImplementation(async (source, dateRange) => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
        return originalFetchEvents(source, dateRange);
      });

      mockAdapter1.setEvents([{ id: '1', title: 'Event 1' }]);

      const result = await calendarManager.fetchEvents(testDateRange, ['source1']);
      
      expect(attemptCount).toBe(2);
      expect(result.results[0].success).toBe(true);
    });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate identical events from different sources', async () => {
      const identicalEvent = {
        id: 'same',
        title: 'Duplicate Event',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z',
        location: 'Same Location'
      };

      mockAdapter1.setEvents([identicalEvent]);
      mockAdapter2.setEvents([identicalEvent]);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].title).toBe('Duplicate Event');
    });

    it('should keep event with more recent lastModified date', async () => {
      const olderEvent = {
        id: 'same',
        title: 'Duplicate Event',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z'
      };

      const newerEvent = {
        id: 'same',
        title: 'Duplicate Event',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z'
      };

      // Mock normalizeEvent to return different lastModified dates
      const originalNormalize1 = mockAdapter1.normalizeEvent.bind(mockAdapter1);
      const originalNormalize2 = mockAdapter2.normalizeEvent.bind(mockAdapter2);

      vi.spyOn(mockAdapter1, 'normalizeEvent').mockImplementation((rawEvent, sourceId) => {
        const normalized = originalNormalize1(rawEvent, sourceId);
        normalized.lastModified = new Date('2024-01-01T00:00:00Z');
        return normalized;
      });

      vi.spyOn(mockAdapter2, 'normalizeEvent').mockImplementation((rawEvent, sourceId) => {
        const normalized = originalNormalize2(rawEvent, sourceId);
        normalized.lastModified = new Date('2024-01-02T00:00:00Z');
        return normalized;
      });

      mockAdapter1.setEvents([olderEvent]);
      mockAdapter2.setEvents([newerEvent]);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].sourceId).toBe('source2'); // Newer event
    });

    it('should not deduplicate events with different characteristics', async () => {
      const event1 = {
        id: '1',
        title: 'Event 1',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z'
      };

      const event2 = {
        id: '2',
        title: 'Event 2', // Different title
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z'
      };

      mockAdapter1.setEvents([event1]);
      mockAdapter2.setEvents([event2]);

      const result = await calendarManager.fetchEvents(testDateRange);
      
      expect(result.events).toHaveLength(2);
    });
  });

  describe('Source Health Monitoring', () => {
    it('should get health status for all sources', async () => {
      const healthStatuses = await calendarManager.getSourcesHealth();
      
      expect(healthStatuses).toHaveLength(2);
      expect(healthStatuses.every(h => h.isHealthy)).toBe(true);
      expect(healthStatuses.every(h => h.responseTime !== undefined)).toBe(true);
    });

    it('should get health status for specific source', async () => {
      const health = await calendarManager.getSourceHealth('source1');
      
      expect(health).toBeDefined();
      expect(health?.sourceId).toBe('source1');
      expect(health?.isHealthy).toBe(true);
    });

    it('should return null for non-existent source health', async () => {
      const health = await calendarManager.getSourceHealth('nonexistent');
      expect(health).toBeNull();
    });

    it('should report unhealthy status for failing sources', async () => {
      mockAdapter1.setFailure(true);

      const health = await calendarManager.getSourceHealth('source1');
      
      expect(health?.isHealthy).toBe(false);
      expect(health?.errorMessage).toBeDefined();
    });
  });

  describe('Source Validation', () => {
    it('should validate source successfully', async () => {
      const isValid = await calendarManager.validateSource(testSource1);
      expect(isValid).toBe(true);
    });

    it('should fail validation for invalid source', async () => {
      mockAdapter1.setFailure(true);
      
      const isValid = await calendarManager.validateSource(testSource1);
      expect(isValid).toBe(false);
    });

    it('should throw error for unsupported source type', async () => {
      const unsupportedSource: CalendarSource = {
        id: 'unsupported',
        name: 'Unsupported',
        type: 'outlook' as any,
        url: 'https://example.com',
        enabled: true,
        status: 'active'
      };

      await expect(calendarManager.validateSource(unsupportedSource))
        .rejects.toThrow('No adapter available for source type: outlook');
    });
  });

  describe('Source Refresh', () => {
    it('should refresh specific source and bypass cache', async () => {
      const mockEvents = [
        { id: '1', title: 'Fresh Event', start: '2024-01-15T10:00:00Z' }
      ];

      mockAdapter1.setEvents(mockEvents);

      const result = await calendarManager.refreshSource('source1', testDateRange);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].title).toBe('Fresh Event');
      expect(mockEventCache.invalidateSource).toHaveBeenCalledWith('source1');
      expect(mockEventCache.setEvents).toHaveBeenCalled();
    });

    it('should throw error for non-existent source refresh', async () => {
      await expect(calendarManager.refreshSource('nonexistent', testDateRange))
        .rejects.toThrow('Source not found: nonexistent');
    });
  });

  describe('Concurrent Fetch Limiting', () => {
    it('should limit concurrent fetches', async () => {
      // Add more sources than the concurrent limit
      const source3: CalendarSource = {
        id: 'source3',
        name: 'Test Source 3',
        type: 'ical',
        url: 'https://example.com/cal3.ics',
        enabled: true,
        status: 'active'
      };

      calendarManager.addSource(source3);

      let concurrentCount = 0;
      let maxConcurrent = 0;

      const originalFetch = mockAdapter1.fetchEvents.bind(mockAdapter1);
      vi.spyOn(mockAdapter1, 'fetchEvents').mockImplementation(async (source, dateRange) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        concurrentCount--;
        return originalFetch(source, dateRange);
      });

      mockAdapter1.setEvents([{ id: '1', title: 'Event' }]);

      await calendarManager.fetchEvents(testDateRange);
      
      expect(maxConcurrent).toBeLessThanOrEqual(2); // Our configured limit
    });
  });
});