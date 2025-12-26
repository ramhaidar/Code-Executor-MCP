/**
 * Global test setup for Vitest
 * 
 * This file is automatically loaded before each test file.
 */
import { vi, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test temp directory for file-based tests
export const TEST_TEMP_DIR = join(__dirname, '.temp');

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Clean up temp directory after all tests
afterAll(async () => {
  try {
    await rm(TEST_TEMP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
});

/**
 * Test utility functions
 */
export const testUtils = {
  /**
   * Create temporary directory for test files
   */
  async createTempDir(subPath?: string): Promise<string> {
    const dir = subPath ? join(TEST_TEMP_DIR, subPath) : TEST_TEMP_DIR;
    await mkdir(dir, { recursive: true });
    return dir;
  },

  /**
   * Clean up temporary directory
   */
  async cleanupTempDir(): Promise<void> {
    try {
      await rm(TEST_TEMP_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  },

  /**
   * Write a test fixture file
   */
  async writeFixture(filename: string, content: string): Promise<string> {
    const dir = await testUtils.createTempDir();
    const filepath = join(dir, filename);
    await writeFile(filepath, content, 'utf-8');
    return filepath;
  },

  /**
   * Write a JSON fixture file
   */
  async writeJsonFixture(filename: string, data: unknown): Promise<string> {
    return testUtils.writeFixture(filename, JSON.stringify(data, null, 2));
  },
};

// Export commonly used test utilities
export { vi, beforeEach, afterEach, afterAll };