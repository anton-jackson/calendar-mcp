/**
 * Calendar Manager - Orchestrates multiple calendar sources
 * Handles parallel fetching, error isolation, and event deduplication
 */

import { CalendarAdapter } from '../interfaces/CalendarAdapter.js';
import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, CalendarSourceStatus } from '../types/calendar.js';
import { CacheQuery } from '../types/cache.js';
import { EventCache } from './EventCache.js';
import { ICalAdapter } from '../adapters/ICalAdapter.js';
import { CalDAVAdapter } from '../adapters/CalDAVAdapter.js';
import { GoogleCalendarAdapter } from '../adapters/GoogleCalendarAdapter.js';

export interface CalendarManagerConfig {
  maxConcurrentFetches: number;
  fetchTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface FetchResult {
  sourceId: string;
  events: NormalizedEvent[];
  success: boolean;
  error?: string;
  fetchTime: number;
}

export interface SourceHealth {
  sourceId: string;
  isHealthy: boolean;
  lastCheck: Date;
  errorMessage?: string;
  responseTime?: number;
}

export class CalendarManager {
  private adapters: Map<CalendarSource['type'], CalendarAdapter> = new Map();
  private sources: Map<string, CalendarSource> = new Map();
  private eventCache: EventCache;
  private config: CalendarManagerConfig;

  constructor(eventCache: EventCache, config?: Partial<CalendarManagerConfig>) {
    this.eventCache = eventCache;
    this.config = {
      maxConcurrentFetches: 5,
      fetchTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    // Register default adapters
    this.registerAdapter(new ICalAdapter());
    this.registerAdapter(new CalDAVAdapter());
    this.registerAdapter(new GoogleCalendarAdapter());
  }

  /**
   * Register a calendar adapter for a specific source type
   */
  registerAdapter(adapter: CalendarAdapter): void {
    this.adapters.set(adapter.getSupportedType(), adapter);
  }

  /**
   * Add a calendar source to be managed
   */
  addSource(source: CalendarSource): void {
    this.sources.set(source.id, source);
  }

  /**
   * Remove a calendar source
   */
  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
    // Invalidate cache for this source
    this.eventCache.invalidateSource(sourceId);
  }

  /**
   * Update an existing calendar source
   */
  updateSource(source: CalendarSource): void {
    if (this.sources.has(source.id)) {
      this.sources.set(source.id, source);
      // Invalidate cache to force refresh
      this.eventCache.invalidateSource(source.id);
    }
  }

  /**
   * Get all configured sources
   */
  getSources(): CalendarSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get a specific source by ID
   */
  getSource(sourceId: string): CalendarSource | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Fetch events from all enabled sources within the specified date range
   */
  async fetchEvents(dateRange: DateRange, sourceIds?: string[]): Promise<{
    events: NormalizedEvent[];
    results: FetchResult[];
    errors: string[];
  }> {
    // Determine which sources to fetch from
    const targetSources = this.getTargetSources(sourceIds);
    
    if (targetSources.length === 0) {
      return {
        events: [],
        results: [],
        errors: ['No enabled calendar sources available']
      };
    }

    // Check cache first
    const cacheQuery: CacheQuery = {
      sourceIds: targetSources.map(s => s.id),
      dateRange
    };
    
    const cachedEvents = await this.eventCache.getEvents(cacheQuery);
    if (cachedEvents) {
      return {
        events: cachedEvents,
        results: targetSources.map(source => ({
          sourceId: source.id,
          events: cachedEvents.filter(e => e.sourceId === source.id),
          success: true,
          fetchTime: 0 // From cache
        })),
        errors: []
      };
    }

    // Fetch from sources in parallel with error isolation
    const fetchResults = await this.fetchFromSourcesParallel(targetSources, dateRange);
    
    // Collect all events and errors
    const allEvents: NormalizedEvent[] = [];
    const errors: string[] = [];
    
    for (const result of fetchResults) {
      if (result.success) {
        allEvents.push(...result.events);
      } else if (result.error) {
        errors.push(`${result.sourceId}: ${result.error}`);
      }
    }

    // Deduplicate events
    const deduplicatedEvents = this.deduplicateEvents(allEvents);

    // Cache the results if we have any successful fetches
    if (deduplicatedEvents.length > 0) {
      await this.eventCache.setEvents(cacheQuery, deduplicatedEvents);
    }

    return {
      events: deduplicatedEvents,
      results: fetchResults,
      errors
    };
  }

