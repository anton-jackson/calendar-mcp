/**
 * Event normalizer that converts different calendar formats to unified structure
 */

import type { NormalizedEvent, RawEvent, Location, Organizer, RecurrenceRule } from '../types/calendar.js';
import { parseDateTime, isAllDayEvent } from './timezone.js';

/**
 * Normalizes raw event data from different calendar sources into a unified format
 */
export class EventNormalizer {
  /**
   * Normalizes an event from any supported calendar format
   */
  static normalize(rawEvent: RawEvent, sourceId: string, sourceType: 'ical' | 'caldav' | 'google'): NormalizedEvent {
    switch (sourceType) {
      case 'ical':
        return this.normalizeICalEvent(rawEvent, sourceId);
      case 'caldav':
        return this.normalizeCalDAVEvent(rawEvent, sourceId);
      case 'google':
        return this.normalizeGoogleEvent(rawEvent, sourceId);
      default:
        throw new Error(`Unsupported source type: ${sourceType}`);
    }
  }

  /**
   * Normalizes an iCal/ICS format event
   */
  private static normalizeICalEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    const uid = rawEvent.uid || rawEvent.UID || this.generateEventId(rawEvent, sourceId);
    const summary = rawEvent.summary || rawEvent.SUMMARY || 'Untitled Event';
    const description = rawEvent.description || rawEvent.DESCRIPTION;
    
    // Parse dates
    const dtstart = rawEvent.dtstart || rawEvent.DTSTART;
    const dtend = rawEvent.dtend || rawEvent.DTEND;
    
    if (!dtstart) {
      throw new Error('Event must have a start date');
    }

    const startDate = this.parseDateFromICalProperty(dtstart);
    const endDate = dtend ? this.parseDateFromICalProperty(dtend) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

