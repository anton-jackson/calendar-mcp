/**
 * Unit tests for Tool Definitions - MCP Protocol Compliance
 */

import { describe, it, expect } from 'vitest';
import { 
  SEARCH_EVENTS_TOOL, 
  GET_EVENT_DETAILS_TOOL, 
  CHECK_AVAILABILITY_TOOL,
  ALL_TOOLS 
} from '../tools/ToolDefinitions.js';

describe('Tool Definitions - MCP Protocol Compliance', () => {
  describe('search_events tool', () => {
    it('should have required MCP tool properties', () => {
      expect(SEARCH_EVENTS_TOOL.name).toBe('search_events');
      expect(SEARCH_EVENTS_TOOL.description).toBeDefined();
      expect(typeof SEARCH_EVENTS_TOOL.description).toBe('string');
      expect(SEARCH_EVENTS_TOOL.inputSchema).toBeDefined();
    });

    it('should have valid JSON schema', () => {
      const schema = SEARCH_EVENTS_TOOL.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.required).toEqual(['start_date', 'end_date']);
      expect(schema.additionalProperties).toBe(false);
    });

    it('should have properly defined date parameters', () => {
      const properties = SEARCH_EVENTS_TOOL.inputSchema.properties;
      expect(properties.start_date.type).toBe('string');
      expect(properties.start_date.format).toBe('date');
      expect(properties.end_date.type).toBe('string');
      expect(properties.end_date.format).toBe('date');
    });

    it('should have optional parameters with correct types', () => {
      const properties = SEARCH_EVENTS_TOOL.inputSchema.properties;
      
      expect(properties.location.type).toBe('string');
      expect(properties.keywords.type).toBe('array');
      expect(properties.keywords.items.type).toBe('string');
      expect(properties.categories.type).toBe('array');
      expect(properties.search_logic.enum).toEqual(['AND', 'OR']);
    });
  });

  describe('get_event_details tool', () => {
    it('should have required MCP tool properties', () => {
      expect(GET_EVENT_DETAILS_TOOL.name).toBe('get_event_details');
      expect(GET_EVENT_DETAILS_TOOL.description).toBeDefined();
      expect(GET_EVENT_DETAILS_TOOL.inputSchema).toBeDefined();
    });

    it('should have valid JSON schema', () => {
      const schema = GET_EVENT_DETAILS_TOOL.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['event_id']);
      expect(schema.additionalProperties).toBe(false);
    });

    it('should have properly defined parameters', () => {
      const properties = GET_EVENT_DETAILS_TOOL.inputSchema.properties;
      expect(properties.event_id.type).toBe('string');
      expect(properties.include_recurrence.type).toBe('boolean');
      expect(properties.include_recurrence.default).toBe(true);
    });
  });

  describe('check_availability tool', () => {
    it('should have required MCP tool properties', () => {
      expect(CHECK_AVAILABILITY_TOOL.name).toBe('check_availability');
      expect(CHECK_AVAILABILITY_TOOL.description).toBeDefined();
      expect(CHECK_AVAILABILITY_TOOL.inputSchema).toBeDefined();
    });

    it('should have valid JSON schema', () => {
      const schema = CHECK_AVAILABILITY_TOOL.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['time_slots']);
      expect(schema.additionalProperties).toBe(false);
    });

    it('should have properly defined time_slots array', () => {
      const properties = CHECK_AVAILABILITY_TOOL.inputSchema.properties;
      const timeSlots = properties.time_slots;
      
      expect(timeSlots.type).toBe('array');
      expect(timeSlots.minItems).toBe(1);
      expect(timeSlots.items.type).toBe('object');
      expect(timeSlots.items.required).toEqual(['start', 'end']);
      
      const slotProperties = timeSlots.items.properties;
      expect(slotProperties.start.type).toBe('string');
      expect(slotProperties.start.format).toBe('date-time');
      expect(slotProperties.end.type).toBe('string');
      expect(slotProperties.end.format).toBe('date-time');
    });
  });

  describe('ALL_TOOLS collection', () => {
    it('should contain all defined tools', () => {
      expect(ALL_TOOLS).toHaveLength(3);
      expect(ALL_TOOLS).toContain(SEARCH_EVENTS_TOOL);
      expect(ALL_TOOLS).toContain(GET_EVENT_DETAILS_TOOL);
      expect(ALL_TOOLS).toContain(CHECK_AVAILABILITY_TOOL);
    });

    it('should have unique tool names', () => {
      const names = ALL_TOOLS.map(tool => tool.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should all have required MCP properties', () => {
      ALL_TOOLS.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });
});