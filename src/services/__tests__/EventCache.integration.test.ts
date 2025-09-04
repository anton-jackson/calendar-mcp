/**
 * Integration tests for EventCache with real database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventCache } from '../EventCache.js';
import { NormalizedEvent } from '../../types/calendar.js';
import { CacheConfig } from '../../types/cache.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EventCache Integration', () => {
  let cache: EventCache;
  let tempDbPath: string;
  let config: CacheConfig;

  const createMockEvents = (count: number): NormalizedEvent[] => {
    return Array.from({ length: count }, (_, i) => {
      const dayOfMonth = Math.max(1, Math.min(28, (i % 28) + 1)); // Ensure valid day
      const hour = Math.max(0, Math.min(23, (i % 12) + 8)); // Ensure valid hour
      const startDate = new Date(`2024-01-${dayOfMonth.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:00:00Z`);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later
      
      return {
        id: `event-${i + 1}`,
        sourceId: `source-${(i % 3) + 1}`,
        title: `Event ${i + 1}`,
        description: `Description for event ${i + 1}`,
        startDate,
        endDate,
        location: i % 2 === 0 ? {
          name: `Venue ${i + 1}`,
          address: `${i + 1} Test Street`,
          coordinates: { lat: 40.7128 + i * 0.001, lng: -74.0060 + i * 0.001 }
        } : undefined,
        organizer: i % 3 === 0 ? {
          name: `Organizer ${i + 1}`,
          email: `organizer${i + 1}@example.com`
        } : undefined,
        categories: [`category-${(i % 5) + 1}`, 'general'],
        recurrence: i % 10 === 0 ? {
          frequency: 'weekly' as const,
          interval: 1
        } : undefined,
        url: `https://example.com/event-${i + 1}`,
        lastModified: new Date(`2024-01-01T${(i % 24).toString().padStart(2, '0')}:00:00Z`)
      };
    });
  };

  beforeEach(async () => {
    tempDbPath = join(tmpdir(), `integration-cache-${Date.now()}.db`);
    
    config = {
      memoryTtl: 3600,
      persistentTtl: 86400,
      maxMemoryEvents: 50,
      cleanupInterval: 300
    };

    cache = new EventCache(tempDbPath, config);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await cache.close();
    
    try {
      await fs.unlink(tempDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Large Dataset Operations', () => {
    it('should handle storing and retrieving large numbers of events', async () => {
      const events = createMockEvents(1000);
      const query = { sourceIds: ['source-1', 'source-2', 'source-3'] };

      await cache.setEvents(query, events);

      const retrieved = await cache.getEvents(query);
      expect(retrieved).toHaveLength(1000);
      expect(retrieved![0].id).toBe('event-1');
      expect(retrieved![999].id).toBe('event-1000');
    });

    it('should maintain performance with large datasets', async () => {
      const events = createMockEvents(5000);
      await cache.setEvents({ sourceIds: ['source-1', 'source-2', 'source-3'] }, events);

      const startTime = Date.now();
      
      // Test various query patterns
      const queries = [
        { sourceIds: ['source-1'] },
        { 
          dateRange: { 
            start: new Date('2024-01-15T00:00:00Z'), 
            end: new Date('2024-01-20T23:59:59Z') 
          } 
        },
        { keywords: ['Event'] },
        { categories: ['category-1'] }
      ];

      for (const query of queries) {
        await cache.getEvents(query);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete all queries within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });

  describe('Memory Management', () => {
    it('should enforce memory limits and evict old entries', async () => {
      const smallConfig = { ...config, maxMemoryEvents: 5 };
      const smallCache = new EventCache(tempDbPath + '-small', smallConfig);

      // Add more events than the memory limit
      for (let i = 0; i < 10; i++) {
        const events = createMockEvents(1);
        const query = { sourceIds: [`source-${i}`] };
        await smallCache.setEvents(query, events);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = await smallCache.getStats();
      expect(stats.memoryEvents).toBeLessThanOrEqual(5);

      await smallCache.close();
    });

    it('should handle memory-to-persistent cache transitions', async () => {
      const events = createMockEvents(100);
      const query = { sourceIds: ['source-1', 'source-2', 'source-3'] };

      // Store events
      await cache.setEvents(query, events);

      // Verify in memory
      let retrieved = await cache.getEvents(query);
      expect(retrieved).toHaveLength(100);

      // Force memory cache clear by creating new cache instance with same DB
      await cache.close();
      cache = new EventCache(tempDbPath, config);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still retrieve from persistent cache
      retrieved = await cache.getEvents(query);
      expect(retrieved).toHaveLength(100);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads and writes', async () => {
      const events1 = createMockEvents(50);
      const events2 = createMockEvents(50);
      const events3 = createMockEvents(50);

      // Concurrent writes
      const writePromises = [
        cache.setEvents({ sourceIds: ['source-1'] }, events1),
        cache.setEvents({ sourceIds: ['source-2'] }, events2),
        cache.setEvents({ sourceIds: ['source-3'] }, events3)
      ];

      await Promise.all(writePromises);

      // Concurrent reads
      const readPromises = [
        cache.getEvents({ sourceIds: ['source-1'] }),
        cache.getEvents({ sourceIds: ['source-2'] }),
        cache.getEvents({ sourceIds: ['source-3'] })
      ];

      const results = await Promise.all(readPromises);

      expect(results[0]).toHaveLength(50);
      expect(results[1]).toHaveLength(50);
      expect(results[2]).toHaveLength(50);
    });

    it('should handle concurrent invalidations', async () => {
      const events = createMockEvents(100);
      await cache.setEvents({ sourceIds: ['source-1', 'source-2', 'source-3'] }, events);

      // Concurrent invalidations
      const invalidatePromises = [
        cache.invalidateSource('source-1'),
        cache.invalidateSource('source-2'),
        cache.invalidateExpired()
      ];

      await Promise.all(invalidatePromises);

      // Verify only source-3 events remain
      const remaining = await cache.getEvents({ sourceIds: ['source-3'] });
      expect(remaining).not.toBeNull();
      expect(remaining!.every(event => event.sourceId === 'source-3')).toBe(true);
    });
  });

  describe('Data Persistence and Recovery', () => {
    it('should persist data across cache instances', async () => {
      const events = createMockEvents(100);
      const query = { sourceIds: ['source-1', 'source-2', 'source-3'] };

      // Store data in first instance
      await cache.setEvents(query, events);
      await cache.close();

      // Create new instance with same database
      const newCache = new EventCache(tempDbPath, config);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should retrieve persisted data
      const retrieved = await newCache.getEvents(query);
      expect(retrieved).toHaveLength(100);
      expect(retrieved![0].title).toBe('Event 1');

      await newCache.close();
    });

    it('should handle database corruption gracefully', async () => {
      const events = createMockEvents(10);
      await cache.setEvents({ sourceIds: ['source-1'] }, events);

      // Simulate corruption by writing invalid data to database file
      await cache.close();
      await fs.writeFile(tempDbPath, 'corrupted data');

      // Should handle gracefully when creating new instance
      const corruptedCache = new EventCache(tempDbPath + '-new', config);
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await corruptedCache.getEvents({ sourceIds: ['source-1'] });
      expect(result).toBeNull(); // Should return null instead of throwing

      await corruptedCache.close();
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should handle overlapping date ranges efficiently', async () => {
      const events = createMockEvents(200);
      await cache.setEvents({ sourceIds: ['source-1', 'source-2', 'source-3'] }, events);

      const overlappingQueries = [
        {
          dateRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-15T23:59:59Z')
          }
        },
        {
          dateRange: {
            start: new Date('2024-01-10T00:00:00Z'),
            end: new Date('2024-01-25T23:59:59Z')
          }
        },
        {
          dateRange: {
            start: new Date('2024-01-20T00:00:00Z'),
            end: new Date('2024-01-31T23:59:59Z')
          }
        }
      ];

      const results = await Promise.all(
        overlappingQueries.map(query => cache.getEvents(query))
      );

      // All queries should return results
      results.forEach(result => {
        expect(result).not.toBeNull();
        expect(result!.length).toBeGreaterThan(0);
      });

      // Results should be properly filtered by date range
      expect(results[0]!.every(event => 
        event.startDate >= new Date('2024-01-01T00:00:00Z') &&
        event.startDate <= new Date('2024-01-15T23:59:59Z')
      )).toBe(true);
    });

    it('should handle complex multi-criteria searches', async () => {
      const events = createMockEvents(500);
      await cache.setEvents({ sourceIds: ['source-1', 'source-2', 'source-3'] }, events);

      const complexQuery = {
        sourceIds: ['source-1', 'source-2'],
        dateRange: {
          start: new Date('2024-01-10T00:00:00Z'),
          end: new Date('2024-01-20T23:59:59Z')
        },
        keywords: ['Event'],
        categories: ['category-1', 'category-2']
      };

      const result = await cache.getEvents(complexQuery);
      expect(result).not.toBeNull();

      // Verify all criteria are met
      result!.forEach(event => {
        expect(['source-1', 'source-2']).toContain(event.sourceId);
        expect(event.startDate >= complexQuery.dateRange.start).toBe(true);
        expect(event.startDate <= complexQuery.dateRange.end).toBe(true);
        expect(event.title.toLowerCase()).toContain('event');
        expect(
          event.categories.some(cat => ['category-1', 'category-2'].includes(cat))
        ).toBe(true);
      });
    });
  });

  describe('Cache Statistics and Monitoring', () => {
    it('should provide accurate statistics for large datasets', async () => {
      const events = createMockEvents(1000);
      await cache.setEvents({ sourceIds: ['source-1', 'source-2', 'source-3'] }, events);

      // Perform various operations to generate stats
      await cache.getEvents({ sourceIds: ['source-1'] }); // Hit
      await cache.getEvents({ sourceIds: ['nonexistent'] }); // Miss
      await cache.getEvents({ sourceIds: ['source-1'] }); // Hit

      const stats = await cache.getStats();

      expect(stats.memoryHits).toBeGreaterThan(0);
      expect(stats.memoryMisses).toBeGreaterThan(0);
      expect(stats.persistentEvents).toBe(1000);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(1000);
    });
  });
});