    return {
      id: uid,
      sourceId,
      title: summary,
      description,
      startDate,
      endDate,
      location: this.parseICalLocation(rawEvent),
      organizer: this.parseICalOrganizer(rawEvent),
      categories: this.parseICalCategories(rawEvent),
      recurrence: this.parseICalRecurrence(rawEvent),
      url: rawEvent.url || rawEvent.URL,
      lastModified: this.parseICalLastModified(rawEvent)
    };
  }

  /**
   * Normalizes a CalDAV format event
   */
  private static normalizeCalDAVEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    // CalDAV events are typically in iCal format within the response
    // Extract the calendar data from the CalDAV response
    const calendarData = rawEvent.calendarData || rawEvent;
    return this.normalizeICalEvent(calendarData, sourceId);
  }

  /**
   * Normalizes a Google Calendar API format event
   */
  private static normalizeGoogleEvent(rawEvent: RawEvent, sourceId: string): NormalizedEvent {
    const id = rawEvent.id || this.generateEventId(rawEvent, sourceId);
    const summary = rawEvent.summary || 'Untitled Event';
    const description = rawEvent.description;

    // Parse Google Calendar date format
    const start = rawEvent.start;
    const end = rawEvent.end;

    if (!start) {
      throw new Error('Event must have a start date');
    }

    const startDate = this.parseGoogleDateTime(start);
    const endDate = end ? this.parseGoogleDateTime(end) : new Date(startDate.getTime() + 60 * 60 * 1000);

    return {
      id,
      sourceId,
      title: summary,
      description,
      startDate,
      endDate,
      location: this.parseGoogleLocation(rawEvent),
      organizer: this.parseGoogleOrganizer(rawEvent),
      categories: this.parseGoogleCategories(rawEvent),
      recurrence: this.parseGoogleRecurrence(rawEvent),
      url: rawEvent.htmlLink,
      lastModified: rawEvent.updated ? new Date(rawEvent.updated) : new Date()
    };
  }

  /**
   * Parses date from iCal property which can be a string or object
   */
  private static parseDateFromICalProperty(dateProperty: any): Date {
    if (typeof dateProperty === 'string') {
      return parseDateTime(dateProperty);
    }
    
    if (dateProperty && typeof dateProperty === 'object') {
      const dateValue = dateProperty.val || dateProperty.value || dateProperty;
      const timezone = dateProperty.tz || dateProperty.timezone;
      
      if (typeof dateValue === 'string') {
        return parseDateTime(dateValue, timezone);
      }
      
      if (dateValue instanceof Date) {
        return dateValue;
      }
    }
    
    throw new Error('Invalid date property format');
  }

  /**
   * Parses Google Calendar date/time format
   */
  private static parseGoogleDateTime(dateTimeObj: any): Date {
    if (dateTimeObj.dateTime) {
      return new Date(dateTimeObj.dateTime);
    }
    
    if (dateTimeObj.date) {
      // All-day event
      return new Date(dateTimeObj.date + 'T00:00:00');
    }
    
    throw new Error('Invalid Google date format');
  }

  /**
   * Parses location from iCal event
   */
  private static parseICalLocation(rawEvent: RawEvent): Location | undefined {
    const location = rawEvent.location || rawEvent.LOCATION;
    if (!location) return undefined;

    return {
      name: typeof location === 'string' ? location : location.val || location.value || 'Unknown Location'
    };
  }

  /**
   * Parses location from Google Calendar event
   */
  private static parseGoogleLocation(rawEvent: RawEvent): Location | undefined {
    if (!rawEvent.location) return undefined;

    return {
      name: rawEvent.location
    };
  }

  /**
   * Parses organizer from iCal event
   */
  private static parseICalOrganizer(rawEvent: RawEvent): Organizer | undefined {
    const organizer = rawEvent.organizer || rawEvent.ORGANIZER;
    if (!organizer) return undefined;

    if (typeof organizer === 'string') {
      return { name: organizer };
    }

    return {
      name: organizer.cn || organizer.name || 'Unknown Organizer',
      email: organizer.val || organizer.value
    };
  }

  /**
   * Parses organizer from Google Calendar event
   */
  private static parseGoogleOrganizer(rawEvent: RawEvent): Organizer | undefined {
    const organizer = rawEvent.organizer;
    if (!organizer) return undefined;

    return {
      name: organizer.displayName || organizer.email || 'Unknown Organizer',
      email: organizer.email
    };
  }

  /**
   * Parses categories from iCal event
   */
  private static parseICalCategories(rawEvent: RawEvent): string[] {
    const categories = rawEvent.categories || rawEvent.CATEGORIES;
    if (!categories) return [];

    if (typeof categories === 'string') {
      return categories.split(',').map(cat => cat.trim());
    }

    if (Array.isArray(categories)) {
      return categories.map(cat => typeof cat === 'string' ? cat : cat.val || cat.value || '').filter(Boolean);
    }

    return [];
  }

  /**
   * Parses categories from Google Calendar event
   */
  private static parseGoogleCategories(rawEvent: RawEvent): string[] {
    // Google Calendar doesn't have direct categories, but we can use other fields
    const categories: string[] = [];
    
    if (rawEvent.eventType) {
      categories.push(rawEvent.eventType);
    }
    
    if (rawEvent.visibility) {
      categories.push(rawEvent.visibility);
    }

    return categories;
  }

  /**
   * Parses recurrence from iCal event
   */
  private static parseICalRecurrence(rawEvent: RawEvent): RecurrenceRule | undefined {
    const rrule = rawEvent.rrule || rawEvent.RRULE;
    if (!rrule) return undefined;

    // This is a simplified parser - full RRULE parsing is complex
    const ruleString = typeof rrule === 'string' ? rrule : rrule.val || rrule.value;
    if (!ruleString) return undefined;

    const rule: Partial<RecurrenceRule> = {};
    
    // Parse frequency
    const freqMatch = ruleString.match(/FREQ=(\w+)/);
    if (freqMatch) {
      const freq = freqMatch[1].toLowerCase();
      if (['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
        rule.frequency = freq as RecurrenceRule['frequency'];
      }
    }

    // Parse interval
    const intervalMatch = ruleString.match(/INTERVAL=(\d+)/);
    if (intervalMatch) {
      rule.interval = parseInt(intervalMatch[1]);
    }

    // Parse until date
    const untilMatch = ruleString.match(/UNTIL=([^;]+)/);
    if (untilMatch) {
      rule.until = parseDateTime(untilMatch[1]);
    }

    // Parse count
    const countMatch = ruleString.match(/COUNT=(\d+)/);
    if (countMatch) {
      rule.count = parseInt(countMatch[1]);
    }

    return rule.frequency ? rule as RecurrenceRule : undefined;
  }

  /**
   * Parses recurrence from Google Calendar event
   */
  private static parseGoogleRecurrence(rawEvent: RawEvent): RecurrenceRule | undefined {
    const recurrence = rawEvent.recurrence;
    if (!recurrence || !Array.isArray(recurrence)) return undefined;

    // Google Calendar uses RRULE format in recurrence array
    const rruleString = recurrence.find(rule => rule.startsWith('RRULE:'));
    if (!rruleString) return undefined;

    return this.parseICalRecurrence({ rrule: rruleString.substring(6) }); // Remove 'RRULE:' prefix
  }

  /**
   * Parses last modified date from iCal event
   */
  private static parseICalLastModified(rawEvent: RawEvent): Date {
    const lastModified = rawEvent['last-modified'] || rawEvent.LASTMODIFIED || rawEvent.lastModified;
    
    if (lastModified) {
      try {
        return this.parseDateFromICalProperty(lastModified);
      } catch {
        // Fall through to default
      }
    }

    return new Date();
  }

  /**
   * Generates a unique event ID when none is provided
   */
  private static generateEventId(rawEvent: RawEvent, sourceId: string): string {
    const title = rawEvent.summary || rawEvent.SUMMARY || 'untitled';
    const start = rawEvent.dtstart || rawEvent.DTSTART || rawEvent.start;
    const timestamp = Date.now();
    
    return `${sourceId}-${title.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`;
  }
}