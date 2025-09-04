import { describe, it, expect, vi } from 'vitest';
import { parseDateTime, adjustForTimezone, isAllDayEvent, formatDateTime, getDurationMinutes } from '../timezone.js';

describe('Timezone Utilities', () => {
  describe('parseDateTime', () => {
    it('should parse ISO 8601 format with timezone', () => {
      const result = parseDateTime('2024-01-15T10:30:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should parse ISO 8601 format with offset', () => {
      const result = parseDateTime('2024-01-15T10:30:00+05:00');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-15T05:30:00.000Z');
    });

    it('should parse date-only format (YYYYMMDD)', () => {
      const result = parseDateTime('20240115');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January (0-indexed)
      expect(result.getDate()).toBe(15);
    });

    it('should parse datetime format without timezone (YYYYMMDDTHHMMSS)', () => {
      const result = parseDateTime('20240115T103000');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it('should handle datetime with timezone parameter', () => {
      const result = parseDateTime('20240115T103000', 'UTC');
      expect(result).toBeInstanceOf(Date);
    });

    it('should throw error for invalid date format', () => {
      expect(() => parseDateTime('invalid-date')).toThrow('Invalid date format');
    });

    it('should throw error for empty string', () => {
      expect(() => parseDateTime('')).toThrow('DateTime string is required');
    });
  });

  describe('adjustForTimezone', () => {
    it('should handle UTC timezone', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = adjustForTimezone(date, 'UTC');
      expect(result).toEqual(date);
    });

    it('should handle Z timezone', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = adjustForTimezone(date, 'Z');
      expect(result).toEqual(date);
    });

    it('should handle positive offset (+0500)', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = adjustForTimezone(date, '+0500');
      expect(result.getTime()).toBe(date.getTime() - (5 * 60 * 60 * 1000));
    });

    it('should handle negative offset (-0800)', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = adjustForTimezone(date, '-0800');
      expect(result.getTime()).toBe(date.getTime() + (8 * 60 * 60 * 1000));
    });

    it('should handle named timezones with warning', () => {
      const date = new Date('2024-01-15T10:30:00');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = adjustForTimezone(date, 'America/New_York');
      expect(result).toEqual(date);
      expect(consoleSpy).toHaveBeenCalledWith('Timezone America/New_York not fully supported, using local time');
      
      consoleSpy.mockRestore();
    });
  });

  describe('isAllDayEvent', () => {
    it('should return true for date-only format', () => {
      expect(isAllDayEvent('20240115')).toBe(true);
    });

    it('should return false for datetime format', () => {
      expect(isAllDayEvent('20240115T103000')).toBe(false);
    });

    it('should return true for midnight to midnight events', () => {
      const result = isAllDayEvent('20240115T000000', '20240116T000000');
      expect(result).toBe(true);
    });

    it('should return false for non-midnight events', () => {
      const result = isAllDayEvent('20240115T100000', '20240115T110000');
      expect(result).toBe(false);
    });
  });

  describe('formatDateTime', () => {
    it('should format date with time by default', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateTime(date);
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should format date without time when specified', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateTime(date, false);
      expect(result).toBe('2024-01-15');
    });
  });

  describe('getDurationMinutes', () => {
    it('should calculate duration in minutes', () => {
      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T11:30:00Z');
      const result = getDurationMinutes(start, end);
      expect(result).toBe(90);
    });

    it('should handle same start and end time', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const result = getDurationMinutes(date, date);
      expect(result).toBe(0);
    });
  });
});