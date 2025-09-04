import { describe, it, expect } from 'vitest';
import type { CalendarSource, NormalizedEvent } from './calendar.js';

describe('Calendar Types', () => {
  it('should create a valid CalendarSource', () => {
    const source: CalendarSource = {
      id: 'test-id',
      name: 'Test Calendar',
      type: 'ical',
      url: 'https://example.com/calendar.ics',
      enabled: true,
      status: 'active'
    };

    expect(source.id).toBe('test-id');
    expect(source.type).toBe('ical');
    expect(source.enabled).toBe(true);
  });

  it('should create a valid NormalizedEvent', () => {
    const event: NormalizedEvent = {
      id: 'event-1',
      sourceId: 'source-1',
      title: 'Test Event',
      startDate: new Date('2024-01-01T10:00:00Z'),
      endDate: new Date('2024-01-01T11:00:00Z'),
      categories: ['meeting'],
      lastModified: new Date()
    };

    expect(event.title).toBe('Test Event');
    expect(event.categories).toContain('meeting');
    expect(event.startDate).toBeInstanceOf(Date);
  });
});