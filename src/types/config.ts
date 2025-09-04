import { CalendarSource } from './calendar.js';

/**
 * Configuration types for the MCP server
 */

export interface ServerConfig {
  port: number;
  autoStart: boolean;
  cacheTimeout: number;
  cache?: {
    memoryTtl: number;
    persistentTtl: number;
    maxMemoryEvents: number;
    cleanupInterval: number;
  };
}

export interface AppConfig {
  server: ServerConfig;
  sources: CalendarSource[];
}

export interface ConfigValidationError {
  field: string;
  message: string;
  value?: any;
}