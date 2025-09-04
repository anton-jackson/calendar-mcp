/**
 * MCP Protocol Handler - Implements standard MCP server interface
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './ToolRegistry.js';
import { MCPError, MCPResponse } from '../types/mcp.js';

export class MCPProtocolHandler {
  private server: Server;
  private toolRegistry: ToolRegistry;

  constructor(name: string, version: string) {
    this.server = new Server({
      name,
      version,
    });

    this.toolRegistry = new ToolRegistry();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle list_tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('Handling list_tools request');
      const tools = this.toolRegistry.getTools();
      console.error(`Returning ${tools.length} tools`);
      return {
        tools,
      };
    });

    // Handle call_tool requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`Executing tool: ${name} with args:`, JSON.stringify(args, null, 2));

      try {
        // Validate tool exists
        if (!this.toolRegistry.hasTool(name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not found`
          );
        }

        // Get tool and validate parameters
        const tool = this.toolRegistry.getTool(name);
        const validationResult = this.toolRegistry.validateToolParameters(name, args);
        
        if (!validationResult.valid) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters for tool '${name}': ${validationResult.errors.join(', ')}`
          );
        }

        // Execute tool
        const result = await this.toolRegistry.executeTool(name, args);
        console.error(`Tool ${name} executed successfully, result type:`, typeof result);
        
        // Handle MCPResponse format
        if (result && typeof result === 'object') {
          if (result.error) {
            // Tool returned an error response
            throw new McpError(
              ErrorCode.InternalError,
              result.error.message || 'Tool execution failed',
              result.error.details
            );
          }
          
          if (result.content) {
            // Tool returned successful content - return it as structured data
            const response = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result.content, this.createSafeReplacer(), 2),
                },
              ],
            } as CallToolResult;
            
            console.error(`Returning structured response for tool ${name}`);
            return response;
          }
        }
        
        // Fallback for unexpected result format
        const response = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, this.createSafeReplacer(), 2),
            },
          ],
        } as CallToolResult;
        
        console.error(`Returning fallback response for tool ${name}`);
        return response;

      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        // Convert internal errors to MCP errors
        const mcpError = error as MCPError;
        throw new McpError(
          ErrorCode.InternalError,
          mcpError.message || 'Internal server error',
          mcpError.details
        );
      }
    });
  }

  /**
   * Get the underlying MCP server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get the tool registry for registering tools
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Connect the server to a transport
   */
  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Close the server connection
   */
  async close(): Promise<void> {
    await this.server.close();
  }

  /**
   * Create a safe JSON replacer that handles circular references and non-serializable objects
   */
  private createSafeReplacer(): (key: string, value: any) => any {
    const seen = new WeakSet();
    
    return (key: string, value: any) => {
      // Handle null and undefined
      if (value === null || value === undefined) {
        return value;
      }
      
      // Handle primitive types
      if (typeof value !== 'object') {
        return value;
      }
      
      // Handle circular references
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
      
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      
      // Handle functions
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      // Handle arrays and objects normally
      return value;
    };
  }
}