/**
 * Tool Registry - Manages available MCP tools and their execution
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { JSONSchema7 } from 'json-schema';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export interface ToolHandler {
  (params: any, ...dependencies: any[]): Promise<any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private schemas: Map<string, JSONSchema7> = new Map();
  private dependencies: any[] = [];
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  /**
   * Set dependencies that will be passed to all tool handlers
   */
  setDependencies(...deps: any[]): void {
    this.dependencies = deps;
  }

  /**
   * Register a new tool with its handler and schema
   */
  registerTool(tool: Tool, handler: ToolHandler): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
    
    if (tool.inputSchema) {
      this.schemas.set(tool.name, tool.inputSchema as JSONSchema7);
    }
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a specific tool definition
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate tool parameters against JSON schema
   */
  validateToolParameters(toolName: string, params: any): ValidationResult {
    const schema = this.schemas.get(toolName);
    
    if (!schema) {
      return { valid: true, errors: [] };
    }

    const validate = this.ajv.compile(schema);
    const valid = validate(params);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = validate.errors?.map(error => {
      const path = error.instancePath || 'root';
      return `${path}: ${error.message}`;
    }) || ['Unknown validation error'];

    return { valid: false, errors };
  }

  /**
   * Execute a tool with the given parameters
   */
  async executeTool(name: string, params: any): Promise<any> {
    const handler = this.handlers.get(name);
    
    if (!handler) {
      throw new Error(`No handler registered for tool '${name}'`);
    }

    return await handler(params, ...this.dependencies);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.handlers.delete(name);
    this.schemas.delete(name);
  }

  /**
   * Get the number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.handlers.clear();
    this.schemas.clear();
  }
}