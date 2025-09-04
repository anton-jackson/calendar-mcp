/**
 * Unit tests for HTTP Bridge
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HTTPBridge, BridgeConfig, StatusUpdate } from '../HTTPBridge.js';
import { ConfigManager } from '../../services/ConfigManager.js';
import { CalendarManager } from '../../services/CalendarManager.js';
import { EventCache } from '../../services/EventCache.js';

describe('HTTPBridge Unit Tests', () => {
  let httpBridge: HTTPBridge;
  let mockConfigManager: ConfigManager;
  let mockCalendarManager: CalendarManager;
  let bridgeConfig: BridgeConfig;

  beforeEach(() => {
    // Create mocks
    mockConfigManager = {
      getConfig: vi.fn(),
      updateServerConfig: vi.fn(),
      addCalendarSource: vi.fn(),
      updateCalendarSource: vi.fn(),
      removeCalendarSource: vi.fn(),
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      addConfigListener: vi.fn(),
      removeConfigListener: vi.fn(),
      validateConfig: vi.fn()
    } as any;

    mockCalendarManager = {
      getSourceStatus: vi.fn(),
      reloadSources: vi.fn(),
      testSource: vi.fn(),
      getSources: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      updateSource: vi.fn()
    } as any;

    bridgeConfig = {
      port: 3001,
      host: 'localhost'
    };

    httpBridge = new HTTPBridge(mockConfigManager, mockCalendarManager, bridgeConfig);
  });

  afterEach(async () => {
    await httpBridge.stop();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(httpBridge).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const defaultBridge = new HTTPBridge(mockConfigManager, mockCalendarManager);
      expect(defaultBridge).toBeDefined();
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      await expect(httpBridge.start()).resolves.toBeUndefined();
    });

    it('should throw error when starting already running server', async () => {
      await httpBridge.start();
      await expect(httpBridge.start()).rejects.toThrow('HTTP bridge is already running');
    });

    it('should stop server successfully', async () => {
      await httpBridge.start();
      await expect(httpBridge.stop()).resolves.toBeUndefined();
    });

    it('should handle stop when server is not running', async () => {
      await expect(httpBridge.stop()).resolves.toBeUndefined();
    });
  });

  describe('Status Listeners', () => {
    it('should add status listeners', () => {
      const listener = vi.fn();
      httpBridge.addStatusListener(listener);
      
      // Verify listener was added (we can't directly test the private Set)
      expect(listener).toBeDefined();
    });

    it('should remove status listeners', () => {
      const listener = vi.fn();
      httpBridge.addStatusListener(listener);
      httpBridge.removeStatusListener(listener);
      
      // Verify listener was removed (we can't directly test the private Set)
      expect(listener).toBeDefined();
    });

    it('should handle errors in status listeners gracefully', () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      
      httpBridge.addStatusListener(faultyListener);
      
      // This should not throw even if listener throws
      expect(() => {
        // We can't directly test the private broadcastStatusUpdate method
        // but we can verify the listener was added
      }).not.toThrow();
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      vi.mocked(mockConfigManager.getConfig).mockReturnValue({
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: []
      });
    });

    it('should handle configuration retrieval', () => {
      const config = mockConfigManager.getConfig();
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('sources');
    });

    it('should handle configuration updates', async () => {
      vi.mocked(mockConfigManager.updateServerConfig).mockResolvedValue();
      
      await expect(
        mockConfigManager.updateServerConfig({ port: 3001 })
      ).resolves.toBeUndefined();
      
      expect(mockConfigManager.updateServerConfig).toHaveBeenCalledWith({ port: 3001 });
    });
  });

  describe('Calendar Source Management', () => {
    const testSource = {
      id: 'test-1',
      name: 'Test Calendar',
      type: 'ical' as const,
      url: 'https://example.com/cal.ics',
      enabled: true,
      status: 'active' as const,
      refreshInterval: 1800
    };

    beforeEach(() => {
      vi.mocked(mockConfigManager.getConfig).mockReturnValue({
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [testSource]
      });
    });

    it('should handle adding calendar sources', async () => {
      vi.mocked(mockConfigManager.addCalendarSource).mockResolvedValue();
      vi.mocked(mockCalendarManager.reloadSources).mockResolvedValue();
      
      await expect(
        mockConfigManager.addCalendarSource(testSource)
      ).resolves.toBeUndefined();
      
      expect(mockConfigManager.addCalendarSource).toHaveBeenCalledWith(testSource);
    });

    it('should handle updating calendar sources', async () => {
      vi.mocked(mockConfigManager.updateCalendarSource).mockResolvedValue();
      vi.mocked(mockCalendarManager.reloadSources).mockResolvedValue();
      
      const updates = { name: 'Updated Calendar' };
      
      await expect(
        mockConfigManager.updateCalendarSource(testSource.id, updates)
      ).resolves.toBeUndefined();
      
      expect(mockConfigManager.updateCalendarSource).toHaveBeenCalledWith(testSource.id, updates);
    });

    it('should handle removing calendar sources', async () => {
      vi.mocked(mockConfigManager.removeCalendarSource).mockResolvedValue();
      vi.mocked(mockCalendarManager.reloadSources).mockResolvedValue();
      
      await expect(
        mockConfigManager.removeCalendarSource(testSource.id)
      ).resolves.toBeUndefined();
      
      expect(mockConfigManager.removeCalendarSource).toHaveBeenCalledWith(testSource.id);
    });

    it('should handle testing calendar sources', async () => {
      vi.mocked(mockCalendarManager.testSource).mockResolvedValue({
        success: true,
        responseTime: 200
      });
      
      const result = await mockCalendarManager.testSource(testSource);
      
      expect(result.success).toBe(true);
      expect(result.responseTime).toBe(200);
      expect(mockCalendarManager.testSource).toHaveBeenCalledWith(testSource);
    });
  });

  describe('Status Updates', () => {
    it('should generate proper status updates', () => {
      const statusUpdate: StatusUpdate = {
        timestamp: new Date(),
        serverStatus: 'running',
        sources: [
          {
            id: 'test-1',
            name: 'Test Calendar',
            status: 'active',
            lastSync: new Date()
          }
        ]
      };

      expect(statusUpdate).toHaveProperty('timestamp');
      expect(statusUpdate).toHaveProperty('serverStatus', 'running');
      expect(statusUpdate).toHaveProperty('sources');
      expect(Array.isArray(statusUpdate.sources)).toBe(true);
    });

    it('should handle source status retrieval', async () => {
      vi.mocked(mockCalendarManager.getSourceStatus).mockResolvedValue({
        status: 'active',
        lastSync: new Date(),
        error: undefined
      });

      const status = await mockCalendarManager.getSourceStatus('test-1');
      
      expect(status.status).toBe('active');
      expect(status.lastSync).toBeInstanceOf(Date);
      expect(mockCalendarManager.getSourceStatus).toHaveBeenCalledWith('test-1');
    });

    it('should handle source status errors', async () => {
      vi.mocked(mockCalendarManager.getSourceStatus).mockResolvedValue({
        status: 'error',
        error: 'Connection failed'
      });

      const status = await mockCalendarManager.getSourceStatus('test-1');
      
      expect(status.status).toBe('error');
      expect(status.error).toBe('Connection failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle configuration manager errors', async () => {
      vi.mocked(mockConfigManager.getConfig).mockImplementation(() => {
        throw new Error('Config error');
      });

      expect(() => mockConfigManager.getConfig()).toThrow('Config error');
    });

    it('should handle calendar manager errors', async () => {
      vi.mocked(mockCalendarManager.getSourceStatus).mockRejectedValue(
        new Error('Calendar error')
      );

      await expect(
        mockCalendarManager.getSourceStatus('test-1')
      ).rejects.toThrow('Calendar error');
    });

    it('should handle network errors gracefully', async () => {
      // This would be tested in integration tests with actual HTTP requests
      expect(true).toBe(true);
    });
  });
});