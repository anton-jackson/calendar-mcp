import { CalendarAdapter } from '../interfaces/CalendarAdapter.js';
import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, RawEvent, RecurrenceRule } from '../types/calendar.js';
import { parseDateTime } from '../utils/timezone.js';
import { google, calendar_v3 } from 'googleapis';

/**
 * Calendar adapter for Google Calendar public feeds
 * Handles Google Calendar API v3 with proper API key management and rate limiting
 * 
 * EXTERNAL SETUP REQUIRED:
 * - Google Cloud project with Calendar API enabled
 * - API key with Calendar API access
 * - Set GOOGLE_CALENDAR_API_KEY environment variable
 * 
 * See SETUP.md for detailed configuration instructions.
 */
export class GoogleCalendarAdapter implements CalendarAdapter {
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second base delay for rate limiting
  private readonly maxDelay = 30000; // 30 seconds max delay
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly rateLimitWindow = 60000; // 1 minute window
  private readonly maxRequestsPerWindow = 100; // Google Calendar API limit

  /**
   * Fetch events from a Google Calendar public feed within the specified date range
   */
  async fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]> {
    try {
      await this.enforceRateLimit();
      
      const calendarId = this.extractCalendarId(source.url);
      const apiKey = this.getApiKey(source);
      
      const calendar = google.calendar({ version: 'v3', auth: apiKey });
      
      const response = await this.retryWithBackoff(async () => {
        return await calendar.events.list({
          calendarId,
          timeMin: dateRange.start.toISOString(),
          timeMax: dateRange.end.toISOString(),
          singleEvents: true, // Expand recurring events
          orderBy: 'startTime',
          maxResults: 2500 // Google Calendar API limit
        });
      });

      return response.data.items || [];
    } catch (error) {
      const formattedError = this.formatError(error);
      throw new Error(`Failed to fetch Google Calendar events from ${source.url}: ${formattedError}`);
    }
  }

  /**
   * Validate that a Google Calendar source is accessible and contains valid data
   */
  async validateSource(source: CalendarSource): Promise<boolean> {
    try {
      await this.enforceRateLimit();
      
      const calendarId = this.extractCalendarId(source.url);
      const apiKey = this.getApiKey(source);
      
      const calendar = google.calendar({ version: 'v3', auth: apiKey });
      
      // Test access by fetching calendar metadata
      await this.retryWithBackoff(async () => {
        return await calendar.calendars.get({
          calendarId
        });
      });
      
      return true;
    } catch (error) {
      console.warn(`Google Calendar source validation failed for ${source.url}:`, error);
      throw error;
    }
  }

  /**
   * Get the current status of a Google Calendar source
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
        errorMessage: this.formatError(error)
      };
    }
  }

  /**
   * Normalize a raw Google Calendar event into the standard NormalizedEvent format
   */
  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    const event = rawEvent as calendar_v3.Schema$Event;
    
    // Generate a unique ID combining source and event ID
    const id = `${sourceId}:${event.id || Math.random().toString(36)}`;
    
    // Parse dates - handle both date and dateTime formats
    const startDate = this.parseGoogleDate(event.start);
    const endDate = this.parseGoogleDate(event.end) || startDate;
    
    // Extract location information
    const location = event.location ? {
      name: event.location,
      address: event.location
    } : undefined;
    
    // Extract organizer information
    const organizer = event.organizer ? {
      name: event.organizer.displayName || event.organizer.email || 'Unknown',
      email: event.organizer.email
    } : undefined;
    
    // Extract categories from event type or custom properties
    const categories: string[] = [];
    if (event.eventType) {
      categories.push(event.eventType);
    }
    
    // Parse recurrence rule from Google's recurrence format
    const recurrence = this.parseGoogleRecurrence(event.recurrence || undefined);
    
    return {
      id,
      sourceId,
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startDate,
      endDate,
      location,
      organizer,
      categories,
      recurrence,
      url: event.htmlLink || undefined,
      lastModified: event.updated ? new Date(event.updated) : new Date()
    };
  }

  /**
   * Get the supported calendar source type
   */
  getSupportedType(): CalendarSource['type'] {
    return 'google';
  }

  /**
   * Extract calendar ID from Google Calendar URL
   */
  private extractCalendarId(url: string): string {
    // Handle various Google Calendar URL formats
    const patterns = [
      // Public calendar embed URL
      /calendar\/embed\?src=([^&]+)/,
      // Calendar ID directly
      /calendars\/([^\/]+)/,
      // Simple calendar ID format
      /([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
      // Group calendar format
      /([a-zA-Z0-9]+@group\.calendar\.google\.com)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    
    // If no pattern matches, assume the URL itself is the calendar ID
    return url;
  }

  /**
   * Get API key from calendar source configuration
   */
  private getApiKey(source: CalendarSource): string {
    // API key should be stored in the source configuration
    // This could be extended to support different storage methods
    const apiKey = process.env.GOOGLE_CALENDAR_API_KEY || 
                   (source as any).apiKey ||
                   (source as any).credentials?.apiKey;
    
    if (!apiKey) {
      throw new Error('Google Calendar API key is required. Set GOOGLE_CALENDAR_API_KEY environment variable or configure apiKey in source.');
    }
    
    return apiKey;
  }

  /**
   * Enforce rate limiting to comply with Google Calendar API limits
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.lastRequestTime > this.rateLimitWindow) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }
    
    // Check if we're approaching rate limit
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.rateLimitWindow - (now - this.lastRequestTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
      }
    }
    
    this.requestCount++;
  }

  /**
   * Retry API calls with exponential backoff
   */
  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          const delay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
          console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For non-rate-limit errors, don't retry certain types
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return error?.code === 429 || 
           error?.status === 429 ||
           (error?.message && error.message.toLowerCase().includes('rate limit')) ||
           (error?.message && error.message.toLowerCase().includes('quota exceeded'));
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    const code = error?.code || error?.status;
    return code === 400 || // Bad Request
           code === 401 || // Unauthorized
           code === 403 || // Forbidden
           code === 404;   // Not Found
  }

  /**
   * Parse Google Calendar date/time format
   */
  private parseGoogleDate(dateTime: calendar_v3.Schema$EventDateTime | undefined): Date {
    if (!dateTime) {
      return new Date();
    }
    
    // Google Calendar uses either 'date' for all-day events or 'dateTime' for timed events
    const dateString = dateTime.dateTime || dateTime.date;
    if (!dateString) {
      return new Date();
    }
    
    return parseDateTime(dateString);
  }

  /**
   * Parse Google Calendar recurrence rules
   */
  private parseGoogleRecurrence(recurrence: string[] | undefined): RecurrenceRule | undefined {
    if (!recurrence || recurrence.length === 0) {
      return undefined;
    }
    
    // Google Calendar uses RRULE format similar to iCal
    const rruleString = recurrence.find(rule => rule.startsWith('RRULE:'));
    if (!rruleString) {
      return undefined;
    }
    
    const rrule = this.parseRRULE(rruleString.substring(6)); // Remove 'RRULE:' prefix
    return rrule;
  }

  /**
   * Parse RRULE string into RecurrenceRule object
   */
  private parseRRULE(rruleString: string): RecurrenceRule | undefined {
    const parts = rruleString.split(';');
    const rule: any = {};
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        rule[key] = value;
      }
    }
    
    const frequency = this.mapGoogleFrequency(rule.FREQ);
    if (!frequency) {
      return undefined;
    }
    
    return {
      frequency,
      interval: rule.INTERVAL ? parseInt(rule.INTERVAL, 10) : 1,
      until: rule.UNTIL ? parseDateTime(rule.UNTIL) : undefined,
      count: rule.COUNT ? parseInt(rule.COUNT, 10) : undefined,
      byDay: rule.BYDAY ? rule.BYDAY.split(',') : undefined,
      byMonth: rule.BYMONTH ? rule.BYMONTH.split(',').map((m: string) => parseInt(m, 10)) : undefined
    };
  }

  /**
   * Map Google Calendar frequency to our RecurrenceRule frequency
   */
  private mapGoogleFrequency(freq: string): RecurrenceRule['frequency'] | undefined {
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

  /**
   * Format error messages for better user experience
   */
  private formatError(error: any): string {
    if (error?.code === 400) {
      return 'Invalid calendar ID or request parameters';
    }
    if (error?.code === 401) {
      return 'Invalid or missing API key';
    }
    if (error?.code === 403) {
      return 'Access denied - check API key permissions or calendar visibility';
    }
    if (error?.code === 404) {
      return 'Calendar not found or not publicly accessible';
    }
    if (error?.code === 429) {
      return 'Rate limit exceeded - too many requests';
    }
    
    return error instanceof Error ? error.message : 'Unknown error occurred';
  }
}