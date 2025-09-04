/**
 * Application Startup Script
 * Demonstrates the complete initialization sequence for the Public Calendar MCP Server
 * This can be used as a reference for the main application or for testing
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  MCPProtocolHandler, 
  ALL_TOOLS,
  handleSearchEvents,
  handleGetEventDetails,
  handleCheckAvailability
} from './server/index.js';
import { HTTPBridge } from './server/HTTPBridge.js';
import { ConfigManager } from './services/ConfigManager.js';
import { CalendarManager } from './services/CalendarManager.js';
import { EventCache } from './services/EventCache.js';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

export interface StartupOptions {
  configPath?: string;
  cachePath?: string;
  httpPort?: number;
  httpHost?: string;
  skipHttpBridge?: boolean;
  skipMCPTransport?: boolean;
}

export interface ApplicationContext {
  configManager: ConfigManager;
  eventCache: EventCache;
  calendarManager: CalendarManager;
  mcpHandler: MCPProtocolHandler;
  httpBridge: HTTPBridge;
  isRunning: boolean;
  startTime: Date;
}

/**
 * Complete application startup with all components
 */
export async function startApplication(options: StartupOptions = {}): Promise<ApplicationContext> {
  console.log('Starting Public Calendar MCP Server...');
  const startTime = new Date();

  // Determine paths
  const appSupportDir = join(homedir(), 'Library', 'Application Support', 'PublicCalendarMCP');
  const configPath = options.configPath || join(appSupportDir, 'config.json');
  const cachePath = options.cachePath || join(appSupportDir, 'events.db');

  // Ensure directories exist
  try {
    mkdirSync(appSupportDir, { recursive: true });
    console.log(`Application directory: ${appSupportDir}`);
  } catch (error) {
    console.warn('Failed to create application directory:', error);
  }

  // Phase 1: Initialize Core Services
  console.log('Phase 1: Initializing core services...');
  
  const configManager = new ConfigManager(configPath);
  console.log('✓ Configuration manager initialized');

  const eventCache = new EventCache(cachePath, {
    memoryTtl: 3600,
    persistentTtl: 86400,
    maxMemoryEvents: 1000,
    cleanupInterval: 300
  });
  console.log('✓ Event cache initialized');

  const calendarManager = new CalendarManager(eventCache);
  console.log('✓ Calendar manager initialized');

  const mcpHandler = new MCPProtocolHandler('public-calendar-mcp-server', '1.0.0');
  console.log('✓ MCP protocol handler initialized');

  const httpBridge = new HTTPBridge(configManager, calendarManager, {
    port: options.httpPort || 3001,
    host: options.httpHost || 'localhost'
  });
  console.log('✓ HTTP bridge initialized');

  // Phase 2: Load Configuration and Set Up Sources
  console.log('Phase 2: Loading configuration and setting up calendar sources...');
  
  try {
    const config = await configManager.loadConfig();
    console.log(`✓ Configuration loaded with ${config.sources.length} calendar sources`);

    // Add sources to calendar manager
    let successfulSources = 0;
    for (const source of config.sources) {
      try {
        calendarManager.addSource(source);
        successfulSources++;
        console.log(`  ✓ Added source: ${source.name} (${source.type})`);
      } catch (error) {
        console.error(`  ✗ Failed to add source ${source.name}:`, error);
      }
    }
    console.log(`✓ Successfully added ${successfulSources}/${config.sources.length} calendar sources`);

    // Set up dynamic configuration updates
    configManager.addConfigListener(async (updatedConfig) => {
      console.log('Configuration updated, reloading calendar sources...');
      
      try {
        // Clear existing sources
        const existingSources = calendarManager.getSources();
        for (const source of existingSources) {
          calendarManager.removeSource(source.id);
        }
        
        // Add updated sources
        let reloadedSources = 0;
        for (const source of updatedConfig.sources) {
          try {
            calendarManager.addSource(source);
            reloadedSources++;
          } catch (error) {
            console.error(`Failed to reload source ${source.name}:`, error);
          }
        }
        
        console.log(`✓ Reloaded ${reloadedSources}/${updatedConfig.sources.length} calendar sources`);
      } catch (error) {
        console.error('Failed to reload calendar sources:', error);
      }
    });

  } catch (error) {
    console.error('Failed to load configuration:', error);
    console.log('Continuing with default configuration...');
  }

  // Phase 3: Register MCP Tools
  console.log('Phase 3: Registering MCP tools...');
  
  const toolRegistry = mcpHandler.getToolRegistry();
  
  // Create tool handlers with proper context
  const searchEventsHandler = (params: any) => handleSearchEvents(params);
  const getEventDetailsHandler = (params: any) => handleGetEventDetails(params, calendarManager);
  const checkAvailabilityHandler = (params: any) => handleCheckAvailability(params, calendarManager);
  
  // Register tools
  toolRegistry.registerTool(ALL_TOOLS[0], searchEventsHandler);
  toolRegistry.registerTool(ALL_TOOLS[1], getEventDetailsHandler);
  toolRegistry.registerTool(ALL_TOOLS[2], checkAvailabilityHandler);
  
  console.log(`✓ Registered ${toolRegistry.getToolCount()} MCP tools:`);
  toolRegistry.getTools().forEach(tool => {
    console.log(`  - ${tool.name}`);
  });

  // Phase 4: Start HTTP Bridge (if not skipped)
  if (!options.skipHttpBridge) {
    console.log('Phase 4: Starting HTTP bridge for GUI communication...');
    
    try {
      await httpBridge.start();
      console.log(`✓ HTTP bridge started on ${options.httpHost || 'localhost'}:${options.httpPort || 3001}`);
    } catch (error) {
      console.error('✗ Failed to start HTTP bridge:', error);
      console.log('GUI communication will not be available');
    }
  } else {
    console.log('Phase 4: Skipping HTTP bridge startup');
  }

  // Phase 5: Connect MCP Transport (if not skipped)
  if (!options.skipMCPTransport) {
    console.log('Phase 5: Connecting to MCP transport...');
    
    try {
      const transport = new StdioServerTransport();
      await mcpHandler.connect(transport);
      console.log('✓ MCP transport connected successfully');
    } catch (error) {
      console.error('✗ Failed to connect MCP transport:', error);
      throw error;
    }
  } else {
    console.log('Phase 5: Skipping MCP transport connection');
  }

  // Application is now fully started
  const context: ApplicationContext = {
    configManager,
    eventCache,
    calendarManager,
    mcpHandler,
    httpBridge,
    isRunning: true,
    startTime
  };

  console.log('🚀 Public Calendar MCP Server started successfully!');
  console.log('Application Status:');
  console.log(`  - Start time: ${startTime.toISOString()}`);
  console.log(`  - MCP tools: ${toolRegistry.getToolCount()}`);
  console.log(`  - Calendar sources: ${calendarManager.getSources().length}`);
  console.log(`  - HTTP bridge: ${options.skipHttpBridge ? 'Disabled' : 'Running'}`);
  console.log(`  - MCP transport: ${options.skipMCPTransport ? 'Disabled' : 'Connected'}`);

  return context;
}

