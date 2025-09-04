/**
 * MCP Tool Handlers - Implementation of tool logic
 */

import { 
  SearchEventsParams, 
  GetEventDetailsParams, 
  CheckAvailabilityParams,
  MCPResponse,
  EventDetailsResponse,
  AvailabilityResult,
  ConflictingEvent,
  TimeSlot
} from '../../types/mcp.js';
import { NormalizedEvent, RecurrenceRule } from '../../types/calendar.js';
import { CalendarManager } from '../../services/CalendarManager.js';

/**
 * Handler for search_events tool
 * Searches for events across all configured calendar sources
 */
export async function handleSearchEvents(
  params: SearchEventsParams,
  calendarManager?: CalendarManager
): Promise<MCPResponse> {
  try {
    console.error('Handling search_events with params:', params);
    
    // Validate input parameters
    if (!params.start_date || !params.end_date) {
      return {
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'Both start_date and end_date are required',
          details: { provided_params: params }
        }
      };
    }

    // Parse and validate dates
    let startDate: Date;
    let endDate: Date;
    
    try {
      startDate = new Date(params.start_date);
      endDate = new Date(params.end_date);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date format');
      }
      
      if (startDate >= endDate) {
        return {
          error: {
            code: 'INVALID_DATE_RANGE',
            message: 'Start date must be before end date',
            details: { start_date: params.start_date, end_date: params.end_date }
          }
        };
      }
    } catch (error) {
      return {
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'Invalid date format. Use YYYY-MM-DD format.',
          details: { 
            start_date: params.start_date, 
            end_date: params.end_date,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }

    // If no calendar manager provided, return placeholder response for testing
    if (!calendarManager) {
      return {
        content: {
          events: [],
          message: `Searching for events from ${params.start_date} to ${params.end_date} (test mode)`,
          total_count: 0,
          search_params: {
            start_date: params.start_date,
            end_date: params.end_date,
            location: params.location,
            keywords: params.keywords || [],
            categories: params.categories || [],
            search_logic: params.search_logic || 'AND'
          }
        }
      };
    }

    // Search for events using CalendarManager
    const dateRange = { start: startDate, end: endDate };
    const searchResults = await calendarManager.searchEvents(dateRange, {
      location: params.location,
      keywords: params.keywords,
      categories: params.categories,
      searchLogic: params.search_logic || 'AND'
    });

    // Convert events to serializable format
    const serializedEvents = searchResults.events.map(event => convertEventToSerializable(event));

    // Apply additional filtering if needed
    let filteredEvents = serializedEvents;
    
    // Filter by keywords if provided
    if (params.keywords && params.keywords.length > 0) {
      filteredEvents = filterEventsByKeywords(filteredEvents, params.keywords, params.search_logic || 'AND');
    }
    
    // Filter by categories if provided
    if (params.categories && params.categories.length > 0) {
      filteredEvents = filterEventsByCategories(filteredEvents, params.categories);
    }
    
    // Filter by location if provided
    if (params.location) {
      filteredEvents = filterEventsByLocation(filteredEvents, params.location);
    }

    const response = {
      content: {
        events: filteredEvents,
        message: `Found ${filteredEvents.length} events from ${params.start_date} to ${params.end_date}`,
        total_count: filteredEvents.length,
        search_params: {
          start_date: params.start_date,
          end_date: params.end_date,
          location: params.location,
          keywords: params.keywords || [],
          categories: params.categories || [],
          search_logic: params.search_logic || 'AND'
        },
        sources_searched: calendarManager.getSources().length
      }
    };
    
    console.error(`Search completed: found ${filteredEvents.length} events from ${calendarManager.getSources().length} sources`);
    return response;
    
  } catch (error) {
    console.error('Error in handleSearchEvents:', error);
    return {
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search events',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    };
  }
}

/**
 * Handler for get_event_details tool
 */
export async function handleGetEventDetails(
  params: GetEventDetailsParams,
  calendarManager?: CalendarManager
): Promise<MCPResponse<EventDetailsResponse>> {
  // Validate input parameters
  if (!params.event_id || typeof params.event_id !== 'string' || params.event_id.trim() === '') {
    return {
      error: {
        code: 'INVALID_EVENT_ID',
        message: 'Event ID is required and must be a non-empty string',
        details: { provided_event_id: params.event_id }
      }
    };
  }

  // If no calendar manager provided, return placeholder response for testing
  if (!calendarManager) {
    return {
      content: {
        event: null,
        message: `Looking for event with ID: ${params.event_id}`,
        found: false
      }
    };
  }

  try {
    const result = await calendarManager.getEventDetails(
      params.event_id.trim(),
      params.include_recurrence ?? true
    );

    if (!result.found || !result.event) {
      return {
        content: {
          event: null,
          found: false,
          message: result.error || `Event with ID '${params.event_id}' not found`
        }
      };
    }

    // Convert the event to a serializable format
    const eventData = convertEventToSerializable(result.event);

    // Generate recurrence information if requested and event is recurring
    let recurrenceInfo;
    const includeRecurrence = params.include_recurrence ?? true;
    if (includeRecurrence && result.event.recurrence) {
      recurrenceInfo = generateRecurrenceInfo(result.event);
    }

    return {
      content: {
        event: eventData,
        found: true,
        message: `Event details retrieved successfully`,
        recurrence_info: recurrenceInfo
      }
    };

  } catch (error) {
    return {
      error: {
        code: 'EVENT_RETRIEVAL_ERROR',
        message: 'Failed to retrieve event details',
        details: {
          event_id: params.event_id,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    };
  }
}

/**
 * Handler for check_availability tool
 */
export async function handleCheckAvailability(
  params: CheckAvailabilityParams,
  calendarManager?: CalendarManager
): Promise<MCPResponse> {
  // Validate input parameters
  if (!params.time_slots || params.time_slots.length === 0) {
    return {
      error: {
        code: 'INVALID_TIME_SLOTS',
        message: 'At least one time slot is required',
        details: { provided_time_slots: params.time_slots }
      }
    };
  }

  // Validate each time slot
  for (let i = 0; i < params.time_slots.length; i++) {
    const slot = params.time_slots[i];
    if (!slot.start || !slot.end) {
      return {
        error: {
          code: 'INVALID_TIME_SLOT',
          message: `Time slot ${i + 1} is missing start or end time`,
          details: { slot_index: i, slot }
        }
      };
    }

    try {
      const startDate = new Date(slot.start);
      const endDate = new Date(slot.end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return {
          error: {
            code: 'INVALID_DATE_FORMAT',
            message: `Time slot ${i + 1} has invalid date format`,
            details: { slot_index: i, slot }
          }
        };
      }

      if (startDate >= endDate) {
        return {
          error: {
            code: 'INVALID_TIME_RANGE',
            message: `Time slot ${i + 1} start time must be before end time`,
            details: { slot_index: i, slot }
          }
        };
      }
    } catch (error) {
      return {
        error: {
          code: 'DATE_PARSING_ERROR',
          message: `Failed to parse dates in time slot ${i + 1}`,
          details: { slot_index: i, slot, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      };
    }
  }

  // If no calendar manager provided, return placeholder response for testing
  if (!calendarManager) {
    const availability = params.time_slots.map(slot => ({
      start: slot.start,
      end: slot.end,
      available: true,
      conflicts: []
    }));

    return {
      content: {
        availability,
        message: `Checked ${params.time_slots.length} time slots (test mode)`,
        location: params.location
      }
    };
  }

  try {
    // Convert time slots to Date objects
    const timeSlots = params.time_slots.map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end)
    }));

    // Check availability using CalendarManager
    const availabilityResult = await calendarManager.checkAvailability(timeSlots);

    // Convert results to response format
    const availabilityResults: AvailabilityResult[] = availabilityResult.results.map(result => ({
      start: result.start.toISOString(),
      end: result.end.toISOString(),
      available: result.available,
      conflicts: result.conflicts.map(event => convertEventToConflict(event))
    }));

    return {
      content: {
        availability: availabilityResults,
        message: `Checked ${params.time_slots.length} time slots for availability`,
        location: params.location,
        total_conflicts: availabilityResults.reduce((sum, result) => sum + result.conflicts.length, 0)
      }
    };

  } catch (error) {
    return {
      error: {
        code: 'AVAILABILITY_CHECK_ERROR',
        message: 'Failed to check availability',
        details: {
          time_slots: params.time_slots,
          location: params.location,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    };
  }
}

/**
 * Convert a NormalizedEvent to a serializable format for MCP response
 */
function convertEventToSerializable(event: NormalizedEvent): any {
  return {
    id: event.id,
    source_id: event.sourceId,
    title: event.title,
    description: event.description,
    start_date: event.startDate.toISOString(),
    end_date: event.endDate.toISOString(),
    location: event.location ? {
      name: event.location.name,
      address: event.location.address,
      coordinates: event.location.coordinates
    } : null,
    organizer: event.organizer ? {
      name: event.organizer.name,
      email: event.organizer.email
    } : null,
    categories: event.categories,
    url: event.url,
    last_modified: event.lastModified.toISOString(),
    is_recurring: !!event.recurrence
  };
}

/**
 * Generate recurrence information for a recurring event
 */
function generateRecurrenceInfo(event: NormalizedEvent): any {
  if (!event.recurrence) {
    return {
      is_recurring: false
    };
  }

  const recurrence = event.recurrence;
  const nextInstances = generateNextInstances(event, 5); // Generate next 5 instances

  return {
    is_recurring: true,
    recurrence_rule: formatRecurrenceRule(recurrence),
    next_instances: nextInstances.map(instance => ({
      start: instance.start.toISOString(),
      end: instance.end.toISOString(),
      instance_id: `${event.id}_${instance.start.getTime()}`
    }))
  };
}

/**
 * Generate upcoming instances of a recurring event
 */
function generateNextInstances(event: NormalizedEvent, maxInstances: number = 5): Array<{
  start: Date;
  end: Date;
}> {
  if (!event.recurrence) {
    return [];
  }

  const instances: Array<{ start: Date; end: Date }> = [];
  const recurrence = event.recurrence;
  const eventDuration = event.endDate.getTime() - event.startDate.getTime();
  
  let currentDate = new Date(event.startDate);
  const now = new Date();
  const maxDate = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year from now
  
  // Skip past instances
  while (currentDate < now && instances.length < maxInstances) {
    const nextDate = getNextOccurrence(currentDate, recurrence);
    if (!nextDate) break;
    currentDate = nextDate;
  }

  // Generate future instances
  while (instances.length < maxInstances && currentDate && currentDate <= maxDate) {
    // Check if we've reached the until date or count limit
    if (recurrence.until && currentDate > recurrence.until) {
      break;
    }
    if (recurrence.count && instances.length >= recurrence.count) {
      break;
    }

    instances.push({
      start: new Date(currentDate),
      end: new Date(currentDate.getTime() + eventDuration)
    });

    const nextDate = getNextOccurrence(currentDate, recurrence);
    if (!nextDate) break;
    currentDate = nextDate;
  }

  return instances;
}

/**
 * Get the next occurrence of a recurring event
 */
function getNextOccurrence(currentDate: Date, recurrence: RecurrenceRule): Date | null {
  const interval = recurrence.interval || 1;
  const nextDate = new Date(currentDate);

  switch (recurrence.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + (7 * interval));
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    default:
      return null;
  }

  return nextDate;
}

/**
 * Format recurrence rule as a human-readable string
 */
function formatRecurrenceRule(recurrence: RecurrenceRule): string {
  const interval = recurrence.interval || 1;
  const frequency = recurrence.frequency;
  
  let rule = '';
  
  if (interval === 1) {
    rule = frequency.charAt(0).toUpperCase() + frequency.slice(1);
  } else {
    rule = `Every ${interval} ${frequency === 'daily' ? 'days' : 
                                frequency === 'weekly' ? 'weeks' :
                                frequency === 'monthly' ? 'months' : 'years'}`;
  }

  if (recurrence.until) {
    rule += ` until ${recurrence.until.toDateString()}`;
  } else if (recurrence.count) {
    rule += ` for ${recurrence.count} occurrences`;
  }

  if (recurrence.byDay && recurrence.byDay.length > 0) {
    rule += ` on ${recurrence.byDay.join(', ')}`;
  }

  return rule;
}



/**
 * Convert a NormalizedEvent to a ConflictingEvent for the response
 */
function convertEventToConflict(event: NormalizedEvent): ConflictingEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.startDate.toISOString(),
    end: event.endDate.toISOString(),
    location: event.location ? {
      name: event.location.name,
      address: event.location.address
    } : undefined,
    source_id: event.sourceId
  };
}

