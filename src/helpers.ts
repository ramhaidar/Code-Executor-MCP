/**
 * Helper functions extracted from server.ts for better testability
 * 
 * These utility functions are used by the MCP server but are also
 * exported for unit testing.
 */

/**
 * Convert kebab-case or other formats to camelCase
 * Examples:
 *   clear-history → clearHistory
 *   process_thought → processThought
 */
export function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert camelCase to kebab-case
 * Examples:
 *   clearHistory → clear-history
 *   processThought → process-thought
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Check if a value looks like an example rather than an enum value.
 * Examples typically:
 *   - Start with e.g. or i.e.
 *   - Contain colons (like "start: 1")
 *   - Are wrapped in quotes (like "'/mongodb/docs'")
 *   - Look like paths (start with /)
 */
export function isExampleValue(value: string): boolean {
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
export function extractEnumFromDescription(description: string): string[] | undefined {
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

/**
 * Extract static import statements from code and separate them from the body.
 * Static imports must be at module top-level, so we hoist them above any wrapper.
 *
 * Handles:
 * - import { x } from 'module';
 * - import * as x from 'module';
 * - import x from 'module';
 * - import 'module';
 * - Multi-line imports with { ... }
 */
export function hoistImports(code: string): { imports: string; body: string } {
  const lines = code.split('\n');
  const importLines: string[] = [];
  const bodyLines: string[] = [];

  let inMultiLineImport = false;
  let multiLineBuffer = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if we're continuing a multi-line import
    if (inMultiLineImport) {
      multiLineBuffer += '\n' + line;
      // Check if this line ends the import (has 'from' and ends with semicolon or quote)
      if (trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) {
        importLines.push(multiLineBuffer);
        multiLineBuffer = '';
        inMultiLineImport = false;
      } else if (trimmed.endsWith(';')) {
        // Side-effect import ending
        importLines.push(multiLineBuffer);
        multiLineBuffer = '';
        inMultiLineImport = false;
      }
      continue;
    }

    // Check if this is a static import statement
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      // Check if it's a complete single-line import
      if ((trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) ||
        (trimmed.startsWith("import '") || trimmed.startsWith('import "'))) {
        // Complete single-line import
        importLines.push(line);
      } else if (trimmed.includes('from') === false && trimmed.includes('{')) {
        // Multi-line import starting (e.g., "import {")
        inMultiLineImport = true;
        multiLineBuffer = line;
      } else if (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"')) {
        // Complete import
        importLines.push(line);
      } else {
        // Start of multi-line import
        inMultiLineImport = true;
        multiLineBuffer = line;
      }
    } else {
      bodyLines.push(line);
    }
  }

  // If we ended while still in a multi-line import, treat it as body (malformed)
  if (inMultiLineImport && multiLineBuffer) {
    bodyLines.unshift(multiLineBuffer);
  }

  return {
    imports: importLines.join('\n'),
    body: bodyLines.join('\n')
  };
}

/**
 * Convert kebab-case or camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/-/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Check if a string is a valid JavaScript identifier (unquoted export name)
 */
export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Convert tool name to camelCase function name with "Call" suffix
 * Examples:
 *   process-thought → processThoughtCall
 *   get-library-docs → getLibraryDocsCall
 *   resolve_library_id → resolveLibraryIdCall
 */
export function toCallFunctionName(str: string): string {
  const camel = toCamelCase(str);
  return camel + "Call";
}

/**
 * Safely format error details for JSON output.
 * Handles Error instances with name, message, and stack.
 * Uses JSON.stringify consistently for all error formatting.
 *
 * @param error - The error to format (can be Error instance or any other value)
 * @returns A JSON-safe string representation of the error
 */
export function formatErrorForJson(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  }
  return JSON.stringify(String(error));
}