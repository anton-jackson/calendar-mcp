/**
 * Integration tests for HTTP Bridge GUI-Server communication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HTTPBridge, BridgeConfig } from '../HTTPBridge.js';
import { ConfigManager } from '../../services/ConfigManager.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { EventCache } from '../../services/EventCache.js';
import { CalendarSource } from '../../types/calendar.js';

describe('HTTPBridge Integration Tests', () => {
  let httpBridge: HTTPBridge;
  let configManager: ConfigManager;
  let calendarManager: CalendarManager;
  let eventCache: EventCache;
  let testPort: number;

  beforeEach(async () => {
    // Use a random port for testing
    testPort = 3000 + Math.floor(Math.random() * 1000);
    
    // Initialize services
    configManager = new ConfigManager();
    eventCache = new EventCache(':memory:', {
      memoryTtl: 3600,
      persistentTtl: 86400,
      maxMemoryEvents: 1000,
      cleanupInterval: 300
    }); // Use in-memory database for testing
    calendarManager = new CalendarManager(eventCache);
    
    // Mock configuration loading
    vi.spyOn(configManager, 'loadConfig').mockResolvedValue({
      server: {
        port: 3000,
        autoStart: true,
        cacheTimeout: 3600
      },
      sources: []
    });
    
    vi.spyOn(configManager, 'getConfig').mockReturnValue({
      server: {
        port: 3000,
        autoStart: true,
        cacheTimeout: 3600
      },
      sources: []
    });

    const bridgeConfig: BridgeConfig = {
      port: testPort,
      host: 'localhost'
    };

    httpBridge = new HTTPBridge(configManager, calendarManager, bridgeConfig);
    await httpBridge.start();
    
    // Small delay to ensure server is fully ready
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    if (httpBridge) {
      await httpBridge.stop();
    }
    vi.restoreAllMocks();
  });

  describe('Server Status API', () => {
    it('should return server status', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/status`);
      expect(response.status).toBe(200);
      
      const status = await response.json();
      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('serverStatus', 'running');
      expect(status).toHaveProperty('sources');
      expect(Array.isArray(status.sources)).toBe(true);
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/status`, {
        method: 'OPTIONS'
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Configuration API', () => {
    it('should return current configuration', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/config`);
      expect(response.status).toBe(200);
      
      const config = await response.json();
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('sources');
      expect(config.server).toHaveProperty('port', 3000);
      expect(config.server).toHaveProperty('autoStart', true);
    });

    it('should update server configuration', async () => {
      const updateData = {
        server: {
          port: 3000,
          autoStart: false,
          cacheTimeout: 7200
        }
      };

      vi.spyOn(configManager, 'updateServerConfig').mockResolvedValue();
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        server: updateData.server,
        sources: []
      });

      const response = await fetch(`http://localhost:${testPort}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      expect(response.status).toBe(200);
      const updatedConfig = await response.json();
      expect(updatedConfig.server.autoStart).toBe(false);
      expect(updatedConfig.server.cacheTimeout).toBe(7200);
    });
  });

  describe('Calendar Sources API', () => {
    const testSource: CalendarSource = {
      id: 'test-source-1',
      name: 'Test Calendar',
      type: 'ical',
      url: 'https://example.com/calendar.ics',
      enabled: true,
      status: 'active',
      refreshInterval: 1800
    };

    it('should return empty sources list initially', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/sources`);
      expect(response.status).toBe(200);
      
      const sources = await response.json();
      expect(Array.isArray(sources)).toBe(true);
      expect(sources).toHaveLength(0);
    });

    it('should add a new calendar source', async () => {
      vi.spyOn(configManager, 'addCalendarSource').mockResolvedValue();
      vi.spyOn(calendarManager, 'reloadSources').mockResolvedValue();

      const sourceData = {
        name: testSource.name,
        type: testSource.type,
        url: testSource.url,
        enabled: testSource.enabled,
        refreshInterval: testSource.refreshInterval
      };

      const response = await fetch(`http://localhost:${testPort}/api/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sourceData)
      });

      expect(response.status).toBe(201);
      const addedSource = await response.json();
      expect(addedSource).toHaveProperty('id');
      expect(addedSource.name).toBe(testSource.name);
      expect(addedSource.type).toBe(testSource.type);
      expect(addedSource.url).toBe(testSource.url);
    });

    it('should update an existing calendar source', async () => {
      vi.spyOn(configManager, 'updateCalendarSource').mockResolvedValue();
      vi.spyOn(calendarManager, 'reloadSources').mockResolvedValue();
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [{ ...testSource, name: 'Updated Calendar', refreshInterval: 3600 }]
      });

      const updateData = {
        name: 'Updated Calendar',
        type: testSource.type,
        url: testSource.url,
        enabled: testSource.enabled,
        refreshInterval: 3600
      };

      const response = await fetch(`http://localhost:${testPort}/api/sources/${testSource.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      expect(response.status).toBe(200);
      const updatedSource = await response.json();
      expect(updatedSource.name).toBe('Updated Calendar');
      expect(updatedSource.refreshInterval).toBe(3600);
    });

    it('should delete a calendar source', async () => {
      vi.spyOn(configManager, 'removeCalendarSource').mockResolvedValue();
      vi.spyOn(calendarManager, 'reloadSources').mockResolvedValue();

      const response = await fetch(`http://localhost:${testPort}/api/sources/${testSource.id}`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(204);
      expect(configManager.removeCalendarSource).toHaveBeenCalledWith(testSource.id);
      expect(calendarManager.reloadSources).toHaveBeenCalled();
    });

    it('should test a calendar source connection', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [testSource]
      });

      vi.spyOn(calendarManager, 'testSource').mockResolvedValue({
        success: true,
        responseTime: 250
      });

      const response = await fetch(`http://localhost:${testPort}/api/sources/${testSource.id}/test`, {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      const testResult = await response.json();
      expect(testResult.success).toBe(true);
      expect(testResult.responseTime).toBe(250);
    });

    it('should handle test for non-existent source', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/sources/non-existent/test`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBe('Source not found');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/unknown`);
      expect(response.status).toBe(404);
      
      const error = await response.json();
      expect(error.error).toBe('Not found');
    });

    it('should handle malformed JSON in requests', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Unexpected token');
    });

    it('should handle configuration manager errors', async () => {
      vi.spyOn(configManager, 'updateServerConfig').mockRejectedValue(new Error('Config error'));

      const response = await fetch(`http://localhost:${testPort}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ server: { port: 3001 } })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBe('Config error');
    });
  });

  describe('Real-time Status Updates', () => {
    it('should support status update listeners', async () => {
      const statusUpdates: any[] = [];
      
      httpBridge.addStatusListener((status) => {
        statusUpdates.push(status);
      });

      // Trigger a status fetch to generate an update
      await fetch(`http://localhost:${testPort}/api/status`);

      expect(statusUpdates).toHaveLength(1);
      expect(statusUpdates[0]).toHaveProperty('serverStatus', 'running');
      expect(statusUpdates[0]).toHaveProperty('sources');
    });

    it('should remove status update listeners', async () => {
      const statusUpdates: any[] = [];
      
      const listener = (status: any) => {
        statusUpdates.push(status);
      };

      httpBridge.addStatusListener(listener);
      httpBridge.removeStatusListener(listener);

      // Trigger a status fetch
      await fetch(`http://localhost:${testPort}/api/status`);

      expect(statusUpdates).toHaveLength(0);
    });
  });

  describe('Dynamic Configuration Updates', () => {
    it('should apply configuration changes without server restart', async () => {
      const initialConfig = {
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: []
      };

      vi.spyOn(configManager, 'getConfig').mockReturnValue(initialConfig);

      // Get initial config
      let response = await fetch(`http://localhost:${testPort}/api/config`);
      let config = await response.json();
      expect(config.server.cacheTimeout).toBe(3600);

      // Update config
      const updatedConfig = {
        ...initialConfig,
        server: {
          ...initialConfig.server,
          cacheTimeout: 7200
        }
      };

      vi.spyOn(configManager, 'updateServerConfig').mockResolvedValue();
      vi.spyOn(configManager, 'getConfig').mockReturnValue(updatedConfig);

      response = await fetch(`http://localhost:${testPort}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ server: { cacheTimeout: 7200 } })
      });

      expect(response.status).toBe(200);
      config = await response.json();
      expect(config.server.cacheTimeout).toBe(7200);

      // Verify the HTTP bridge is still running (no restart required)
      response = await fetch(`http://localhost:${testPort}/api/status`);
      expect(response.status).toBe(200);
    });
  });
});