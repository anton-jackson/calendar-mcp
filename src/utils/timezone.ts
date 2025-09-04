/**
 * Timezone and date/time utilities for calendar event processing
 */

/**
 * Converts a date string with timezone information to a Date object
 * Handles various timezone formats commonly found in calendar data
 */
export function parseDateTime(dateTimeString: string, timezone?: string): Date {
  if (!dateTimeString) {
    throw new Error('DateTime string is required');
  }

  // Handle ISO 8601 format with timezone
  if (dateTimeString.includes('T') && (dateTimeString.includes('Z') || dateTimeString.includes('+') || dateTimeString.includes('-'))) {
    return new Date(dateTimeString);
  }

  // Handle date-only format (YYYYMMDD)
  if (/^\d{8}$/.test(dateTimeString)) {
    const year = parseInt(dateTimeString.substring(0, 4));
    const month = parseInt(dateTimeString.substring(4, 6)) - 1; // Month is 0-indexed
    const day = parseInt(dateTimeString.substring(6, 8));
    return new Date(year, month, day);
  }

  // Handle datetime format without timezone (YYYYMMDDTHHMMSS)
  if (/^\d{8}T\d{6}$/.test(dateTimeString)) {
    const year = parseInt(dateTimeString.substring(0, 4));
    const month = parseInt(dateTimeString.substring(4, 6)) - 1;
    const day = parseInt(dateTimeString.substring(6, 8));
    const hour = parseInt(dateTimeString.substring(9, 11));
    const minute = parseInt(dateTimeString.substring(11, 13));
    const second = parseInt(dateTimeString.substring(13, 15));
    
    const date = new Date(year, month, day, hour, minute, second);
    
    // If timezone is provided, adjust for it
    if (timezone) {
      return adjustForTimezone(date, timezone);
    }
    
    return date;
  }

  // Fallback to standard Date parsing
  const parsed = new Date(dateTimeString);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${dateTimeString}`);
  }
  
  return parsed;
}

/**
 * Adjusts a date for a given timezone
 * This is a simplified implementation - in production, consider using a library like date-fns-tz
 */
export function adjustForTimezone(date: Date, timezone: string): Date {
  // Handle UTC timezone
  if (timezone === 'UTC' || timezone === 'Z') {
    return date;
  }

  // Handle offset format (+HHMM or -HHMM)
  const offsetMatch = timezone.match(/^([+-])(\d{2})(\d{2})$/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(offsetMatch[2]);
    const minutes = parseInt(offsetMatch[3]);
    const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
    return new Date(date.getTime() - offsetMs);
  }

  // For named timezones, we'd need a more sophisticated approach
  // For now, return the date as-is
  console.warn(`Timezone ${timezone} not fully supported, using local time`);
  return date;
}

/**
 * Checks if a date string represents an all-day event
 */
export function isAllDayEvent(startDate: string, endDate?: string): boolean {
  // All-day events typically use date-only format (YYYYMMDD)
  const dateOnlyPattern = /^\d{8}$/;
  
  if (dateOnlyPattern.test(startDate)) {
    return true;
  }

  // Check if times are exactly midnight to midnight
  if (endDate) {
    const start = parseDateTime(startDate);
    const end = parseDateTime(endDate);
    
    return start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0 &&
           end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
  }

  return false;
}

/**
 * Formats a date for display purposes
 */
export function formatDateTime(date: Date, includeTime: boolean = true): string {
  if (includeTime) {
    return date.toISOString();
  }
  return date.toISOString().split('T')[0];
}

/**
 * Calculates the duration between two dates in minutes
 */
export function getDurationMinutes(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
}