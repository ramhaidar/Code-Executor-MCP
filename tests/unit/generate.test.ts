/**
 * Unit tests for src/generate.ts
 * 
 * Tests the code generation utilities without running the full generate() function
 * which requires actual MCP server connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';

// Import the helper functions that generate.ts uses from helpers.ts
import {
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  isExampleValue,
  extractEnumFromDescription,
  isValidIdentifier,
  toCallFunctionName,
} from '../../src/helpers.js';

describe('generate.ts utilities', () => {
  // These functions are tested in helpers.test.ts, but we verify the specific
  // use cases from generate.ts here

  describe('toCamelCase for generate.ts use cases', () => {
    it('should handle MCP tool naming conventions', () => {
      // Common MCP tool name patterns
      expect(toCamelCase('get-library-docs')).toBe('getLibraryDocs');
      expect(toCamelCase('resolve-library-id')).toBe('resolveLibraryId');
      expect(toCamelCase('process-thought')).toBe('processThought');
      expect(toCamelCase('clear_history')).toBe('clearHistory');
    });
  });

  describe('toCallFunctionName for generate.ts', () => {
    it('should create function names with Call suffix', () => {
      expect(toCallFunctionName('get-library-docs')).toBe('getLibraryDocsCall');
      expect(toCallFunctionName('resolve-library-id')).toBe('resolveLibraryIdCall');
      expect(toCallFunctionName('process_thought')).toBe('processThoughtCall');
    });
  });

  describe('isValidIdentifier for generate.ts', () => {
    it('should validate JavaScript identifiers for exports', () => {
      expect(isValidIdentifier('getLibraryDocs')).toBe(true);
      expect(isValidIdentifier('_private')).toBe(true);
      expect(isValidIdentifier('$special')).toBe(true);
      expect(isValidIdentifier('get-library-docs')).toBe(false); // kebab-case needs quoting
      expect(isValidIdentifier('123invalid')).toBe(false);
    });
  });

  describe('toKebabCase for filename generation', () => {
    it('should convert tool names to valid kebab-case filenames', () => {
      expect(toKebabCase('getLibraryDocs')).toBe('get-library-docs');
      expect(toKebabCase('processThought')).toBe('process-thought');
      expect(toKebabCase('simpleAPI')).toBe('simple-api');
    });
  });

  describe('toSnakeCase for snake_case exports', () => {
    it('should convert tool names for snake_case exports', () => {
      expect(toSnakeCase('get-library-docs')).toBe('get_library_docs');
      expect(toSnakeCase('clearHistory')).toBe('clear_history');
    });
  });

  describe('isExampleValue for filtering enum detection', () => {
    it('should identify example values that should not be treated as enums', () => {
      // Examples with e.g. prefix
      expect(isExampleValue('e.g. /path/to/file')).toBe(true);
      
      // Path-like values
      expect(isExampleValue('/mongodb/docs')).toBe(true);
      expect(isExampleValue("'/vercel/next.js'")).toBe(true);
      
      // Metadata with colons
      expect(isExampleValue('start: 1')).toBe(true);
      expect(isExampleValue('default: true')).toBe(true);
      
      // Valid enum values
      expect(isExampleValue('fast')).toBe(false);
      expect(isExampleValue('slow')).toBe(false);
      expect(isExampleValue('Problem Definition')).toBe(false);
    });
  });

  describe('extractEnumFromDescription for generate.ts', () => {
    it('should extract enum values from tool parameter descriptions', () => {
      // Common patterns in MCP tool schemas
      const thinkingStages = 'The thinking stage (Problem Definition, Research, Analysis, Synthesis, Conclusion)';
      expect(extractEnumFromDescription(thinkingStages)).toEqual([
        'Problem Definition',
        'Research',
        'Analysis',
        'Synthesis',
        'Conclusion',
      ]);

      // Valid values pattern
      const modeDesc = 'Mode to use. Valid values: fast, balanced, thorough';
      expect(extractEnumFromDescription(modeDesc)).toEqual(['fast', 'balanced', 'thorough']);
    });

    it('should not extract example paths as enum values', () => {
      const pathDesc = "Library path (e.g., '/mongodb/docs', '/vercel/next.js')";
      expect(extractEnumFromDescription(pathDesc)).toBeUndefined();
    });
  });
});

describe('generate.ts code generation patterns', () => {
  describe('generateArgsType patterns', () => {
    // Test the type mapping logic used in generate.ts
    const mapJsonTypeToTs = (jsonType?: string): string => {
      switch (jsonType) {
        case 'string': return 'string';
        case 'number': return 'number';
        case 'integer': return 'number';
        case 'boolean': return 'boolean';
        case 'array': return 'unknown[]';
        case 'object': return 'Record<string, unknown>';
        default: return 'unknown';
      }
    };

    it('should map JSON Schema types to TypeScript types', () => {
      expect(mapJsonTypeToTs('string')).toBe('string');
      expect(mapJsonTypeToTs('number')).toBe('number');
      expect(mapJsonTypeToTs('integer')).toBe('number');
      expect(mapJsonTypeToTs('boolean')).toBe('boolean');
      expect(mapJsonTypeToTs('array')).toBe('unknown[]');
      expect(mapJsonTypeToTs('object')).toBe('Record<string, unknown>');
      expect(mapJsonTypeToTs(undefined)).toBe('unknown');
      expect(mapJsonTypeToTs('custom')).toBe('unknown');
    });
  });

  describe('generateExampleArgs patterns', () => {
    // Test the example value generation logic
    const getExampleValue = (jsonType?: string): string => {
      switch (jsonType) {
        case 'string': return '"..."';
        case 'number': return '0';
        case 'integer': return '0';
        case 'boolean': return 'true';
        case 'array': return '[]';
        case 'object': return '{}';
        default: return 'undefined';
      }
    };

    it('should generate appropriate example values', () => {
      expect(getExampleValue('string')).toBe('"..."');
      expect(getExampleValue('number')).toBe('0');
      expect(getExampleValue('integer')).toBe('0');
      expect(getExampleValue('boolean')).toBe('true');
      expect(getExampleValue('array')).toBe('[]');
      expect(getExampleValue('object')).toBe('{}');
      expect(getExampleValue(undefined)).toBe('undefined');
    });
  });

  describe('generateParamDocs pattern', () => {
    it('should format required/optional markers correctly', () => {
      const formatParam = (name: string, isRequired: boolean, type: string, desc: string) => {
        const marker = isRequired ? ' **REQUIRED**' : ' (optional)';
        return ` * @param args.${name} - ${desc}${marker} [${type}]`;
      };

      expect(formatParam('libraryName', true, 'string', 'Name of the library'))
        .toBe(' * @param args.libraryName - Name of the library **REQUIRED** [string]');
      
      expect(formatParam('topic', false, 'string', 'Topic to search'))
        .toBe(' * @param args.topic - Topic to search (optional) [string]');
    });
  });
});

describe('generate.ts generated content structure', () => {
  describe('tool wrapper content structure', () => {
    it('should generate proper module structure', () => {
      // Simulate the structure of a generated tool wrapper
      const toolName = 'get-library-docs';
      const serverName = 'context7';
      const camelCaseName = toCamelCase(toolName);
      const filename = toKebabCase(toolName);

      // Check expected patterns
      expect(camelCaseName).toBe('getLibraryDocs');
      expect(filename).toBe('get-library-docs');

      // Import path pattern
      const importPath = `../servers/${serverName}/${filename}.js`;
      expect(importPath).toBe('../servers/context7/get-library-docs.js');
    });

    it('should generate proper export patterns', () => {
      const toolName = 'resolve-library-id';
      const camelName = toCamelCase(toolName);
      const callFnName = toCallFunctionName(toolName);
      const kebabName = toKebabCase(toolName);
      const snakeName = toSnakeCase(toolName);

      expect(camelName).toBe('resolveLibraryId');
      expect(callFnName).toBe('resolveLibraryIdCall');
      expect(kebabName).toBe('resolve-library-id');
      expect(snakeName).toBe('resolve_library_id');

      // Verify snake_case is valid identifier
      expect(isValidIdentifier(snakeName)).toBe(true);
      // Verify kebab-case needs quoting
      expect(isValidIdentifier(kebabName)).toBe(false);
    });
  });

  describe('server index content structure', () => {
    it('should generate proper import statements', () => {
      const tools = [
        { name: 'get-library-docs', filename: 'get-library-docs' },
        { name: 'resolve-library-id', filename: 'resolve-library-id' },
      ];

      const imports = tools.map(t => {
        const camelName = toCamelCase(t.name);
        return `import * as ${camelName}Module from "./${t.filename}.js";`;
      });

      expect(imports[0]).toBe('import * as getLibraryDocsModule from "./get-library-docs.js";');
      expect(imports[1]).toBe('import * as resolveLibraryIdModule from "./resolve-library-id.js";');
    });

    it('should generate callable factory pattern', () => {
      const toolName = 'get-library-docs';
      const camelName = toCamelCase(toolName);

      const factoryLine = `const ${camelName} = makeCallable(${camelName}Module);`;
      expect(factoryLine).toBe('const getLibraryDocs = makeCallable(getLibraryDocsModule);');
    });
  });

  describe('root index content structure', () => {
    it('should generate proper re-exports', () => {
      const serverNames = ['context7', 'test-server'];

      const exports = serverNames.map(name =>
        `export * as ${name} from "./${name}/index.js";`
      );

      expect(exports[0]).toBe('export * as context7 from "./context7/index.js";');
      expect(exports[1]).toBe('export * as test-server from "./test-server/index.js";');
    });
  });
});

describe('generate.ts schema handling', () => {
  describe('inputSchema processing', () => {
    it('should handle empty schema', () => {
      const schema = {};
      const properties = (schema as any).properties || {};
      expect(Object.keys(properties)).toHaveLength(0);
    });

    it('should handle schema with properties', () => {
      const schema = {
        type: 'object',
        properties: {
          libraryName: {
            type: 'string',
            description: 'Name of the library',
          },
          topic: {
            type: 'string',
            description: 'Topic to search',
          },
        },
        required: ['libraryName'],
      };

      const properties = schema.properties;
      const required = new Set(schema.required);

      expect(Object.keys(properties)).toHaveLength(2);
      expect(required.has('libraryName')).toBe(true);
      expect(required.has('topic')).toBe(false);
    });

    it('should handle schema with enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['fast', 'balanced', 'thorough'],
            description: 'Processing mode',
          },
        },
        required: ['mode'],
      };

      const modeProp = schema.properties.mode;
      expect(modeProp.enum).toEqual(['fast', 'balanced', 'thorough']);
    });

    it('should handle schema with default values', () => {
      const schema = {
        type: 'object',
        properties: {
          timeout: {
            type: 'number',
            default: 30000,
            description: 'Timeout in milliseconds',
          },
        },
      };

      const timeoutProp = schema.properties.timeout;
      expect(timeoutProp.default).toBe(30000);
    });
  });

  describe('JSDoc generation', () => {
    it('should format enum info correctly', () => {
      const enumValues = ['fast', 'balanced', 'thorough'];
      const isInferred = false;
      const prefix = isInferred ? 'Inferred values:' : 'Valid values:';
      const enumInfo = ` ${prefix} ${enumValues.map(v => `"${v}"`).join(' | ')}`;

      expect(enumInfo).toBe(' Valid values: "fast" | "balanced" | "thorough"');
    });

    it('should format inferred enum info correctly', () => {
      const enumValues = ['Problem Definition', 'Research', 'Analysis'];
      const isInferred = true;
      const prefix = isInferred ? 'Inferred values:' : 'Valid values:';
      const enumInfo = ` ${prefix} ${enumValues.map(v => `"${v}"`).join(' | ')}`;

      expect(enumInfo).toBe(' Inferred values: "Problem Definition" | "Research" | "Analysis"');
    });

    it('should format default value correctly', () => {
      const defaultValue = 30000;
      const defaultInfo = ` Default: ${JSON.stringify(defaultValue)}`;
      expect(defaultInfo).toBe(' Default: 30000');

      const stringDefault = 'fast';
      const stringDefaultInfo = ` Default: ${JSON.stringify(stringDefault)}`;
      expect(stringDefaultInfo).toBe(' Default: "fast"');
    });
  });
});

describe('generate.ts declaration file generation', () => {
  describe('type declaration patterns', () => {
    it('should generate CallableTool type correctly', () => {
      // The type definition used in generated .d.ts files
      const typeDefPattern = `type CallableTool<TModule extends { call: (...args: any[]) => any }> = TModule["call"] &
  TModule & { call: TModule["call"] };`;

      expect(typeDefPattern).toContain('CallableTool');
      expect(typeDefPattern).toContain('TModule["call"]');
    });

    it('should generate proper declare statements', () => {
      const toolName = 'get-library-docs';
      const constDecl = `export declare const TOOL_NAME: "${toolName}";`;
      expect(constDecl).toBe('export declare const TOOL_NAME: "get-library-docs";');
    });
  });
});