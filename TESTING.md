# Testing Plan for Code-Executor-MCP

## Overview

This document outlines the testing strategy for the Code-Executor-MCP project using **Vitest** as the testing framework. The plan covers unit tests, integration tests, and end-to-end tests with a comprehensive mocking strategy for MCP server connections.

## Testing Framework: Vitest

### Why Vitest?
- Native ESM support (critical for this project which uses `"type": "module"`)
- Excellent TypeScript integration
- Fast test execution with intelligent watch mode
- Compatible with the existing `NodeNext` module resolution
- Built-in mocking capabilities

## Project Test Structure

```
code-executor-mcp/
├── src/
│   ├── config.ts
│   ├── generate.ts
│   ├── mcp.ts
│   ├── run.ts
│   └── server.ts
├── tests/
│   ├── setup.ts                    # Global test setup
│   ├── mocks/
│   │   ├── mcp-client.ts           # Mock MCP client
│   │   └── fixtures/
│   │       ├── mcp.json            # Test config fixture
│   │       ├── skills.json         # Test skills config fixture
│   │       └── tool-schemas.ts     # Sample tool schemas
│   ├── unit/
│   │   ├── config.test.ts          # Tests for config.ts
│   │   ├── mcp.test.ts             # Tests for mcp.ts helpers
│   │   ├── server-helpers.test.ts  # Tests for server.ts helper functions
│   │   └── generate.test.ts        # Tests for generate.ts functions
│   ├── integration/
│   │   ├── mcp-connection.test.ts  # MCP server connection tests
│   │   └── tool-execution.test.ts  # Tool execution tests
│   └── e2e/
│       ├── generate-workflow.test.ts    # Full generate workflow
│       └── execute-code-workflow.test.ts # Full execute_code workflow
├── vitest.config.ts
└── package.json
```

## Test Categories

### 1. Unit Tests

Unit tests focus on individual functions in isolation with all external dependencies mocked.

#### `config.test.ts` - Configuration Module Tests
```typescript
// Functions to test:
- loadConfig()           // Parse and validate mcp.json
- loadSkillsConfig()     // Parse and validate skills.json
- isServerEnabled()      // Check server enabled state
- isSkillEnabled()       // Check skill enabled state
- resolveSkillPath()     // Resolve skill directory path
- initConfigPaths()      // CLI argument parsing
- shouldSkipGetStarted() // Check skip flag

// Test cases:
- ✓ loads valid mcp.json configuration
- ✓ throws error for missing config file
- ✓ throws error for invalid JSON
- ✓ throws error for schema validation failures
- ✓ respects enabled=false for servers
- ✓ defaults to enabled=true when not specified
- ✓ parses CLI arguments for config paths
- ✓ resolves skill paths correctly (default and custom)
```

#### `mcp.test.ts` - MCP Helper Functions Tests
```typescript
// Functions to test:
- parseMcpResponse()      // Parse MCP response format
- commandExists()         // Check if command exists in PATH
- diagnoseServerCommand() // Diagnose server command issues

// Test cases:
- ✓ parseMcpResponse handles array of content blocks
- ✓ parseMcpResponse extracts JSON from text content
- ✓ parseMcpResponse handles plain text content
- ✓ parseMcpResponse handles non-standard formats
- ✓ commandExists returns true for existing commands (node, npm)
- ✓ commandExists returns false for non-existent commands
- ✓ diagnoseServerCommand identifies missing commands
- ✓ diagnoseServerCommand identifies missing script paths
```

#### `server-helpers.test.ts` - Server Helper Functions Tests
```typescript
// Functions to test (extracted from server.ts):
- toCamelCase()              // Convert kebab-case to camelCase
- toKebabCase()              // Convert camelCase to kebab-case
- isExampleValue()           // Check if value looks like an example
- extractEnumFromDescription() // Extract enum values from description
- hoistImports()             // Separate imports from body code
- getStartedReminder()       // Generate get_started reminder
- requireGetStarted()        // Check get_started requirement

// Test cases:
- ✓ toCamelCase converts kebab-case correctly
- ✓ toCamelCase converts snake_case correctly
- ✓ toKebabCase converts camelCase correctly
- ✓ isExampleValue identifies e.g. patterns
- ✓ isExampleValue identifies path-like values
- ✓ extractEnumFromDescription finds parenthesized lists
- ✓ extractEnumFromDescription finds "Valid values:" pattern
- ✓ extractEnumFromDescription ignores example patterns
- ✓ hoistImports separates static imports from body
- ✓ hoistImports handles multi-line imports
- ✓ hoistImports preserves dynamic imports in body
```

#### `generate.test.ts` - Code Generation Tests
```typescript
// Functions to test:
- toCamelCase()
- toKebabCase()
- toSnakeCase()
- toCallFunctionName()
- isValidIdentifier()
- generateParamDocs()
- generateArgsType()
- generateToolWrapper()
- generateServerIndex()

// Test cases:
- ✓ generates correct TypeScript type from JSON schema
- ✓ generates JSDoc param documentation
- ✓ generates valid tool wrapper code
- ✓ generates correct index file with exports
- ✓ handles tools with no parameters
- ✓ handles complex nested schemas
```

