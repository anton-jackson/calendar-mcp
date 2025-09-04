/**
 * Main entry point for the Public Calendar MCP Server
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

// Global application state for proper shutdown
interface AppState {
  configManager: ConfigManager;
  eventCache: EventCache;
  calendarManager: CalendarManager;
  mcpHandler: MCPProtocolHandler;
  httpBridge: HTTPBridge;
  isShuttingDown: boolean;
}

let appState: AppState | null = null;

/**
 * Initialize all core services with proper error handling and dependencies
 */
async function initializeServices(): Promise<AppState> {
  console.error('Initializing core services...');
  
  // Initialize configuration manager first
  const configManager = new ConfigManager();
  
  // Initialize event cache with proper path
  const cacheDir = join(homedir(), 'Library', 'Application Support', 'PublicCalendarMCP');
  const cachePath = join(cacheDir, 'events.db');
  
  const eventCache = new EventCache(cachePath, {
    memoryTtl: 3600,
    persistentTtl: 86400,
    maxMemoryEvents: 1000,
    cleanupInterval: 300
  });
  
  // Initialize calendar manager
  const calendarManager = new CalendarManager(eventCache);
  
  // Initialize MCP protocol handler
  const mcpHandler = new MCPProtocolHandler('public-calendar-mcp-server', '1.0.0');
  
  // Initialize HTTP bridge for GUI communication
  const httpBridge = new HTTPBridge(configManager, calendarManager);
  
  console.error('Core services initialized successfully');
  
  return {
    configManager,
    eventCache,
    calendarManager,
    mcpHandler,
    httpBridge,
    isShuttingDown: false
  };
}

/**
 * Load configuration and set up calendar sources
 */
async function loadConfiguration(state: AppState): Promise<void> {
  console.error('Loading configuration...');
  
  try {
    const config = await state.configManager.loadConfig();
    console.error(`Loaded configuration with ${config.sources.length} calendar sources`);
    
    // Add sources to calendar manager
    for (const source of config.sources) {
      try {
        state.calendarManager.addSource(source);
        console.error(`Added calendar source: ${source.name} (${source.type})`);
      } catch (error) {
        console.error(`Failed to add calendar source ${source.name}:`, error);
      }
    }
    
    // Set up configuration change listener for dynamic updates
    state.configManager.addConfigListener(async (updatedConfig) => {
      if (state.isShuttingDown) return;
      
      console.error('Configuration updated, reloading calendar sources...');
      
      try {
        // Clear existing sources
        const existingSources = state.calendarManager.getSources();
        for (const source of existingSources) {
          state.calendarManager.removeSource(source.id);
        }
        
        // Add updated sources
        for (const source of updatedConfig.sources) {
          state.calendarManager.addSource(source);
        }
        
        console.error(`Reloaded ${updatedConfig.sources.length} calendar sources`);
      } catch (error) {
        console.error('Failed to reload calendar sources:', error);
      }
    });
    
  } catch (error) {
    console.error('Failed to load configuration:', error);
    console.error('Continuing with default configuration...');
  }
}

/**
 * Register MCP tools with their handlers
 */
function registerMCPTools(state: AppState): void {
  console.error('Registering MCP tools...');
  
  const toolRegistry = state.mcpHandler.getToolRegistry();
  
  // Create tool handlers with proper context binding
  const searchEventsHandler = (params: any) => handleSearchEvents(params, state.calendarManager);
  const getEventDetailsHandler = (params: any) => handleGetEventDetails(params, state.calendarManager);
  const checkAvailabilityHandler = (params: any) => handleCheckAvailability(params, state.calendarManager);
  
  // Register all MCP tools
  toolRegistry.registerTool(ALL_TOOLS[0], searchEventsHandler);      // search_events
  toolRegistry.registerTool(ALL_TOOLS[1], getEventDetailsHandler);   // get_event_details
  toolRegistry.registerTool(ALL_TOOLS[2], checkAvailabilityHandler); // check_availability

  console.error(`Registered ${toolRegistry.getToolCount()} MCP tools`);
}

/**
 * Start HTTP bridge for GUI communication
 */
async function startHTTPBridge(state: AppState): Promise<void> {
  console.error('Starting HTTP bridge for GUI communication...');
  
  try {
    await state.httpBridge.start();
    console.error('HTTP bridge started successfully');
  } catch (error) {
    console.error('Failed to start HTTP bridge:', error);
    console.error('GUI communication will not be available');
    // Continue without GUI bridge - MCP functionality will still work
  }
}

/**
 * Connect to MCP transport
 */
async function connectMCPTransport(state: AppState): Promise<void> {
  console.error('Connecting to MCP transport...');
  
  try {
    const transport = new StdioServerTransport();
    
    // Add error handlers for the transport
    transport.onclose = () => {
      console.error('MCP transport closed');
    };
    
    transport.onerror = (error: any) => {
      console.error('MCP transport error:', error);
    };
    
    await state.mcpHandler.connect(transport);
    console.error('MCP transport connected successfully');
    
  } catch (error) {
    console.error('Failed to connect MCP transport:', error);
    throw error;
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupShutdownHandlers(state: AppState): void {
  const shutdown = async (signal: string) => {
    if (state.isShuttingDown) {
      console.error('Shutdown already in progress...');
      return;
    }
    
    console.error(`Received ${signal}, shutting down gracefully...`);
    state.isShuttingDown = true;
    
    try {
      // Stop HTTP bridge first
      console.error('Stopping HTTP bridge...');
      await state.httpBridge.stop();
      
      // Close event cache database connections
      console.error('Closing event cache...');
      await state.eventCache.close();
      
      // Clear calendar manager sources
      console.error('Clearing calendar sources...');
      const sources = state.calendarManager.getSources();
      for (const source of sources) {
        state.calendarManager.removeSource(source.id);
      }
      
      console.error('Shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    if (state) {
      shutdown('uncaughtException');
    } else {
      process.exit(1);
    }
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    if (state) {
      shutdown('unhandledRejection');
    } else {
      process.exit(1);
    }
  });
}

/**
 * Main application startup sequence
 */
async function main(): Promise<void> {
  console.error('Public Calendar MCP Server starting...');
  
  try {
    // Initialize all services
    appState = await initializeServices();
    
    // Load configuration and set up sources
    await loadConfiguration(appState);
    
    // Register MCP tools
    registerMCPTools(appState);
    
    // Start HTTP bridge for GUI
    await startHTTPBridge(appState);
    
    // Connect to MCP transport
    await connectMCPTransport(appState);
    
    // Set up shutdown handlers
    setupShutdownHandlers(appState);
    
    console.error('Public Calendar MCP Server started and ready for requests');
    console.error('Server is running with the following components:');
    console.error(`- MCP Tools: ${appState.mcpHandler.getToolRegistry().getToolCount()}`);
    console.error(`- Calendar Sources: ${appState.calendarManager.getSources().length}`);
    console.error('- HTTP Bridge: Available for GUI communication');
    console.error('- Event Cache: Initialized and ready');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    
    // Attempt cleanup if we have partial state
    if (appState) {
      try {
        await appState.httpBridge.stop();
        await appState.eventCache.close();
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
    
    process.exit(1);
  }

}

// Export the startup functions for use by other modules
export { initializeServices, loadConfiguration, registerMCPTools, startHTTPBridge, connectMCPTransport, setupShutdownHandlers };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}