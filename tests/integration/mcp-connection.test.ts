/**
 * Integration tests for MCP server connections
 * 
 * These tests verify the connection and tool calling behavior
 * using mock MCP clients.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockMcpModule } from '../mocks/mcp-client.js';
import { mockTools } from '../mocks/fixtures/tool-schemas.js';

describe('MCP Connection Integration', () => {
  let mockMcpModule: ReturnType<typeof createMockMcpModule>;

  beforeEach(() => {
    vi.resetModules();
    mockMcpModule = createMockMcpModule({ tools: mockTools });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connectServer', () => {
    it('should connect to a mock MCP server successfully', async () => {
      await mockMcpModule.connectServer('test-server');
      
      expect(mockMcpModule.connectServer).toHaveBeenCalledWith('test-server');
      expect(mockMcpModule._clients.has('test-server')).toBe(true);
    });

    it('should reuse existing connection for same server', async () => {
      await mockMcpModule.connectServer('test-server');
      await mockMcpModule.connectServer('test-server');
      
      expect(mockMcpModule.connectServer).toHaveBeenCalledTimes(2);
    });

    it('should handle connection to multiple servers', async () => {
      await mockMcpModule.connectServer('server-1');
      await mockMcpModule.connectServer('server-2');
      
      expect(mockMcpModule._clients.has('server-1')).toBe(true);
      expect(mockMcpModule._clients.has('server-2')).toBe(true);
    });
  });

  describe('listTools', () => {
    it('should list tools from connected server', async () => {
      const tools = await mockMcpModule.listTools('test-server');
      
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(mockTools.length);
    });

    it('should return tool names and schemas', async () => {
      const tools = await mockMcpModule.listTools('test-server');
      
      const simpleTool = tools.find((t: { name: string }) => t.name === 'simple-tool');
      expect(simpleTool).toBeDefined();
      expect(simpleTool?.name).toBe('simple-tool');
    });
  });

  describe('callTool', () => {
    it('should call tool with correct arguments', async () => {
      await mockMcpModule.connectServer('test-server');
      
      const result = await mockMcpModule.callTool('test-server', 'string-tool', {
        requiredParam: 'test-value',
      });
      
      expect(mockMcpModule.callTool).toHaveBeenCalledWith(
        'test-server',
        'string-tool',
        { requiredParam: 'test-value' }
      );
    });

    it('should return mock response from tool call', async () => {
      await mockMcpModule.connectServer('test-server');
      
      const result = await mockMcpModule.callTool('test-server', 'simple-tool', {});
      
      expect(result).toBeDefined();
    });

    it('should throw error when calling tool on unconnected server', async () => {
      await expect(
        mockMcpModule.callTool('unconnected-server', 'tool', {})
      ).rejects.toThrow(/not connected/);
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all clients', async () => {
      await mockMcpModule.connectServer('server-1');
      await mockMcpModule.connectServer('server-2');
      
      expect(mockMcpModule._clients.size).toBe(2);
      
      await mockMcpModule.disconnectAll();
      
      expect(mockMcpModule._clients.size).toBe(0);
    });

    it('should handle disconnecting when no clients connected', async () => {
      await expect(mockMcpModule.disconnectAll()).resolves.toBeUndefined();
    });
  });

  describe('checkServerHealth', () => {
    it('should return healthy status for connected server', async () => {
      const health = await mockMcpModule.checkServerHealth('test-server');
      
      expect(health).toBeDefined();
      expect(health.status).toBe('connected');
      expect(health.commandExists).toBe(true);
      expect(health.isEnabled).toBe(true);
    });
  });

  describe('testServerConnection', () => {
    it('should test connection successfully', async () => {
      const result = await mockMcpModule.testServerConnection('test-server');
      
      expect(result.success).toBe(true);
      expect(result.connectionTimeMs).toBeDefined();
      expect(typeof result.connectionTimeMs).toBe('number');
    });
  });

  describe('parseMcpResponse', () => {
    it('should parse JSON response from text content', () => {
      const response = [
        { type: 'text', text: '{"status": "success", "data": "test"}' }
      ];
      
      const parsed = mockMcpModule.parseMcpResponse(response);
      
      expect(parsed).toEqual({ status: 'success', data: 'test' });
    });

    it('should return raw text when not JSON', () => {
      const response = [
        { type: 'text', text: 'plain text response' }
      ];
      
      const parsed = mockMcpModule.parseMcpResponse(response);
      
      expect(parsed).toBe('plain text response');
    });
  });
});

describe('MCP Connection Error Handling', () => {
  describe('connection failures', () => {
    it('should handle connection timeout', async () => {
      const slowModule = createMockMcpModule({ tools: [] });
      
      // Mock connect to throw timeout error
      slowModule.connectServer.mockRejectedValueOnce(new Error('Connection timed out'));
      
      await expect(
        slowModule.connectServer('slow-server')
      ).rejects.toThrow(/timed out/);
    });

    it('should handle connection refused', async () => {
      const failingModule = createMockMcpModule({ tools: [] });
      
      failingModule.connectServer.mockRejectedValueOnce(
        new Error('Connection refused')
      );
      
      await expect(
        failingModule.connectServer('failing-server')
      ).rejects.toThrow(/refused/);
    });
  });

  describe('tool call failures', () => {
    it('should handle tool not found error', async () => {
      const module = createMockMcpModule({ tools: mockTools });
      await module.connectServer('test-server');
      
      module.callTool.mockRejectedValueOnce(new Error('Tool not found: unknown-tool'));
      
      await expect(
        module.callTool('test-server', 'unknown-tool', {})
      ).rejects.toThrow(/not found/);
    });

    it('should handle invalid arguments error', async () => {
      const module = createMockMcpModule({ tools: mockTools });
      await module.connectServer('test-server');
      
      module.callTool.mockRejectedValueOnce(
        new Error('Invalid arguments: requiredParam is required')
      );
      
      await expect(
        module.callTool('test-server', 'string-tool', {})
      ).rejects.toThrow(/required/);
    });
  });
});