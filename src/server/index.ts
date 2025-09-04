/**
 * Server module exports
 */

export { MCPProtocolHandler } from './MCPProtocolHandler.js';
export { ToolRegistry, type ToolHandler, type ValidationResult } from './ToolRegistry.js';
export { HTTPBridge, type BridgeConfig, type StatusUpdate } from './HTTPBridge.js';
export { 
  SEARCH_EVENTS_TOOL, 
  GET_EVENT_DETAILS_TOOL, 
  CHECK_AVAILABILITY_TOOL,
  ALL_TOOLS 
} from './tools/ToolDefinitions.js';
export { 
  handleSearchEvents, 
  handleGetEventDetails, 
  handleCheckAvailability 
} from './tools/ToolHandlers.js';