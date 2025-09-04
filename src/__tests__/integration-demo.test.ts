/**
 * Integration Demo Test
 * A simplified test that demonstrates the complete end-to-end integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { startApplication, shutdownApplication, performHealthCheck } from '../startup.js';

describe('Integration Demo', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary directory for test data
    testDir = join(tmpdir(), `integration-demo-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Remove test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should demonstrate complete application lifecycle', async () => {
    // Start the application with test configuration
    const context = await startApplication({
      configPath: join(testDir, 'config.json'),
      cachePath: join(testDir, 'events.db'),
      httpPort: 0, // Use random port
      skipMCPTransport: true // Skip MCP transport for testing
    });

    expect(context).toBeDefined();
    expect(context.isRunning).toBe(true);
    expect(context.startTime).toBeInstanceOf(Date);

    // Verify all components are initialized
    expect(context.configManager).toBeDefined();
    expect(context.eventCache).toBeDefined();
    expect(context.calendarManager).toBeDefined();
    expect(context.mcpHandler).toBeDefined();
    expect(context.httpBridge).toBeDefined();

    // Perform health check
    const health = await performHealthCheck(context);
    expect(health.healthy).toBe(true);
    expect(health.components.configManager.status).toBe('healthy');
    expect(health.components.eventCache.status).toBe('healthy');
    expect(health.components.calendarManager.status).toBe('healthy');
    expect(health.components.mcpHandler.status).toBe('healthy');

    // Verify MCP tools are registered
    const toolRegistry = context.mcpHandler.getToolRegistry();
    expect(toolRegistry.getToolCount()).toBe(3);
    
    const tools = toolRegistry.getTools();
    const toolNames = tools.map(tool => tool.name);
    expect(toolNames).toContain('search_events');
    expect(toolNames).toContain('get_event_details');
    expect(toolNames).toContain('check_availability');

    // Test tool execution
    const searchResult = await toolRegistry.executeTool('search_events', {
      start_date: '2025-02-01',
      end_date: '2025-02-28'
    });
    expect(searchResult).toBeDefined();
    expect(searchResult.content).toBeDefined();

    // Shutdown the application
    await shutdownApplication(context);
    expect(context.isRunning).toBe(false);
  }, 10000); // 10 second timeout

  it('should handle configuration and calendar sources', async () => {
    const context = await startApplication({
      configPath: join(testDir, 'config.json'),
      cachePath: join(testDir, 'events.db'),
      httpPort: 0,
      skipMCPTransport: true
    });

    // Add a test calendar source
    await context.configManager.addCalendarSource({
      id: 'demo-source',
      name: 'Demo Calendar',
      type: 'ical',
      url: 'https://example.com/demo.ics',
      enabled: true,
      status: 'active',
      refreshInterval: 1800
    });

    // Verify source was added
    const config = context.configManager.getConfig();
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0].name).toBe('Demo Calendar');

    // Add source to calendar manager
    context.calendarManager.addSource(config.sources[0]);
    expect(context.calendarManager.getSources()).toHaveLength(1);

    await shutdownApplication(context);
  }, 10000);

  it('should demonstrate error handling', async () => {
    const context = await startApplication({
      configPath: join(testDir, 'config.json'),
      cachePath: join(testDir, 'events.db'),
      httpPort: 0,
      skipMCPTransport: true
    });

    // Test invalid tool execution
    await expect(
      context.mcpHandler.getToolRegistry().executeTool('nonexistent_tool', {})
    ).rejects.toThrow();

    // Test invalid event details request
    const detailsResult = await context.mcpHandler.getToolRegistry().executeTool('get_event_details', {
      event_id: 'nonexistent-event'
    });
    
    expect(detailsResult).toBeDefined();
    if ('content' in detailsResult) {
      expect(detailsResult.content.found).toBe(false);
    }

    await shutdownApplication(context);
  }, 10000);
});