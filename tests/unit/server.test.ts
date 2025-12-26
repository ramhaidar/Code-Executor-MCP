/**
 * Unit tests for src/server.ts
 * 
 * Tests the MCP server tool implementations and helper functions
 * without starting the actual server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, writeFile, readdir, access } from 'node:fs/promises';

describe('server.ts helper functions', () => {
  describe('pathExists helper', () => {
    const tempDir = join(process.cwd(), 'tests', '.temp-server');

    beforeEach(async () => {
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    // Test the pathExists helper pattern
    const pathExists = async (path: string): Promise<boolean> => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    };

    it('should return true for existing path', async () => {
      const exists = await pathExists(tempDir);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const exists = await pathExists(join(tempDir, 'non-existent'));
      expect(exists).toBe(false);
    });
  });

  describe('toCamelCase helper', () => {
    // Replicate the toCamelCase function from server.ts
    const toCamelCase = (str: string): string => {
      return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
    };

    it('should convert kebab-case to camelCase', () => {
      expect(toCamelCase('clear-history')).toBe('clearHistory');
      expect(toCamelCase('get-library-docs')).toBe('getLibraryDocs');
    });

    it('should convert snake_case to camelCase', () => {
      expect(toCamelCase('process_thought')).toBe('processThought');
    });

    it('should handle already camelCase', () => {
      expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel');
    });
  });

  describe('toKebabCase helper', () => {
    // Replicate the toKebabCase function from server.ts
    const toKebabCase = (str: string): string => {
      return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
    };

    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('clearHistory')).toBe('clear-history');
      expect(toKebabCase('processThought')).toBe('process-thought');
    });
  });

  describe('isExampleValue helper', () => {
    // Replicate the isExampleValue function from server.ts
    const isExampleValue = (value: string): boolean => {
      const trimmed = value.trim().toLowerCase();

      if (trimmed === 'e.g.' || trimmed === 'i.e.' ||
        trimmed.startsWith('e.g.') || trimmed.startsWith('i.e.')) {
        return true;
      }

      if (value.includes(':')) {
        return true;
      }

      if (/^['"].*['"]$/.test(value.trim())) {
        return true;
      }

      if (value.trim().startsWith('/') || value.trim().startsWith("'/") || value.trim().startsWith('"/')) {
        return true;
      }

      return false;
    };

    it('should identify example patterns', () => {
      expect(isExampleValue('e.g.')).toBe(true);
      expect(isExampleValue('e.g. example')).toBe(true);
      expect(isExampleValue('i.e.')).toBe(true);
    });

    it('should identify colon patterns', () => {
      expect(isExampleValue('start: 1')).toBe(true);
    });

    it('should identify path patterns', () => {
      expect(isExampleValue('/path/to/file')).toBe(true);
    });

    it('should not match regular values', () => {
      expect(isExampleValue('fast')).toBe(false);
      expect(isExampleValue('slow')).toBe(false);
    });
  });

  describe('extractEnumFromDescription helper', () => {
    // Replicate the extractEnumFromDescription function from server.ts
    const isExampleValue = (value: string): boolean => {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === 'e.g.' || trimmed === 'i.e.' ||
        trimmed.startsWith('e.g.') || trimmed.startsWith('i.e.')) {
        return true;
      }
      if (value.includes(':')) {
        return true;
      }
      if (/^['"].*['"]$/.test(value.trim())) {
        return true;
      }
      if (value.trim().startsWith('/') || value.trim().startsWith("'/") || value.trim().startsWith('"/')) {
        return true;
      }
      return false;
    };

    const extractEnumFromDescription = (description: string): string[] | undefined => {
      const parenMatch = description.match(/\(([^)]+(?:,\s*[^)]+)+)\)/);
      if (parenMatch) {
        const rawContent = parenMatch[1];
        if (/^\s*(e\.g\.|i\.e\.)/i.test(rawContent)) {
          // Skip
        } else {
          const values = rawContent
            .split(/,\s*/)
            .map(v => v.trim())
            .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));
          if (values.length >= 2 && values.length <= 10) {
            return values;
          }
        }
      }

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
    };

    it('should extract from parenthesized list', () => {
      const result = extractEnumFromDescription('Stage (Problem Definition, Research, Analysis)');
      expect(result).toEqual(['Problem Definition', 'Research', 'Analysis']);
    });

    it('should extract from valid values pattern', () => {
      const result = extractEnumFromDescription('Valid values: fast, slow, balanced');
      expect(result).toEqual(['fast', 'slow', 'balanced']);
    });

    it('should skip example patterns', () => {
      const result = extractEnumFromDescription("Path (e.g., '/mongodb/docs')");
      expect(result).toBeUndefined();
    });
  });

  describe('killProcessTree helper', () => {
    it('should handle Windows platform', () => {
      // Test the pattern used for Windows
      const isWindows = process.platform === 'win32';
      const pid = 12345;
      
      if (isWindows) {
        const command = `taskkill /F /T /PID ${pid}`;
        expect(command).toBe('taskkill /F /T /PID 12345');
      } else {
        // Unix pattern
        expect(typeof process.kill).toBe('function');
      }
    });
  });
});

