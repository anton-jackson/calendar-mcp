import { CalendarAdapter } from '../interfaces/CalendarAdapter.js';
import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, RawEvent, RecurrenceRule } from '../types/calendar.js';
import { parseDateTime, isAllDayEvent } from '../utils/timezone.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ical = require('node-ical');

/**
 * Calendar adapter for iCal (.ics) feeds
 * Handles parsing of standard iCal format with support for recurring events
 */
export class ICalAdapter implements CalendarAdapter {
  private readonly httpTimeout = 30000; // 30 seconds
  private readonly maxRetries = 3;

  /**
   * Fetch events from an iCal source within the specified date range
   */
  async fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]> {
    try {
      const icalData = await this.fetchICalData(source.url);
      const parsedEvents = await this.parseICalData(icalData);
      
      // Filter events within date range and expand recurring events
      const filteredEvents = this.filterEventsByDateRange(parsedEvents, dateRange);
      const expandedEvents = this.expandRecurringEvents(filteredEvents, dateRange);
      
      return expandedEvents;
    } catch (error) {
      throw new Error(`Failed to fetch iCal events from ${source.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that an iCal source is accessible and contains valid data
   */
  async validateSource(source: CalendarSource): Promise<boolean> {
    try {
      const icalData = await this.fetchICalData(source.url);
      
      // Basic validation - check if we can parse the data
      const parsed = await this.parseICalData(icalData);
      const hasEvents = Object.keys(parsed).length > 0;
      
      if (!hasEvents) {
        throw new Error('Calendar contains no events');
      }
      
      return true;
    } catch (error) {
      console.warn(`iCal source validation failed for ${source.url}:`, error);
      throw error; // Re-throw for getSourceStatus to catch
    }
  }

  /**
   * Get the current status of an iCal source
   */
  async getSourceStatus(source: CalendarSource): Promise<SourceStatus> {
    const now = new Date();
    
    try {
      const isValid = await this.validateSource(source);
      return {
        isHealthy: isValid,
        lastCheck: now
      };
    } catch (error) {
      return {
        isHealthy: false,
        lastCheck: now,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Normalize a raw iCal event into the standard NormalizedEvent format
   */
  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    const event = rawEvent as any; // node-ical event object
    
    // Generate a unique ID combining source and event UID
    const id = `${sourceId}:${event.uid || Math.random().toString(36)}`;
    
    // Parse dates
    const startDate = this.parseEventDate(event.start);
    const endDate = this.parseEventDate(event.end || event.start);
    
    // Extract location information
    const location = event.location ? {
      name: event.location,
      address: event.location
    } : undefined;
    
    // Extract organizer information
    const organizer = event.organizer ? {
      name: event.organizer.params?.CN || event.organizer.val || 'Unknown',
      email: event.organizer.val?.replace('mailto:', '')
    } : undefined;
    
    // Extract categories
    const categories = event.categories ? 
      (Array.isArray(event.categories) ? event.categories : [event.categories]) : [];
    
    // Parse recurrence rule
    const recurrence = this.parseRecurrenceRule(event.rrule);
    
    return {
      id,
      sourceId,
      title: event.summary || 'Untitled Event',
      description: event.description,
      startDate,
      endDate,
      location,
      organizer,
      categories,
      recurrence,
      url: event.url,
      lastModified: event.lastmodified ? new Date(event.lastmodified) : new Date()
    };
  }

  /**
   * Get the supported calendar source type
   */
  getSupportedType(): CalendarSource['type'] {
    return 'ical';
  }

  /**
   * Normalize calendar URLs by converting webcal:// to https://
   */
  private normalizeCalendarUrl(url: string): string {
    // Convert webcal:// to https://
    if (url.startsWith('webcal://')) {
      return url.replace('webcal://', 'https://');
    }
    
    // Convert webcals:// to https:// (secure webcal)
    if (url.startsWith('webcals://')) {
      return url.replace('webcals://', 'https://');
    }
    
    return url;
  }

  /**
   * Fetch iCal data from a URL with proper error handling and timeouts
   */
  private async fetchICalData(url: string): Promise<string> {
    // Convert webcal:// URLs to https://
    const fetchUrl = this.normalizeCalendarUrl(url);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PublicCalendarMCP/1.0',
            'Accept': 'text/calendar, text/plain, */*'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response || !response.ok) {
          throw new Error(`HTTP ${response?.status || 'unknown'}: ${response?.statusText || 'Request failed'}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/calendar') && !contentType.includes('text/plain')) {
          console.warn(`Unexpected content type: ${contentType}`);
        }
        
        return await response.text();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown fetch error');
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    clearTimeout(timeoutId);
    throw lastError || new Error('Failed to fetch iCal data after retries');
  }

  /**
   * Parse iCal data using node-ical library
   */
  private async parseICalData(icalData: string): Promise<any> {
    try {
      return ical.parseICS(icalData);
    } catch (error) {
      throw new Error(`Failed to parse iCal data: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }

  /**
   * Filter events by date range
   */
  private filterEventsByDateRange(events: any, dateRange: DateRange): any[] {
    const filtered: any[] = [];
    
    for (const [key, event] of Object.entries(events)) {
      if (event && typeof event === 'object' && (event as any).type === 'VEVENT') {
        const eventStart = this.parseEventDate((event as any).start);
        const eventEnd = this.parseEventDate((event as any).end || (event as any).start);
        
        // Check if event overlaps with date range
        if (eventEnd >= dateRange.start && eventStart <= dateRange.end) {
          filtered.push(event);
        }
      }
    }
    
    return filtered;
  }

  /**
   * Expand recurring events within the date range
   */
  private expandRecurringEvents(events: any[], dateRange: DateRange): RawEvent[] {
    const expandedEvents: RawEvent[] = [];
    
    for (const event of events) {
      if (event.rrule) {
        // For recurring events, generate instances within the date range
        const instances = this.generateRecurringInstances(event, dateRange);
        expandedEvents.push(...instances);
      } else {
        // Non-recurring event
        expandedEvents.push(event);
      }
    }
    
    return expandedEvents;
  }

  /**
   * Generate instances of a recurring event within the date range
   */
  private generateRecurringInstances(event: any, dateRange: DateRange): RawEvent[] {
    const instances: RawEvent[] = [];
    const startDate = this.parseEventDate(event.start);
    const endDate = this.parseEventDate(event.end || event.start);
    const duration = endDate.getTime() - startDate.getTime();
    
    if (!event.rrule) {
      return [event];
    }
    
    const rrule = event.rrule;
    let currentDate = new Date(startDate);
    let instanceCount = 0;
    const maxInstances = 1000; // Safety limit
    
    while (currentDate <= dateRange.end && instanceCount < maxInstances) {
      if (currentDate >= dateRange.start) {
        // Create instance
        const instanceEnd = new Date(currentDate.getTime() + duration);
        const instance = {
          ...event,
          start: currentDate,
          end: instanceEnd,
          uid: `${event.uid}_${currentDate.getTime()}` // Unique ID for instance
        };
        instances.push(instance);
      }
      
      // Calculate next occurrence based on recurrence rule
      currentDate = this.getNextRecurrence(currentDate, rrule);
      instanceCount++;
      
      // Check if we've reached the until date or count limit
      if (rrule.until && currentDate > rrule.until) {
        break;
      }
      if (rrule.count && instanceCount >= rrule.count) {
        break;
      }
    }
    
    return instances;
  }

  /**
   * Calculate the next occurrence date based on recurrence rule
   */
  private getNextRecurrence(currentDate: Date, rrule: any): Date {
    const next = new Date(currentDate);
    const interval = rrule.interval || 1;
    
    switch (rrule.freq) {
      case 'DAILY':
        next.setDate(next.getDate() + interval);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + (7 * interval));
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + interval);
        break;
      default:
        // Default to daily if frequency is unknown
        next.setDate(next.getDate() + interval);
    }
    
    return next;
  }

  /**
   * Parse event date handling various formats
   */
  private parseEventDate(dateValue: any): Date {
    if (!dateValue) {
      return new Date();
    }
    
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    if (typeof dateValue === 'string') {
      return parseDateTime(dateValue);
    }
    
    // node-ical sometimes provides date objects with additional properties
    if (dateValue.toJSDate && typeof dateValue.toJSDate === 'function') {
      return dateValue.toJSDate();
    }
    
    // Fallback
    return new Date(dateValue);
  }

  /**
   * Parse recurrence rule from iCal RRULE
   */
  private parseRecurrenceRule(rrule: any): RecurrenceRule | undefined {
    if (!rrule) {
      return undefined;
    }
    
    const frequency = this.mapFrequency(rrule.freq);
    if (!frequency) {
      return undefined;
    }
    
    return {
      frequency,
      interval: rrule.interval || 1,
      until: rrule.until ? new Date(rrule.until) : undefined,
      count: rrule.count,
      byDay: rrule.byday ? (Array.isArray(rrule.byday) ? rrule.byday : [rrule.byday]) : undefined,
      byMonth: rrule.bymonth ? (Array.isArray(rrule.bymonth) ? rrule.bymonth : [rrule.bymonth]) : undefined
    };
  }

  /**
   * Map iCal frequency to our RecurrenceRule frequency
   */
  private mapFrequency(freq: string): RecurrenceRule['frequency'] | undefined {
    switch (freq?.toUpperCase()) {
      case 'DAILY':
        return 'daily';
      case 'WEEKLY':
        return 'weekly';
      case 'MONTHLY':
        return 'monthly';
      case 'YEARLY':
        return 'yearly';
      default:
        return undefined;
    }
  }
}