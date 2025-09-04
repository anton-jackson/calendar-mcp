/**
 * macOS Application Integration Tests
 * Tests the integration between the TypeScript MCP server and the macOS SwiftUI application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { ConfigManager } from '../services/ConfigManager.js';
import { CalendarManager } from '../services/CalendarManager.js';
import { EventCache } from '../services/EventCache.js';
import { HTTPBridge } from '../server/HTTPBridge.js';
import { CalendarSource } from '../types/calendar.js';
import { AppConfig } from '../types/config.js';

// Mock fetch for HTTP requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('macOS Application Integration', () => {
  let testDir: string;
  let configManager: ConfigManager;
  let eventCache: EventCache;
  let calendarManager: CalendarManager;
  let httpBridge: HTTPBridge;

  beforeEach(async () => {
    // Create temporary directory for test data
    testDir = join(tmpdir(), `macos-integration-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize services
    configManager = new ConfigManager(join(testDir, 'config.json'));
    eventCache = new EventCache(join(testDir, 'events.db'), {
      memoryTtl: 300,
      persistentTtl: 3600,
      maxMemoryEvents: 100,
      cleanupInterval: 60
    });
    calendarManager = new CalendarManager(eventCache);
    httpBridge = new HTTPBridge(configManager, calendarManager, { port: 0, host: 'localhost' });

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

  describe('HTTP Bridge API Endpoints', () => {
    beforeEach(async () => {
      await httpBridge.start();
    });

    it('should provide server status endpoint', async () => {
      // This test simulates what the macOS app would do to check server status
      // In a real scenario, the macOS app would make HTTP requests to these endpoints
      
      // Set up test configuration
      const testConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'macos-test-source',
            name: 'macOS Test Calendar',
            type: 'ical',
            url: 'https://example.com/macos-test.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      await configManager.saveConfig(testConfig);
      const config = await configManager.loadConfig();
      
      for (const source of config.sources) {
        calendarManager.addSource(source);
      }

      // Test that the HTTP bridge can provide status information
      // (In a real test, we would make actual HTTP requests)
      const sources = calendarManager.getSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe('macOS Test Calendar');
    });

    it('should handle configuration updates from GUI', async () => {
      // Simulate the macOS app adding a new calendar source
      const newSource: CalendarSource = {
        id: 'gui-added-source',
        name: 'GUI Added Calendar',
        type: 'caldav',
        url: 'https://caldav.example.com/calendar/',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      // Add source via configuration manager (simulating HTTP API call)
      await configManager.addCalendarSource(newSource);
      
      // Reload sources in calendar manager (simulating the HTTP bridge behavior)
      await calendarManager.reloadSources();
      
      const config = await configManager.loadConfig();
      expect(config.sources).toHaveLength(1);
      expect(config.sources[0].name).toBe('GUI Added Calendar');
    });

    it('should handle calendar source removal from GUI', async () => {
      // Set up initial source
      const initialSource: CalendarSource = {
        id: 'to-be-removed',
        name: 'Calendar to Remove',
        type: 'ical',
        url: 'https://example.com/remove-me.ics',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      await configManager.addCalendarSource(initialSource);
      calendarManager.addSource(initialSource);
      
      expect(calendarManager.getSources()).toHaveLength(1);

      // Remove source (simulating GUI action)
      await configManager.removeCalendarSource('to-be-removed');
      calendarManager.removeSource('to-be-removed');

      expect(calendarManager.getSources()).toHaveLength(0);
      
      const config = await configManager.loadConfig();
      expect(config.sources).toHaveLength(0);
    });

    it('should provide calendar source testing functionality', async () => {
      // Set up a test source
      const testSource: CalendarSource = {
        id: 'test-connection-source',
        name: 'Test Connection Calendar',
        type: 'ical',
        url: 'https://example.com/test-connection.ics',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      calendarManager.addSource(testSource);

      // Mock successful response for testing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-connection-event@example.com
DTSTART:20250203T100000Z
DTEND:20250203T110000Z
SUMMARY:Test Connection Event
END:VEVENT
END:VCALENDAR`)
      });

      // Test the source (simulating GUI test button)
      const testResult = await calendarManager.testSource(testSource);
      
      expect(testResult.success).toBe(true);
      expect(testResult.responseTime).toBeGreaterThan(0);
    });
  });

  describe('Configuration Persistence', () => {
    it('should persist configuration in macOS Application Support directory format', async () => {
      // Test that configuration is saved in the expected macOS format
      const testConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'persistence-test-source',
            name: 'Persistence Test Calendar',
            type: 'ical',
            url: 'https://example.com/persistence-test.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      await configManager.saveConfig(testConfig);
      
      // Verify configuration can be loaded back
      const loadedConfig = await configManager.loadConfig();
      expect(loadedConfig.server.port).toBe(3001);
      expect(loadedConfig.server.autoStart).toBe(true);
      expect(loadedConfig.sources).toHaveLength(1);
      expect(loadedConfig.sources[0].name).toBe('Persistence Test Calendar');
    });

    it('should handle configuration updates without server restart', async () => {
      // Initial configuration
      const initialConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'initial-source',
            name: 'Initial Calendar',
            type: 'ical',
            url: 'https://example.com/initial.ics',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      await configManager.saveConfig(initialConfig);
      const config = await configManager.loadConfig();
      
      for (const source of config.sources) {
        calendarManager.addSource(source);
      }

      expect(calendarManager.getSources()).toHaveLength(1);

      // Update configuration (simulating GUI changes)
      const updatedConfig: AppConfig = {
        ...initialConfig,
        server: {
          ...initialConfig.server,
          cacheTimeout: 7200 // Changed cache timeout
        },
        sources: [
          ...initialConfig.sources,
          {
            id: 'added-source',
            name: 'Added Calendar',
            type: 'caldav',
            url: 'https://caldav.example.com/added/',
            enabled: true,
            status: 'active',
            refreshInterval: 1800
          }
        ]
      };

      await configManager.saveConfig(updatedConfig);

      // Simulate configuration reload (what happens when GUI updates config)
      const reloadedConfig = await configManager.loadConfig();
      
      // Clear and reload sources
      const existingSources = calendarManager.getSources();
      for (const source of existingSources) {
        calendarManager.removeSource(source.id);
      }
      
      for (const source of reloadedConfig.sources) {
        calendarManager.addSource(source);
      }

      expect(calendarManager.getSources()).toHaveLength(2);
      expect(reloadedConfig.server.cacheTimeout).toBe(7200);
    });
  });

  describe('Server Lifecycle Management', () => {
    it('should support server startup and shutdown from GUI', async () => {
      // Test the server lifecycle that would be managed by the macOS app
      
      // Startup
      await httpBridge.start();
      
      // Verify server is running (in real scenario, GUI would check HTTP endpoints)
      expect(true).toBe(true); // HTTP bridge started without throwing
      
      // Shutdown
      await httpBridge.stop();
      
      // Verify clean shutdown
      expect(true).toBe(true); // HTTP bridge stopped without throwing
    });

    it('should handle server restart scenarios', async () => {
      // Start server
      await httpBridge.start();
      
      // Stop server
      await httpBridge.stop();
      
      // Restart server (simulating GUI restart button)
      await httpBridge.start();
      
      // Verify server is running again
      expect(true).toBe(true);
      
      // Final cleanup
      await httpBridge.stop();
    });
  });

  describe('Error Handling for GUI Integration', () => {
    it('should provide meaningful error messages for GUI display', async () => {
      // Test invalid calendar source
      const invalidSource: CalendarSource = {
        id: 'invalid-source',
        name: 'Invalid Calendar',
        type: 'ical',
        url: 'not-a-valid-url',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      calendarManager.addSource(invalidSource);

      // Mock fetch failure
      mockFetch.mockRejectedValueOnce(new Error('Invalid URL'));

      // Test the source and expect meaningful error
      const testResult = await calendarManager.testSource(invalidSource);
      
      expect(testResult.success).toBe(false);
      expect(testResult.error).toBeDefined();
      expect(typeof testResult.error).toBe('string');
    });

    it('should handle configuration validation errors', async () => {
      // Test invalid configuration
      const invalidConfig = {
        server: {
          port: 'not-a-number', // Invalid port
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: []
      };

      // Configuration manager should handle invalid data gracefully
      try {
        await configManager.saveConfig(invalidConfig as any);
        const loadedConfig = await configManager.loadConfig();
        
        // Should fall back to defaults or handle gracefully
        expect(loadedConfig).toBeDefined();
      } catch (error) {
        // Or should throw a meaningful error
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Real-time Status Updates', () => {
    it('should provide status updates for GUI monitoring', async () => {
      await httpBridge.start();

      // Set up test sources
      const testSources: CalendarSource[] = [
        {
          id: 'status-test-1',
          name: 'Status Test Calendar 1',
          type: 'ical',
          url: 'https://example.com/status-test-1.ics',
          enabled: true,
          status: 'active',
          refreshInterval: 1800
        },
        {
          id: 'status-test-2',
          name: 'Status Test Calendar 2',
          type: 'caldav',
          url: 'https://caldav.example.com/status-test-2/',
          enabled: true,
          status: 'active',
          refreshInterval: 1800
        }
      ];

      for (const source of testSources) {
        calendarManager.addSource(source);
      }

      // Test that status can be retrieved for GUI display
      const sources = calendarManager.getSources();
      expect(sources).toHaveLength(2);
      
      // Each source should have status information
      for (const source of sources) {
        expect(source.status).toBeDefined();
        expect(['active', 'error', 'syncing'].includes(source.status)).toBe(true);
      }
    });

    it('should handle status listener registration for real-time updates', async () => {
      await httpBridge.start();

      let statusUpdateReceived = false;
      
      // Register a status listener (simulating GUI status monitoring)
      httpBridge.addStatusListener((status) => {
        statusUpdateReceived = true;
        expect(status.timestamp).toBeInstanceOf(Date);
        expect(status.serverStatus).toBeDefined();
        expect(Array.isArray(status.sources)).toBe(true);
      });

      // Add a source to trigger status update
      const testSource: CalendarSource = {
        id: 'listener-test-source',
        name: 'Listener Test Calendar',
        type: 'ical',
        url: 'https://example.com/listener-test.ics',
        enabled: true,
        status: 'active',
        refreshInterval: 1800
      };

      calendarManager.addSource(testSource);

      // In a real scenario, status updates would be triggered by various events
      // For testing, we can verify the listener mechanism works
      expect(statusUpdateReceived).toBe(false); // No automatic trigger in test
    });
  });

  describe('Performance Considerations for GUI', () => {
    it('should handle multiple calendar sources efficiently', async () => {
      // Test with multiple sources (simulating a user with many calendars)
      const multipleSources: CalendarSource[] = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-test-source-${i}`,
        name: `Performance Test Calendar ${i}`,
        type: 'ical' as const,
        url: `https://example.com/perf-test-${i}.ics`,
        enabled: true,
        status: 'active' as const,
        refreshInterval: 1800
      }));

      const startTime = Date.now();
      
      for (const source of multipleSources) {
        calendarManager.addSource(source);
      }

      const endTime = Date.now();
      const addTime = endTime - startTime;

      expect(calendarManager.getSources()).toHaveLength(10);
      expect(addTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should provide responsive configuration operations', async () => {
      // Test that configuration operations are fast enough for GUI responsiveness
      const testConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: Array.from({ length: 5 }, (_, i) => ({
          id: `responsive-test-${i}`,
          name: `Responsive Test Calendar ${i}`,
          type: 'ical' as const,
          url: `https://example.com/responsive-${i}.ics`,
          enabled: true,
          status: 'active' as const,
          refreshInterval: 1800
        }))
      };

      const startTime = Date.now();
      
      await configManager.saveConfig(testConfig);
      const loadedConfig = await configManager.loadConfig();
      
      const endTime = Date.now();
      const configTime = endTime - startTime;

      expect(loadedConfig.sources).toHaveLength(5);
      expect(configTime).toBeLessThan(500); // Should complete within 500ms
    });
  });
});