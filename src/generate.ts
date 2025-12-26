import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, initConfigPaths } from "./config.js";
import { connectServer, listTools, disconnectAll, type Tool } from "./mcp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = join(__dirname, "..", "servers");

// Parse CLI args
const args = process.argv.slice(2);
initConfigPaths(args);

// Check for --no-clean flag
const noClean = args.includes("--no-clean");

/**
 * Convert kebab-case or other formats to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert tool name to camelCase function name with "Call" suffix
 * Examples:
 *   process-thought → processThoughtCall
 *   get-library-docs → getLibraryDocsCall
 *   resolve_library_id → resolveLibraryIdCall
 */
function toCallFunctionName(str: string): string {
  const camel = toCamelCase(str);
  return camel + "Call";
}

/**
 * Check if a string is a valid JavaScript identifier (unquoted export name)
 */
function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Convert kebab-case or camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/-/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Convert tool name to valid kebab-case filename
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

interface InputSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];      // Enum values
  default?: unknown;    // Default value
}

/**
 * Check if a value looks like an example rather than an enum value.
 * Examples typically:
 *   - Start with e.g. or i.e.
 *   - Contain colons (like "start: 1")
 *   - Are wrapped in quotes (like "'/mongodb/docs'")
 *   - Look like paths (start with /)
 */
function isExampleValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  // Check for example indicators
  if (trimmed === 'e.g.' || trimmed === 'i.e.' ||
    trimmed.startsWith('e.g.') || trimmed.startsWith('i.e.')) {
    return true;
  }

  // Check for colon (metadata like "start: 1", "default: 1")
  if (value.includes(':')) {
    return true;
  }

  // Check for quoted values (examples are often quoted)
  if (/^['"].*['"]$/.test(value.trim())) {
    return true;
  }

  // Check for path-like values (start with /)
  if (value.trim().startsWith('/') || value.trim().startsWith("'/") || value.trim().startsWith('"/')) {
    return true;
  }

  return false;
}

/**
 * Extract enum-like values from a description string.
 * Looks for patterns like:
 *   - "Valid values: A, B, C"
 *   - "(A, B, C)"
 *   - "one of: A, B, C"
 *   - "must be A, B, or C"
 *   - "The thinking stage (Problem Definition, Research, Analysis, Synthesis, Conclusion)"
 *
 * Filters out example patterns like:
 *   - "(e.g., '/mongodb/docs', '/vercel/next.js')" - examples, not enums
 *   - "(start: 1, default: 1)" - metadata, not enums
 *
 * Returns undefined if no enum-like pattern is found.
 */
