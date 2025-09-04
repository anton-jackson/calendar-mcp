/**
 * Cache-related types and interfaces
 */

import { NormalizedEvent, DateRange } from './calendar.js';

export interface CacheConfig {
  memoryTtl: number; // Time to live in seconds for in-memory cache
  persistentTtl: number; // Time to live in seconds for persistent cache
  maxMemoryEvents: number; // Maximum number of events to keep in memory
  cleanupInterval: number; // Interval in seconds to run cleanup
}

export interface CachedEvent extends NormalizedEvent {
  cachedAt: Date;
  expiresAt: Date;
}

export interface CacheEntry {
  key: string;
  data: NormalizedEvent[];
  cachedAt: Date;
  expiresAt: Date;
}

export interface CacheStats {
  memoryHits: number;
  memoryMisses: number;
  persistentHits: number;
  persistentMisses: number;
  totalEvents: number;
  memoryEvents: number;
  persistentEvents: number;
}

export interface CacheQuery {
  sourceIds?: string[];
  dateRange?: DateRange;
  keywords?: string[];
  categories?: string[];
}