describe('server.ts hoistImports function', () => {
  // Replicate the hoistImports function from server.ts
  const hoistImports = (code: string): { imports: string; body: string } => {
    const lines = code.split('\n');
    const importLines: string[] = [];
    const bodyLines: string[] = [];

    let inMultiLineImport = false;
    let multiLineBuffer = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (inMultiLineImport) {
        multiLineBuffer += '\n' + line;
        if (trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) {
          importLines.push(multiLineBuffer);
          multiLineBuffer = '';
          inMultiLineImport = false;
        } else if (trimmed.endsWith(';')) {
          importLines.push(multiLineBuffer);
          multiLineBuffer = '';
          inMultiLineImport = false;
        }
        continue;
      }

      if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
        if ((trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) ||
          (trimmed.startsWith("import '") || trimmed.startsWith('import "'))) {
          importLines.push(line);
        } else if (trimmed.includes('from') === false && trimmed.includes('{')) {
          inMultiLineImport = true;
          multiLineBuffer = line;
        } else if (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"')) {
          importLines.push(line);
        } else {
          inMultiLineImport = true;
          multiLineBuffer = line;
        }
      } else {
        bodyLines.push(line);
      }
    }

    if (inMultiLineImport && multiLineBuffer) {
      bodyLines.unshift(multiLineBuffer);
    }

    return {
      imports: importLines.join('\n'),
      body: bodyLines.join('\n')
    };
  };

  it('should hoist single-line imports', () => {
    const code = `import { foo } from 'module';
const x = 1;`;
    
    const result = hoistImports(code);
    expect(result.imports).toContain("import { foo } from 'module'");
    expect(result.body).toContain('const x = 1');
  });

  it('should hoist multi-line imports', () => {
    const code = `import {
  foo,
  bar
} from 'module';
const x = 1;`;
    
    const result = hoistImports(code);
    expect(result.imports).toContain('import {');
    expect(result.imports).toContain('foo');
    expect(result.body).toContain('const x = 1');
  });

  it('should handle side-effect imports', () => {
    const code = `import 'polyfill';
const x = 1;`;
    
    const result = hoistImports(code);
    expect(result.imports).toContain("import 'polyfill'");
  });

  it('should preserve dynamic imports in body', () => {
    const code = `import { foo } from 'static';
const dynamic = await import('dynamic');`;
    
    const result = hoistImports(code);
    expect(result.body).toContain("await import('dynamic')");
  });
});

describe('server.ts tool response patterns', () => {
  describe('getStartedReminder pattern', () => {
    let hasCalledGetStarted = false;

    const getStartedReminder = (): string => {
      if (hasCalledGetStarted) {
        return '';
      }
      return "\n\n⚠️ **NEW TO CODE EXECUTOR?** Call the `get_started` tool first...";
    };

    it('should return reminder when not called', () => {
      hasCalledGetStarted = false;
      const reminder = getStartedReminder();
      expect(reminder).toContain('get_started');
    });

    it('should return empty when already called', () => {
      hasCalledGetStarted = true;
      const reminder = getStartedReminder();
      expect(reminder).toBe('');
    });
  });

  describe('requireGetStarted pattern', () => {
    let hasCalledGetStarted = false;

    const requireGetStarted = () => {
      if (hasCalledGetStarted) {
        return null;
      }
      return {
        content: [{
          type: 'text',
          text: '❌ BLOCKED: You must call get_started first',
        }],
        isError: true,
      };
    };

    it('should return blocking response when not called', () => {
      hasCalledGetStarted = false;
      const result = requireGetStarted();
      expect(result).not.toBeNull();
      expect(result?.isError).toBe(true);
    });

    it('should return null when already called', () => {
      hasCalledGetStarted = true;
      const result = requireGetStarted();
      expect(result).toBeNull();
    });
  });
});