function extractEnumFromDescription(description: string): string[] | undefined {
  // Pattern 1: Parenthesized list with comma-separated values
  // e.g., "(Problem Definition, Research, Analysis, Synthesis, Conclusion)"
  const parenMatch = description.match(/\(([^)]+(?:,\s*[^)]+)+)\)/);
  if (parenMatch) {
    const rawContent = parenMatch[1];

    // Skip if the content starts with "e.g." or "i.e." - these are examples
    if (/^\s*(e\.g\.|i\.e\.)/i.test(rawContent)) {
      // This is an example list, not an enum - skip Pattern 1
    } else {
      const values = rawContent
        .split(/,\s*/)
        .map(v => v.trim())
        .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

      // Only return if we have 2-10 values (reasonable enum size)
      if (values.length >= 2 && values.length <= 10) {
        return values;
      }
    }
  }

  // Pattern 2: "Valid values:" or "Allowed values:" followed by list
  const validMatch = description.match(/(?:valid|allowed)\s+values?:\s*([^.]+)/i);
  if (validMatch) {
    const values = validMatch[1]
      .split(/[,|]|\s+or\s+/)
      .map(v => v.trim().replace(/^["']|["']$/g, ''))
      .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

    if (values.length >= 2 && values.length <= 10) {
      return values;
    }
  }

  // Pattern 3: "one of:" or "must be one of:" followed by list
  const oneOfMatch = description.match(/(?:one of|must be):\s*([^.]+)/i);
  if (oneOfMatch) {
    const values = oneOfMatch[1]
      .split(/[,|]|\s+or\s+/)
      .map(v => v.trim().replace(/^["']|["']$/g, ''))
      .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

    if (values.length >= 2 && values.length <= 10) {
      return values;
    }
  }

  return undefined;
}

interface InputSchema {
  type?: string;
  properties?: Record<string, InputSchemaProperty>;
  required?: string[];
}

/**
 * Generate JSDoc @param lines from inputSchema properties
 * @param inputSchema - The JSON schema for the tool's input
 * @param toolDescription - Optional tool description to extract enum hints from
 */
function generateParamDocs(inputSchema?: object, toolDescription?: string): string {
  if (!inputSchema) return "";
  const schema = inputSchema as InputSchema;
  if (!schema.properties) return "";

  const required = new Set(schema.required ?? []);
  const lines: string[] = [];

  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const isRequired = required.has(propName);
    const typeStr = propDef.type ?? "unknown";
    const desc = propDef.description ?? "";

    // Clear required/optional marker
    const requiredMarker = isRequired ? " **REQUIRED**" : " (optional)";

    // Add enum values if present (explicit or inferred from description)
    let enumInfo = "";
    let enumValues = propDef.enum;
    let isInferred = false;

    if (!enumValues) {
      // First try property description
      if (propDef.description) {
        enumValues = extractEnumFromDescription(propDef.description);
        isInferred = true;
      }
      // If not found, try to find in tool description (e.g., "stage: The thinking stage (A, B, C)")
      // Use word boundary to ensure we match the exact parameter name
      if (!enumValues && toolDescription) {
        // Match pattern: "paramName:" or "paramName :" followed by description with parenthesized values
        // The \b ensures we match whole words only
        const paramPattern = new RegExp(`\\b${propName}\\s*:\\s*[^(\\n]*\\(([^)]+)\\)`, 'i');
        const paramMatch = toolDescription.match(paramPattern);
        if (paramMatch) {
          enumValues = extractEnumFromDescription(`(${paramMatch[1]})`);
          isInferred = true;
        }
      }
    }

    if (enumValues && enumValues.length > 0) {
      const prefix = isInferred ? "Inferred values:" : "Valid values:";
      enumInfo = ` ${prefix} ${enumValues.map(v => `"${v}"`).join(" | ")}`;
    }

    // Add default value if present
    let defaultInfo = "";
    if (propDef.default !== undefined) {
      defaultInfo = ` Default: ${JSON.stringify(propDef.default)}`;
    }

    lines.push(` * @param args.${propName} - ${desc}${requiredMarker}${enumInfo}${defaultInfo} [${typeStr}]`);
  }

  return lines.join("\n");
}

/**
 * Generate TypeScript type from inputSchema
 */
function generateArgsType(inputSchema?: object): string {
  if (!inputSchema) return "unknown";
  const schema = inputSchema as InputSchema;
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return "Record<string, unknown>";
  }

  const required = new Set(schema.required ?? []);
  const props: string[] = [];

  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const isRequired = required.has(propName);
    const tsType = mapJsonTypeToTs(propDef.type);
    const opt = isRequired ? "" : "?";
    props.push(`  ${propName}${opt}: ${tsType};`);
  }

  return `{\n${props.join("\n")}\n}`;
}

/**
 * Map JSON Schema type to TypeScript type
 */
function mapJsonTypeToTs(jsonType?: string): string {
  switch (jsonType) {
    case "string": return "string";
    case "number": return "number";
    case "integer": return "number";
    case "boolean": return "boolean";
    case "array": return "unknown[]";
    case "object": return "Record<string, unknown>";
    default: return "unknown";
  }
}

/**
 * Generate example args from inputSchema
 */
function generateExampleArgs(inputSchema?: object): string {
  if (!inputSchema) return "{}";
  const schema = inputSchema as InputSchema;
  if (!schema.properties) return "{}";

  const examples: string[] = [];
  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const exampleValue = getExampleValue(propDef.type);
    examples.push(`${propName}: ${exampleValue}`);
  }

  if (examples.length === 0) return "{}";
  return `{ ${examples.join(", ")} }`;
}

/**
 * Get example value for a JSON Schema type
 */
function getExampleValue(jsonType?: string): string {
  switch (jsonType) {
    case "string": return '"..."';
    case "number": return "0";
    case "integer": return "0";
    case "boolean": return "true";
    case "array": return "[]";
    case "object": return "{}";
    default: return "undefined";
  }
}

/**
 * Generate tool wrapper file content with JSDoc
 */
function generateToolWrapper(serverName: string, tool: Tool): string {
  const { name: toolName, description, inputSchema } = tool;
  const argsType = generateArgsType(inputSchema);
  const paramDocs = generateParamDocs(inputSchema, description);
  const exampleArgs = generateExampleArgs(inputSchema);
  const desc = description ?? `Call the ${toolName} tool`;
  const schemaStr = inputSchema ? JSON.stringify(inputSchema, null, 2) : "{}";
  const filename = toKebabCase(toolName);
  const camelCaseName = toCamelCase(toolName);

  const paramDocsSection = paramDocs ? `\n${paramDocs}` : "";

  return `/**
 * Auto-generated wrapper for ${toolName} tool from ${serverName} server
 *
 * @module
 * @example
 * // Import the tool (from workspace/ directory)
 * import * as ${camelCaseName} from "../servers/${serverName}/${filename}.js";
 * // Or import from server index
 * import { ${camelCaseName} } from "../servers/${serverName}/index.js";
 *
 * // Call the tool (always use .call())
 * const result = await ${camelCaseName}.call({ ...args });
 *
 * // Call with timeout (30 seconds)
 * const result = await ${camelCaseName}.call({ ...args }, { timeout: 30000 });
 *
 * // Check schema for parameters
 * console.log(${camelCaseName}.SCHEMA);
 *
 * NOTE: Import paths use .js extension for ESM compatibility.
 * TypeScript resolves these to .ts files at compile time.
 * See: https://www.typescriptlang.org/docs/handbook/esm-node.html
 */
import { callTool, connectServer, parseMcpResponse } from "../../src/mcp.js";

/** Original MCP tool name */
export const TOOL_NAME = "${toolName}";

/**
 * Full JSON Schema for tool parameters.
 * Use this to discover required parameters, types, and valid enum values.
 */
export const SCHEMA = ${schemaStr} as const;

/**
 * ${desc}
 * @param args - Tool arguments${paramDocsSection}
 * @param options - Optional call options
 * @param options.timeout - Timeout in milliseconds (optional)
 * @returns Promise resolving to tool result
 * @example
 * const result = await call(${exampleArgs});
 * // With timeout:
 * const result = await call(${exampleArgs}, { timeout: 30000 });
 */
export async function call(args: ${argsType}, options?: { timeout?: number }): Promise<unknown> {
  await connectServer("${serverName}");
  const result = await callTool("${serverName}", "${toolName}", args, options?.timeout);
  return parseMcpResponse(result);
}
`;
}

/**
 * Generate .d.ts declaration file content
 */
function generateToolDeclaration(serverName: string, tool: Tool): string {
  const { name: toolName, description, inputSchema } = tool;
  const argsType = generateArgsType(inputSchema);
  const paramDocs = generateParamDocs(inputSchema, description);
  const desc = description ?? `Call the ${toolName} tool`;
  const exampleArgs = generateExampleArgs(inputSchema);

  const paramDocsSection = paramDocs ? `\n${paramDocs}` : "";

  return `// Auto-generated type declarations for ${toolName} tool from ${serverName} server

/** Original MCP tool name */
export declare const TOOL_NAME: "${toolName}";

/**
 * Full JSON Schema for tool parameters.
 * Use this to discover required parameters, types, and valid enum values.
 */
export declare const SCHEMA: object;

/**
 * ${desc}
 * @param args - Tool arguments${paramDocsSection}
 * @param options - Optional call options
 * @param options.timeout - Timeout in milliseconds (optional)
 * @returns Promise resolving to tool result
 * @example
 * const result = await call(${exampleArgs});
 * // With timeout:
 * const result = await call(${exampleArgs}, { timeout: 30000 });
 */
export declare function call(args: ${argsType}, options?: { timeout?: number }): Promise<unknown>;
`;
}

/**
 * Generate server index file content
 */
function generateServerIndex(
  serverName: string,
  tools: Array<{ name: string; filename: string; description?: string }>
): string {
  const imports: string[] = [];
  const callableFactories: string[] = [];
  const callableExports: string[] = [];
  const directFunctionExports: string[] = [];
  const kebabAliasExports: string[] = [];

  // Get first tool name for example (or use placeholder)
  const exampleToolName = tools.length > 0 ? toCamelCase(tools[0].name) : "toolName";
  const exampleCallFn = tools.length > 0 ? toCallFunctionName(tools[0].name) : "toolNameCall";
  const exampleKebab = tools.length > 0 ? toKebabCase(tools[0].name) : "tool-name";
  const exampleSnake = tools.length > 0 ? toSnakeCase(tools[0].name) : "tool_name";

  for (const t of tools) {
    const camelName = toCamelCase(t.name);
    const callFnName = toCallFunctionName(t.name);
    const kebabName = toKebabCase(t.name);
    const snakeName = toSnakeCase(t.name);

    imports.push(`import * as ${camelName}Module from "./${t.filename}.js";`);
    callableFactories.push(`const ${camelName} = makeCallable(${camelName}Module);`);
    callableExports.push(`  ${camelName},`);

    // Direct function export for convenience
    directFunctionExports.push(`export { call as ${callFnName} } from "./${t.filename}.js";`);

    // Snake_case direct function export (matches common MCP tool naming)
    // This allows: server.clear_history({}) syntax
    if (isValidIdentifier(snakeName) && snakeName !== camelName && snakeName !== callFnName) {
      directFunctionExports.push(`export { call as ${snakeName} } from "./${t.filename}.js";`);
    }

    // Kebab-case alias (matches original MCP tool name) - quoted for valid JS identifier
    // This allows: server['tool-name']({}) syntax
    kebabAliasExports.push(`export { call as "${kebabName}" } from "./${t.filename}.js";`);
  }

  return `/**
 * Auto-generated index for ${serverName} server
 *
 * @module
 *
 * ## Usage
 *
 * ### Callable exports (functions with metadata)
 * \`\`\`typescript
 * // From workspace/ directory:
 * import { ${exampleToolName} } from "../servers/${serverName}/index.js";
 * await ${exampleToolName}({ param: "value" });
 * // Still supports .call and SCHEMA metadata:
 * await ${exampleToolName}.call({ param: "value" });
 * console.log(${exampleToolName}.SCHEMA);
 * \`\`\`
 *
 * ### Direct function imports (convenience for single tools)
 * \`\`\`typescript
 * // From workspace/ directory:
 * import { ${exampleCallFn} } from "../servers/${serverName}/index.js";
 * await ${exampleCallFn}({ param: "value" });
 * \`\`\`
 *
 * ### Snake_case function imports (matches MCP tool naming)
 * \`\`\`typescript
 * // From workspace/ directory:
 * import * as server from "../servers/${serverName}/index.js";
 * await server.${exampleSnake}({ param: "value" });
 * \`\`\`
 *
 * ### Kebab-case access (matches original MCP tool names)
 * \`\`\`typescript
 * // From workspace/ directory:
 * import * as server from "../servers/${serverName}/index.js";
 * await server["${exampleKebab}"]({ param: "value" });
 * \`\`\`
 *
 * ### Import all tools as namespace
 * \`\`\`typescript
 * // From workspace/ directory:
 * import * as ${serverName.replace(/-/g, "_")} from "../servers/${serverName}/index.js";
 * await ${serverName.replace(/-/g, "_")}.${exampleToolName}({ param: "value" });
 * \`\`\`
 *
 * ## Naming Conventions
 * - Callable exports (camelCase) can be invoked directly OR via .call() and expose SCHEMA/TOOL_NAME
 * - Direct function exports use camelCase + "Call" suffix (e.g., resolveLibraryIdCall)
 * - Snake_case exports match common MCP tool names (e.g., clear_history) - call directly
 * - Kebab-case exports match original MCP tool names (e.g., "resolve-library-id")
 *
 * NOTE: Import paths use .js extension for ESM compatibility.
 * TypeScript resolves these to .ts files at compile time.
 * See: https://www.typescriptlang.org/docs/handbook/esm-node.html
 */

${imports.join("\n")}

// Turn a tool module into a callable function that still exposes .call, SCHEMA, and TOOL_NAME
function makeCallable(module: { call: (...args: unknown[]) => Promise<unknown> }): any {
  const callable = (...args: Parameters<typeof module.call>) => module.call(...args);
  return Object.assign(callable, module, { call: module.call });
}

// Callable exports (functions with metadata)
${callableFactories.join("\n")}

export {
${callableExports.join("\n")}
};

// Direct function exports (convenience) - call directly without .call()
${directFunctionExports.join("\n")}

// Kebab-case aliases (match original MCP tool names) - call directly
${kebabAliasExports.join("\n")}
`;
}

/**
 * Generate server index .d.ts declaration file content
 */
function generateServerIndexDeclaration(
  serverName: string,
  tools: Array<{ name: string; filename: string }>
): string {
  const callableExports: string[] = [];
  const directFunctionExports: string[] = [];
  const kebabAliasExports: string[] = [];

  for (const t of tools) {
    const camelName = toCamelCase(t.name);
    const callFnName = toCallFunctionName(t.name);
    const kebabName = toKebabCase(t.name);
    const snakeName = toSnakeCase(t.name);

    callableExports.push(
      `export const ${camelName}: CallableTool<typeof import("./${t.filename}.js")>;`
    );
    directFunctionExports.push(`export { call as ${callFnName} } from "./${t.filename}.js";`);
    // Snake_case direct function export
    if (isValidIdentifier(snakeName) && snakeName !== camelName && snakeName !== callFnName) {
      directFunctionExports.push(`export { call as ${snakeName} } from "./${t.filename}.js";`);
    }
    kebabAliasExports.push(`export { call as "${kebabName}" } from "./${t.filename}.js";`);
  }

  return `// Auto-generated type declarations for ${serverName} server
//
// NAMING CONVENTIONS:
// - Callable exports use camelCase (e.g., resolveLibraryId) and can be called directly OR via .call()
// - Direct function exports use camelCase + "Call" suffix (e.g., resolveLibraryIdCall)
// - Snake_case exports match common MCP tool names (e.g., clear_history) - call directly
// - Kebab-case exports match original MCP tool names (e.g., "resolve-library-id")

type CallableTool<TModule extends { call: (...args: any[]) => any }> = TModule["call"] &
  TModule & { call: TModule["call"] };

// Callable exports (functions with metadata)
${callableExports.join("\n")}

// Direct function exports (convenience) - call directly without .call()
${directFunctionExports.join("\n")}

// Kebab-case aliases (match original MCP tool names) - call directly
${kebabAliasExports.join("\n")}
`;
}

/**
 * Generate root barrel file content for servers/index.ts
 */
function generateRootIndex(serverNames: string[]): string {
  const exports: string[] = [];
  const serverList = serverNames.map(s => ` *   - ${s}`).join("\n");
  const exampleServer = serverNames.length > 0 ? serverNames[0] : "serverName";

  for (const serverName of serverNames) {
    // Quote server names with hyphens to make them valid identifiers
    const exportName = isValidIdentifier(serverName) ? serverName : `"${serverName}"`;
    exports.push(`export * as ${exportName} from "./${serverName}/index.js";`);
  }

  return `/**
 * MCP Server Wrappers - Root Index
 *
 * This file re-exports all available MCP server modules.
 *
 * Available servers:
${serverList}
 *
 * Usage (from workspace/ directory):
 *   import * as servers from '../servers/index.js';
 *   await servers.${exampleServer}.toolName.call({ ... });
 *
 * Or import specific server:
 *   import { ${exampleServer} } from '../servers/index.js';
 *   await ${exampleServer}.toolName.call({ ... });
 *
 * NOTE: Import paths use .js extension for ESM compatibility.
 * TypeScript resolves these to .ts files at compile time.
 */

${exports.join("\n")}
`;
}

/**
 * Generate root barrel declaration file content for servers/index.d.ts
 */
function generateRootIndexDeclaration(serverNames: string[]): string {
  const exports: string[] = [];
  const serverList = serverNames.map(s => `*   - ${s}`).join("\n");

  for (const serverName of serverNames) {
    // Quote server names with hyphens to make them valid identifiers
    const exportName = isValidIdentifier(serverName) ? serverName : `"${serverName}"`;
    exports.push(`export * as ${exportName} from "./${serverName}/index.js";`);
  }

  return `/**
 * MCP Server Wrappers - Root Index Type Declarations
 *
 * Available servers:
${serverList}
 */

${exports.join("\n")}
`;
}

/**
 * Generate wrapper files for all configured MCP servers
 */
export async function generate(): Promise<void> {
  const config = await loadConfig();
  const serverNames = Object.keys(config.servers);
  const stats: Array<{ server: string; tools: number }> = [];

  // Clean servers directory by default unless --no-clean is specified
  if (!noClean) {
    console.log("Cleaning servers directory...");
    await rm(SERVERS_DIR, { recursive: true, force: true });
  }

  for (const serverName of serverNames) {
    console.log(`Connecting to ${serverName}...`);
    await connectServer(serverName);

    const tools = await listTools(serverName);
    console.log(`  Found ${tools.length} tools`);

    const serverDir = join(SERVERS_DIR, serverName);
    await mkdir(serverDir, { recursive: true });

    const toolFiles: Array<{ name: string; filename: string; description?: string }> = [];

    for (const tool of tools) {
      const filename = toKebabCase(tool.name);
      const filePath = join(serverDir, `${filename}.ts`);
      const dtsPath = join(serverDir, `${filename}.d.ts`);

      const content = generateToolWrapper(serverName, tool);
      const dtsContent = generateToolDeclaration(serverName, tool);

      await writeFile(filePath, content, "utf-8");
      await writeFile(dtsPath, dtsContent, "utf-8");

      toolFiles.push({ name: tool.name, filename, description: tool.description });
      console.log(`  Generated ${filename}.ts + ${filename}.d.ts`);
    }

    const indexPath = join(serverDir, "index.ts");
    const indexDtsPath = join(serverDir, "index.d.ts");
    const indexContent = generateServerIndex(serverName, toolFiles);
    const indexDtsContent = generateServerIndexDeclaration(serverName, toolFiles);

    await writeFile(indexPath, indexContent, "utf-8");
    await writeFile(indexDtsPath, indexDtsContent, "utf-8");
    console.log(`  Generated index.ts + index.d.ts`);

    stats.push({ server: serverName, tools: tools.length });
  }

  // Generate root barrel file
  const rootIndexPath = join(SERVERS_DIR, "index.ts");
  const rootIndexDtsPath = join(SERVERS_DIR, "index.d.ts");
  const rootIndexContent = generateRootIndex(serverNames);
  const rootIndexDtsContent = generateRootIndexDeclaration(serverNames);

  await writeFile(rootIndexPath, rootIndexContent, "utf-8");
  await writeFile(rootIndexDtsPath, rootIndexDtsContent, "utf-8");
  console.log(`Generated servers/index.ts + servers/index.d.ts`);

  await disconnectAll();

  console.log("\nGeneration complete:");
  for (const s of stats) {
    console.log(`  ${s.server}: ${s.tools} tools`);
  }
}

// CLI entry point
generate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Generation failed:", err);
    process.exit(1);
  });