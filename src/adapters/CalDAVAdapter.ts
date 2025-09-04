import { CalendarAdapter } from '../interfaces/CalendarAdapter.js';
import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, RawEvent, RecurrenceRule } from '../types/calendar.js';
import { parseDateTime } from '../utils/timezone.js';
import * as ical from 'node-ical';

/**
 * Calendar adapter for CalDAV servers
 * Handles CalDAV protocol communication with authentication support
 * 
 * EXTERNAL SETUP REQUIRED:
 * - CalDAV server credentials (username/password)
 * - App-specific passwords recommended for security
 * - CalDAV server URL with proper authentication
 * 
 * See SETUP.md for detailed configuration instructions.
 */
export class CalDAVAdapter implements CalendarAdapter {
  private readonly httpTimeout = 30000; // 30 seconds
  private readonly maxRetries = 3;

  /**
   * Fetch events from a CalDAV source within the specified date range
   */
  async fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]> {
    try {
      // First, discover the calendar collection URL
      const calendarUrl = await this.discoverCalendarUrl(source);
      
      // Fetch calendar data using REPORT method with time-range filter
      const calendarData = await this.fetchCalendarData(source, calendarUrl, dateRange);
      
      // Parse the iCal data from CalDAV response
      const parsedEvents = await this.parseCalDAVResponse(calendarData);
      
      return parsedEvents;
    } catch (error) {
      throw new Error(`Failed to fetch CalDAV events from ${source.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that a CalDAV source is accessible and properly configured
   */
  async validateSource(source: CalendarSource): Promise<boolean> {
    try {
      // Test basic connectivity and authentication
      await this.discoverCalendarUrl(source);
      return true;
    } catch (error) {
      console.warn(`CalDAV source validation failed for ${source.url}:`, error);
      throw error;
    }
  }

  /**
   * Get the current status of a CalDAV source
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
   * Normalize a raw CalDAV event into the standard NormalizedEvent format
   */
  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    const event = rawEvent as any; // Parsed iCal event from CalDAV
    
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
    return 'caldav';
  }

  /**
   * Discover the calendar collection URL using CalDAV discovery
   */
  private async discoverCalendarUrl(source: CalendarSource): Promise<string> {
    // For basic implementation, assume the URL is the calendar collection
    // In a full implementation, this would do PROPFIND requests to discover collections
    const url = new URL(source.url);
    
    // Test basic connectivity with OPTIONS request
    const response = await this.makeCalDAVRequest(source, 'OPTIONS', url.toString());
    
    // Check if server supports CalDAV
    const davHeader = response.headers.get('DAV');
    if (!davHeader || !davHeader.includes('calendar-access')) {
      throw new Error('Server does not support CalDAV calendar-access');
    }
    
    return source.url;
  }

  /**
   * Fetch calendar data using CalDAV REPORT method with time-range filter
   */
  private async fetchCalendarData(source: CalendarSource, calendarUrl: string, dateRange: DateRange): Promise<string> {
    const reportBody = this.buildCalendarQuery(dateRange);
    
    const response = await this.makeCalDAVRequest(source, 'REPORT', calendarUrl, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Depth': '1'
    }, reportBody);
    
    return await response.text();
  }

  /**
   * Build CalDAV calendar-query XML for fetching events in date range
   */
  private buildCalendarQuery(dateRange: DateRange): string {
    const startISO = dateRange.start.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endISO = dateRange.end.toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    return `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startISO}" end="${endISO}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
  }

  /**
   * Make authenticated CalDAV HTTP request
   */
  private async makeCalDAVRequest(
    source: CalendarSource, 
    method: string, 
    url: string, 
    headers: Record<string, string> = {},
    body?: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const requestHeaders: Record<string, string> = {
          'User-Agent': 'PublicCalendarMCP/1.0',
          ...headers
        };
        
        // Add authentication if credentials are provided in URL
        const parsedUrl = new URL(url);
        if (parsedUrl.username && parsedUrl.password) {
          const credentials = btoa(`${parsedUrl.username}:${parsedUrl.password}`);
          requestHeaders['Authorization'] = `Basic ${credentials}`;
          
          // Remove credentials from URL for the actual request
          parsedUrl.username = '';
          parsedUrl.password = '';
          url = parsedUrl.toString();
        }
        
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response || !response.ok) {
          if (response?.status === 401) {
            throw new Error('Authentication failed - check username and password');
          }
          if (response?.status === 403) {
            throw new Error('Access forbidden - check permissions');
          }
          if (response?.status === 404) {
            throw new Error('Calendar not found - check URL');
          }
          throw new Error(`HTTP ${response?.status || 'unknown'}: ${response?.statusText || 'Request failed'}`);
        }
        
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown request error');
        
        if (attempt < this.maxRetries && 
            !lastError.message.includes('Authentication failed') &&
            !lastError.message.includes('Access forbidden') &&
            !lastError.message.includes('Calendar not found')) {
          // Exponential backoff, but don't retry auth failures or client errors
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
    
    clearTimeout(timeoutId);
    throw lastError || new Error('Failed to make CalDAV request after retries');
  }

  /**
   * Parse CalDAV XML response and extract iCal data
   */
  private async parseCalDAVResponse(xmlData: string): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    
    try {
      // Simple XML parsing to extract calendar-data elements
      // In a production implementation, you'd use a proper XML parser
      const calendarDataMatches = xmlData.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>/gi);
      
      if (!calendarDataMatches) {
        return events;
      }
      
      for (const match of calendarDataMatches) {
        // Extract the iCal content
        const icalContent = match
          .replace(/<C:calendar-data[^>]*>/, '')
          .replace(/<\/C:calendar-data>/, '')
          .trim();
        
        if (icalContent) {
          // Parse the iCal data
          const parsedEvents = ical.parseICS(icalContent);
          
          // Extract VEVENT objects
          for (const [key, event] of Object.entries(parsedEvents)) {
            if (event && typeof event === 'object' && (event as any).type === 'VEVENT') {
              events.push(event as RawEvent);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse CalDAV response: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
    
    return events;
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