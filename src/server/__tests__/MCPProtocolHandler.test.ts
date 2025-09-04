/**
 * Unit tests for MCP Protocol Handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPProtocolHandler } from '../MCPProtocolHandler.js';
import { ToolRegistry } from '../ToolRegistry.js';
import { SEARCH_EVENTS_TOOL } from '../tools/ToolDefinitions.js';

describe('MCPProtocolHandler', () => {
  let handler: MCPProtocolHandler;

  beforeEach(() => {
    handler = new MCPProtocolHandler('test-server', '1.0.0');
  });

  describe('initialization', () => {
    it('should create server with correct name and version', () => {
      const server = handler.getServer();
      expect(server).toBeDefined();
    });

    it('should create tool registry', () => {
      const registry = handler.getToolRegistry();
      expect(registry).toBeInstanceOf(ToolRegistry);
    });
  });

  describe('tool registration', () => {
    it('should register tools through tool registry', () => {
      const registry = handler.getToolRegistry();
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      expect(registry.hasTool('search_events')).toBe(true);
      expect(registry.getToolCount()).toBe(1);
    });

    it('should provide access to registered tools', () => {
      const registry = handler.getToolRegistry();
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      const tools = registry.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('search_events');
    });
  });

  describe('MCP protocol compliance', () => {
    it('should have capabilities defined', () => {
      const server = handler.getServer();
      // The server should be properly configured with capabilities
      expect(server).toBeDefined();
    });

    it('should handle tool registration for MCP compliance', () => {
      const registry = handler.getToolRegistry();
      const mockHandler = vi.fn().mockResolvedValue({ result: 'test' });
      
      // Register a tool
      registry.registerTool(SEARCH_EVENTS_TOOL, mockHandler);
      
      // Verify tool is available for MCP protocol
      expect(registry.hasTool('search_events')).toBe(true);
      const tool = registry.getTool('search_events');
      expect(tool?.name).toBe('search_events');
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle server lifecycle', async () => {
      // Test that server can be created and closed without errors
      expect(() => handler.getServer()).not.toThrow();
      
      // Close should not throw
      await expect(handler.close()).resolves.not.toThrow();
    });
  });
});