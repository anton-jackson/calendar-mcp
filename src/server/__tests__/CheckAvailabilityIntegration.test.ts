/**
 * Integration tests for check_availability MCP tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCheckAvailability } from '../tools/ToolHandlers.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { EventCache } from '../../services/EventCache.js';
import { CheckAvailabilityParams } from '../../types/mcp.js';
import { NormalizedEvent } from '../../types/calendar.js';

describe('CheckAvailability Integration Tests', () => {
  let calendarManager: CalendarManager;
  let mockEventCache: EventCache;

  beforeEach(() => {
    mockEventCache = {
      getEvents: vi.fn(),
      setEvents: vi.fn(),
      invalidateSource: vi.fn(),
      getEventById: vi.fn()
    } as any;

    calendarManager = new CalendarManager(mockEventCache);
  });

  it('should perform end-to-end availability checking', async () => {
    // Mock some events that will conflict with our time slots
    const conflictingEvent: NormalizedEvent = {
      id: 'meeting-1',
      sourceId: 'test-calendar',
      title: 'Team Standup',
      startDate: new Date('2024-01-15T09:30:00Z'),
      endDate: new Date('2024-01-15T10:00:00Z'),
      location: {
        name: 'Conference Room A'
      },
      categories: ['meeting'],
      lastModified: new Date()
    };

    const nonConflictingEvent: NormalizedEvent = {
      id: 'meeting-2',
      sourceId: 'test-calendar',
      title: 'Project Review',
      startDate: new Date('2024-01-15T14:00:00Z'),
      endDate: new Date('2024-01-15T15:00:00Z'),
      categories: ['meeting'],
      lastModified: new Date()
    };

    // Mock the calendar manager's fetchEvents method
    vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
      events: [conflictingEvent, nonConflictingEvent],
      results: [],
      errors: []
    });

    // Test parameters with multiple time slots
    const params: CheckAvailabilityParams = {
      time_slots: [
        {
          start: '2024-01-15T09:00:00Z',  // Will conflict with Team Standup
          end: '2024-01-15T10:00:00Z'
        },
        {
          start: '2024-01-15T11:00:00Z',  // No conflicts
          end: '2024-01-15T12:00:00Z'
        },
        {
          start: '2024-01-15T13:30:00Z',  // Will conflict with Project Review
          end: '2024-01-15T14:30:00Z'
        }
      ]
    };

    // Execute the handler
    const result = await handleCheckAvailability(params, calendarManager);

    // Verify the response structure
    expect(result.content).toBeDefined();
    expect(result.content.availability).toHaveLength(3);
    expect(result.content.total_conflicts).toBe(2);

    // Check first time slot (should have conflict)
    const slot1 = result.content.availability[0];
    expect(slot1.available).toBe(false);
    expect(slot1.conflicts).toHaveLength(1);
    expect(slot1.conflicts[0].title).toBe('Team Standup');
    expect(slot1.conflicts[0].id).toBe('meeting-1');

    // Check second time slot (should be available)
    const slot2 = result.content.availability[1];
    expect(slot2.available).toBe(true);
    expect(slot2.conflicts).toHaveLength(0);

    // Check third time slot (should have conflict)
    const slot3 = result.content.availability[2];
    expect(slot3.available).toBe(false);
    expect(slot3.conflicts).toHaveLength(1);
    expect(slot3.conflicts[0].title).toBe('Project Review');
    expect(slot3.conflicts[0].id).toBe('meeting-2');

    // Verify the calendar manager was called with correct parameters
    expect(calendarManager.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.any(Date),
        end: expect.any(Date)
      }),
      undefined
    );
  });

  it('should handle complex overlapping scenarios', async () => {
    // Create an event that spans multiple time slots
    const longEvent: NormalizedEvent = {
      id: 'long-meeting',
      sourceId: 'test-calendar',
      title: 'All Hands Meeting',
      startDate: new Date('2024-01-15T10:30:00Z'),
      endDate: new Date('2024-01-15T12:30:00Z'),
      categories: ['meeting'],
      lastModified: new Date()
    };

    vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
      events: [longEvent],
      results: [],
      errors: []
    });

    const params: CheckAvailabilityParams = {
      time_slots: [
        {
          start: '2024-01-15T10:00:00Z',  // Partial overlap at start
          end: '2024-01-15T11:00:00Z'
        },
        {
          start: '2024-01-15T11:00:00Z',  // Completely contained within event
          end: '2024-01-15T12:00:00Z'
        },
        {
          start: '2024-01-15T12:00:00Z',  // Partial overlap at end
          end: '2024-01-15T13:00:00Z'
        },
        {
          start: '2024-01-15T13:00:00Z',  // No overlap (adjacent)
          end: '2024-01-15T14:00:00Z'
        }
      ]
    };

    const result = await handleCheckAvailability(params, calendarManager);

    expect(result.content.availability).toHaveLength(4);
    expect(result.content.total_conflicts).toBe(3);

    // All first three slots should conflict with the long event
    expect(result.content.availability[0].available).toBe(false);
    expect(result.content.availability[1].available).toBe(false);
    expect(result.content.availability[2].available).toBe(false);
    
    // Last slot should be available (adjacent, not overlapping)
    expect(result.content.availability[3].available).toBe(true);

    // All conflicts should reference the same event
    result.content.availability.slice(0, 3).forEach(slot => {
      expect(slot.conflicts).toHaveLength(1);
      expect(slot.conflicts[0].id).toBe('long-meeting');
    });
  });

  it('should handle empty calendar scenarios', async () => {
    // Mock empty calendar
    vi.spyOn(calendarManager, 'fetchEvents').mockResolvedValue({
      events: [],
      results: [],
      errors: []
    });

    const params: CheckAvailabilityParams = {
      time_slots: [
        {
          start: '2024-01-15T09:00:00Z',
          end: '2024-01-15T17:00:00Z'  // Full work day
        }
      ]
    };

    const result = await handleCheckAvailability(params, calendarManager);

    expect(result.content.availability).toHaveLength(1);
    expect(result.content.availability[0].available).toBe(true);
    expect(result.content.availability[0].conflicts).toHaveLength(0);
    expect(result.content.total_conflicts).toBe(0);
  });
});