import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../ConfigManager.js';
import { CalendarSource } from '../../types/calendar.js';

// Integration tests that use real file system operations
describe('ConfigManager Integration', () => {
  let configManager: ConfigManager;
  let testConfigDir: string;
  let originalConfigPath: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testConfigDir = join(tmpdir(), 'test-calendar-mcp-' + Date.now());
    await fs.mkdir(testConfigDir, { recursive: true });
    
    // Create ConfigManager and override the config path for testing
    configManager = new ConfigManager();
    originalConfigPath = (configManager as any).configPath;
    (configManager as any).configPath = join(testConfigDir, 'config.json');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should create and persist configuration to real file system', async () => {
    // Load config (should create default)
    const config = await configManager.loadConfig();
    
    expect(config.server.port).toBe(3000);
    expect(config.sources).toEqual([]);
    
    // Verify file was created
    const configPath = join(testConfigDir, 'config.json');
    const fileExists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
    
    // Read and verify file contents
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const parsedContent = JSON.parse(fileContent);
    expect(parsedContent).toEqual(config);
  });

  it('should persist configuration changes', async () => {
    // Load initial config
    await configManager.loadConfig();
    
    // Add a calendar source
    const testSource: CalendarSource = {
      id: 'test-integration',
      name: 'Integration Test Calendar',
      type: 'ical',
      url: 'https://example.com/test.ics',
      enabled: true,
      refreshInterval: 3600
    };
    
    await configManager.addCalendarSource(testSource);
    
    // Create a new ConfigManager instance to test persistence
    const newConfigManager = new ConfigManager();
    (newConfigManager as any).configPath = join(testConfigDir, 'config.json');
    
    const loadedConfig = await newConfigManager.loadConfig();
    expect(loadedConfig.sources).toHaveLength(1);
    expect(loadedConfig.sources[0]).toEqual(testSource);
  });

  it('should handle configuration updates and notify listeners', async () => {
    await configManager.loadConfig();
    
    let notificationReceived = false;
    let notifiedConfig: any = null;
    
    configManager.addConfigListener((config) => {
      notificationReceived = true;
      notifiedConfig = config;
    });
    
    // Update server config
    await configManager.updateServerConfig({ port: 4000 });
    
    expect(notificationReceived).toBe(true);
    expect(notifiedConfig.server.port).toBe(4000);
    
    // Verify persistence
    const newConfigManager = new ConfigManager();
    (newConfigManager as any).configPath = join(testConfigDir, 'config.json');
    const reloadedConfig = await newConfigManager.loadConfig();
    expect(reloadedConfig.server.port).toBe(4000);
  });
});