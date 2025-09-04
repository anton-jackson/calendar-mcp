/**
 * MCP-specific types and interfaces
 */

export interface SearchEventsParams {
  start_date: string;
  end_date: string;
  location?: string;
  keywords?: string[];
  categories?: string[];
  search_logic?: 'AND' | 'OR';
}

export interface GetEventDetailsParams {
  event_id: string;
  include_recurrence?: boolean;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface CheckAvailabilityParams {
  time_slots: TimeSlot[];
  location?: string;
}

export interface MCPError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface MCPResponse<T = any> {
  content?: T;
  error?: MCPError;
}

export interface EventDetailsResponse {
  event: any | null;
  found: boolean;
  message?: string;
  recurrence_info?: {
    is_recurring: boolean;
    next_instances?: Array<{
      start: string;
      end: string;
      instance_id: string;
    }>;
    recurrence_rule?: string;
  };
}

export interface ConflictingEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: {
    name: string;
    address?: string;
  };
  source_id: string;
}

export interface AvailabilityResult {
  start: string;
  end: string;
  available: boolean;
  conflicts: ConflictingEvent[];
}

export interface CheckAvailabilityResponse {
  availability: AvailabilityResult[];
  message: string;
  location?: string;
  total_conflicts: number;
}