/**
 * Filter events by keywords using AND/OR logic
 */
function filterEventsByKeywords(events: any[], keywords: string[], searchLogic: 'AND' | 'OR'): any[] {
  if (!keywords || keywords.length === 0) {
    return events;
  }

  const normalizedKeywords = keywords.map(k => k.toLowerCase().trim());
  
  return events.filter(event => {
    const searchText = [
      event.title || '',
      event.description || '',
      ...(event.categories || [])
    ].join(' ').toLowerCase();

    if (searchLogic === 'AND') {
      // All keywords must be found
      return normalizedKeywords.every(keyword => searchText.includes(keyword));
    } else {
      // At least one keyword must be found
      return normalizedKeywords.some(keyword => searchText.includes(keyword));
    }
  });
}

/**
 * Filter events by categories
 */
function filterEventsByCategories(events: any[], categories: string[]): any[] {
  if (!categories || categories.length === 0) {
    return events;
  }

  const normalizedCategories = categories.map(c => c.toLowerCase().trim());
  
  return events.filter(event => {
    if (!event.categories || event.categories.length === 0) {
      return false;
    }
    
    const eventCategories = event.categories.map((c: string) => c.toLowerCase().trim());
    return normalizedCategories.some(category => 
      eventCategories.some((eventCategory: string) => eventCategory.includes(category))
    );
  });
}

/**
 * Filter events by location
 */
function filterEventsByLocation(events: any[], location: string): any[] {
  if (!location) {
    return events;
  }

  const normalizedLocation = location.toLowerCase().trim();
  
  return events.filter(event => {
    if (!event.location) {
      return false;
    }
    
    const eventLocation = [
      event.location.name || '',
      event.location.address || ''
    ].join(' ').toLowerCase();
    
    return eventLocation.includes(normalizedLocation);
  });
}