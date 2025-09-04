#!/usr/bin/env node

/**
 * Test the search functionality with real calendar data
 */

import { CalendarManager } from './dist/services/CalendarManager.js';
import { EventCache } from './dist/services/EventCache.js';
import { handleSearchEvents } from './dist/server/tools/ToolHandlers.js';

async function testSearch() {
  console.log('Testing search functionality...');
  
  // Create a temporary cache
  const eventCache = new EventCache(':memory:', {
    memoryTtl: 3600,
    persistentTtl: 86400,
    maxMemoryEvents: 1000,
    cleanupInterval: 300
  });
  
  // Create calendar manager
  const calendarManager = new CalendarManager(eventCache);
  
  // Add a test calendar source (using one from your config)
  calendarManager.addSource({
    id: 'test-soccer',
    name: 'Test Soccer Calendar',
    type: 'ical',
    url: 'https://calendar.google.com/calendar/ical/c_4b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b%40group.calendar.google.com/public/basic.ics',
    enabled: true,
    refreshInterval: 3600
  });
  
  // Test search for events in the next month
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const searchParams = {
    start_date: today.toISOString().split('T')[0],
    end_date: nextMonth.toISOString().split('T')[0]
  };
  
  console.log('Search params:', searchParams);
  
  try {
    const result = await handleSearchEvents(searchParams, calendarManager);
    console.log('Search result:', JSON.stringify(result, null, 2));
    
    if (result.content && result.content.events) {
      console.log(`Found ${result.content.events.length} events`);
      result.content.events.forEach((event, index) => {
        console.log(`${index + 1}. ${event.title} - ${event.start_date}`);
      });
    }
  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    await eventCache.close();
  }
}

testSearch().catch(console.error);