  /**
   * Get health status for all sources
   */
  async getSourcesHealth(): Promise<SourceHealth[]> {
    const targetSources = Array.from(this.sources.values());
    const healthChecks = targetSources.map(source => this.checkSourceHealth(source));
    
    return Promise.all(healthChecks);
  }

  /**
   * Get health status for a specific source
   */
  async getSourceHealth(sourceId: string): Promise<SourceHealth | null> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return null;
    }
    
    return this.checkSourceHealth(source);
  }

  /**
   * Validate a calendar source configuration
   */
  async validateSource(source: CalendarSource): Promise<boolean> {
    const adapter = this.adapters.get(source.type);
    if (!adapter) {
      throw new Error(`No adapter available for source type: ${source.type}`);
    }

    try {
      return await adapter.validateSource(source);
    } catch (error) {
      return false;
    }
  }

  /**
   * Force refresh of a specific source (bypass cache)
   */
  async refreshSource(sourceId: string, dateRange: DateRange): Promise<FetchResult> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    // Invalidate cache for this source
    await this.eventCache.invalidateSource(sourceId);

    // Fetch fresh data
    const result = await this.fetchFromSource(source, dateRange);
    
    // Update cache if successful
    if (result.success && result.events.length > 0) {
      const cacheQuery: CacheQuery = {
        sourceIds: [sourceId],
        dateRange
      };
      await this.eventCache.setEvents(cacheQuery, result.events);
    }

    return result;
  }

  /**
   * Check availability for time slots by finding conflicting events
   */
  async checkAvailability(
    timeSlots: Array<{ start: Date; end: Date }>,
    sourceIds?: string[]
  ): Promise<{
    results: Array<{
      start: Date;
      end: Date;
      available: boolean;
      conflicts: NormalizedEvent[];
    }>;
    errors: string[];
  }> {
    if (timeSlots.length === 0) {
      return { results: [], errors: [] };
    }

    // Determine the overall date range to fetch events for
    const allDates = timeSlots.flatMap(slot => [slot.start, slot.end]);
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Add buffer to catch overlapping events
    const bufferHours = 24;
    const fetchStart = new Date(minDate.getTime() - (bufferHours * 60 * 60 * 1000));
    const fetchEnd = new Date(maxDate.getTime() + (bufferHours * 60 * 60 * 1000));

    // Fetch events for the date range
    const fetchResult = await this.fetchEvents({
      start: fetchStart,
      end: fetchEnd
    }, sourceIds);

    // Check each time slot for conflicts
    const results = timeSlots.map(slot => {
      const conflicts = this.findConflictingEvents(fetchResult.events, slot.start, slot.end);
      
      return {
        start: slot.start,
        end: slot.end,
        available: conflicts.length === 0,
        conflicts
      };
    });

    return {
      results,
      errors: fetchResult.errors
    };
  }

  /**
   * Reload sources from configuration
   */
  async reloadSources(): Promise<void> {
    // This method will be called by the HTTP bridge when configuration changes
    // The actual source reloading will be handled by the main server
    // For now, we just clear the cache to force fresh fetches
    await this.eventCache.clear();
  }

  /**
   * Test a calendar source connection
   */
  async testSource(source: CalendarSource): Promise<{
    success: boolean;
    error?: string;
    responseTime?: number;
  }> {
    const adapter = this.adapters.get(source.type);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter available for source type: ${source.type}`
      };
    }

    const startTime = Date.now();
    
    try {
      const isValid = await adapter.validateSource(source);
      const responseTime = Date.now() - startTime;
      
      if (isValid) {
        return {
          success: true,
          responseTime
        };
      } else {
        return {
          success: false,
          error: 'Source validation failed',
          responseTime
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      };
    }
  }

  /**
   * Get source status for HTTP bridge
   */
  async getSourceStatus(sourceId: string): Promise<{
    status: CalendarSourceStatus;
    lastSync?: Date;
    error?: string;
  }> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return {
        status: 'error',
        error: 'Source not found'
      };
    }

    try {
      const health = await this.getSourceHealth(sourceId);
      if (!health) {
        return {
          status: 'error',
          error: 'Unable to check source health'
        };
      }

      return {
        status: health.isHealthy ? 'active' : 'error',
        lastSync: health.lastCheck,
        error: health.errorMessage
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get detailed information about a specific event by ID
   */
  async getEventDetails(eventId: string, includeRecurrence: boolean = true): Promise<{
    event: NormalizedEvent | null;
    found: boolean;
    error?: string;
  }> {
    try {
      // First try to get from cache
      const cachedEvent = await this.eventCache.getEventById(eventId);
      
      if (cachedEvent) {
        return {
          event: cachedEvent,
          found: true
        };
      }

      // If not in cache, we need to search across all sources
      // This is a fallback for cases where the event might exist but not be cached
      const enabledSources = Array.from(this.sources.values()).filter(s => s.enabled);
      
      if (enabledSources.length === 0) {
        return {
          event: null,
          found: false,
          error: 'No enabled calendar sources available'
        };
      }

      // Try to find the event by searching recent events from all sources
      // We'll search a reasonable date range around now
      const now = new Date();
      const pastRange = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)); // 90 days ago
      const futureRange = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year ahead
      
      const searchResult = await this.fetchEvents({
        start: pastRange,
        end: futureRange
      });

      // Check if there were errors during fetching
      if (searchResult.errors.length > 0 && searchResult.events.length === 0) {
        // If all sources failed, return the first error
        const firstError = searchResult.errors[0];
        const errorMessage = firstError.includes(':') ? firstError.split(':')[1].trim() : firstError;
        return {
          event: null,
          found: false,
          error: errorMessage
        };
      }

      // Look for the event in the fetched results
      const foundEvent = searchResult.events.find(event => event.id === eventId);
      
      if (foundEvent) {
        return {
          event: foundEvent,
          found: true
        };
      }

      return {
        event: null,
        found: false,
        error: 'Event not found in any configured calendar sources'
      };

    } catch (error) {
      return {
        event: null,
        found: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Search for events across all sources with filtering options
   */
  async searchEvents(
    dateRange: DateRange, 
    options?: {
      location?: string;
      keywords?: string[];
      categories?: string[];
      searchLogic?: 'AND' | 'OR';
      sourceIds?: string[];
    }
  ): Promise<{
    events: NormalizedEvent[];
    results: FetchResult[];
    errors: string[];
  }> {
    try {
      // Fetch all events in the date range
      const fetchResult = await this.fetchEvents(dateRange, options?.sourceIds);
      
      let filteredEvents = fetchResult.events;
      
      // Apply keyword filtering if provided
      if (options?.keywords && options.keywords.length > 0) {
        const searchLogic = options.searchLogic || 'AND';
        const normalizedKeywords = options.keywords.map(k => k.toLowerCase().trim());
        
        filteredEvents = filteredEvents.filter(event => {
          const searchText = [
            event.title || '',
            event.description || '',
            ...(event.categories || [])
          ].join(' ').toLowerCase();

          if (searchLogic === 'AND') {
            return normalizedKeywords.every(keyword => searchText.includes(keyword));
          } else {
            return normalizedKeywords.some(keyword => searchText.includes(keyword));
          }
        });
      }
      
      // Apply category filtering if provided
      if (options?.categories && options.categories.length > 0) {
        const normalizedCategories = options.categories.map(c => c.toLowerCase().trim());
        
        filteredEvents = filteredEvents.filter(event => {
          if (!event.categories || event.categories.length === 0) {
            return false;
          }
          
          const eventCategories = event.categories.map(c => c.toLowerCase().trim());
          return normalizedCategories.some(category => 
            eventCategories.some(eventCategory => eventCategory.includes(category))
          );
        });
      }
      
      // Apply location filtering if provided
      if (options?.location) {
        const normalizedLocation = options.location.toLowerCase().trim();
        
        filteredEvents = filteredEvents.filter(event => {
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
      
      return {
        events: filteredEvents,
        results: fetchResult.results,
        errors: fetchResult.errors
      };
      
    } catch (error) {
      return {
        events: [],
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown search error']
      };
    }
  }

  /**
   * Get target sources based on provided IDs or all enabled sources
   */
  private getTargetSources(sourceIds?: string[]): CalendarSource[] {
    const allSources = Array.from(this.sources.values());
    
    if (sourceIds && sourceIds.length > 0) {
      return allSources.filter(source => 
        sourceIds.includes(source.id) && source.enabled
      );
    }
    
    return allSources.filter(source => source.enabled);
  }

  /**
   * Fetch events from multiple sources in parallel with error isolation
   */
  private async fetchFromSourcesParallel(
    sources: CalendarSource[], 
    dateRange: DateRange
  ): Promise<FetchResult[]> {
    // Create semaphore for concurrent fetch limiting
    const semaphore = new Semaphore(this.config.maxConcurrentFetches);
    
    const fetchPromises = sources.map(async (source) => {
      return semaphore.acquire(async () => {
        return this.fetchFromSource(source, dateRange);
      });
    });

    return Promise.all(fetchPromises);
  }

  /**
   * Fetch events from a single source with error handling and retries
   */
  private async fetchFromSource(source: CalendarSource, dateRange: DateRange): Promise<FetchResult> {
    const adapter = this.adapters.get(source.type);
    if (!adapter) {
      return {
        sourceId: source.id,
        events: [],
        success: false,
        error: `No adapter available for source type: ${source.type}`,
        fetchTime: 0
      };
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Set timeout for the fetch operation
        const fetchPromise = adapter.fetchEvents(source, dateRange);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Fetch timeout')), this.config.fetchTimeout);
        });

        const rawEvents = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Normalize events
        const normalizedEvents = rawEvents.map(rawEvent => 
          adapter.normalizeEvent(rawEvent, source.id)
        );

        const fetchTime = Date.now() - startTime;
        
        return {
          sourceId: source.id,
          events: normalizedEvents,
          success: true,
          fetchTime
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.retryAttempts) {
          // Exponential backoff
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const fetchTime = Date.now() - startTime;
    
    return {
      sourceId: source.id,
      events: [],
      success: false,
      error: lastError?.message || 'Unknown error',
      fetchTime
    };
  }

  /**
   * Check health status of a single source
   */
  private async checkSourceHealth(source: CalendarSource): Promise<SourceHealth> {
    const adapter = this.adapters.get(source.type);
    if (!adapter) {
      return {
        sourceId: source.id,
        isHealthy: false,
        lastCheck: new Date(),
        errorMessage: `No adapter available for source type: ${source.type}`
      };
    }

    const startTime = Date.now();
    
    try {
      const status = await adapter.getSourceStatus(source);
      const responseTime = Date.now() - startTime;
      
      return {
        sourceId: source.id,
        isHealthy: status.isHealthy,
        lastCheck: status.lastCheck,
        errorMessage: status.errorMessage,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        sourceId: source.id,
        isHealthy: false,
        lastCheck: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      };
    }
  }

  /**
   * Deduplicate events based on title, start time, and location
   */
  private deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
    const seen = new Map<string, NormalizedEvent>();
    
    for (const event of events) {
      // Create a deduplication key based on event characteristics
      const key = this.createDeduplicationKey(event);
      
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, event);
      } else {
        // Keep the event with more recent lastModified date
        if (event.lastModified > existing.lastModified) {
          seen.set(key, event);
        }
      }
    }
    
    return Array.from(seen.values()).sort((a, b) => 
      a.startDate.getTime() - b.startDate.getTime()
    );
  }

  /**
   * Create a deduplication key for an event
   */
  private createDeduplicationKey(event: NormalizedEvent): string {
    const parts = [
      event.title.toLowerCase().trim(),
      event.startDate.getTime().toString(),
      event.endDate.getTime().toString(),
      event.location?.name?.toLowerCase().trim() || 'no-location'
    ];
    
    return parts.join('|');
  }

  /**
   * Filter events by location using address-focused matching
   * Prioritizes address matching since most locations are expected to be addresses
   */
  private filterEventsByLocation(events: NormalizedEvent[], location: string): NormalizedEvent[] {
    const locationLower = location.toLowerCase().trim();
    
    return events.filter(event => {
      if (!event.location) {
        return false;
      }

      const eventLocationName = event.location.name?.toLowerCase() || '';
      const eventLocationAddress = event.location.address?.toLowerCase() || '';
      
      // First priority: exact address matching
      if (eventLocationAddress && locationLower.includes(eventLocationAddress)) {
        return true;
      }
      if (eventLocationAddress && eventLocationAddress.includes(locationLower)) {
        return true;
      }
      
      // Second priority: name matching (for cases where address isn't available)
      if (eventLocationName && locationLower.includes(eventLocationName)) {
        return true;
      }
      if (eventLocationName && eventLocationName.includes(locationLower)) {
        return true;
      }
      
      // Third priority: partial word matching for addresses (e.g., "Building A" matches "123 Main St, Building A")
      if (eventLocationAddress) {
        const addressWords = eventLocationAddress.split(/[\s,]+/);
        const locationWords = locationLower.split(/[\s,]+/);
        
        for (const locationWord of locationWords) {
          if (locationWord.length > 2) { // Only match words longer than 2 characters
            for (const addressWord of addressWords) {
              if (addressWord.includes(locationWord) || locationWord.includes(addressWord)) {
                return true;
              }
            }
          }
        }
      }
      
      return false;
    });
  }

  /**
   * Find events that conflict with a given time slot
   */
  private findConflictingEvents(
    events: NormalizedEvent[], 
    slotStart: Date, 
    slotEnd: Date
  ): NormalizedEvent[] {
    return events.filter(event => {
      // Check if the event overlaps with the time slot
      return this.doTimeRangesOverlap(
        event.startDate, 
        event.endDate, 
        slotStart, 
        slotEnd
      );
    });
  }

  /**
   * Check if two time ranges overlap
   */
  private doTimeRangesOverlap(
    start1: Date, 
    end1: Date, 
    start2: Date, 
    end2: Date
  ): boolean {
    // Two ranges overlap if one starts before the other ends
    // and the other starts before the first ends
    return start1 < end2 && start2 < end1;
  }
}

/**
 * Simple semaphore implementation for limiting concurrent operations
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.permits > 0) {
        this.permits--;
        this.executeTask(task, resolve, reject);
      } else {
        this.waiting.push(() => {
          this.permits--;
          this.executeTask(task, resolve, reject);
        });
      }
    });
  }

  private async executeTask<T>(
    task: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (reason: any) => void
  ): Promise<void> {
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.permits++;
      if (this.waiting.length > 0) {
        const next = this.waiting.shift();
        if (next) next();
      }
    }
  }
}