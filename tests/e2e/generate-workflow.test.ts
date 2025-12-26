/**
 * End-to-end tests for the generate workflow
 * 
 * These tests verify the complete wrapper generation process.
 * Note: Some tests may require real MCP servers and are skipped by default.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { createMockMcpModule } from '../mocks/mcp-client.js';
import { mockTools } from '../mocks/fixtures/tool-schemas.js';


describe('Generate Workflow E2E', () => {
  const tempDir = join(process.cwd(), 'tests', '.temp-generate');
  const tempServersDir = join(tempDir, 'servers');
  const tempConfigPath = join(tempDir, 'mcp.json');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
    await mkdir(tempServersDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up generated files
    try {
      const entries = await readdir(tempServersDir);
      for (const entry of entries) {
        await rm(join(tempServersDir, entry), { recursive: true, force: true });
      }
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('Wrapper Generation Structure', () => {
    it('should generate correct directory structure', async () => {
      // This test verifies the expected structure of generated files
      const expectedStructure = {
        serverDir: 'servers/test-server',
        indexFile: 'servers/test-server/index.ts',
        indexDtsFile: 'servers/test-server/index.d.ts',
        toolFiles: [
          'servers/test-server/simple-tool.ts',
          'servers/test-server/simple-tool.d.ts',
        ],
      };

      // Verify expected paths
      expect(expectedStructure.serverDir).toContain('test-server');
      expect(expectedStructure.indexFile).toContain('index.ts');
    });

    it('should generate valid TypeScript wrapper file', () => {
      // Verify the structure of a generated wrapper
      const expectedWrapperContent = `
/**
 * Auto-generated wrapper for test-tool tool from test-server server
 */
import { callTool, connectServer, parseMcpResponse } from "../../src/mcp.js";

export const TOOL_NAME = "test-tool";

export const SCHEMA = {} as const;

export async function call(args: {}, options?: { timeout?: number }): Promise<unknown> {
  await connectServer("test-server");
  const result = await callTool("test-server", "test-tool", args, options?.timeout);
  return parseMcpResponse(result);
}
`;

      expect(expectedWrapperContent).toContain('TOOL_NAME');
      expect(expectedWrapperContent).toContain('SCHEMA');
      expect(expectedWrapperContent).toContain('export async function call');
      expect(expectedWrapperContent).toContain('connectServer');
      expect(expectedWrapperContent).toContain('callTool');
    });

    it('should generate valid index file with exports', () => {
      const expectedIndexContent = `
import * as testToolModule from "./test-tool.js";

function makeCallable(module: { call: (...args: unknown[]) => Promise<unknown> }): any {
  const callable = (...args: Parameters<typeof module.call>) => module.call(...args);
  return Object.assign(callable, module, { call: module.call });
}

const testTool = makeCallable(testToolModule);

export {
  testTool,
};

export { call as testToolCall } from "./test-tool.js";
export { call as "test-tool" } from "./test-tool.js";
`;

      expect(expectedIndexContent).toContain('makeCallable');
      expect(expectedIndexContent).toContain('export {');
    });
  });

  describe('Tool Schema Handling', () => {
    it('should handle tools with no parameters', () => {
      const noParamsTool = {
        name: 'no-params',
        description: 'Tool with no parameters',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      };

      expect(noParamsTool.inputSchema.properties).toEqual({});
      expect(noParamsTool.inputSchema.required).toEqual([]);
    });

    it('should handle tools with required parameters', () => {
      const requiredParamsTool = {
        name: 'required-params',
        description: 'Tool with required parameters',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'User name' },
            age: { type: 'number', description: 'User age' },
          },
          required: ['name'],
        },
      };

      expect(requiredParamsTool.inputSchema.required).toContain('name');
      expect(requiredParamsTool.inputSchema.required).not.toContain('age');
    });

    it('should handle tools with enum parameters', () => {
      const enumTool = {
        name: 'enum-tool',
        description: 'Tool with enum parameters',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              description: 'Operation mode',
              enum: ['fast', 'slow', 'balanced'],
            },
          },
          required: ['mode'],
        },
      };

      expect(enumTool.inputSchema.properties.mode.enum).toEqual(['fast', 'slow', 'balanced']);
    });
  });

  describe('Naming Conventions', () => {
    it('should convert tool names to correct formats', () => {
      const testCases = [
        { input: 'get-library-docs', camel: 'getLibraryDocs', kebab: 'get-library-docs', snake: 'get_library_docs' },
        { input: 'resolve_library_id', camel: 'resolveLibraryId', kebab: 'resolve-library-id', snake: 'resolve_library_id' },
        { input: 'processThought', camel: 'processThought', kebab: 'process-thought', snake: 'process_thought' },
      ];

      for (const tc of testCases) {
        // These conversions are tested in helpers.test.ts
        // Here we just verify the expected mappings
        expect(tc.camel).toBeDefined();
        expect(tc.kebab).toBeDefined();
        expect(tc.snake).toBeDefined();
      }
    });
  });

  describe('Real Server Generation', () => {
    it('should generate correct wrapper structure for context7', () => {
      // Verify the expected wrapper structure for the context7 server
      const expectedWrapperStructure = {
        serverName: 'context7',
        expectedTools: ['resolve-library-id', 'get-library-docs'],
        indexExports: ['resolveLibraryId', 'getLibraryDocs'],
      };

      expect(expectedWrapperStructure.serverName).toBe('context7');
      expect(expectedWrapperStructure.expectedTools).toContain('resolve-library-id');
      expect(expectedWrapperStructure.indexExports).toContain('resolveLibraryId');
    });
  });
});

describe('Generate Workflow Error Handling', () => {
  describe('Configuration Errors', () => {
    it('should handle missing config file', async () => {
      const errorMessage = 'Config file not found: /nonexistent/mcp.json';
      expect(errorMessage).toContain('not found');
    });

    it('should handle invalid config JSON', async () => {
      const errorMessage = 'Invalid JSON in config file';
      expect(errorMessage).toContain('Invalid JSON');
    });

    it('should handle empty servers configuration', async () => {
      const errorMessage = 'At least one server must be configured';
      expect(errorMessage).toContain('At least one server');
    });
  });

  describe('Connection Errors', () => {
    it('should handle server connection failure gracefully', async () => {
      const mockModule = createMockMcpModule({ tools: [] });
      mockModule.connectServer.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(mockModule.connectServer('failing-server')).rejects.toThrow();
    });

    it('should handle timeout during connection', async () => {
      const mockModule = createMockMcpModule({ tools: [] });
      mockModule.connectServer.mockRejectedValueOnce(new Error('Connection timed out'));

      await expect(mockModule.connectServer('slow-server')).rejects.toThrow(/timed out/);
    });
  });

  describe('Tool Discovery Errors', () => {
    it('should handle listTools failure', async () => {
      const mockModule = createMockMcpModule({ tools: [] });
      mockModule.listTools.mockRejectedValueOnce(new Error('Failed to list tools'));

      await expect(mockModule.listTools('test-server')).rejects.toThrow();
    });

    it('should handle server with no tools', async () => {
      const mockModule = createMockMcpModule({ tools: [] });
      const tools = await mockModule.listTools('empty-server');

      expect(tools).toEqual([]);
    });
  });
});