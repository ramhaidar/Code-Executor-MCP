/**
 * Scenario: Looking up a single library's documentation
 * Direct approach: Load all tool definitions + pass result through context
 * Code execution: Load only needed tool definition + execute code
 */

import type { BenchmarkScenario, ToolDefinition } from '../src/types.js';
import { generateRealisticToolDefinitions } from './helpers.js';

// Get all 25+ tool definitions to simulate a real MCP environment
const allToolDefinitions = generateRealisticToolDefinitions() as ToolDefinition[];

// The single tool that's actually used
const resolveLibraryIdTool: ToolDefinition = {
  name: 'resolve-library-id',
  description: 'Resolve a library name to its Context7 library ID',
  inputSchema: {
    type: 'object',
    properties: {
      libraryName: { type: 'string', description: 'Library name to resolve' }
    },
    required: ['libraryName']
  }
};

export const simpleToolCall: BenchmarkScenario = {
  name: 'Simple Tool Call',
  description: 'Single tool call to fetch library documentation. Demonstrates overhead of loading 25+ tool definitions when only 1 is needed.',

  // Direct approach: All 25+ tools loaded upfront in system prompt
  toolDefinitions: allToolDefinitions,

  // The intermediate result that would pass through the model
  intermediateResults: [
    {
      toolName: 'resolve-library-id',
      result: JSON.stringify({
        libraries: [
          { id: '/facebook/react', name: 'React', version: '18.2.0', description: 'A JavaScript library for building user interfaces' },
          { id: '/facebook/react-native', name: 'React Native', version: '0.72.0', description: 'A framework for building native apps with React' },
          { id: '/preactjs/preact', name: 'Preact', version: '10.19.0', description: 'Fast 3kB alternative to React with the same modern API' }
        ]
      }),
      passedToModel: true
    }
  ],

  // Code execution approach
  codeExecutionApproach: {
    code: `import { resolveLibraryId } from '../servers/context7/index.js';

const result = await resolveLibraryId.call({ libraryName: "react" });
console.log(result.libraries[0].id);`,
    // Only the single tool that was actually used
    loadedDefinitions: [resolveLibraryIdTool],
    finalResult: '/facebook/react'
  }
};