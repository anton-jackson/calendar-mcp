import { CalendarSource, NormalizedEvent, DateRange, SourceStatus, RawEvent } from '../types/calendar.js';

/**
 * Interface for calendar adapters that handle different calendar source types
 */
export interface CalendarAdapter {
  /**
   * Fetch events from a calendar source within the specified date range
   */
  fetchEvents(source: CalendarSource, dateRange: DateRange): Promise<RawEvent[]>;

  /**
   * Validate that a calendar source is properly configured and accessible
   */
  validateSource(source: CalendarSource): Promise<boolean>;

  /**
   * Get the current status of a calendar source
   */
  getSourceStatus(source: CalendarSource): Promise<SourceStatus>;

  /**
   * Normalize raw event data into the standard NormalizedEvent format
   */
  normalizeEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent;

  /**
   * Get the supported calendar source type for this adapter
   */
  getSupportedType(): CalendarSource['type'];
}