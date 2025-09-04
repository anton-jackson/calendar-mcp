/**
 * Example usage of the EventCache system
 */

import { EventCache } from '../services/EventCache.js';
import { NormalizedEvent } from '../types/calendar.js';
import { CacheConfig } from '../types/cache.js';

async function exampleUsage() {
  // Configure cache settings
  const cacheConfig: CacheConfig = {
    memoryTtl: 3600, // 1 hour in memory
    persistentTtl: 86400, // 24 hours in database
    maxMemoryEvents: 1000, // Maximum events in memory
    cleanupInterval: 300 // Cleanup every 5 minutes
  };

  // Create cache instance
  const cache = new EventCache('./cache.db', cacheConfig);

  // Sample events
  const events: NormalizedEvent[] = [
    {
      id: 'event-1',
      sourceId: 'calendar-1',
      title: 'Team Meeting',
      description: 'Weekly team sync',
      startDate: new Date('2024-01-15T10:00:00Z'),
      endDate: new Date('2024-01-15T11:00:00Z'),
      categories: ['work', 'meeting'],
      lastModified: new Date()
    },
    {
      id: 'event-2',
      sourceId: 'calendar-1',
      title: 'Conference',
      description: 'Tech conference',
      startDate: new Date('2024-01-20T09:00:00Z'),
      endDate: new Date('2024-01-20T17:00:00Z'),
      location: {
        name: 'Convention Center',
        address: '123 Main St'
      },
      categories: ['conference', 'tech'],
      lastModified: new Date()
    }
  ];

  // Store events in cache
  await cache.setEvents({ sourceIds: ['calendar-1'] }, events);

  // Retrieve events by source
  const sourceEvents = await cache.getEvents({ sourceIds: ['calendar-1'] });
  console.log('Events from calendar-1:', sourceEvents?.length);

  // Search by date range
  const dateRangeEvents = await cache.getEvents({
    dateRange: {
      start: new Date('2024-01-15T00:00:00Z'),
      end: new Date('2024-01-15T23:59:59Z')
    }
  });
  console.log('Events on Jan 15:', dateRangeEvents?.length);

  // Search by keywords
  const keywordEvents = await cache.getEvents({
    keywords: ['meeting']
  });
  console.log('Meeting events:', keywordEvents?.length);

  // Search by categories
  const categoryEvents = await cache.getEvents({
    categories: ['work']
  });
  console.log('Work events:', categoryEvents?.length);

  // Complex query
  const complexEvents = await cache.getEvents({
    sourceIds: ['calendar-1'],
    dateRange: {
      start: new Date('2024-01-01T00:00:00Z'),
      end: new Date('2024-01-31T23:59:59Z')
    },
    keywords: ['team'],
    categories: ['work']
  });
  console.log('Complex query results:', complexEvents?.length);

  // Get cache statistics
  const stats = await cache.getStats();
  console.log('Cache stats:', {
    memoryHits: stats.memoryHits,
    memoryMisses: stats.memoryMisses,
    totalEvents: stats.totalEvents
  });

  // Invalidate specific source
  await cache.invalidateSource('calendar-1');

  // Clean up
  await cache.close();
}

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}

export { exampleUsage };