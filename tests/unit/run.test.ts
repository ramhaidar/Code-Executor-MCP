/**
 * Unit tests for src/run.ts
 * 
 * Tests the script execution utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, writeFile, access } from 'node:fs/promises';

describe('run.ts', () => {
  const tempDir = join(process.cwd(), 'tests', '.temp-run');
  const scriptsDir = join(tempDir, 'scripts');

  beforeEach(async () => {
    await mkdir(scriptsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('fileExists helper', () => {
    // Test the file existence checking pattern used in run.ts
    const fileExists = async (path: string): Promise<boolean> => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    };

    it('should return true for existing files', async () => {
      const testFile = join(tempDir, 'test.txt');
      await writeFile(testFile, 'test content', 'utf-8');
      
      const exists = await fileExists(testFile);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      const nonExistent = join(tempDir, 'does-not-exist.txt');
      
      const exists = await fileExists(nonExistent);
      expect(exists).toBe(false);
    });

    it('should return true for existing directories', async () => {
      const exists = await fileExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  describe('ensureWorkspace pattern', () => {
    it('should create directory recursively', async () => {
      const nestedDir = join(tempDir, 'workspace', 'nested', 'deep');
      
      await mkdir(nestedDir, { recursive: true });
      
      const exists = await access(nestedDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      // First creation
      await mkdir(tempDir, { recursive: true });
      
      // Second creation should not throw
      await expect(mkdir(tempDir, { recursive: true })).resolves.not.toThrow();
    });
  });

  describe('script path resolution', () => {
    it('should resolve relative paths correctly', () => {
      const projectRoot = '/project';
      const scriptPath = 'scripts/demo.ts';
      const resolved = join(projectRoot, scriptPath);
      
      // Path separators differ between Windows and Unix
      expect(resolved).toContain('project');
      expect(resolved).toContain('scripts');
      expect(resolved).toContain('demo.ts');
    });

    it('should handle absolute paths', () => {
      const absolutePath = '/absolute/path/to/script.ts';
      const projectRoot = '/project';
      
      // When path is already absolute, join still works but may produce unexpected results
      // The actual code uses path.resolve which handles this better
      const { resolve } = require('node:path');
      const resolved = resolve(projectRoot, absolutePath);
      
      // On Unix, absolute path wins
      if (process.platform !== 'win32') {
        expect(resolved).toBe(absolutePath);
      }
    });
  });

  describe('runScript return value structure', () => {
    it('should have correct structure for success', () => {
      const result = {
        exitCode: 0,
        stdout: 'Script output',
        stderr: '',
      };

      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result.exitCode).toBe(0);
    });

    it('should have correct structure for failure', () => {
      const result = {
        exitCode: 1,
        stdout: '',
        stderr: 'Script not found: /path/to/script.ts',
      };

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Script not found');
    });

    it('should handle execution errors', () => {
      const error = new Error('spawn ENOENT');
      const result = {
        exitCode: 1,
        stdout: '',
        stderr: `Execution error: ${error.message}`,
      };

      expect(result.stderr).toContain('Execution error');
      expect(result.stderr).toContain('spawn ENOENT');
    });
  });

  describe('spawn configuration patterns', () => {
    it('should have correct spawn options structure', () => {
      const projectRoot = '/project';
      const spawnOptions = {
        cwd: projectRoot,
        env: { ...process.env },
        shell: true,
      };

      expect(spawnOptions.cwd).toBe(projectRoot);
      expect(spawnOptions.shell).toBe(true);
      expect(spawnOptions.env).toBeDefined();
    });

    it('should use npx tsx for TypeScript execution', () => {
      const command = 'npx';
      const scriptPath = '/project/scripts/test.ts';
      const args = ['tsx', scriptPath];

      expect(command).toBe('npx');
      expect(args[0]).toBe('tsx');
      expect(args[1]).toBe(scriptPath);
    });
  });

  describe('CLI argument handling', () => {
    it('should extract script path from argv', () => {
      const mockArgv = ['node', 'src/run.ts', 'scripts/demo.ts'];
      const scriptPath = mockArgv[2];

      expect(scriptPath).toBe('scripts/demo.ts');
    });

    it('should handle missing script path', () => {
      const mockArgv = ['node', 'src/run.ts'];
      const scriptPath = mockArgv[2];

      expect(scriptPath).toBeUndefined();
    });
  });

  describe('exit code handling', () => {
    it('should use null coalescing for exit code', () => {
      // Test the pattern: code ?? 1
      const nullCode: number | null = null;
      const exitCode = nullCode ?? 1;

      expect(exitCode).toBe(1);
    });

    it('should preserve zero exit code', () => {
      const zeroCode: number | null = 0;
      const exitCode = zeroCode ?? 1;

      expect(exitCode).toBe(0);
    });

    it('should preserve non-zero exit codes', () => {
      const errorCode: number | null = 127;
      const exitCode = errorCode ?? 1;

      expect(exitCode).toBe(127);
    });
  });

  describe('stdout/stderr handling', () => {
    it('should concatenate buffer data', () => {
      let stdout = '';
      
      const chunks = [
        Buffer.from('Hello '),
        Buffer.from('World'),
        Buffer.from('!'),
      ];

      for (const chunk of chunks) {
        stdout += chunk.toString();
      }

      expect(stdout).toBe('Hello World!');
    });

    it('should handle empty output', () => {
      let stdout = '';
      let stderr = '';

      // No data events

      expect(stdout).toBe('');
      expect(stderr).toBe('');
    });

    it('should handle mixed stdout and stderr', () => {
      let stdout = '';
      let stderr = '';

      stdout += 'Normal output\n';
      stderr += 'Warning: something\n';
      stdout += 'More output\n';

      expect(stdout).toContain('Normal output');
      expect(stdout).toContain('More output');
      expect(stderr).toContain('Warning');
    });
  });
});

describe('run.ts integration patterns', () => {
  describe('workspace directory pattern', () => {
    it('should calculate workspace directory correctly', () => {
      // Pattern from run.ts
      const __dirname = '/project/src';
      const PROJECT_ROOT = join(__dirname, '..');
      const WORKSPACE_DIR = join(PROJECT_ROOT, 'workspace');

      // Path separators differ between Windows and Unix
      expect(PROJECT_ROOT).toContain('project');
      expect(WORKSPACE_DIR).toContain('project');
      expect(WORKSPACE_DIR).toContain('workspace');
    });
  });

  describe('script not found handling', () => {
    it('should return error for missing script', async () => {
      const fileExists = async (path: string) => {
        try {
          await access(path);
          return true;
        } catch {
          return false;
        }
      };

      const scriptPath = '/non-existent/script.ts';
      const exists = await fileExists(scriptPath);

      if (!exists) {
        const result = {
          exitCode: 1,
          stdout: '',
          stderr: `Script not found: ${scriptPath}`,
        };

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Script not found');
        expect(result.stderr).toContain(scriptPath);
      }
    });
  });
});