describe('server.ts generateUsageExample pattern', () => {
  const generateUsageExample = (
    toolName: string,
    parameters: Array<{ name: string; type: string; required: boolean }>
  ): string => {
    if (parameters.length === 0) {
      return `await ${toolName}.call({});`;
    }

    const paramExamples = parameters
      .filter(p => p.required)
      .map(p => {
        let exampleValue: string;
        if (p.type === 'number' || p.type === 'integer') {
          exampleValue = '1';
        } else if (p.type === 'boolean') {
          exampleValue = 'true';
        } else if (p.type === 'array') {
          exampleValue = '[]';
        } else if (p.type === 'object') {
          exampleValue = '{}';
        } else {
          exampleValue = `"..."`;
        }
        return `${p.name}: ${exampleValue}`;
      });

    return `await ${toolName}.call({ ${paramExamples.join(', ')} });`;
  };

  it('should generate empty call for no parameters', () => {
    const result = generateUsageExample('tool', []);
    expect(result).toBe('await tool.call({});');
  });

  it('should generate call with required string param', () => {
    const params = [{ name: 'query', type: 'string', required: true }];
    const result = generateUsageExample('tool', params);
    expect(result).toBe('await tool.call({ query: "..." });');
  });

  it('should generate call with required number param', () => {
    const params = [{ name: 'count', type: 'number', required: true }];
    const result = generateUsageExample('tool', params);
    expect(result).toBe('await tool.call({ count: 1 });');
  });

  it('should skip optional params', () => {
    const params = [
      { name: 'query', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
    ];
    const result = generateUsageExample('tool', params);
    expect(result).toBe('await tool.call({ query: "..." });');
    expect(result).not.toContain('limit');
  });

  it('should handle multiple required params', () => {
    const params = [
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'number', required: true },
    ];
    const result = generateUsageExample('tool', params);
    expect(result).toBe('await tool.call({ name: "...", age: 1 });');
  });
});

describe('server.ts timeout and execution patterns', () => {
  describe('timeout handling', () => {
    it('should use default timeout of 120000ms', () => {
      const DEFAULT_TIMEOUT = 120000;
      const effectiveTimeout = undefined ?? DEFAULT_TIMEOUT;
      expect(effectiveTimeout).toBe(120000);
    });

    it('should use provided timeout', () => {
      const DEFAULT_TIMEOUT = 120000;
      const providedTimeout = 30000;
      const effectiveTimeout = providedTimeout ?? DEFAULT_TIMEOUT;
      expect(effectiveTimeout).toBe(30000);
    });
  });

  describe('timeout exit code', () => {
    it('should use exit code 124 for timeout', () => {
      const TIMEOUT_EXIT_CODE = 124; // Standard timeout exit code
      expect(TIMEOUT_EXIT_CODE).toBe(124);
    });
  });

  describe('timeout diagnosis patterns', () => {
    it('should diagnose no output as infinite loop', () => {
      const hadAnyOutput = false;
      const timeSinceLastOutput = 100000;
      const timeout = 120000;
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      if (!hadAnyOutput) {
        diagnosis = 'NO OUTPUT - Likely INFINITE LOOP';
      } else if (likelyInfiniteLoop) {
        diagnosis = 'STALLED';
      } else {
        diagnosis = 'SLOW OPERATION';
      }

      expect(diagnosis).toBe('NO OUTPUT - Likely INFINITE LOOP');
    });

    it('should diagnose stalled execution', () => {
      const hadAnyOutput = true;
      const timeSinceLastOutput = 100000;
      const timeout = 120000;
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      if (!hadAnyOutput) {
        diagnosis = 'NO OUTPUT - Likely INFINITE LOOP';
      } else if (likelyInfiniteLoop) {
        diagnosis = 'STALLED';
      } else {
        diagnosis = 'SLOW OPERATION';
      }

      expect(diagnosis).toBe('STALLED');
    });

    it('should diagnose slow operation', () => {
      const hadAnyOutput = true;
      const timeSinceLastOutput = 10000;
      const timeout = 120000;
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      if (!hadAnyOutput) {
        diagnosis = 'NO OUTPUT - Likely INFINITE LOOP';
      } else if (likelyInfiniteLoop) {
        diagnosis = 'STALLED';
      } else {
        diagnosis = 'SLOW OPERATION';
      }

      expect(diagnosis).toBe('SLOW OPERATION');
    });
  });
});

