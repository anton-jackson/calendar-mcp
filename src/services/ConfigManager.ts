import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { AppConfig, ServerConfig, ConfigValidationError } from '../types/config.js';
import { CalendarSource } from '../types/calendar.js';

export class ConfigManager {
  private configPath: string;
  private config: AppConfig | null = null;
  private listeners: Array<(config: AppConfig) => void> = [];

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath;
    } else {
      // Store config in macOS Application Support directory
      const appSupportDir = join(homedir(), 'Library', 'Application Support', 'PublicCalendarMCP');
      this.configPath = join(appSupportDir, 'config.json');
    }
  }

  /**
   * Load configuration from disk
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      await this.ensureConfigDirectory();
      
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const parsedConfig = JSON.parse(configData);
        
        // Validate the loaded configuration
        const validationErrors = this.validateConfig(parsedConfig);
        if (validationErrors.length > 0) {
          throw new Error(`Configuration validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
        }
        
        this.config = parsedConfig;
        return this.config!;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // Config file doesn't exist, create default
          this.config = this.getDefaultConfig();
          await this.saveConfig();
          return this.config!;
        }
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save configuration to disk
   */
  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    try {
      await this.ensureConfigDirectory();
      
      // Validate before saving
      const validationErrors = this.validateConfig(this.config);
      if (validationErrors.length > 0) {
        throw new Error(`Configuration validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
      }

      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf-8');
      
      // Notify listeners of config change
      this.notifyListeners();
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return { ...this.config }; // Return a copy to prevent external mutations
  }

  /**
   * Update server configuration
   */
  async updateServerConfig(serverConfig: Partial<ServerConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    this.config.server = { ...this.config.server, ...serverConfig };
    await this.saveConfig();
  }

  /**
   * Add a calendar source
   */
  async addCalendarSource(source: CalendarSource): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    // Check for duplicate IDs
    if (this.config.sources.some(s => s.id === source.id)) {
      throw new Error(`Calendar source with ID '${source.id}' already exists`);
    }

    this.config.sources.push(source);
    await this.saveConfig();
  }

  /**
   * Update a calendar source
   */
  async updateCalendarSource(sourceId: string, updates: Partial<CalendarSource>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    const sourceIndex = this.config.sources.findIndex(s => s.id === sourceId);
    if (sourceIndex === -1) {
      throw new Error(`Calendar source with ID '${sourceId}' not found`);
    }

    this.config.sources[sourceIndex] = { ...this.config.sources[sourceIndex], ...updates };
    await this.saveConfig();
  }

  /**
   * Remove a calendar source
   */
  async removeCalendarSource(sourceId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    const sourceIndex = this.config.sources.findIndex(s => s.id === sourceId);
    if (sourceIndex === -1) {
      throw new Error(`Calendar source with ID '${sourceId}' not found`);
    }

    this.config.sources.splice(sourceIndex, 1);
    await this.saveConfig();
  }

  /**
   * Add a listener for configuration changes
   */
  addConfigListener(listener: (config: AppConfig) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a configuration change listener
   */
  removeConfigListener(listener: (config: AppConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Validate configuration object
   */
  validateConfig(config: any): ConfigValidationError[] {
    const errors: ConfigValidationError[] = [];

    // Validate root structure
    if (!config || typeof config !== 'object') {
      errors.push({ field: 'root', message: 'Configuration must be an object' });
      return errors;
    }

    // Validate server config
    if (!config.server || typeof config.server !== 'object') {
      errors.push({ field: 'server', message: 'Server configuration is required and must be an object' });
    } else {
      const server = config.server;
      
      if (typeof server.port !== 'number' || server.port < 1 || server.port > 65535) {
        errors.push({ field: 'server.port', message: 'Port must be a number between 1 and 65535', value: server.port });
      }
      
      if (typeof server.autoStart !== 'boolean') {
        errors.push({ field: 'server.autoStart', message: 'autoStart must be a boolean', value: server.autoStart });
      }
      
      if (typeof server.cacheTimeout !== 'number' || server.cacheTimeout < 0) {
        errors.push({ field: 'server.cacheTimeout', message: 'cacheTimeout must be a non-negative number', value: server.cacheTimeout });
      }
    }

    // Validate sources array
    if (!Array.isArray(config.sources)) {
      errors.push({ field: 'sources', message: 'Sources must be an array' });
    } else {
      config.sources.forEach((source: any, index: number) => {
        const prefix = `sources[${index}]`;
        
        if (!source || typeof source !== 'object') {
          errors.push({ field: prefix, message: 'Source must be an object' });
          return;
        }
        
        if (!source.id || typeof source.id !== 'string') {
          errors.push({ field: `${prefix}.id`, message: 'Source ID is required and must be a string', value: source.id });
        }
        
        if (!source.name || typeof source.name !== 'string') {
          errors.push({ field: `${prefix}.name`, message: 'Source name is required and must be a string', value: source.name });
        }
        
        if (!['ical', 'caldav', 'google'].includes(source.type)) {
          errors.push({ field: `${prefix}.type`, message: 'Source type must be one of: ical, caldav, google', value: source.type });
        }
        
        if (!source.url || typeof source.url !== 'string') {
          errors.push({ field: `${prefix}.url`, message: 'Source URL is required and must be a string', value: source.url });
        }
        
        if (typeof source.enabled !== 'boolean') {
          errors.push({ field: `${prefix}.enabled`, message: 'Source enabled must be a boolean', value: source.enabled });
        }
        
        if (typeof source.refreshInterval !== 'number' || source.refreshInterval < 0) {
          errors.push({ field: `${prefix}.refreshInterval`, message: 'refreshInterval must be a non-negative number', value: source.refreshInterval });
        }
      });
    }

    return errors;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AppConfig {
    return {
      server: {
        port: 3000,
        autoStart: true,
        cacheTimeout: 3600 // 1 hour
      },
      sources: []
    };
  }

  /**
   * Ensure configuration directory exists
   */
  private async ensureConfigDirectory(): Promise<void> {
    const configDir = join(homedir(), 'Library', 'Application Support', 'PublicCalendarMCP');
    try {
      await fs.mkdir(configDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(): void {
    if (this.config) {
      this.listeners.forEach(listener => {
        try {
          listener({ ...this.config! });
        } catch (error) {
          console.error('Error in config listener:', error);
        }
      });
    }
  }
}