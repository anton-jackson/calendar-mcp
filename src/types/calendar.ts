/**
 * Core calendar interfaces and types for the MCP server
 */

export type CalendarSourceStatus = 'active' | 'error' | 'syncing';

export interface CalendarSource {
  id: string;
  name: string;
  type: 'ical' | 'caldav' | 'google';
  url: string;
  enabled: boolean;
  lastSync?: Date;
  status: CalendarSourceStatus;
  refreshInterval?: number;
}

export interface Location {
  name: string;
  address?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Organizer {
  name: string;
  email?: string;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  until?: Date;
  count?: number;
  byDay?: string[];
  byMonth?: number[];
}

export interface NormalizedEvent {
  id: string;
  sourceId: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: Location;
  organizer?: Organizer;
  categories: string[];
  recurrence?: RecurrenceRule;
  url?: string;
  lastModified: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface SourceStatus {
  isHealthy: boolean;
  lastCheck: Date;
  errorMessage?: string;
}

export interface RawEvent {
  [key: string]: any;
}