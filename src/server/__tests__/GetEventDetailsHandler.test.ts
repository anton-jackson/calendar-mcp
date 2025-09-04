/**
 * Unit tests for get_event_details tool handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGetEventDetails } from '../tools/ToolHandlers.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { NormalizedEvent } from '../../types/calendar.js';
import { GetEventDetailsParams } from '../../types/mcp.js';

// Mock CalendarManager
const mockCalendarManager = {
  getEventDetails: vi.fn()
} as unknown as CalendarManager;

describe('handleGetEventDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('should return error for missing event_id', async () => {
      const params = {} as GetEventDetailsParams;
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_EVENT_ID');
      expect(result.error?.message).toContain('Event ID is required');
    });

    it('should return error for empty event_id', async () => {
      const params = { event_id: '' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_EVENT_ID');
      expect(result.error?.message).toContain('non-empty string');
    });

    it('should return error for whitespace-only event_id', async () => {
      const params = { event_id: '   ' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_EVENT_ID');
    });

    it('should return error for non-string event_id', async () => {
      const params = { event_id: 123 as any };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_EVENT_ID');
    });
  });

  describe('without calendar manager', () => {
    it('should return placeholder response when no calendar manager provided', async () => {
      const params = { event_id: 'test-event-123' };
      
      const result = await handleGetEventDetails(params);
      
      expect(result.content).toBeDefined();
      expect(result.content?.event).toBeNull();
      expect(result.content?.found).toBe(false);
      expect(result.content?.message).toContain('test-event-123');
    });
  });

  describe('event retrieval', () => {
    it('should return event details when event is found', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'event-123',
        sourceId: 'source-1',
        title: 'Test Event',
        description: 'A test event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Conference Room A',
          address: '123 Main St',
          coordinates: { lat: 40.7128, lng: -74.0060 }
        },
        organizer: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        categories: ['meeting', 'work'],
        url: 'https://example.com/event',
        lastModified: new Date('2024-01-10T09:00:00Z')
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'event-123', include_recurrence: false };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content).toBeDefined();
      expect(result.content?.found).toBe(true);
      expect(result.content?.event).toBeDefined();
      expect(result.content?.event.id).toBe('event-123');
      expect(result.content?.event.title).toBe('Test Event');
      expect(result.content?.event.start_date).toBe('2024-01-15T10:00:00.000Z');
      expect(result.content?.event.end_date).toBe('2024-01-15T11:00:00.000Z');
      expect(result.content?.event.location).toEqual({
        name: 'Conference Room A',
        address: '123 Main St',
        coordinates: { lat: 40.7128, lng: -74.0060 }
      });
      expect(result.content?.event.organizer).toEqual({
        name: 'John Doe',
        email: 'john@example.com'
      });
      expect(result.content?.event.categories).toEqual(['meeting', 'work']);
      expect(result.content?.event.is_recurring).toBe(false);
      expect(result.content?.recurrence_info).toBeUndefined();
    });

    it('should return not found when event does not exist', async () => {
      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: null,
        found: false,
        error: 'Event not found'
      });

      const params = { event_id: 'nonexistent-event' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content).toBeDefined();
      expect(result.content?.found).toBe(false);
      expect(result.content?.event).toBeNull();
      expect(result.content?.message).toContain('not found');
    });

    it('should handle calendar manager errors gracefully', async () => {
      vi.mocked(mockCalendarManager.getEventDetails).mockRejectedValue(
        new Error('Database connection failed')
      );

      const params = { event_id: 'event-123' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('EVENT_RETRIEVAL_ERROR');
      expect(result.error?.message).toContain('Failed to retrieve event details');
      expect(result.error?.details?.error_message).toBe('Database connection failed');
    });
  });

  describe('recurring events', () => {
    it('should include recurrence information for recurring events', async () => {
      const mockRecurringEvent: NormalizedEvent = {
        id: 'recurring-event-123',
        sourceId: 'source-1',
        title: 'Weekly Meeting',
        description: 'Team standup',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date('2024-01-10T09:00:00Z'),
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          count: 10
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockRecurringEvent,
        found: true
      });

      const params = { event_id: 'recurring-event-123', include_recurrence: true };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content).toBeDefined();
      expect(result.content?.found).toBe(true);
      expect(result.content?.event.is_recurring).toBe(true);
      expect(result.content?.recurrence_info).toBeDefined();
      expect(result.content?.recurrence_info?.is_recurring).toBe(true);
      expect(result.content?.recurrence_info?.recurrence_rule).toContain('Weekly');
      expect(result.content?.recurrence_info?.next_instances).toBeDefined();
      expect(result.content?.recurrence_info?.next_instances?.length).toBeGreaterThan(0);
    });

    it('should not include recurrence info when include_recurrence is false', async () => {
      const mockRecurringEvent: NormalizedEvent = {
        id: 'recurring-event-123',
        sourceId: 'source-1',
        title: 'Weekly Meeting',
        description: 'Team standup',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date('2024-01-10T09:00:00Z'),
        recurrence: {
          frequency: 'weekly',
          interval: 1
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockRecurringEvent,
        found: true
      });

      const params = { event_id: 'recurring-event-123', include_recurrence: false };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content).toBeDefined();
      expect(result.content?.event.is_recurring).toBe(true);
      expect(result.content?.recurrence_info).toBeUndefined();
    });

    it('should default include_recurrence to true', async () => {
      const mockRecurringEvent: NormalizedEvent = {
        id: 'recurring-event-123',
        sourceId: 'source-1',
        title: 'Weekly Meeting',
        description: 'Team standup',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date('2024-01-10T09:00:00Z'),
        recurrence: {
          frequency: 'daily',
          interval: 2,
          until: new Date('2024-02-15T10:00:00Z')
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockRecurringEvent,
        found: true
      });

      const params = { event_id: 'recurring-event-123' }; // No include_recurrence specified
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content?.recurrence_info).toBeDefined();
      expect(result.content?.recurrence_info?.recurrence_rule).toContain('Every 2 days');
      expect(result.content?.recurrence_info?.recurrence_rule).toContain('until');
    });
  });

  describe('event serialization', () => {
    it('should properly serialize event with all fields', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'full-event-123',
        sourceId: 'source-1',
        title: 'Complete Event',
        description: 'Event with all fields',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        location: {
          name: 'Main Hall',
          address: '456 Oak Ave',
          coordinates: { lat: 37.7749, lng: -122.4194 }
        },
        organizer: {
          name: 'Jane Smith',
          email: 'jane@example.com'
        },
        categories: ['conference', 'tech'],
        url: 'https://example.com/full-event',
        lastModified: new Date('2024-01-12T14:30:00Z')
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'full-event-123' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      const event = result.content?.event;
      expect(event).toBeDefined();
      expect(event.id).toBe('full-event-123');
      expect(event.source_id).toBe('source-1');
      expect(event.title).toBe('Complete Event');
      expect(event.description).toBe('Event with all fields');
      expect(event.start_date).toBe('2024-01-15T10:00:00.000Z');
      expect(event.end_date).toBe('2024-01-15T11:00:00.000Z');
      expect(event.location).toEqual({
        name: 'Main Hall',
        address: '456 Oak Ave',
        coordinates: { lat: 37.7749, lng: -122.4194 }
      });
      expect(event.organizer).toEqual({
        name: 'Jane Smith',
        email: 'jane@example.com'
      });
      expect(event.categories).toEqual(['conference', 'tech']);
      expect(event.url).toBe('https://example.com/full-event');
      expect(event.last_modified).toBe('2024-01-12T14:30:00.000Z');
      expect(event.is_recurring).toBe(false);
    });

    it('should handle event with minimal fields', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'minimal-event-123',
        sourceId: 'source-1',
        title: 'Minimal Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: [],
        lastModified: new Date('2024-01-12T14:30:00Z')
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'minimal-event-123' };
      
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      const event = result.content?.event;
      expect(event).toBeDefined();
      expect(event.id).toBe('minimal-event-123');
      expect(event.title).toBe('Minimal Event');
      expect(event.description).toBeUndefined();
      expect(event.location).toBeNull();
      expect(event.organizer).toBeNull();
      expect(event.categories).toEqual([]);
      expect(event.url).toBeUndefined();
      expect(event.is_recurring).toBe(false);
    });
  });

  describe('recurrence rule formatting', () => {
    it('should format daily recurrence correctly', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'daily-event',
        sourceId: 'source-1',
        title: 'Daily Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: [],
        lastModified: new Date('2024-01-12T14:30:00Z'),
        recurrence: {
          frequency: 'daily',
          interval: 1
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'daily-event' };
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      expect(result.content?.recurrence_info?.recurrence_rule).toBe('Daily');
    });

    it('should format weekly recurrence with interval correctly', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'biweekly-event',
        sourceId: 'source-1',
        title: 'Biweekly Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: [],
        lastModified: new Date('2024-01-12T14:30:00Z'),
        recurrence: {
          frequency: 'weekly',
          interval: 2,
          byDay: ['Monday', 'Wednesday']
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'biweekly-event' };
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      const rule = result.content?.recurrence_info?.recurrence_rule;
      expect(rule).toContain('Every 2 weeks');
      expect(rule).toContain('on Monday, Wednesday');
    });

    it('should format monthly recurrence with count correctly', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'monthly-event',
        sourceId: 'source-1',
        title: 'Monthly Event',
        startDate: new Date('2024-01-15T10:00:00Z'),
        endDate: new Date('2024-01-15T11:00:00Z'),
        categories: [],
        lastModified: new Date('2024-01-12T14:30:00Z'),
        recurrence: {
          frequency: 'monthly',
          interval: 1,
          count: 12
        }
      };

      vi.mocked(mockCalendarManager.getEventDetails).mockResolvedValue({
        event: mockEvent,
        found: true
      });

      const params = { event_id: 'monthly-event' };
      const result = await handleGetEventDetails(params, mockCalendarManager);
      
      const rule = result.content?.recurrence_info?.recurrence_rule;
      expect(rule).toBe('Monthly for 12 occurrences');
    });
  });
});