### 2. Integration Tests

Integration tests verify that components work correctly together with real file system operations but mocked MCP connections.

#### `mcp-connection.test.ts` - MCP Connection Tests
```typescript
// Test scenarios:
- ✓ connects to a mock MCP server successfully
- ✓ handles connection timeout gracefully
- ✓ retries on connection failure
- ✓ respects retry count configuration
- ✓ respects disabled server flag
- ✓ lists tools from connected server
- ✓ calls tool with correct arguments
- ✓ disconnects all clients properly
```

#### `tool-execution.test.ts` - Tool Execution Tests
```typescript
// Test scenarios:
- ✓ validates TypeScript code before execution
- ✓ executes valid TypeScript code
- ✓ handles execution timeout
- ✓ captures stdout and stderr correctly
- ✓ returns correct exit code on failure
- ✓ hoists imports correctly before execution
- ✓ adds auto-cleanup wrapper when autoExit=true
```

### 3. End-to-End Tests

E2E tests verify complete workflows using real file system and optionally real MCP servers.

#### `generate-workflow.test.ts` - Generate Workflow Tests
```typescript
// Test scenarios:
- ✓ generates wrapper files for all configured servers
- ✓ creates index.ts with all tool exports
- ✓ creates .d.ts declaration files
- ✓ cleans servers directory before generation
- ✓ handles --no-clean flag
- ✓ handles server connection failures gracefully
```

#### `execute-code-workflow.test.ts` - Execute Code Workflow Tests
```typescript
// Test scenarios:
- ✓ executes code that imports from servers/
- ✓ blocks execution without get_started
- ✓ validates code syntax before execution
- ✓ provides helpful error messages on import errors
- ✓ provides helpful error messages on .call() errors
```

## Mocking Strategy

### Mock MCP Client (`tests/mocks/mcp-client.ts`)

```typescript
import { vi } from 'vitest';

export const createMockClient = (tools: MockTool[] = []) => ({
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue({ tools }),
  callTool: vi.fn().mockImplementation(({ name, arguments: args }) => {
    // Return mock response based on tool name
    return Promise.resolve({
      content: [{ type: 'text', text: JSON.stringify({ success: true }) }]
    });
  }),
});

export const mockMcpModule = {
  connectServer: vi.fn(),
  disconnectAll: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  parseMcpResponse: vi.fn(),
};
```

### Test Fixtures

#### `tests/mocks/fixtures/mcp.json`
```json
{
  "servers": {
    "test-server": {
      "enabled": true,
      "description": "Test server for unit tests",
      "transport": "stdio",
      "command": "node",
      "args": ["test-server.js"],
      "timeout": 5000,
      "retries": 1
    },
    "disabled-server": {
      "enabled": false,
      "transport": "stdio",
      "command": "node",
      "args": ["disabled-server.js"]
    }
  }
}
```

## Configuration Files

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'build', 'servers'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Setup file for global mocks and utilities
    setupFiles: ['./tests/setup.ts'],
    // Pool configuration for better isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

### `tests/setup.ts`

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Global test utilities
export const testUtils = {
  createTempDir: async () => {
    // Create temporary directory for test files
  },
  cleanupTempDir: async () => {
    // Clean up temporary directory
  },
};
```

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e"
  }
}
```

## Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

## Implementation Priority

1. **Phase 1: Setup** (Essential)
   - Install Vitest and configure
   - Create test directory structure
   - Create mock fixtures

2. **Phase 2: Unit Tests** (High Priority)
   - `config.test.ts` - Most critical for configuration validation
   - `server-helpers.test.ts` - Test helper functions
   - `mcp.test.ts` - Test response parsing

3. **Phase 3: Integration Tests** (Medium Priority)
   - `mcp-connection.test.ts` - Test with mock MCP client
   - `tool-execution.test.ts` - Test code execution

4. **Phase 4: E2E Tests** (Lower Priority)
   - `generate-workflow.test.ts` - Full generation flow
   - `execute-code-workflow.test.ts` - Full execution flow

## Test Coverage Goals

| Module | Target Coverage |
|--------|----------------|
| config.ts | 90%+ |
| mcp.ts | 85%+ |
| server.ts | 80%+ |
| generate.ts | 80%+ |
| run.ts | 70%+ |

## Notes

### Helper Function Extraction

Some helper functions in `server.ts` are currently private. For better testability, consider:

1. **Extract to separate module**: Create `src/helpers.ts` for utility functions
2. **Export for testing**: Use `// @internal` JSDoc or separate internal exports

### Real Server Testing

All tests run by default, including those that verify real server interaction patterns. The test suite uses mocks to ensure tests are fast and reliable without requiring actual MCP server connections.

---

## Next Steps

1. Review and approve this testing plan
2. Switch to Code mode to implement the tests
3. Start with Phase 1: Setup Vitest configuration
4. Implement tests incrementally by phase