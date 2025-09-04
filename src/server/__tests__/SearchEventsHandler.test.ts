/**
 * Unit tests for search_events MCP tool handler
 * Tests various search scenarios and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSearchEvents } from '../tools/ToolHandlers.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { NormalizedEvent } from '../../types/calendar.js';

// Mock CalendarManager
const mockCalendarManager = {
  searchEvents: vi.fn(),
  getSources: vi.fn()
} as unknown as CalendarManager;

describe('SearchEventsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCalendarManager.getSources as any).mockReturnValue([
      { id: 'source1', name: 'Test Source 1' },
      { id: 'source2', name: 'Test Source 2' }
    ]);
  });

  describe('Parameter Validation', () => {
    it('should require start_date and end_date', async () => {
      const result = await handleSearchEvents({} as any);
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('INVALID_DATE_RANGE');
      expect(result.error.message).toContain('start_date and end_date are required');
    });

    it('should validate date format', async () => {
      const result = await handleSearchEvents({
        start_date: 'invalid-date',
        end_date: '2025-12-31'
      });
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('INVALID_DATE_FORMAT');
    });

    it('should validate date range order', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-12-31',
        end_date: '2025-01-01'
      });
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('INVALID_DATE_RANGE');
      expect(result.error.message).toContain('Start date must be before end date');
    });

    it('should accept valid date parameters', async () => {
      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      }, mockCalendarManager);
      
      expect(result.error).toBeUndefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('Search Logic', () => {
    const mockEvents: NormalizedEvent[] = [
      {
        id: 'event1',
        sourceId: 'source1',
        title: 'Team Meeting',
        description: 'Weekly team sync meeting',
        startDate: new Date('2025-02-01T10:00:00Z'),
        endDate: new Date('2025-02-01T11:00:00Z'),
        categories: ['work', 'meeting'],
        location: {
          name: 'Conference Room A',
          address: '123 Main St'
        },
        lastModified: new Date()
      },
      {
        id: 'event2',
        sourceId: 'source1',
        title: 'Project Review',
        description: 'Quarterly project review session',
        startDate: new Date('2025-02-02T14:00:00Z'),
        endDate: new Date('2025-02-02T16:00:00Z'),
        categories: ['work', 'review'],
        location: {
          name: 'Conference Room B',
          address: '123 Main St'
        },
        lastModified: new Date()
      },
      {
        id: 'event3',
        sourceId: 'source2',
        title: 'Coffee Chat',
        description: 'Informal coffee discussion',
        startDate: new Date('2025-02-03T09:00:00Z'),
        endDate: new Date('2025-02-03T10:00:00Z'),
        categories: ['social'],
        location: {
          name: 'Cafe Downtown',
          address: '456 Oak Ave'
        },
        lastModified: new Date()
      }
    ];

    beforeEach(() => {
      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: mockEvents,
        results: [],
        errors: []
      });
    });

    it('should search without filters', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      }, mockCalendarManager);
      
      expect(result.content.events).toHaveLength(3);
      expect(result.content.total_count).toBe(3);
    });

    it('should filter by keywords with AND logic', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['team', 'meeting'],
        search_logic: 'AND'
      }, mockCalendarManager);
      
      // Should find only the "Team Meeting" event
      expect(result.content.events).toHaveLength(1);
      expect(result.content.events[0].title).toBe('Team Meeting');
    });

    it('should filter by keywords with OR logic', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['meeting', 'coffee'],
        search_logic: 'OR'
      }, mockCalendarManager);
      
      // Should find "Team Meeting" and "Coffee Chat"
      expect(result.content.events).toHaveLength(2);
      const titles = result.content.events.map(e => e.title);
      expect(titles).toContain('Team Meeting');
      expect(titles).toContain('Coffee Chat');
    });

    it('should filter by categories', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        categories: ['work']
      }, mockCalendarManager);
      
      // Should find events with 'work' category
      expect(result.content.events).toHaveLength(2);
      const titles = result.content.events.map(e => e.title);
      expect(titles).toContain('Team Meeting');
      expect(titles).toContain('Project Review');
    });

    it('should filter by location', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        location: 'Conference Room'
      }, mockCalendarManager);
      
      // Should find events in conference rooms
      expect(result.content.events).toHaveLength(2);
      const titles = result.content.events.map(e => e.title);
      expect(titles).toContain('Team Meeting');
      expect(titles).toContain('Project Review');
    });

    it('should combine multiple filters', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['meeting'],
        categories: ['work'],
        location: 'Conference Room A'
      }, mockCalendarManager);
      
      // Should find only "Team Meeting"
      expect(result.content.events).toHaveLength(1);
      expect(result.content.events[0].title).toBe('Team Meeting');
    });

    it('should return empty results when no matches found', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['nonexistent']
      }, mockCalendarManager);
      
      expect(result.content.events).toHaveLength(0);
      expect(result.content.total_count).toBe(0);
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted response', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'test-event',
        sourceId: 'test-source',
        title: 'Test Event',
        description: 'Test Description',
        startDate: new Date('2025-02-01T10:00:00Z'),
        endDate: new Date('2025-02-01T11:00:00Z'),
        categories: ['test'],
        location: {
          name: 'Test Location',
          address: 'Test Address'
        },
        organizer: {
          name: 'Test Organizer',
          email: 'test@example.com'
        },
        url: 'https://example.com/event',
        lastModified: new Date('2025-01-01T00:00:00Z')
      };

      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [mockEvent],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      }, mockCalendarManager);
      
      expect(result.content).toBeDefined();
      expect(result.content.events).toHaveLength(1);
      
      const event = result.content.events[0];
      expect(event.id).toBe('test-event');
      expect(event.source_id).toBe('test-source');
      expect(event.title).toBe('Test Event');
      expect(event.description).toBe('Test Description');
      expect(event.start_date).toBe('2025-02-01T10:00:00.000Z');
      expect(event.end_date).toBe('2025-02-01T11:00:00.000Z');
      expect(event.categories).toEqual(['test']);
      expect(event.location.name).toBe('Test Location');
      expect(event.location.address).toBe('Test Address');
      expect(event.organizer.name).toBe('Test Organizer');
      expect(event.organizer.email).toBe('test@example.com');
      expect(event.url).toBe('https://example.com/event');
      expect(event.last_modified).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should include search metadata', async () => {
      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['test'],
        categories: ['work'],
        location: 'office',
        search_logic: 'AND'
      }, mockCalendarManager);
      
      expect(result.content.search_params).toEqual({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        location: 'office',
        keywords: ['test'],
        categories: ['work'],
        search_logic: 'AND'
      });
      expect(result.content.sources_searched).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle CalendarManager errors', async () => {
      (mockCalendarManager.searchEvents as any).mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      }, mockCalendarManager);
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('SEARCH_ERROR');
      expect(result.error.message).toBe('Failed to search events');
      expect(result.error.details.error).toBe('Network timeout');
    });

    it('should work without CalendarManager (test mode)', async () => {
      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      });
      
      expect(result.content).toBeDefined();
      expect(result.content.events).toEqual([]);
      expect(result.content.message).toContain('test mode');
    });

    it('should handle partial search results with errors', async () => {
      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [],
        results: [],
        errors: ['Source 1 unavailable', 'Source 2 timeout']
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      }, mockCalendarManager);
      
      // Should still return success with empty results
      expect(result.error).toBeUndefined();
      expect(result.content.events).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle events without optional fields', async () => {
      const minimalEvent: NormalizedEvent = {
        id: 'minimal-event',
        sourceId: 'test-source',
        title: 'Minimal Event',
        startDate: new Date('2025-02-01T10:00:00Z'),
        endDate: new Date('2025-02-01T11:00:00Z'),
        categories: [],
        lastModified: new Date()
      };

      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [minimalEvent],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      }, mockCalendarManager);
      
      const event = result.content.events[0];
      expect(event.id).toBe('minimal-event');
      expect(event.title).toBe('Minimal Event');
      expect(event.description).toBeUndefined();
      expect(event.location).toBeNull();
      expect(event.organizer).toBeNull();
      expect(event.url).toBeUndefined();
    });

    it('should handle empty keyword arrays', async () => {
      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: []
      }, mockCalendarManager);
      
      expect(result.content.search_params.keywords).toEqual([]);
    });

    it('should handle case-insensitive keyword matching', async () => {
      const mockEvent: NormalizedEvent = {
        id: 'case-test',
        sourceId: 'test-source',
        title: 'IMPORTANT Meeting',
        description: 'Very important discussion',
        startDate: new Date('2025-02-01T10:00:00Z'),
        endDate: new Date('2025-02-01T11:00:00Z'),
        categories: [],
        lastModified: new Date()
      };

      (mockCalendarManager.searchEvents as any).mockResolvedValue({
        events: [mockEvent],
        results: [],
        errors: []
      });

      const result = await handleSearchEvents({
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        keywords: ['important']
      }, mockCalendarManager);
      
      expect(result.content.events).toHaveLength(1);
      expect(result.content.events[0].title).toBe('IMPORTANT Meeting');
    });
  });
});