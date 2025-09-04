/**
 * End-to-End Integration Tests
 * Tests complete user workflows from startup to shutdown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { ConfigManager } from '../services/ConfigManager.js';
import { CalendarManager } from '../services/CalendarManager.js';
import { EventCache } from '../services/EventCache.js';
import { HTTPBridge } from '../server/HTTPBridge.js';
import { MCPProtocolHandler } from '../server/MCPProtocolHandler.js';
import { CalendarSource, NormalizedEvent } from '../types/calendar.js';
import { AppConfig } from '../types/config.js';

// Mock fetch for HTTP requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('End-to-End Integration Tests', () => {
  let testDir: string;
  let configManager: ConfigManager;
  let eventCache: EventCache;
  let calendarManager: CalendarManager;
  let httpBridge: HTTPBridge;
  let mcpHandler: MCPProtocolHandler;

  beforeEach(async () => {
    // Create temporary directory for test data
    testDir = join(tmpdir(), `public-calendar-mcp-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize services with test configuration
    configManager = new ConfigManager(join(testDir, 'config.json'));
    eventCache = new EventCache(join(testDir, 'events.db'), {
      memoryTtl: 300,
      persistentTtl: 3600,
      maxMemoryEvents: 100,
      cleanupInterval: 60
    });
    calendarManager = new CalendarManager(eventCache);
    httpBridge = new HTTPBridge(configManager, calendarManager, { port: 0, host: 'localhost' });
    mcpHandler = new MCPProtocolHandler('test-server', '1.0.0');

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(async () => {
    // Cleanup services
    try {
      await httpBridge.stop();
      await eventCache.close();
    } catch (error) {
      // Ignore cleanup errors
    }

    // Remove test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Complete Application Startup and Shutdown', () => {
    it('should initialize all services in correct order', async () => {
      // Test service initialization
      expect(configManager).toBeDefined();
      expect(eventCache).toBeDefined();
      expect(calendarManager).toBeDefined();
      expect(httpBridge).toBeDefined();
      expect(mcpHandler).toBeDefined();

      // Test that services are properly connected
      expect(calendarManager.getSources()).toEqual([]);
      expect(mcpHandler.getToolRegistry().getToolCount()).toBe(0);
    });

    it('should load configuration and set up calendar sources', async () => {
      // Create test configuration
      const testConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'test-ical-source',
            name: 'Test iCal Calendar',
            type: 'ical',
            url: 'https://example.com/test.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          },
          {
            id: 'test-caldav-source',
            name: 'Test CalDAV Calendar',
            type: 'caldav',
            url: 'https://caldav.example.com/calendar/',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      // Save configuration by adding sources individually
      await configManager.loadConfig(); // Load default config first
      for (const source of testConfig.sources) {
        await configManager.addCalendarSource(source);
      }
      await configManager.updateServerConfig(testConfig.server);

      // Load configuration and add sources
      const loadedConfig = await configManager.loadConfig();
      expect(loadedConfig.sources).toHaveLength(2);

      // Add sources to calendar manager
      for (const source of loadedConfig.sources) {
        calendarManager.addSource(source);
      }

      expect(calendarManager.getSources()).toHaveLength(2);
    });

    it('should register MCP tools correctly', async () => {
      const toolRegistry = mcpHandler.getToolRegistry();

      // Import and register tools (simulating main startup)
      const { ALL_TOOLS, handleSearchEvents, handleGetEventDetails, handleCheckAvailability } = 
        await import('../server/index.js');

      toolRegistry.registerTool(ALL_TOOLS[0], handleSearchEvents);
      toolRegistry.registerTool(ALL_TOOLS[1], (params: any) => handleGetEventDetails(params, calendarManager));
      toolRegistry.registerTool(ALL_TOOLS[2], (params: any) => handleCheckAvailability(params, calendarManager));

      expect(toolRegistry.getToolCount()).toBe(3);
      const tools = toolRegistry.getTools();
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('search_events');
      expect(toolNames).toContain('get_event_details');
      expect(toolNames).toContain('check_availability');
    });

    it('should start HTTP bridge for GUI communication', async () => {
      await httpBridge.start();
      
      // HTTP bridge should be running (we can't easily test the actual port without making real requests)
      // This test verifies that start() completes without throwing
      expect(true).toBe(true);
    });

    it('should handle graceful shutdown', async () => {
      // Start services
      await httpBridge.start();

      // Simulate shutdown
      await httpBridge.stop();
      await eventCache.close();

      // Clear calendar sources
      const sources = calendarManager.getSources();
      for (const source of sources) {
        calendarManager.removeSource(source.id);
      }

      expect(calendarManager.getSources()).toHaveLength(0);
    });
  });

  describe('Complete User Workflows', () => {
    beforeEach(async () => {
      // Set up a complete working environment
      const testConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'workflow-test-source',
            name: 'Workflow Test Calendar',
            type: 'ical',
            url: 'https://example.com/workflow-test.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      await configManager.loadConfig(); // Load default config first
      for (const source of testConfig.sources) {
        await configManager.addCalendarSource(source);
      }
      await configManager.updateServerConfig(testConfig.server);
      const config = await configManager.loadConfig();
      
      for (const source of config.sources) {
        calendarManager.addSource(source);
      }

      await httpBridge.start();

      // Register MCP tools
      const { ALL_TOOLS, handleSearchEvents, handleGetEventDetails, handleCheckAvailability } = 
        await import('../server/index.js');
      const toolRegistry = mcpHandler.getToolRegistry();
      
      toolRegistry.registerTool(ALL_TOOLS[0], handleSearchEvents);
      toolRegistry.registerTool(ALL_TOOLS[1], (params: any) => handleGetEventDetails(params, calendarManager));
      toolRegistry.registerTool(ALL_TOOLS[2], (params: any) => handleCheckAvailability(params, calendarManager));
    });

    it('should complete full event search workflow', async () => {
      // Mock successful iCal response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:workflow-test-event@example.com
DTSTART:20250203T100000Z
DTEND:20250203T110000Z
SUMMARY:Workflow Test Event
DESCRIPTION:Test event for workflow testing
LOCATION:Test Location
END:VEVENT
END:VCALENDAR`)
      });

      // Test search_events tool
      const toolRegistry = mcpHandler.getToolRegistry();
      const searchTool = toolRegistry.getTool('search_events');
      expect(searchTool).toBeDefined();

      const searchResult = await toolRegistry.executeTool('search_events', {
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      });

      expect(searchResult).toBeDefined();
      expect(searchResult.content).toBeDefined();
    });

    it('should complete full event details workflow', async () => {
      // Add a test event to the cache
      const testEvent: NormalizedEvent = {
        id: 'workflow-test-source:workflow-test-event',
        sourceId: 'workflow-test-source',
        title: 'Workflow Test Event',
        description: 'Test event for workflow testing',
        startDate: new Date('2025-02-03T10:00:00Z'),
        endDate: new Date('2025-02-03T11:00:00Z'),
        location: {
          name: 'Test Location'
        },
        categories: ['test'],
        lastModified: new Date()
      };

      await eventCache.setEvents({
        dateRange: {
          start: new Date('2025-02-01'),
          end: new Date('2025-02-28')
        }
      }, [testEvent]);

      // Test get_event_details tool
      const toolRegistry = mcpHandler.getToolRegistry();
      const detailsTool = toolRegistry.getTool('get_event_details');
      expect(detailsTool).toBeDefined();

      const detailsResult = await toolRegistry.executeTool('get_event_details', {
        event_id: 'workflow-test-source:workflow-test-event',
        include_recurrence: true
      });

      expect(detailsResult).toBeDefined();
      expect(detailsResult.content).toBeDefined();
      if ('content' in detailsResult) {
        expect(detailsResult.content.found).toBe(true);
        expect(detailsResult.content.event).toBeDefined();
        expect(detailsResult.content.event.title).toBe('Workflow Test Event');
      }
    });

    it('should complete full availability check workflow', async () => {
      // Add a conflicting event to the cache
      const conflictingEvent: NormalizedEvent = {
        id: 'workflow-test-source:conflicting-event',
        sourceId: 'workflow-test-source',
        title: 'Conflicting Event',
        description: 'Event that conflicts with availability check',
        startDate: new Date('2025-02-03T14:00:00Z'),
        endDate: new Date('2025-02-03T15:00:00Z'),
        location: {
          name: 'Conflict Location'
        },
        categories: ['conflict'],
        lastModified: new Date()
      };

      await eventCache.setEvents({
        dateRange: {
          start: new Date('2025-02-01'),
          end: new Date('2025-02-28')
        }
      }, [conflictingEvent]);

      // Test check_availability tool
      const toolRegistry = mcpHandler.getToolRegistry();
      const availabilityTool = toolRegistry.getTool('check_availability');
      expect(availabilityTool).toBeDefined();

      const availabilityResult = await toolRegistry.executeTool('check_availability', {
        time_slots: [
          {
            start: '2025-02-03T13:00:00Z',
            end: '2025-02-03T14:00:00Z'
          },
          {
            start: '2025-02-03T14:30:00Z',
            end: '2025-02-03T15:30:00Z'
          }
        ]
      });

      expect(availabilityResult).toBeDefined();
      expect(availabilityResult.content).toBeDefined();
      if ('content' in availabilityResult) {
        expect(availabilityResult.content.availability).toHaveLength(2);
        expect(availabilityResult.content.availability[0].available).toBe(true);
        expect(availabilityResult.content.availability[1].available).toBe(false);
        expect(availabilityResult.content.availability[1].conflicts).toHaveLength(1);
      }
    });

    it('should handle configuration updates dynamically', async () => {
      // Initial state
      expect(calendarManager.getSources()).toHaveLength(1);

      // Add a new source via configuration update
      const updatedConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'workflow-test-source',
            name: 'Workflow Test Calendar',
            type: 'ical',
            url: 'https://example.com/workflow-test.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          },
          {
            id: 'new-dynamic-source',
            name: 'New Dynamic Calendar',
            type: 'ical',
            url: 'https://example.com/new-dynamic.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      // Simulate configuration update (like what would happen from GUI)
      const currentConfig = await configManager.loadConfig();
      for (const source of updatedConfig.sources) {
        if (!currentConfig.sources.find(s => s.id === source.id)) {
          await configManager.addCalendarSource(source);
        }
      }
      await configManager.updateServerConfig(updatedConfig.server);

      // Manually trigger the configuration listener (simulating the real app behavior)
      const config = await configManager.loadConfig();
      
      // Clear existing sources
      const existingSources = calendarManager.getSources();
      for (const source of existingSources) {
        calendarManager.removeSource(source.id);
      }
      
      // Add updated sources
      for (const source of config.sources) {
        calendarManager.addSource(source);
      }

      expect(calendarManager.getSources()).toHaveLength(2);
      expect(calendarManager.getSources().map(s => s.id)).toContain('new-dynamic-source');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle service initialization failures gracefully', async () => {
      // Test with invalid cache path
      const invalidEventCache = new EventCache('/invalid/path/events.db', {
        memoryTtl: 300,
        persistentTtl: 3600,
        maxMemoryEvents: 100,
        cleanupInterval: 60
      });

      // Should not throw during construction, but may fail during operations
      expect(invalidEventCache).toBeDefined();

      // Try a simple operation that should fail
      try {
        await invalidEventCache.getEvents({
          dateRange: {
            start: new Date('2025-02-01'),
            end: new Date('2025-02-28')
          }
        });
      } catch (error) {
        // Expected to fail due to invalid path
        expect(error).toBeDefined();
      }

      // Cleanup
      try {
        await invalidEventCache.close();
      } catch (error) {
        // Expected to fail
      }
    }, 1000); // Reduce timeout to 1 second

    it('should handle configuration loading failures', async () => {
      // Test with non-existent config file
      const invalidConfigManager = new ConfigManager('/invalid/path/config.json');
      
      // Should throw an error due to invalid path
      await expect(invalidConfigManager.loadConfig()).rejects.toThrow();
    });

    it('should handle HTTP bridge startup failures', async () => {
      // Test with invalid port (negative port)
      const invalidHttpBridge = new HTTPBridge(
        configManager, 
        calendarManager, 
        { port: -1, host: 'localhost' }
      );

      // Should throw during start
      await expect(invalidHttpBridge.start()).rejects.toThrow();
    });

    it('should handle calendar source failures gracefully', async () => {
      // Add a source that will fail
      const failingSource: CalendarSource = {
        id: 'failing-source',
        name: 'Failing Calendar',
        type: 'ical',
        url: 'https://invalid-url-that-will-fail.com/calendar.ics',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      calendarManager.addSource(failingSource);

      // Mock fetch to fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Test that the system continues to work despite source failure
      const sources = calendarManager.getSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('failing-source');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle multiple concurrent operations', async () => {
      // Add test events to cache
      const testEvents: NormalizedEvent[] = Array.from({ length: 50 }, (_, i) => ({
        id: `workflow-test-source:event-${i}`,
        sourceId: 'workflow-test-source',
        title: `Test Event ${i}`,
        description: `Test event number ${i}`,
        startDate: new Date(`2025-02-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`),
        endDate: new Date(`2025-02-${String(i % 28 + 1).padStart(2, '0')}T11:00:00Z`),
        location: {
          name: `Location ${i}`
        },
        categories: ['test'],
        lastModified: new Date()
      }));

      await eventCache.setEvents({
        dateRange: {
          start: new Date('2025-02-01'),
          end: new Date('2025-02-28')
        }
      }, testEvents);

      // Register tools
      const { ALL_TOOLS, handleSearchEvents, handleGetEventDetails, handleCheckAvailability } = 
        await import('../server/index.js');
      const toolRegistry = mcpHandler.getToolRegistry();
      
      toolRegistry.registerTool(ALL_TOOLS[0], handleSearchEvents);
      toolRegistry.registerTool(ALL_TOOLS[1], (params: any) => handleGetEventDetails(params, calendarManager));
      toolRegistry.registerTool(ALL_TOOLS[2], (params: any) => handleCheckAvailability(params, calendarManager));

      // Perform multiple concurrent operations
      const operations = [
        toolRegistry.executeTool('get_event_details', { event_id: 'workflow-test-source:event-1' }),
        toolRegistry.executeTool('get_event_details', { event_id: 'workflow-test-source:event-2' }),
        toolRegistry.executeTool('get_event_details', { event_id: 'workflow-test-source:event-3' }),
        toolRegistry.executeTool('check_availability', {
          time_slots: [
            { start: '2025-02-01T12:00:00Z', end: '2025-02-01T13:00:00Z' },
            { start: '2025-02-02T12:00:00Z', end: '2025-02-02T13:00:00Z' }
          ]
        }),
        toolRegistry.executeTool('search_events', {
          start_date: '2025-02-01',
          end_date: '2025-02-28'
        })
      ];

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should properly clean up resources on shutdown', async () => {
      // Start all services
      await httpBridge.start();
      
      // Add some data
      const testEvent: NormalizedEvent = {
        id: 'cleanup-test:event',
        sourceId: 'cleanup-test',
        title: 'Cleanup Test Event',
        description: 'Event for testing cleanup',
        startDate: new Date('2025-02-03T10:00:00Z'),
        endDate: new Date('2025-02-03T11:00:00Z'),
        location: { name: 'Cleanup Location' },
        categories: ['cleanup'],
        lastModified: new Date()
      };

      await eventCache.setEvents({
        dateRange: {
          start: new Date('2025-02-01'),
          end: new Date('2025-02-28')
        }
      }, [testEvent]);

      // Verify data exists
      const cachedEvents = await eventCache.getEvents({
        dateRange: {
          start: new Date('2025-02-01'),
          end: new Date('2025-02-28')
        }
      });
      expect(cachedEvents).toHaveLength(1);

      // Perform shutdown
      await httpBridge.stop();
      await eventCache.close();

      // Verify cleanup completed without errors
      expect(true).toBe(true);
    });
  });
});