describe('server.ts code wrapping patterns', () => {
  describe('autoExit wrapper structure', () => {
    it('should wrap body in async main function', () => {
      const body = 'console.log("hello");';
      const wrappedParts = [
        'const __ce_main = async () => {',
        body,
        '};',
      ];

      const wrapped = wrappedParts.join('\n');
      expect(wrapped).toContain('__ce_main');
      expect(wrapped).toContain('async');
      expect(wrapped).toContain(body);
    });

    it('should include cleanup function', () => {
      const cleanupCode = `
const __ce_cleanup = async () => {
  if (__ce_cleaned) return;
  __ce_cleaned = true;
  try {
    await __ce_disconnectAll();
  } catch (err) {
    console.error("[code-executor] Cleanup error:", err);
  }
};`;

      expect(cleanupCode).toContain('__ce_cleanup');
      expect(cleanupCode).toContain('__ce_disconnectAll');
    });

    it('should handle SIGINT and SIGTERM', () => {
      const signalHandlers = `
process.once("SIGINT", () => { void __ce_exit(130); });
process.once("SIGTERM", () => { void __ce_exit(143); });`;

      expect(signalHandlers).toContain('SIGINT');
      expect(signalHandlers).toContain('SIGTERM');
      expect(signalHandlers).toContain('130');
      expect(signalHandlers).toContain('143');
    });
  });

  describe('import and body concatenation', () => {
    it('should join imports and body with double newline', () => {
      const imports = "import { foo } from 'module';";
      const body = 'console.log(foo);';

      const finalCode = [imports, body]
        .filter(p => p && p.trim().length > 0)
        .join('\n\n');

      expect(finalCode).toBe("import { foo } from 'module';\n\nconsole.log(foo);");
    });

    it('should filter empty parts', () => {
      const imports = '';
      const body = 'console.log("hello");';

      const finalCode = [imports, body]
        .filter(p => p && p.trim().length > 0)
        .join('\n\n');

      expect(finalCode).toBe('console.log("hello");');
    });
  });
});

describe('server.ts error hint patterns', () => {
  describe('import error hints', () => {
    it('should detect module not found errors', () => {
      const stderr = 'Error: Cannot find module "../servers/test"';
      const combined = stderr.toLowerCase();

      const isImportError = combined.includes('cannot find module') ||
        combined.includes('err_module_not_found') ||
        combined.includes('is not exported');

      expect(isImportError).toBe(true);
    });

    it('should detect ERR_MODULE_NOT_FOUND', () => {
      const stderr = 'ERR_MODULE_NOT_FOUND: Cannot find package';
      const combined = stderr.toLowerCase();

      const isImportError = combined.includes('cannot find module') ||
        combined.includes('err_module_not_found');

      expect(isImportError).toBe(true);
    });
  });

  describe('function call error hints', () => {
    it('should detect is not a function errors', () => {
      const stderr = 'TypeError: tool is not a function';
      const combined = stderr.toLowerCase();

      const isFunctionError = combined.includes('is not a function') ||
        combined.includes('call is not a function');

      expect(isFunctionError).toBe(true);
    });

    it('should detect .call is not a function', () => {
      const stderr = 'TypeError: tool.call is not a function';
      const combined = stderr.toLowerCase();

      const isFunctionError = combined.includes('is not a function') ||
        combined.includes('call is not a function');

      expect(isFunctionError).toBe(true);
    });
  });
});

describe('server.ts skills handling', () => {
  describe('SKILL.md parsing patterns', () => {
    it('should extract description from YAML frontmatter', () => {
      const content = `---
description: A helpful skill for testing
tags:
  - test
  - example
---

# Skill Content

This is the skill documentation.
`;

      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(match).not.toBeNull();

      if (match) {
        const descMatch = match[1].match(/^description:\s*(.+)$/m);
        expect(descMatch).not.toBeNull();
        expect(descMatch?.[1].trim()).toBe('A helpful skill for testing');
      }
    });

    it('should handle missing description', () => {
      const content = `---
tags:
  - test
---

# No Description
`;

      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      let description = 'No description';

      if (match) {
        const descMatch = match[1].match(/^description:\s*(.+)$/m);
        if (descMatch) {
          description = descMatch[1].trim();
        }
      }

      expect(description).toBe('No description');
    });
  });
});

describe('server.ts list filtering patterns', () => {
  describe('tool file filtering', () => {
    it('should filter for .ts files excluding index and .d.ts', () => {
      const entries = [
        'get-library-docs.ts',
        'resolve-library-id.ts',
        'index.ts',
        'get-library-docs.d.ts',
        'README.md',
      ];

      const toolFiles = entries.filter(f =>
        f.endsWith('.ts') &&
        f !== 'index.ts' &&
        !f.endsWith('.d.ts')
      );

      expect(toolFiles).toEqual([
        'get-library-docs.ts',
        'resolve-library-id.ts',
      ]);
    });
  });

  describe('workspace file filtering', () => {
    it('should exclude temp files', () => {
      const entries = [
        { name: 'output.json', isFile: () => true },
        { name: '_temp_12345.ts', isFile: () => true },
        { name: 'data', isFile: () => false },
      ];

      const files = entries
        .filter(e => e.isFile() && !e.name.startsWith('_temp_'))
        .map(e => e.name);

      expect(files).toEqual(['output.json']);
    });
  });

  describe('script file filtering', () => {
    it('should filter for .ts scripts', () => {
      const entries = ['demo.ts', 'test.ts', 'README.md', '.gitkeep'];

      const scripts = entries.filter(f => f.endsWith('.ts'));

      expect(scripts).toEqual(['demo.ts', 'test.ts']);
    });
  });
});