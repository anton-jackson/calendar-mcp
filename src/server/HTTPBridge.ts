/**
 * HTTP Bridge for GUI-Server Communication
 * Provides REST API endpoints for the macOS GUI to communicate with the MCP server
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { ConfigManager } from '../services/ConfigManager.js';
import { CalendarManager } from '../services/CalendarManager.js';
import { CalendarSource, CalendarSourceStatus } from '../types/calendar.js';
import { AppConfig } from '../types/config.js';

export interface BridgeConfig {
  port: number;
  host: string;
}

export interface StatusUpdate {
  timestamp: Date;
  serverStatus: 'running' | 'error' | 'starting' | 'stopped';
  sources: Array<{
    id: string;
    name: string;
    status: CalendarSourceStatus;
    lastSync?: Date;
    error?: string;
  }>;
}

export class HTTPBridge {
  private server: ReturnType<typeof createServer> | null = null;
  private configManager: ConfigManager;
  private calendarManager: CalendarManager;
  private statusListeners: Set<(status: StatusUpdate) => void> = new Set();
  private config: BridgeConfig;

  constructor(
    configManager: ConfigManager,
    calendarManager: CalendarManager,
    config: BridgeConfig = { port: 3001, host: 'localhost' }
  ) {
    this.configManager = configManager;
    this.calendarManager = calendarManager;
    this.config = config;
  }

  /**
   * Start the HTTP bridge server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('HTTP bridge is already running');
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        console.error('Error handling HTTP bridge request:', error);
        this.sendErrorResponse(res, 500, 'Internal server error');
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`HTTP bridge listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  /**
   * Stop the HTTP bridge server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Add a status update listener
   */
  addStatusListener(listener: (status: StatusUpdate) => void): void {
    this.statusListeners.add(listener);
  }

  /**
   * Remove a status update listener
   */
  removeStatusListener(listener: (status: StatusUpdate) => void): void {
    this.statusListeners.delete(listener);
  }

  /**
   * Broadcast status update to all listeners
   */
  private broadcastStatusUpdate(status: StatusUpdate): void {
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Enable CORS for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method!;

    try {
      // Route requests to appropriate handlers
      if (path === '/api/status' && method === 'GET') {
        await this.handleGetStatus(req, res);
      } else if (path === '/api/config' && method === 'GET') {
        await this.handleGetConfig(req, res);
      } else if (path === '/api/config' && method === 'PUT') {
        await this.handleUpdateConfig(req, res);
      } else if (path === '/api/sources' && method === 'GET') {
        await this.handleGetSources(req, res);
      } else if (path === '/api/sources' && method === 'POST') {
        await this.handleAddSource(req, res);
      } else if (path.startsWith('/api/sources/') && method === 'PUT') {
        const sourceId = path.split('/')[3];
        await this.handleUpdateSource(req, res, sourceId);
      } else if (path.startsWith('/api/sources/') && method === 'DELETE') {
        const sourceId = path.split('/')[3];
        await this.handleDeleteSource(req, res, sourceId);
      } else if (path.startsWith('/api/sources/') && path.endsWith('/test') && method === 'POST') {
        const sourceId = path.split('/')[3];
        await this.handleTestSource(req, res, sourceId);
      } else {
        this.sendErrorResponse(res, 404, 'Not found');
      }
    } catch (error) {
      console.error('Request handler error:', error);
      this.sendErrorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }

  /**
   * Handle GET /api/status - Get server and source status
   */
  private async handleGetStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      const sourceStatuses = await Promise.all(
        config.sources.map(async (source) => {
          try {
            const status = await this.calendarManager.getSourceStatus(source.id);
            return {
              id: source.id,
              name: source.name,
              status: status.status,
              lastSync: status.lastSync,
              error: status.error
            };
          } catch (error) {
            return {
              id: source.id,
              name: source.name,
              status: 'error' as CalendarSourceStatus,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      const statusUpdate: StatusUpdate = {
        timestamp: new Date(),
        serverStatus: 'running',
        sources: sourceStatuses
      };

      this.sendJsonResponse(res, 200, statusUpdate);
      this.broadcastStatusUpdate(statusUpdate);
    } catch (error) {
      this.sendErrorResponse(res, 500, error instanceof Error ? error.message : 'Failed to get status');
    }
  }

  /**
   * Handle GET /api/config - Get current configuration
   */
  private async handleGetConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      this.sendJsonResponse(res, 200, config);
    } catch (error) {
      this.sendErrorResponse(res, 500, error instanceof Error ? error.message : 'Failed to get configuration');
    }
  }

  /**
   * Handle PUT /api/config - Update configuration
   */
  private async handleUpdateConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const updates = JSON.parse(body);

      if (updates.server) {
        await this.configManager.updateServerConfig(updates.server);
      }

      const updatedConfig = this.configManager.getConfig();
      this.sendJsonResponse(res, 200, updatedConfig);
    } catch (error) {
      this.sendErrorResponse(res, 400, error instanceof Error ? error.message : 'Failed to update configuration');
    }
  }

  /**
   * Handle GET /api/sources - Get all calendar sources
   */
  private async handleGetSources(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      this.sendJsonResponse(res, 200, config.sources);
    } catch (error) {
      this.sendErrorResponse(res, 500, error instanceof Error ? error.message : 'Failed to get sources');
    }
  }

  /**
   * Handle POST /api/sources - Add new calendar source
   */
  private async handleAddSource(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const sourceData = JSON.parse(body);

      // Generate ID if not provided
      if (!sourceData.id) {
        sourceData.id = `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Set defaults
      const source: CalendarSource = {
        id: sourceData.id,
        name: sourceData.name,
        type: sourceData.type,
        url: sourceData.url,
        enabled: sourceData.enabled ?? true,
        status: 'active',
        refreshInterval: sourceData.refreshInterval ?? 1800
      };

      await this.configManager.addCalendarSource(source);
      
      // Trigger calendar manager to reload sources
      await this.calendarManager.reloadSources();

      this.sendJsonResponse(res, 201, source);
    } catch (error) {
      this.sendErrorResponse(res, 400, error instanceof Error ? error.message : 'Failed to add source');
    }
  }

  /**
   * Handle PUT /api/sources/:id - Update calendar source
   */
  private async handleUpdateSource(req: IncomingMessage, res: ServerResponse, sourceId: string): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const updates = JSON.parse(body);

      await this.configManager.updateCalendarSource(sourceId, updates);
      
      // Trigger calendar manager to reload sources
      await this.calendarManager.reloadSources();

      const config = this.configManager.getConfig();
      const updatedSource = config.sources.find(s => s.id === sourceId);
      
      this.sendJsonResponse(res, 200, updatedSource);
    } catch (error) {
      this.sendErrorResponse(res, 400, error instanceof Error ? error.message : 'Failed to update source');
    }
  }

  /**
   * Handle DELETE /api/sources/:id - Remove calendar source
   */
  private async handleDeleteSource(req: IncomingMessage, res: ServerResponse, sourceId: string): Promise<void> {
    try {
      await this.configManager.removeCalendarSource(sourceId);
      
      // Trigger calendar manager to reload sources
      await this.calendarManager.reloadSources();

      this.sendJsonResponse(res, 204, null);
    } catch (error) {
      this.sendErrorResponse(res, 400, error instanceof Error ? error.message : 'Failed to delete source');
    }
  }

  /**
   * Handle POST /api/sources/:id/test - Test calendar source connection
   */
  private async handleTestSource(req: IncomingMessage, res: ServerResponse, sourceId: string): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      const source = config.sources.find(s => s.id === sourceId);
      
      if (!source) {
        this.sendErrorResponse(res, 404, 'Source not found');
        return;
      }

      const testResult = await this.calendarManager.testSource(source);
      this.sendJsonResponse(res, 200, testResult);
    } catch (error) {
      this.sendErrorResponse(res, 400, error instanceof Error ? error.message : 'Failed to test source');
    }
  }

  /**
   * Read request body as string
   */
  private async readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJsonResponse(res: ServerResponse, statusCode: number, data: any): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    this.sendJsonResponse(res, statusCode, { error: message });
  }
}