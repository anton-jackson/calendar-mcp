/**
 * Event caching system with in-memory and persistent storage
 */

import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
type Database = sqlite3.Database;
import { promisify } from 'util';
import { NormalizedEvent, DateRange } from '../types/calendar.js';
import { CacheConfig, CachedEvent, CacheEntry, CacheStats, CacheQuery } from '../types/cache.js';

export class EventCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private db: Database;
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;

  private initPromise: Promise<void>;

  constructor(dbPath: string, config: CacheConfig) {
    this.config = config;
    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      persistentHits: 0,
      persistentMisses: 0,
      totalEvents: 0,
      memoryEvents: 0,
      persistentEvents: 0
    };

    this.db = new Database(dbPath);
    this.initPromise = this.initializeDatabase();
    this.startCleanupTimer();
  }

  private async initializeDatabase(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    // Create events table
    await run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        location_name TEXT,
        location_address TEXT,
        location_lat REAL,
        location_lng REAL,
        organizer_name TEXT,
        organizer_email TEXT,
        categories TEXT,
        recurrence TEXT,
        url TEXT,
        last_modified INTEGER NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    // Create indexes separately
    await run(`CREATE INDEX IF NOT EXISTS idx_events_source_id ON events(source_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at)`);

    await run(`
      CREATE TABLE IF NOT EXISTS cache_metadata (
        key TEXT PRIMARY KEY,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval * 1000);
  }

  private generateCacheKey(query: CacheQuery): string {
    const parts = [
      query.sourceIds?.sort().join(',') || 'all',
      query.dateRange ? `${query.dateRange.start.getTime()}-${query.dateRange.end.getTime()}` : 'norange',
      query.keywords?.sort().join(',') || 'nokeywords',
      query.categories?.sort().join(',') || 'nocategories'
    ];
    return parts.join('|');
  }

  async getEvents(query: CacheQuery): Promise<NormalizedEvent[] | null> {
    await this.initPromise;
    
    const cacheKey = this.generateCacheKey(query);
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && memoryEntry.expiresAt > new Date()) {
      this.stats.memoryHits++;
      return memoryEntry.data;
    }
    this.stats.memoryMisses++;

    // Check persistent cache
    const persistentEvents = await this.getFromPersistentCache(query);
    if (persistentEvents) {
      this.stats.persistentHits++;
      // Store in memory cache for faster access
      this.setInMemoryCache(cacheKey, persistentEvents);
      return persistentEvents;
    }
    this.stats.persistentMisses++;

    return null;
  }

  async getEventById(eventId: string): Promise<NormalizedEvent | null> {
    await this.initPromise;
    
    // Check memory cache first
    for (const entry of this.memoryCache.values()) {
      if (entry.expiresAt > new Date()) {
        const event = entry.data.find(e => e.id === eventId);
        if (event) {
          this.stats.memoryHits++;
          return event;
        }
      }
    }
    this.stats.memoryMisses++;

    // Check persistent cache
    const get = promisify(this.db.get.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
    const now = Date.now();

    try {
      const row = await get(`
        SELECT * FROM events 
        WHERE id = ? AND expires_at > ?
      `, [eventId, now]);

      if (row) {
        this.stats.persistentHits++;
        return this.rowToEvent(row);
      }
    } catch (error) {
      console.error('Error querying event by ID from persistent cache:', error);
    }

    this.stats.persistentMisses++;
    return null;
  }

  async setEvents(query: CacheQuery, events: NormalizedEvent[]): Promise<void> {
    await this.initPromise;
    
    const cacheKey = this.generateCacheKey(query);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.memoryTtl * 1000);

    // Store in memory cache
    this.setInMemoryCache(cacheKey, events, expiresAt);

    // Store in persistent cache
    await this.setInPersistentCache(events, expiresAt);
    
    this.updateStats();
  }

  private setInMemoryCache(key: string, events: NormalizedEvent[], expiresAt?: Date): void {
    const expires = expiresAt || new Date(Date.now() + this.config.memoryTtl * 1000);
    
    this.memoryCache.set(key, {
      key,
      data: events,
      cachedAt: new Date(),
      expiresAt: expires
    });

    // Enforce memory limits
    if (this.memoryCache.size > this.config.maxMemoryEvents) {
      this.evictOldestMemoryEntries();
    }
  }

  private evictOldestMemoryEntries(): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime());
    
    const toRemove = entries.length - this.config.maxMemoryEvents;
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  private async getFromPersistentCache(query: CacheQuery): Promise<NormalizedEvent[] | null> {
    const get = promisify(this.db.all.bind(this.db)) as (sql: string, params?: any[]) => Promise<any[]>;
    const now = Date.now();

    let sql = `
      SELECT * FROM events 
      WHERE expires_at > ?
    `;
    const params: any[] = [now];

    if (query.sourceIds && query.sourceIds.length > 0) {
      sql += ` AND source_id IN (${query.sourceIds.map(() => '?').join(',')})`;
      params.push(...query.sourceIds);
    }

    if (query.dateRange) {
      sql += ` AND start_date <= ? AND end_date >= ?`;
      params.push(query.dateRange.end.getTime(), query.dateRange.start.getTime());
    }

    sql += ` ORDER BY start_date ASC`;

    try {
      const rows = await get(sql, params);
      if (rows.length === 0) return null;

      const events = rows.map(row => this.rowToEvent(row));
      
      // Apply additional filters that can't be done in SQL
      return this.applyAdditionalFilters(events, query);
    } catch (error) {
      console.error('Error querying persistent cache:', error);
      return null;
    }
  }

  private applyAdditionalFilters(events: NormalizedEvent[], query: CacheQuery): NormalizedEvent[] {
    let filtered = events;

    if (query.keywords && query.keywords.length > 0) {
      filtered = filtered.filter(event => {
        const searchText = `${event.title} ${event.description || ''}`.toLowerCase();
        return query.keywords!.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );
      });
    }

    if (query.categories && query.categories.length > 0) {
      filtered = filtered.filter(event => 
        event.categories.some(cat => 
          query.categories!.includes(cat)
        )
      );
    }

    return filtered;
  }

  private async setInPersistentCache(events: NormalizedEvent[], memoryExpiresAt: Date): Promise<void> {
    const run = promisify(this.db.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
    const persistentExpiresAt = new Date(Date.now() + this.config.persistentTtl * 1000);

    for (const event of events) {
      const params = [
        event.id,
        event.sourceId,
        event.title,
        event.description || null,
        event.startDate.getTime(),
        event.endDate.getTime(),
        event.location?.name || null,
        event.location?.address || null,
        event.location?.coordinates?.lat || null,
        event.location?.coordinates?.lng || null,
        event.organizer?.name || null,
        event.organizer?.email || null,
        JSON.stringify(event.categories),
        event.recurrence ? JSON.stringify(event.recurrence) : null,
        event.url || null,
        event.lastModified.getTime(),
        Date.now(),
        persistentExpiresAt.getTime()
      ];

      await run(`
        INSERT OR REPLACE INTO events (
          id, source_id, title, description, start_date, end_date,
          location_name, location_address, location_lat, location_lng,
          organizer_name, organizer_email, categories, recurrence, url,
          last_modified, cached_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, params);
    }
  }

  private rowToEvent(row: any): NormalizedEvent {
    return {
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      description: row.description,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      location: row.location_name ? {
        name: row.location_name,
        address: row.location_address,
        coordinates: row.location_lat && row.location_lng ? {
          lat: row.location_lat,
          lng: row.location_lng
        } : undefined
      } : undefined,
      organizer: row.organizer_name ? {
        name: row.organizer_name,
        email: row.organizer_email
      } : undefined,
      categories: JSON.parse(row.categories || '[]'),
      recurrence: row.recurrence ? JSON.parse(row.recurrence) : undefined,
      url: row.url,
      lastModified: new Date(row.last_modified)
    };
  }

  async invalidateSource(sourceId: string): Promise<void> {
    await this.initPromise;
    
    // Check if database is still available
    if (!this.db) {
      return;
    }
    
    // Remove from memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.data.some(event => event.sourceId === sourceId)) {
        this.memoryCache.delete(key);
      }
    }

    try {
      // Remove from persistent cache
      const run = promisify(this.db.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
      await run('DELETE FROM events WHERE source_id = ?', [sourceId]);
      
      this.updateStats();
    } catch (error) {
      // Ignore errors if database is closed
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'SQLITE_MISUSE') {
        throw error;
      }
    }
  }

  async invalidateExpired(): Promise<void> {
    await this.initPromise;
    
    const now = Date.now();
    
    // Remove expired entries from memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt.getTime() <= now) {
        this.memoryCache.delete(key);
      }
    }

    // Remove expired entries from persistent cache
    const run = promisify(this.db.run.bind(this.db)) as (sql: string, params?: any[]) => Promise<any>;
    await run('DELETE FROM events WHERE expires_at <= ?', [now]);
    
    this.updateStats();
  }

  private async cleanup(): Promise<void> {
    try {
      await this.invalidateExpired();
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  async forceCleanup(): Promise<void> {
    await this.cleanup();
  }

  private updateStats(): void {
    this.stats.memoryEvents = this.memoryCache.size;
    // Note: persistentEvents count would require a DB query, 
    // so we'll update it only when specifically requested
  }

  async getStats(): Promise<CacheStats> {
    await this.initPromise;
    
    const get = promisify(this.db.get.bind(this.db)) as (sql: string) => Promise<any>;
    const result = await get('SELECT COUNT(*) as count FROM events');
    
    return {
      ...this.stats,
      persistentEvents: result?.count || 0,
      totalEvents: this.stats.memoryEvents + (result?.count || 0)
    };
  }

  /**
   * Clear all cached data (both memory and persistent)
   */
  async clear(): Promise<void> {
    try {
      await this.initPromise;
    } catch (error) {
      // Ignore initialization errors
    }

    // Clear memory cache
    this.memoryCache.clear();

    // Clear persistent cache
    try {
      const run = promisify(this.db.run.bind(this.db));
      await run('DELETE FROM events');
    } catch (error) {
      console.error('Error clearing persistent cache:', error);
    }

    this.updateStats();
  }

  async close(): Promise<void> {
    try {
      await this.initPromise;
    } catch (error) {
      // Ignore initialization errors during close
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      
      this.db.close((err: any) => {
        if (err && (err as any).code !== 'SQLITE_MISUSE') {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}