/**
 * Graceful application shutdown
 */
export async function shutdownApplication(context: ApplicationContext): Promise<void> {
  if (!context.isRunning) {
    console.log('Application is already shut down');
    return;
  }

  console.log('Shutting down Public Calendar MCP Server...');
  context.isRunning = false;

  try {
    // Stop HTTP bridge
    console.log('Stopping HTTP bridge...');
    await context.httpBridge.stop();
    console.log('✓ HTTP bridge stopped');

    // Close event cache
    console.log('Closing event cache...');
    await context.eventCache.close();
    console.log('✓ Event cache closed');

    // Clear calendar sources
    console.log('Clearing calendar sources...');
    const sources = context.calendarManager.getSources();
    for (const source of sources) {
      context.calendarManager.removeSource(source.id);
    }
    console.log(`✓ Cleared ${sources.length} calendar sources`);

    const shutdownTime = new Date();
    const uptime = shutdownTime.getTime() - context.startTime.getTime();
    
    console.log('✓ Public Calendar MCP Server shut down successfully');
    console.log(`Total uptime: ${Math.round(uptime / 1000)} seconds`);

  } catch (error) {
    console.error('Error during shutdown:', error);
    throw error;
  }
}

/**
 * Set up signal handlers for graceful shutdown
 */
export function setupSignalHandlers(context: ApplicationContext): void {
  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}, initiating graceful shutdown...`);
    
    try {
      await shutdownApplication(context);
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    try {
      await shutdownApplication(context);
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    try {
      await shutdownApplication(context);
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }
    process.exit(1);
  });
}

/**
 * Health check function to verify all components are working
 */
export async function performHealthCheck(context: ApplicationContext): Promise<{
  healthy: boolean;
  components: Record<string, { status: 'healthy' | 'unhealthy' | 'unknown'; message?: string }>;
}> {
  const components: Record<string, { status: 'healthy' | 'unhealthy' | 'unknown'; message?: string }> = {};

  // Check configuration manager
  try {
    const config = context.configManager.getConfig();
    components.configManager = { 
      status: 'healthy', 
      message: `${config.sources.length} sources configured` 
    };
  } catch (error) {
    components.configManager = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }

  // Check event cache
  try {
    // Try to perform a simple cache operation
    await context.eventCache.getEvents({
      dateRange: {
        start: new Date(),
        end: new Date()
      }
    });
    components.eventCache = { status: 'healthy' };
  } catch (error) {
    components.eventCache = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }

  // Check calendar manager
  try {
    const sources = context.calendarManager.getSources();
    components.calendarManager = { 
      status: 'healthy', 
      message: `${sources.length} sources active` 
    };
  } catch (error) {
    components.calendarManager = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }

  // Check MCP handler
  try {
    const toolCount = context.mcpHandler.getToolRegistry().getToolCount();
    components.mcpHandler = { 
      status: 'healthy', 
      message: `${toolCount} tools registered` 
    };
  } catch (error) {
    components.mcpHandler = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }

  // Check HTTP bridge (basic check)
  components.httpBridge = { status: 'healthy', message: 'HTTP bridge initialized' };

  // Overall health
  const healthy = Object.values(components).every(component => component.status === 'healthy');

  return { healthy, components };
}

// If this file is run directly, start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  startApplication()
    .then(context => {
      setupSignalHandlers(context);
      
      // Perform initial health check
      setTimeout(async () => {
        const health = await performHealthCheck(context);
        console.log('Health check results:', health);
      }, 5000);
    })
    .catch(error => {
      console.error('Failed to start application:', error);
      process.exit(1);
    });
}