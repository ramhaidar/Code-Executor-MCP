/**
 * Unit tests for src/helpers.ts
 */
import { describe, it, expect } from 'vitest';
import {
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  isExampleValue,
  extractEnumFromDescription,
  hoistImports,
  isValidIdentifier,
  toCallFunctionName,
  formatErrorForJson,
} from '../../src/helpers.js';

describe('helpers.ts', () => {
  describe('toCamelCase', () => {
    it('should convert kebab-case to camelCase', () => {
      expect(toCamelCase('clear-history')).toBe('clearHistory');
      expect(toCamelCase('get-library-docs')).toBe('getLibraryDocs');
      expect(toCamelCase('resolve-library-id')).toBe('resolveLibraryId');
    });

    it('should convert snake_case to camelCase', () => {
      expect(toCamelCase('process_thought')).toBe('processThought');
      expect(toCamelCase('get_user_info')).toBe('getUserInfo');
    });

    it('should handle already camelCase strings', () => {
      expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel');
    });

    it('should handle single word', () => {
      expect(toCamelCase('simple')).toBe('simple');
    });

    it('should handle multiple consecutive separators', () => {
      expect(toCamelCase('a-b-c')).toBe('aBC');
      expect(toCamelCase('a_b_c')).toBe('aBC');
    });
  });

  describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('clearHistory')).toBe('clear-history');
      expect(toKebabCase('processThought')).toBe('process-thought');
      expect(toKebabCase('getLibraryDocs')).toBe('get-library-docs');
    });

    it('should handle already kebab-case strings', () => {
      expect(toKebabCase('already-kebab')).toBe('already-kebab');
    });

    it('should handle single word', () => {
      expect(toKebabCase('simple')).toBe('simple');
    });

    it('should handle consecutive uppercase letters', () => {
      // Note: The current implementation converts getHTTPResponse to get-httpresponse
      // This is the actual behavior of the toKebabCase function
      expect(toKebabCase('getHTTPResponse')).toBe('get-httpresponse');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert kebab-case to snake_case', () => {
      expect(toSnakeCase('clear-history')).toBe('clear_history');
      expect(toSnakeCase('get-library-docs')).toBe('get_library_docs');
    });

    it('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('clearHistory')).toBe('clear_history');
      expect(toSnakeCase('processThought')).toBe('process_thought');
    });

    it('should handle already snake_case strings', () => {
      expect(toSnakeCase('already_snake')).toBe('already_snake');
    });
  });

  describe('isExampleValue', () => {
    it('should identify e.g. patterns', () => {
      expect(isExampleValue('e.g.')).toBe(true);
      expect(isExampleValue('e.g. example')).toBe(true);
      expect(isExampleValue('i.e.')).toBe(true);
      expect(isExampleValue('i.e. something')).toBe(true);
    });

    it('should identify colon patterns', () => {
      expect(isExampleValue('start: 1')).toBe(true);
      expect(isExampleValue('default: true')).toBe(true);
    });

    it('should identify quoted values', () => {
      expect(isExampleValue("'quoted'")).toBe(true);
      expect(isExampleValue('"quoted"')).toBe(true);
    });

    it('should identify path-like values', () => {
      expect(isExampleValue('/path/to/file')).toBe(true);
      expect(isExampleValue("'/mongodb/docs'")).toBe(true);
      expect(isExampleValue('"/vercel/next.js"')).toBe(true);
    });

    it('should return false for regular values', () => {
      expect(isExampleValue('fast')).toBe(false);
      expect(isExampleValue('slow')).toBe(false);
      expect(isExampleValue('Problem Definition')).toBe(false);
    });
  });

  describe('extractEnumFromDescription', () => {
    it('should extract values from parenthesized list', () => {
      const description = 'The thinking stage (Problem Definition, Research, Analysis, Synthesis, Conclusion)';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual([
        'Problem Definition',
        'Research',
        'Analysis',
        'Synthesis',
        'Conclusion',
      ]);
    });

    it('should extract values from "Valid values:" pattern', () => {
      const description = 'The mode to use. Valid values: fast, slow, balanced';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['fast', 'slow', 'balanced']);
    });

    it('should extract values from "one of:" pattern', () => {
      const description = 'Priority must be one of: low, medium, high';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['low', 'medium', 'high']);
    });

    it('should ignore example patterns with e.g.', () => {
      const description = "Library path (e.g., '/mongodb/docs', '/vercel/next.js')";
      const result = extractEnumFromDescription(description);
      
      expect(result).toBeUndefined();
    });

    it('should ignore metadata patterns with colons', () => {
      const description = 'Number parameter (start: 1, default: 1)';
      const result = extractEnumFromDescription(description);
      
      expect(result).toBeUndefined();
    });

    it('should return undefined when no enum pattern found', () => {
      const description = 'A simple description without any enum values';
      const result = extractEnumFromDescription(description);
      
      expect(result).toBeUndefined();
    });

    it('should handle "or" separated values', () => {
      const description = 'Allowed values: success or failure or pending';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['success', 'failure', 'pending']);
    });

    it('should filter out values that are too long', () => {
      const description = 'Options (short, this is a really really really really really really long value that should be filtered)';
      const result = extractEnumFromDescription(description);
      
      // Should be undefined because we need at least 2 valid values
      expect(result).toBeUndefined();
    });
  });

  describe('hoistImports', () => {
    it('should separate single-line imports from body', () => {
      const code = `import { foo } from 'module';
const x = 1;
console.log(x);`;

      const result = hoistImports(code);

      expect(result.imports).toBe("import { foo } from 'module';");
      expect(result.body).toContain('const x = 1');
      expect(result.body).toContain('console.log(x)');
    });

    it('should handle multiple imports', () => {
      const code = `import { foo } from 'module1';
import { bar } from 'module2';
import * as baz from 'module3';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import { foo } from 'module1'");
      expect(result.imports).toContain("import { bar } from 'module2'");
      expect(result.imports).toContain("import * as baz from 'module3'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle multi-line imports', () => {
      const code = `import {
  foo,
  bar,
  baz
} from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import {');
      expect(result.imports).toContain('foo');
      expect(result.imports).toContain("from 'module'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle side-effect imports', () => {
      const code = `import 'polyfill';
import './styles.css';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import 'polyfill'");
      expect(result.imports).toContain("import './styles.css'");
      expect(result.body).toContain('const x = 1');
    });

    it('should preserve dynamic imports in body', () => {
      const code = `import { foo } from 'static';
const dynamic = await import('dynamic-module');`;

      const result = hoistImports(code);

      expect(result.imports).toBe("import { foo } from 'static';");
      expect(result.body).toContain("await import('dynamic-module')");
    });

    it('should handle code with no imports', () => {
      const code = `const x = 1;
console.log(x);`;

      const result = hoistImports(code);

      expect(result.imports).toBe('');
      expect(result.body).toContain('const x = 1');
    });

    it('should handle default imports', () => {
      const code = `import defaultExport from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toBe("import defaultExport from 'module';");
      expect(result.body).toContain('const x = 1');
    });
  });

  describe('isValidIdentifier', () => {
    it('should return true for valid identifiers', () => {
      expect(isValidIdentifier('foo')).toBe(true);
      expect(isValidIdentifier('_private')).toBe(true);
      expect(isValidIdentifier('$special')).toBe(true);
      expect(isValidIdentifier('camelCase')).toBe(true);
      expect(isValidIdentifier('with123numbers')).toBe(true);
    });

    it('should return false for invalid identifiers', () => {
      expect(isValidIdentifier('123starts')).toBe(false);
      expect(isValidIdentifier('has-dash')).toBe(false);
      expect(isValidIdentifier('has space')).toBe(false);
      expect(isValidIdentifier('')).toBe(false);
    });
  });

  describe('toCallFunctionName', () => {
    it('should convert kebab-case to camelCase with Call suffix', () => {
      expect(toCallFunctionName('process-thought')).toBe('processThoughtCall');
      expect(toCallFunctionName('get-library-docs')).toBe('getLibraryDocsCall');
    });

    it('should convert snake_case to camelCase with Call suffix', () => {
      expect(toCallFunctionName('resolve_library_id')).toBe('resolveLibraryIdCall');
    });

    it('should handle already camelCase with Call suffix', () => {
      expect(toCallFunctionName('simpleName')).toBe('simpleNameCall');
    });
  });

  describe('hoistImports edge cases', () => {
    it('should handle import with double quotes', () => {
      const code = `import { foo } from "module";
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import { foo } from "module"');
      expect(result.body).toContain('const x = 1');
    });

    it('should handle import{} without space', () => {
      const code = `import{ foo } from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import{ foo }');
      expect(result.body).toContain('const x = 1');
    });

    it('should handle incomplete multi-line import (malformed)', () => {
      // When there's a multi-line import that never closes properly,
      // the current behavior is that it gets treated as an import
      // because the parser sees the semicolon and thinks it's complete
      const code = `import {
  foo,
const x = 1;`;

      const result = hoistImports(code);

      // The malformed import gets consumed with the next line
      // This tests the current behavior - the import statement spans multiple lines
      expect(result.imports).toContain('import {');
      expect(result.imports).toContain('foo,');
      // The "const x = 1" gets included in the import (malformed)
    });

    it('should handle import ending with quote instead of semicolon', () => {
      const code = `import 'module'
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import 'module'");
    });

    it('should handle multi-line import with from keyword', () => {
      const code = `import {
  foo
} from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import {');
      expect(result.imports).toContain("} from 'module'");
    });

    it('should handle side-effect import with double quotes', () => {
      const code = `import "polyfill";
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import "polyfill"');
    });
  });

  describe('extractEnumFromDescription edge cases', () => {
    it('should handle empty parentheses', () => {
      const description = 'Empty parens ()';
      const result = extractEnumFromDescription(description);
      
      expect(result).toBeUndefined();
    });

    it('should handle single value in parentheses', () => {
      const description = 'Single value (only-one)';
      const result = extractEnumFromDescription(description);
      
      // Need at least 2 values
      expect(result).toBeUndefined();
    });

    it('should handle too many values', () => {
      const values = Array(15).fill(0).map((_, i) => `val${i}`).join(', ');
      const description = `Too many (${values})`;
      const result = extractEnumFromDescription(description);
      
      // More than 10 values should be rejected
      expect(result).toBeUndefined();
    });

    it('should handle pipe-separated values', () => {
      const description = 'Valid values: fast | slow | balanced';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['fast', 'slow', 'balanced']);
    });

    it('should handle "must be:" pattern', () => {
      const description = 'Value must be: low, medium, high';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['low', 'medium', 'high']);
    });

    it('should strip quotes from values', () => {
      const description = 'Valid values: "fast", "slow"';
      const result = extractEnumFromDescription(description);
      
      expect(result).toEqual(['fast', 'slow']);
    });
  });

  describe('isExampleValue edge cases', () => {
    it('should handle mixed case e.g.', () => {
      expect(isExampleValue('E.G. example')).toBe(true);
      expect(isExampleValue('I.E. something')).toBe(true);
    });

    it('should handle path with double quotes', () => {
      expect(isExampleValue('"/absolute/path"')).toBe(true);
    });
  });

  describe('hoistImports multi-line edge cases', () => {
    it('should handle import with from but no ending', () => {
      // This exercises the line 182-189 branch: import with 'from' that doesn't end with ; or quote
      const code = `import { foo } from
'module';
const x = 1;`;

      const result = hoistImports(code);

      // The import gets captured across multiple lines
      expect(result.imports).toContain('import { foo } from');
      expect(result.body).toContain('const x = 1');
    });

    it('should handle import that ends with semicolon on same line as from', () => {
      const code = `import foo from 'bar';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import foo from 'bar'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle multi-line import with only opening brace on first line', () => {
      // This tests the branch where we start multi-line import
      const code = `import {
  a,
  b,
  c
} from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain('import {');
      expect(result.imports).toContain("} from 'module'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle malformed multi-line import at end of file', () => {
      // This tests lines 196-198: if still in multi-line import at EOF, treat as body
      const code = `import {
  foo,
  bar`;  // No closing - malformed

      const result = hoistImports(code);

      // The malformed import gets treated as body (via unshift to bodyLines)
      expect(result.body.includes('import {')).toBe(true);
      expect(result.imports).toBe('');
    });

    it('should handle import with from keyword but incomplete', () => {
      // import starts but doesn't complete properly
      const code = `import { foo }
from
'module';
const x = 1;`;

      const result = hoistImports(code);
      
      // Should handle multi-line import
      expect(result.body).toContain('const x = 1');
    });
  });

  describe('hoistImports line 182-184 branch', () => {
    it('should handle complete import ending with semicolon', () => {
      // This specifically targets line 182-184: else if (trimmed.endsWith(';'))
      // An import that ends with ; but doesn't have 'from' (side-effect import on single line)
      const code = `import 'sideeffect';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import 'sideeffect'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle complete import ending with quote', () => {
      // An import ending with quote (no semicolon)
      const code = `import 'module'
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import 'module'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle import with from keyword but ends with semicolon not quote', () => {
      // Test line 184: importLines.push(line) when endsWith semicolon
      const code = `import defaultExport from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import defaultExport from 'module';");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle import starting import{ (no space)', () => {
      // This tests line 172: trimmed.startsWith('import{')
      const code = `import{a,b,c}from 'module';
const x = 1;`;

      const result = hoistImports(code);

      expect(result.imports).toContain("import{a,b,c}from 'module'");
      expect(result.body).toContain('const x = 1');
    });

    it('should handle import without from that ends with semicolon', () => {
      // This tests line 182-184: import that ends with ; but has no 'from' and no '{'
      // This is a malformed import but we handle it gracefully
      const code = `import type;
const x = 1;`;

      const result = hoistImports(code);

      // Should be treated as import (ends with semicolon)
      expect(result.imports).toContain('import type;');
      expect(result.body).toContain('const x = 1');
    });
  });

  describe('formatErrorForJson', () => {
    it('should format Error instances with name, message, and stack', () => {
      const error = new Error('Test error message');
      error.name = 'TestError';
      
      const result = formatErrorForJson(error);
      const parsed = JSON.parse(result);
      
      expect(parsed.name).toBe('TestError');
      expect(parsed.message).toBe('Test error message');
      expect(parsed.stack).toBeDefined();
    });

    it('should format plain Error with default name', () => {
      const error = new Error('Simple error');
      
      const result = formatErrorForJson(error);
      const parsed = JSON.parse(result);
      
      expect(parsed.name).toBe('Error');
      expect(parsed.message).toBe('Simple error');
    });

    it('should format string values as JSON strings', () => {
      const result = formatErrorForJson('string error');
      
      expect(result).toBe('"string error"');
    });

    it('should format numbers as JSON strings', () => {
      const result = formatErrorForJson(42);
      
      expect(result).toBe('"42"');
    });

    it('should format null as JSON string', () => {
      const result = formatErrorForJson(null);
      
      expect(result).toBe('"null"');
    });

    it('should format undefined as JSON string', () => {
      const result = formatErrorForJson(undefined);
      
      expect(result).toBe('"undefined"');
    });

    it('should format objects as JSON strings', () => {
      const obj = { foo: 'bar' };
      const result = formatErrorForJson(obj);
      
      expect(result).toBe('"[object Object]"');
    });

    it('should format arrays as JSON strings', () => {
      const arr = [1, 2, 3];
      const result = formatErrorForJson(arr);
      
      expect(result).toBe('"1,2,3"');
    });

    it('should format boolean values as JSON strings', () => {
      expect(formatErrorForJson(true)).toBe('"true"');
      expect(formatErrorForJson(false)).toBe('"false"');
    });
  });
});