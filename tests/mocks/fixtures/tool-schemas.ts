/**
 * Sample tool schemas for testing
 */

export interface MockTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

/**
 * Simple tool with no parameters
 */
export const noParamsTool: MockTool = {
  name: 'simple-tool',
  description: 'A simple tool with no parameters',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Tool with required and optional string parameters
 */
export const stringParamsTool: MockTool = {
  name: 'string-tool',
  description: 'A tool with string parameters',
  inputSchema: {
    type: 'object',
    properties: {
      requiredParam: {
        type: 'string',
        description: 'A required string parameter',
      },
      optionalParam: {
        type: 'string',
        description: 'An optional string parameter',
      },
    },
    required: ['requiredParam'],
  },
};

/**
 * Tool with multiple parameter types
 */
export const multiTypeTool: MockTool = {
  name: 'multi-type-tool',
  description: 'A tool with multiple parameter types',
  inputSchema: {
    type: 'object',
    properties: {
      stringParam: {
        type: 'string',
        description: 'A string parameter',
      },
      numberParam: {
        type: 'number',
        description: 'A number parameter',
      },
      booleanParam: {
        type: 'boolean',
        description: 'A boolean parameter',
      },
      arrayParam: {
        type: 'array',
        description: 'An array parameter',
      },
      objectParam: {
        type: 'object',
        description: 'An object parameter',
      },
    },
    required: ['stringParam'],
  },
};

/**
 * Tool with enum parameter
 */
export const enumTool: MockTool = {
  name: 'enum-tool',
  description: 'A tool with enum parameters',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        description: 'The mode to use',
        enum: ['fast', 'slow', 'balanced'],
      },
      priority: {
        type: 'string',
        description: 'Priority level (low, medium, high)',
      },
    },
    required: ['mode'],
  },
};

/**
 * Tool with default values
 */
export const defaultsTool: MockTool = {
  name: 'defaults-tool',
  description: 'A tool with default parameter values',
  inputSchema: {
    type: 'object',
    properties: {
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 5000,
      },
      retries: {
        type: 'integer',
        description: 'Number of retries',
        default: 3,
      },
      enabled: {
        type: 'boolean',
        description: 'Whether the feature is enabled',
        default: true,
      },
    },
    required: [],
  },
};

/**
 * All mock tools for testing
 */
export const mockTools: MockTool[] = [
  noParamsTool,
  stringParamsTool,
  multiTypeTool,
  enumTool,
  defaultsTool,
];

/**
 * Create a mock MCP response
 */
export function createMockResponse(data: unknown): Array<{ type: string; text: string }> {
  return [
    {
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data),
    },
  ];
}

/**
 * Create a mock tool list response
 */
export function createToolListResponse(tools: MockTool[]): { tools: MockTool[] } {
  return { tools };
}