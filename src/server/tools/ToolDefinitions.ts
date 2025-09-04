/**
 * MCP Tool Definitions - Defines the schema and metadata for all MCP tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const SEARCH_EVENTS_TOOL: Tool = {
  name: 'search_events',
  description: 'Search for public events by date range, location, and keywords',
  inputSchema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        format: 'date',
        description: 'Start date for event search (YYYY-MM-DD format)'
      },
      end_date: {
        type: 'string',
        format: 'date',
        description: 'End date for event search (YYYY-MM-DD format)'
      },
      location: {
        type: 'string',
        description: 'Geographic location or venue to filter events'
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords to search in event titles and descriptions'
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event categories to filter by'
      },
      search_logic: {
        type: 'string',
        enum: ['AND', 'OR'],
        default: 'AND',
        description: 'Logic for combining multiple keywords'
      }
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false
  }
};

export const GET_EVENT_DETAILS_TOOL: Tool = {
  name: 'get_event_details',
  description: 'Get detailed information about a specific event',
  inputSchema: {
    type: 'object',
    properties: {
      event_id: {
        type: 'string',
        description: 'Unique identifier for the event'
      },
      include_recurrence: {
        type: 'boolean',
        default: true,
        description: 'Whether to include recurrence information for recurring events'
      }
    },
    required: ['event_id'],
    additionalProperties: false
  }
};

export const CHECK_AVAILABILITY_TOOL: Tool = {
  name: 'check_availability',
  description: 'Check if time slots conflict with public events',
  inputSchema: {
    type: 'object',
    properties: {
      time_slots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              format: 'date-time',
              description: 'Start time of the slot (ISO 8601 format)'
            },
            end: {
              type: 'string',
              format: 'date-time',
              description: 'End time of the slot (ISO 8601 format)'
            }
          },
          required: ['start', 'end'],
          additionalProperties: false
        },
        minItems: 1,
        description: 'Array of time slots to check for availability'
      },
      location: {
        type: 'string',
        description: 'Geographic location to consider for availability check'
      }
    },
    required: ['time_slots'],
    additionalProperties: false
  }
};

export const ALL_TOOLS: Tool[] = [
  SEARCH_EVENTS_TOOL,
  GET_EVENT_DETAILS_TOOL,
  CHECK_AVAILABILITY_TOOL
];