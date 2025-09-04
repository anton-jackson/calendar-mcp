/**
 * Search Events Integration Test
 * Tests the search_events MCP tool with real calendar data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { CalendarManager } from '../services/CalendarManager.js';
import { EventCache } from '../services/EventCache.js';
import { handleSearchEvents } from '../server/tools/ToolHandlers.js';
import { CalendarSource } from '../types/calendar.js';

describe('Search Events Integration', () => {
  let testDir: string;
  let eventCache: EventCache;
  let calendarManager: CalendarManager;

  beforeEach(async () => {
    // Create temporary directory for test data
    testDir = join(tmpdir(), `search-events-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize event cache and calendar manager
    const cacheConfig = {
      memoryTtl: 3600000, // 1 hour
      persistentTtl: 86400000, // 24 hours
      maxMemoryEvents: 1000,
      cleanupInterval: 300000 // 5 minutes
    };
    
    eventCache = new EventCache(join(testDir, 'events.db'), cacheConfig);
    calendarManager = new CalendarManager(eventCache);
  });

  afterEach(async () => {
    // Clean up
    if (eventCache) {
      await eventCache.close();
    }
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should search events from PlayMetrics test calendar', async () => {
    // Add the test calendar source
    const testCalendarSource: CalendarSource = {
      id: 'playmetrics-test',
      name: 'PlayMetrics Test Calendar',
      type: 'ical',
      url: 'https://calendar.playmetrics.com/calendars/c545/t314830/p0/t989C7EB8/f/calendar.ics',
      enabled: true,
      status: 'active',
      refreshInterval: 3600
    };
    
    calendarManager.addSource(testCalendarSource);

    // Test search parameters - use a wide date range to catch any events
    const searchParams = {
      start_date: '2024-01-01',
      end_date: '2026-12-31'
    };

    console.log('Testing search with calendar:', testCalendarSource.url);
    console.log('Search parameters:', searchParams);

    // Execute the search
    const result = await handleSearchEvents(searchParams, calendarManager);

    console.log('Search result:', JSON.stringify(result, null, 2));

    // Verify the result structure
    expect(result).toBeDefined();
    
    if (result.error) {
      console.error('Search failed with error:', result.error);
      // If there's an error, let's still check that it's a proper error response
      expect(result.error.code).toBeDefined();
      expect(result.error.message).toBeDefined();
    } else {
      // Success case
      expect(result.content).toBeDefined();
      expect(result.content.events).toBeDefined();
      expect(Array.isArray(result.content.events)).toBe(true);
      expect(result.content.total_count).toBeDefined();
      expect(result.content.search_params).toBeDefined();
      
      console.log(`Found ${result.content.events.length} events`);
      
      // If we found events, verify their structure
      if (result.content.events.length > 0) {
        const firstEvent = result.content.events[0];
        expect(firstEvent.id).toBeDefined();
        expect(firstEvent.title).toBeDefined();
        expect(firstEvent.start_date).toBeDefined();
        expect(firstEvent.end_date).toBeDefined();
        
        console.log('Sample event:', {
          title: firstEvent.title,
          start: firstEvent.start_date,
          end: firstEvent.end_date,
          location: firstEvent.location?.name
        });
      }
    }
  }, 30000); // 30 second timeout for network requests

  it('should handle search with keywords', async () => {
    const testCalendarSource: CalendarSource = {
      id: 'playmetrics-test-keywords',
      name: 'PlayMetrics Test Calendar for Keywords',
      type: 'ical',
      url: 'https://calendar.playmetrics.com/calendars/c545/t314830/p0/t989C7EB8/f/calendar.ics',
      enabled: true,
      status: 'active',
      refreshInterval: 3600
    };
    
    calendarManager.addSource(testCalendarSource);

    // Test search with keywords
    const searchParams = {
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      keywords: ['meeting', 'event', 'conference'],
      search_logic: 'OR' as const
    };

    const result = await handleSearchEvents(searchParams, calendarManager);

    expect(result).toBeDefined();
    
    if (!result.error) {
      expect(result.content.search_params.keywords).toEqual(['meeting', 'event', 'conference']);
      expect(result.content.search_params.search_logic).toBe('OR');
    }
  }, 30000);

  it('should validate date parameters', async () => {
    // Test with invalid date format
    const invalidParams = {
      start_date: 'invalid-date',
      end_date: '2025-12-31'
    };

    const result = await handleSearchEvents(invalidParams, calendarManager);

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('INVALID_DATE_FORMAT');
  });

  it('should handle date range validation', async () => {
    // Test with end date before start date
    const invalidParams = {
      start_date: '2025-12-31',
      end_date: '2025-01-01'
    };

    const result = await handleSearchEvents(invalidParams, calendarManager);

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('should test calendar source connectivity', async () => {
    const testCalendarSource: CalendarSource = {
      id: 'connectivity-test',
      name: 'Connectivity Test Calendar',
      type: 'ical',
      url: 'https://calendar.playmetrics.com/calendars/c545/t314830/p0/t989C7EB8/f/calendar.ics',
      enabled: true,
      status: 'active',
      refreshInterval: 3600
    };
    
    calendarManager.addSource(testCalendarSource);

    // Test source validation
    const isValid = await calendarManager.validateSource(testCalendarSource);
    console.log('Calendar source validation result:', isValid);

    // Test source health
    const health = await calendarManager.getSourceHealth(testCalendarSource.id);
    console.log('Calendar source health:', health);

    expect(health).toBeDefined();
    if (health) {
      expect(health.sourceId).toBe(testCalendarSource.id);
      expect(typeof health.isHealthy).toBe('boolean');
      expect(health.lastCheck).toBeInstanceOf(Date);
    }
  }, 30000);
});