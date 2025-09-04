/**
 * Unit tests for EventCache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventCache } from '../EventCache.js';
import { NormalizedEvent } from '../../types/calendar.js';
import { CacheConfig } from '../../types/cache.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EventCache', () => {
  let cache: EventCache;
  let tempDbPath: string;
  let config: CacheConfig;

  const mockEvent: NormalizedEvent = {
    id: 'event-1',
    sourceId: 'source-1',
    title: 'Test Event',
    description: 'A test event',
    startDate: new Date('2024-01-15T10:00:00Z'),
    endDate: new Date('2024-01-15T11:00:00Z'),
    location: {
      name: 'Test Venue',
      address: '123 Test St',
      coordinates: { lat: 40.7128, lng: -74.0060 }
    },
    organizer: {
      name: 'Test Organizer',
      email: 'test@example.com'
    },
    categories: ['meeting', 'work'],
    url: 'https://example.com/event',
    lastModified: new Date('2024-01-01T00:00:00Z')
  };

  const mockEvent2: NormalizedEvent = {
    id: 'event-2',
    sourceId: 'source-2',
    title: 'Another Event',
    startDate: new Date('2024-01-16T14:00:00Z'),
    endDate: new Date('2024-01-16T15:00:00Z'),
    categories: ['social'],
    lastModified: new Date('2024-01-01T00:00:00Z')
  };

  beforeEach(async () => {
    // Create temporary database file
    tempDbPath = join(tmpdir(), `test-cache-${Date.now()}.db`);
    
    config = {
      memoryTtl: 3600, // 1 hour
      persistentTtl: 86400, // 24 hours
      maxMemoryEvents: 100,
      cleanupInterval: 300 // 5 minutes
    };

    cache = new EventCache(tempDbPath, config);
    
    // Wait a bit for database initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await cache.close();
    
    // Clean up temp file
    try {
      await fs.unlink(tempDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Memory Cache', () => {
    it('should store and retrieve events from memory cache', async () => {
      const query = { sourceIds: ['source-1'] };
      const events = [mockEvent];

      await cache.setEvents(query, events);
      const retrieved = await cache.getEvents(query);

      expect(retrieved).toEqual(events);
    });

    it('should return null for cache miss', async () => {
      const query = { sourceIds: ['nonexistent'] };
      const retrieved = await cache.getEvents(query);

      expect(retrieved).toBeNull();
    });

    it('should handle different cache keys for different queries', async () => {
      const query1 = { sourceIds: ['source-1'] };
      const query2 = { sourceIds: ['source-2'] };
      const events1 = [mockEvent];
      const events2 = [mockEvent2];

      await cache.setEvents(query1, events1);
      await cache.setEvents(query2, events2);

      const retrieved1 = await cache.getEvents(query1);
      const retrieved2 = await cache.getEvents(query2);

      expect(retrieved1).toEqual(events1);
      expect(retrieved2).toEqual(events2);
    });

    it('should respect memory TTL', async () => {
      const shortConfig = { ...config, memoryTtl: 1 }; // 1 second
      const shortCache = new EventCache(tempDbPath + '-short', shortConfig);

      const query = { sourceIds: ['source-1'] };
      const events = [mockEvent];

      await shortCache.setEvents(query, events);
      
      // Should be available immediately
      let retrieved = await shortCache.getEvents(query);
      expect(retrieved).toEqual(events);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Force cleanup to remove expired entries
      await shortCache.forceCleanup();

      // Should be expired from memory (but might still be in persistent cache)
      const stats = await shortCache.getStats();
      expect(stats.memoryEvents).toBe(0);

      await shortCache.close();
    });
  });

  describe('Persistent Cache', () => {
    it('should store and retrieve events from persistent cache', async () => {
      const query = { sourceIds: ['source-1'] };
      const events = [mockEvent];

      await cache.setEvents(query, events);
      
      // Clear memory cache to force persistent lookup
      await cache.invalidateExpired();
      
      const retrieved = await cache.getEvents(query);
      expect(retrieved).toEqual(events);
    });

    it('should handle complex event data in persistent cache', async () => {
      const complexEvent: NormalizedEvent = {
        ...mockEvent,
        recurrence: {
          frequency: 'weekly',
          interval: 2,
          until: new Date('2024-12-31T23:59:59Z'),
          byDay: ['MO', 'WE', 'FR']
        }
      };

      const query = { sourceIds: ['source-1'] };
      await cache.setEvents(query, [complexEvent]);

      const retrieved = await cache.getEvents(query);
      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].recurrence).toEqual(complexEvent.recurrence);
    });

    it('should filter by date range in persistent cache', async () => {
      const events = [mockEvent, mockEvent2];
      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      // Query for events only in January 15th range
      const query = {
        dateRange: {
          start: new Date('2024-01-15T00:00:00Z'),
          end: new Date('2024-01-15T23:59:59Z')
        }
      };

      const retrieved = await cache.getEvents(query);
      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].id).toBe('event-1');
    });

    it('should filter by source IDs in persistent cache', async () => {
      const events = [mockEvent, mockEvent2];
      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      const query = { sourceIds: ['source-1'] };
      const retrieved = await cache.getEvents(query);

      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].sourceId).toBe('source-1');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate events by source ID', async () => {
      const events = [mockEvent, mockEvent2];
      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      await cache.invalidateSource('source-1');

      const query1 = { sourceIds: ['source-1'] };
      const query2 = { sourceIds: ['source-2'] };

      const retrieved1 = await cache.getEvents(query1);
      const retrieved2 = await cache.getEvents(query2);

      expect(retrieved1).toBeNull();
      expect(retrieved2).toHaveLength(1);
      expect(retrieved2![0].sourceId).toBe('source-2');
    });

    it('should invalidate expired events', async () => {
      const expiredConfig = { ...config, persistentTtl: 1, memoryTtl: 1 }; // 1 second for both
      const expiredCache = new EventCache(tempDbPath + '-expired', expiredConfig);

      const query = { sourceIds: ['source-1'] };
      const events = [mockEvent];

      await expiredCache.setEvents(query, events);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expiredCache.forceCleanup();

      const retrieved = await expiredCache.getEvents(query);
      expect(retrieved).toBeNull();

      await expiredCache.close();
    });
  });

  describe('Search Filtering', () => {
    it('should filter by keywords', async () => {
      const events = [
        { ...mockEvent, title: 'Team Meeting', description: 'Weekly sync' },
        { ...mockEvent2, title: 'Birthday Party', description: 'Celebration time' }
      ];

      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      const query = { keywords: ['meeting'] };
      const retrieved = await cache.getEvents(query);

      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].title).toBe('Team Meeting');
    });

    it('should filter by categories', async () => {
      const events = [
        { ...mockEvent, categories: ['work', 'meeting'] },
        { ...mockEvent2, categories: ['social', 'party'] }
      ];

      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      const query = { categories: ['work'] };
      const retrieved = await cache.getEvents(query);

      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].categories).toContain('work');
    });

    it('should handle complex queries with multiple filters', async () => {
      const events = [
        { 
          ...mockEvent, 
          title: 'Work Meeting',
          categories: ['work', 'meeting'],
          startDate: new Date('2024-01-15T10:00:00Z')
        },
        { 
          ...mockEvent2, 
          title: 'Social Gathering',
          categories: ['social'],
          startDate: new Date('2024-01-16T14:00:00Z')
        }
      ];

      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      const query = {
        sourceIds: ['source-1'],
        dateRange: {
          start: new Date('2024-01-15T00:00:00Z'),
          end: new Date('2024-01-15T23:59:59Z')
        },
        keywords: ['meeting'],
        categories: ['work']
      };

      const retrieved = await cache.getEvents(query);

      expect(retrieved).toHaveLength(1);
      expect(retrieved![0].title).toBe('Work Meeting');
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache statistics', async () => {
      const query = { sourceIds: ['source-1'] };
      const events = [mockEvent];

      // Initial stats
      let stats = await cache.getStats();
      expect(stats.memoryHits).toBe(0);
      expect(stats.memoryMisses).toBe(0);

      // Cache miss
      await cache.getEvents(query);
      stats = await cache.getStats();
      expect(stats.memoryMisses).toBe(1);

      // Cache set and hit
      await cache.setEvents(query, events);
      await cache.getEvents(query);
      stats = await cache.getStats();
      expect(stats.memoryHits).toBe(1);
    });

    it('should count events correctly', async () => {
      const events = [mockEvent, mockEvent2];
      await cache.setEvents({ sourceIds: ['source-1', 'source-2'] }, events);

      const stats = await cache.getStats();
      expect(stats.memoryEvents).toBeGreaterThan(0);
      expect(stats.persistentEvents).toBe(2);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for identical queries', async () => {
      const query1 = { 
        sourceIds: ['source-1', 'source-2'],
        keywords: ['test', 'event'],
        categories: ['work']
      };
      const query2 = { 
        sourceIds: ['source-2', 'source-1'], // Different order
        keywords: ['event', 'test'], // Different order
        categories: ['work']
      };

      const events = [mockEvent];
      await cache.setEvents(query1, events);

      // Should hit cache with reordered query
      const retrieved = await cache.getEvents(query2);
      expect(retrieved).toEqual(events);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      await cache.close();

      const query = { sourceIds: ['source-1'] };
      const retrieved = await cache.getEvents(query);

      // Should return null instead of throwing
      expect(retrieved).toBeNull();
    });
  });
});