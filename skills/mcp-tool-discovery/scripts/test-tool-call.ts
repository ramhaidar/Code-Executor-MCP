/**
 * Test Tool Call Script
 * 
 * A utility script to test calling an MCP tool and see the result.
 * Demonstrates the correct .call() pattern for tool invocation.
 */

/**
 * Example: Test calling a Context7 tool
 * 
 * Usage in execute_code:
 * ```typescript
 * import { resolveLibraryId } from '../servers/context7/index.js';
 * 
 * const result = await resolveLibraryId.call({ libraryName: "react" });
 * console.log(result);
 * ```
 */

console.log(`
=== MCP Tool Call Test Pattern ===

✅ CORRECT Pattern:
   import { toolName } from '../servers/server-name/index.js';
   const result = await toolName.call({ param: "value" });

❌ WRONG Pattern (will fail):
   const result = await toolName({ param: "value" });  // Missing .call()

Key Points:
1. All tool exports are objects with a .call() method
2. Import from '../servers/<server>/index.js' for bundled access
3. Or import specific tool: '../servers/<server>/<tool-name>.js'

Example Tool Test:
`);

// To actually test a tool, uncomment and modify:
// import { resolveLibraryId } from '../../../servers/context7/index.js';
// const result = await resolveLibraryId.call({ libraryName: "react" });
// console.log(JSON.stringify(result, null, 2));

console.log('To test a specific tool, modify this script with your import and call.');