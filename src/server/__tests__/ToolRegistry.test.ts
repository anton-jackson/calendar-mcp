/**
 * Unit tests for Tool Registry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry, type ToolHandler } from '../ToolRegistry.js';
import { SEARCH_EVENTS_TOOL, GET_EVENT_DETAILS_TOOL } from '../tools/ToolDefinitions.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockHandler: ToolHandler;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockHandler = vi.fn().mockResolvedValue({ success: true });
  });

  describe('tool registration', () => {
    it('should register a tool successfully', () => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      expect(registry.hasTool('search_events')).toBe(true);
      expect(registry.getToolCount()).toBe(1);
    });

    it('should register multiple tools', () => {
      const mockHandler2 = vi.fn().mockResolvedValue({ success: true });
      
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      registry.registerTool(GET_EVENT_DETAILS_TOOL, mockHandler2);
      
      expect(registry.getToolCount()).toBe(2);
      expect(registry.hasTool('search_events')).toBe(true);
      expect(registry.hasTool('get_event_details')).toBe(true);
    });

    it('should retrieve registered tool', () => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      const tool = registry.getTool('search_events');
      expect(tool).toEqual(SEARCH_EVENTS_TOOL);
    });

    it('should return undefined for unregistered tool', () => {
      const tool = registry.getTool('nonexistent');
      expect(tool).toBeUndefined();
    });

    it('should get all registered tools', () => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      registry.registerTool(GET_EVENT_DETAILS_TOOL, mockHandler);
      
      const tools = registry.getTools();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toContain('search_events');
      expect(tools.map(t => t.name)).toContain('get_event_details');
    });
  });

  describe('tool unregistration', () => {
    it('should unregister a tool', () => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      expect(registry.hasTool('search_events')).toBe(true);
      
      registry.unregisterTool('search_events');
      expect(registry.hasTool('search_events')).toBe(false);
      expect(registry.getToolCount()).toBe(0);
    });

    it('should clear all tools', () => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      registry.registerTool(GET_EVENT_DETAILS_TOOL, mockHandler);
      expect(registry.getToolCount()).toBe(2);
      
      registry.clear();
      expect(registry.getToolCount()).toBe(0);
    });
  });

  describe('parameter validation', () => {
    beforeEach(() => {
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
    });

    it('should validate valid parameters', () => {
      const validParams = {
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };
      
      const result = registry.validateToolParameters('search_events', validParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required parameters', () => {
      const invalidParams = {
        start_date: '2024-01-01'
        // missing end_date
      };
      
      const result = registry.validateToolParameters('search_events', invalidParams);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid date format', () => {
      const invalidParams = {
        start_date: 'invalid-date',
        end_date: '2024-01-31'
      };
      
      const result = registry.validateToolParameters('search_events', invalidParams);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate optional parameters', () => {
      const validParams = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        location: 'New York',
        keywords: ['concert', 'music'],
        search_logic: 'AND' as const
      };
      
      const result = registry.validateToolParameters('search_events', validParams);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid enum values', () => {
      const invalidParams = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        search_logic: 'INVALID'
      };
      
      const result = registry.validateToolParameters('search_events', invalidParams);
      expect(result.valid).toBe(false);
    });

    it('should return valid for tools without schema', () => {
      const toolWithoutSchema = {
        name: 'no-schema-tool',
        description: 'Tool without schema'
      };
      
      registry.registerTool(toolWithoutSchema, mockHandler);
      
      const result = registry.validateToolParameters('no-schema-tool', { anything: true });
      expect(result.valid).toBe(true);
    });
  });

  describe('tool execution', () => {
    it('should execute registered tool', async () => {
      const testParams = { start_date: '2024-01-01', end_date: '2024-01-31' };
      const expectedResult = { events: [], count: 0 };
      
      mockHandler.mockResolvedValue(expectedResult);
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      const result = await registry.executeTool('search_events', testParams);
      
      expect(mockHandler).toHaveBeenCalledWith(testParams);
      expect(result).toEqual(expectedResult);
    });

    it('should throw error for unregistered tool', async () => {
      await expect(registry.executeTool('nonexistent', {}))
        .rejects.toThrow("No handler registered for tool 'nonexistent'");
    });

    it('should propagate handler errors', async () => {
      const error = new Error('Handler failed');
      mockHandler.mockRejectedValue(error);
      
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      await expect(registry.executeTool('search_events', {}))
        .rejects.toThrow('Handler failed');
    });
  });
});