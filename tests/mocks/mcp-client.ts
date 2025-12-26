/**
 * Mock MCP Client for testing
 * 
 * Provides a mock implementation of the MCP client for unit and integration tests.
 */
import { vi } from 'vitest';
import type { MockTool } from './fixtures/tool-schemas.js';

export interface MockClientOptions {
  tools?: MockTool[];
  connectDelay?: number;
  shouldFailConnect?: boolean;
  connectError?: Error;
  toolCallResults?: Map<string, unknown>;
}

/**
 * Create a mock MCP client
 */
export function createMockClient(options: MockClientOptions = {}) {
  const {
    tools = [],
    connectDelay = 0,
    shouldFailConnect = false,
    connectError = new Error('Connection failed'),
    toolCallResults = new Map(),
  } = options;

  const mockClient = {
    connect: vi.fn().mockImplementation(async () => {
      if (connectDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, connectDelay));
      }
      if (shouldFailConnect) {
        throw connectError;
      }
    }),

    close: vi.fn().mockResolvedValue(undefined),

    listTools: vi.fn().mockResolvedValue({ tools }),

    callTool: vi.fn().mockImplementation(async ({ name, arguments: args }) => {
      // Check if there's a custom result for this tool
      if (toolCallResults.has(name)) {
        const result = toolCallResults.get(name);
        if (typeof result === 'function') {
          return result(args);
        }
        return {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          }],
        };
      }

      // Default mock response
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            toolName: name,
            args,
          }),
        }],
      };
    }),
  };

  return mockClient;
}

/**
 * Create mock transport for testing
 */
export function createMockTransport() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onmessage: vi.fn(),
    onerror: vi.fn(),
    onclose: vi.fn(),
  };
}

/**
 * Mock the entire MCP module
 */
export function createMockMcpModule(options: MockClientOptions = {}) {
  const mockClient = createMockClient(options);
  const clients = new Map<string, typeof mockClient>();

  return {
    connectServer: vi.fn().mockImplementation(async (serverName: string) => {
      await mockClient.connect();
      clients.set(serverName, mockClient);
      return mockClient;
    }),

    disconnectAll: vi.fn().mockImplementation(async () => {
      for (const client of clients.values()) {
        await client.close();
      }
      clients.clear();
    }),

    getClient: vi.fn().mockImplementation((serverName: string) => {
      return clients.get(serverName);
    }),

    listTools: vi.fn().mockImplementation(async () => {
      return options.tools ?? [];
    }),

    callTool: vi.fn().mockImplementation(async (serverName: string, toolName: string, args: unknown) => {
      const client = clients.get(serverName);
      if (!client) {
        throw new Error(`Server "${serverName}" not connected`);
      }
      return client.callTool({ name: toolName, arguments: args });
    }),

    parseMcpResponse: vi.fn().mockImplementation((result: unknown) => {
      if (Array.isArray(result) && result.length > 0) {
        const first = result[0] as { type?: string; text?: string };
        if (first.type === 'text' && typeof first.text === 'string') {
          try {
            return JSON.parse(first.text);
          } catch {
            return first.text;
          }
        }
        return first;
      }
      return result;
    }),

    checkServerHealth: vi.fn().mockResolvedValue({
      status: 'connected',
      commandExists: true,
      argsValid: true,
      isEnabled: true,
      toolCount: options.tools?.length ?? 0,
      suggestions: [],
      config: {
        command: 'node',
        args: ['test-server.js'],
        timeout: 30000,
        retries: 3,
      },
    }),

    testServerConnection: vi.fn().mockResolvedValue({
      success: true,
      connectionTimeMs: 100,
      toolCount: options.tools?.length ?? 0,
    }),

    listConfiguredServers: vi.fn().mockResolvedValue([
      {
        name: 'test-server',
        enabled: true,
        connected: true,
        command: 'node',
      },
    ]),

    getServerStderr: vi.fn().mockReturnValue(undefined),

    commandExists: vi.fn().mockResolvedValue(true),

    diagnoseServerCommand: vi.fn().mockResolvedValue({
      commandExists: true,
      commandPath: 'node',
      argsValid: true,
      suggestions: [],
    }),

    // Expose the mock client for assertions
    _mockClient: mockClient,
    _clients: clients,
  };
}

/**
 * Helper to create a failing mock client
 */
export function createFailingMockClient(errorMessage = 'Connection failed') {
  return createMockClient({
    shouldFailConnect: true,
    connectError: new Error(errorMessage),
  });
}

/**
 * Helper to create a slow mock client
 */
export function createSlowMockClient(delayMs = 5000) {
  return createMockClient({
    connectDelay: delayMs,
  });
}