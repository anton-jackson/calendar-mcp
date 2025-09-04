/**
 * Unit tests for check_availability MCP tool handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCheckAvailability } from '../tools/ToolHandlers.js';
import { CheckAvailabilityParams } from '../../types/mcp.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { NormalizedEvent } from '../../types/calendar.js';

describe('handleCheckAvailability', () => {
  let mockCalendarManager: CalendarManager;

  beforeEach(() => {
    // Create a mock CalendarManager
    mockCalendarManager = {
      checkAvailability: vi.fn(),
    } as any;
  });

  describe('parameter validation', () => {
    it('should return error when time_slots is empty', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: []
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_SLOTS');
      expect(result.error?.message).toContain('At least one time slot is required');
    });

    it('should return error when time_slots is missing', async () => {
      const params = {} as CheckAvailabilityParams;

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_SLOTS');
    });

    it('should return error when time slot is missing start time', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '', end: '2024-01-15T14:00:00Z' }
        ]
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_SLOT');
      expect(result.error?.message).toContain('Time slot 1 is missing start or end time');
    });

    it('should return error when time slot is missing end time', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '' }
        ]
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_SLOT');
    });

    it('should return error when date format is invalid', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: 'invalid-date', end: '2024-01-15T14:00:00Z' }
        ]
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_DATE_FORMAT');
      expect(result.error?.message).toContain('Time slot 1 has invalid date format');
    });

    it('should return error when start time is after end time', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T14:00:00Z', end: '2024-01-15T12:00:00Z' }
        ]
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_RANGE');
      expect(result.error?.message).toContain('start time must be before end time');
    });

    it('should return error when start time equals end time', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T12:00:00Z' }
        ]
      };

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_TIME_RANGE');
    });
  });

  describe('test mode (no calendar manager)', () => {
    it('should return available slots when no calendar manager provided', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' },
          { start: '2024-01-15T15:00:00Z', end: '2024-01-15T17:00:00Z' }
        ]
      };

      const result = await handleCheckAvailability(params);

      expect(result.content).toBeDefined();
      expect(result.content.availability).toHaveLength(2);
      expect(result.content.availability[0].available).toBe(true);
      expect(result.content.availability[0].conflicts).toHaveLength(0);
      expect(result.content.availability[1].available).toBe(true);
      expect(result.content.availability[1].conflicts).toHaveLength(0);
      expect(result.content.message).toContain('test mode');
    });

    it('should include location in test mode response', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ],
        location: 'Conference Room A'
      };

      const result = await handleCheckAvailability(params);

      expect(result.content?.location).toBe('Conference Room A');
    });
  });

  describe('availability checking with calendar manager', () => {
    it('should return available slots when no conflicts exist', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ]
      };

      // Mock calendar manager to return no conflicts
      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content).toBeDefined();
      expect(result.content.availability).toHaveLength(1);
      expect(result.content.availability[0].available).toBe(true);
      expect(result.content.availability[0].conflicts).toHaveLength(0);
      expect(result.content.total_conflicts).toBe(0);
    });

    it('should return conflicts when events overlap with time slots', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ]
      };

      const conflictingEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Team Meeting',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T15:00:00Z'),
        location: {
          name: 'Conference Room A'
        },
        categories: ['meeting'],
        lastModified: new Date()
      };

      // Mock calendar manager to return conflicts
      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: false,
            conflicts: [conflictingEvent]
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content).toBeDefined();
      expect(result.content.availability).toHaveLength(1);
      expect(result.content.availability[0].available).toBe(false);
      expect(result.content.availability[0].conflicts).toHaveLength(1);
      expect(result.content.availability[0].conflicts[0].title).toBe('Team Meeting');
      expect(result.content.availability[0].conflicts[0].location?.name).toBe('Conference Room A');
      expect(result.content.total_conflicts).toBe(1);
    });

    it('should handle multiple time slots with mixed availability', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T09:00:00Z', end: '2024-01-15T10:00:00Z' },
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' },
          { start: '2024-01-15T16:00:00Z', end: '2024-01-15T17:00:00Z' }
        ]
      };

      const conflictingEvent: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Lunch Meeting',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T14:30:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      // Mock calendar manager to return mixed results
      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T09:00:00Z'),
            end: new Date('2024-01-15T10:00:00Z'),
            available: true,
            conflicts: []
          },
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: false,
            conflicts: [conflictingEvent]
          },
          {
            start: new Date('2024-01-15T16:00:00Z'),
            end: new Date('2024-01-15T17:00:00Z'),
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content).toBeDefined();
      expect(result.content.availability).toHaveLength(3);
      expect(result.content.availability[0].available).toBe(true);
      expect(result.content.availability[1].available).toBe(false);
      expect(result.content.availability[2].available).toBe(true);
      expect(result.content.total_conflicts).toBe(1);
    });

    it('should call calendar manager with correct time slots', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ],
        location: 'Building A'
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      await handleCheckAvailability(params, mockCalendarManager);

      expect(mockCalendarManager.checkAvailability).toHaveBeenCalledWith(
        [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z')
          }
        ]
      );
    });

    it('should handle calendar manager errors gracefully', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ]
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockRejectedValue(
        new Error('Calendar service unavailable')
      );

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('AVAILABILITY_CHECK_ERROR');
      expect(result.error?.message).toBe('Failed to check availability');
      expect(result.error?.details?.error_message).toBe('Calendar service unavailable');
    });

    it('should convert time slots to Date objects correctly', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' },
          { start: '2024-01-16T09:00:00-05:00', end: '2024-01-16T11:00:00-05:00' }
        ]
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: true,
            conflicts: []
          },
          {
            start: new Date('2024-01-16T14:00:00Z'), // UTC equivalent of 09:00 EST
            end: new Date('2024-01-16T16:00:00Z'),   // UTC equivalent of 11:00 EST
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      await handleCheckAvailability(params, mockCalendarManager);

      expect(mockCalendarManager.checkAvailability).toHaveBeenCalledWith(
        [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z')
          },
          {
            start: new Date('2024-01-16T14:00:00Z'),
            end: new Date('2024-01-16T16:00:00Z')
          }
        ]
      );
    });
  });

  describe('edge cases', () => {
    it('should handle events without location when location filter is specified', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T14:00:00Z' }
        ],
        location: 'Conference Room'
      };

      const eventWithoutLocation: NormalizedEvent = {
        id: 'event-1',
        sourceId: 'source-1',
        title: 'Virtual Meeting',
        startDate: new Date('2024-01-15T13:00:00Z'),
        endDate: new Date('2024-01-15T15:00:00Z'),
        categories: ['meeting'],
        lastModified: new Date()
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T14:00:00Z'),
            available: false,
            conflicts: [eventWithoutLocation]
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content?.availability[0].conflicts[0].location).toBeUndefined();
    });

    it('should handle very short time slots', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T12:00:00Z', end: '2024-01-15T12:01:00Z' } // 1 minute
        ]
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T12:00:00Z'),
            end: new Date('2024-01-15T12:01:00Z'),
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content?.availability[0].available).toBe(true);
    });

    it('should handle time slots spanning multiple days', async () => {
      const params: CheckAvailabilityParams = {
        time_slots: [
          { start: '2024-01-15T20:00:00Z', end: '2024-01-16T08:00:00Z' } // 12 hours across days
        ]
      };

      vi.mocked(mockCalendarManager.checkAvailability).mockResolvedValue({
        results: [
          {
            start: new Date('2024-01-15T20:00:00Z'),
            end: new Date('2024-01-16T08:00:00Z'),
            available: true,
            conflicts: []
          }
        ],
        errors: []
      });

      const result = await handleCheckAvailability(params, mockCalendarManager);

      expect(result.content?.availability[0].available).toBe(true);
    });
  });
});