import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ConfigManager } from '../ConfigManager.js';
import { AppConfig, ServerConfig } from '../../types/config.js';
import { CalendarSource } from '../../types/calendar.js';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn()
  }
}));

// Mock os module  
vi.mock('os', () => ({
  homedir: vi.fn()
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockFs = fs as any;
  const mockHomedir = homedir as any;
  const expectedConfigPath = join('/Users/testuser', 'Library', 'Application Support', 'PublicCalendarMCP', 'config.json');

  beforeEach(() => {
    mockHomedir.mockReturnValue('/Users/testuser');
    configManager = new ConfigManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadConfig', () => {
    it('should load existing configuration from file', async () => {
      const mockConfig: AppConfig = {
        server: {
          port: 3001,
          autoStart: false,
          cacheTimeout: 7200
        },
        sources: [
          {
            id: 'test-source',
            name: 'Test Calendar',
            type: 'ical',
            url: 'https://example.com/calendar.ics',
            enabled: true,
            refreshInterval: 1800
          }
        ]
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.loadConfig();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join('/Users/testuser', 'Library', 'Application Support', 'PublicCalendarMCP'),
        { recursive: true }
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedConfigPath, 'utf-8');
      expect(result).toEqual(mockConfig);
    });

    it('should create default configuration when file does not exist', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await configManager.loadConfig();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedConfigPath,
        expect.stringContaining('"port": 3000'),
        'utf-8'
      );
      expect(result.server.port).toBe(3000);
      expect(result.server.autoStart).toBe(true);
      expect(result.server.cacheTimeout).toBe(3600);
      expect(result.sources).toEqual([]);
    });

    it('should throw error for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(configManager.loadConfig()).rejects.toThrow('Failed to load configuration');
    });

    it('should throw error for invalid configuration structure', async () => {
      const invalidConfig = {
        server: {
          port: 'invalid', // should be number
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: []
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('saveConfig', () => {
    beforeEach(async () => {
      // Load a default config first
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      await configManager.loadConfig();
      vi.clearAllMocks();
    });

    it('should save configuration to file', async () => {
      await configManager.saveConfig();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedConfigPath,
        expect.stringContaining('"port": 3000'),
        'utf-8'
      );
    });

    it('should throw error when no configuration is loaded', async () => {
      const freshConfigManager = new ConfigManager();
      
      await expect(freshConfigManager.saveConfig()).rejects.toThrow('No configuration to save');
    });

    it('should validate configuration before saving', async () => {
      // Manually corrupt the config to test validation
      const config = configManager.getConfig();
      (config.server as any).port = 'invalid';
      
      // We need to access the private config property to test this
      (configManager as any).config = config;

      await expect(configManager.saveConfig()).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('getConfig', () => {
    it('should return configuration copy', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      await configManager.loadConfig();

      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    it('should throw error when configuration not loaded', () => {
      expect(() => configManager.getConfig()).toThrow('Configuration not loaded');
    });
  });

  describe('updateServerConfig', () => {
    beforeEach(async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      await configManager.loadConfig();
      vi.clearAllMocks();
    });

    it('should update server configuration', async () => {
      const updates: Partial<ServerConfig> = {
        port: 4000,
        cacheTimeout: 7200
      };

      await configManager.updateServerConfig(updates);

      const config = configManager.getConfig();
      expect(config.server.port).toBe(4000);
      expect(config.server.cacheTimeout).toBe(7200);
      expect(config.server.autoStart).toBe(true); // Should remain unchanged
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('calendar source management', () => {
    let testSource: CalendarSource;

    beforeEach(async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      await configManager.loadConfig();
      vi.clearAllMocks();

      testSource = {
        id: 'test-source-1',
        name: 'Test Calendar',
        type: 'ical',
        url: 'https://example.com/calendar.ics',
        enabled: true,
        refreshInterval: 1800
      };
    });

    describe('addCalendarSource', () => {
      it('should add calendar source', async () => {
        await configManager.addCalendarSource(testSource);

        const config = configManager.getConfig();
        expect(config.sources).toHaveLength(1);
        expect(config.sources[0]).toEqual(testSource);
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it('should throw error for duplicate source ID', async () => {
        await configManager.addCalendarSource(testSource);
        vi.clearAllMocks();

        await expect(configManager.addCalendarSource(testSource))
          .rejects.toThrow("Calendar source with ID 'test-source-1' already exists");
        expect(mockFs.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('updateCalendarSource', () => {
      beforeEach(async () => {
        await configManager.addCalendarSource(testSource);
        vi.clearAllMocks();
      });

      it('should update calendar source', async () => {
        const updates = {
          name: 'Updated Calendar',
          enabled: false
        };

        await configManager.updateCalendarSource('test-source-1', updates);

        const config = configManager.getConfig();
        expect(config.sources[0].name).toBe('Updated Calendar');
        expect(config.sources[0].enabled).toBe(false);
        expect(config.sources[0].url).toBe(testSource.url); // Should remain unchanged
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it('should throw error for non-existent source', async () => {
        await expect(configManager.updateCalendarSource('non-existent', { name: 'Test' }))
          .rejects.toThrow("Calendar source with ID 'non-existent' not found");
        expect(mockFs.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('removeCalendarSource', () => {
      beforeEach(async () => {
        await configManager.addCalendarSource(testSource);
        vi.clearAllMocks();
      });

      it('should remove calendar source', async () => {
        await configManager.removeCalendarSource('test-source-1');

        const config = configManager.getConfig();
        expect(config.sources).toHaveLength(0);
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it('should throw error for non-existent source', async () => {
        await expect(configManager.removeCalendarSource('non-existent'))
          .rejects.toThrow("Calendar source with ID 'non-existent' not found");
        expect(mockFs.writeFile).not.toHaveBeenCalled();
      });
    });
  });

  describe('configuration listeners', () => {
    beforeEach(async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      await configManager.loadConfig();
      vi.clearAllMocks();
    });

    it('should notify listeners on configuration changes', async () => {
      const listener = vi.fn();
      configManager.addConfigListener(listener);

      await configManager.updateServerConfig({ port: 4000 });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({ port: 4000 })
      }));
    });

    it('should remove listeners', async () => {
      const listener = vi.fn();
      configManager.addConfigListener(listener);
      configManager.removeConfigListener(listener);

      await configManager.updateServerConfig({ port: 4000 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = vi.fn(() => { throw new Error('Listener error'); });
      const goodListener = vi.fn();
      
      configManager.addConfigListener(errorListener);
      configManager.addConfigListener(goodListener);

      // Should not throw despite listener error
      await configManager.updateServerConfig({ port: 4000 });

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const validConfig: AppConfig = {
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: 'test',
            name: 'Test',
            type: 'ical',
            url: 'https://example.com',
            enabled: true,
            refreshInterval: 1800
          }
        ]
      };

      const errors = configManager.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for invalid root structure', () => {
      const errors = configManager.validateConfig(null);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('root');
    });

    it('should return errors for invalid server config', () => {
      const invalidConfig = {
        server: {
          port: 'invalid',
          autoStart: 'not-boolean',
          cacheTimeout: -1
        },
        sources: []
      };

      const errors = configManager.validateConfig(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'server.port')).toBe(true);
      expect(errors.some(e => e.field === 'server.autoStart')).toBe(true);
      expect(errors.some(e => e.field === 'server.cacheTimeout')).toBe(true);
    });

    it('should return errors for invalid sources', () => {
      const invalidConfig = {
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: [
          {
            id: '',
            name: '',
            type: 'invalid-type',
            url: '',
            enabled: 'not-boolean',
            refreshInterval: -1
          }
        ]
      };

      const errors = configManager.validateConfig(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'sources[0].id')).toBe(true);
      expect(errors.some(e => e.field === 'sources[0].name')).toBe(true);
      expect(errors.some(e => e.field === 'sources[0].type')).toBe(true);
      expect(errors.some(e => e.field === 'sources[0].url')).toBe(true);
      expect(errors.some(e => e.field === 'sources[0].enabled')).toBe(true);
      expect(errors.some(e => e.field === 'sources[0].refreshInterval')).toBe(true);
    });

    it('should return error for non-array sources', () => {
      const invalidConfig = {
        server: {
          port: 3000,
          autoStart: true,
          cacheTimeout: 3600
        },
        sources: 'not-an-array'
      };

      const errors = configManager.validateConfig(invalidConfig);
      expect(errors.some(e => e.field === 'sources')).toBe(true);
    });
  });
});