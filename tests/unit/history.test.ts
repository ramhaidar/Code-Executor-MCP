/**
 * Unit tests for src/history.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addExecutionRecord,
  getExecutionHistory,
  getExecutionById,
  getFullHistory,
  clearHistory,
  getMaxHistorySize,
  getHistoryCount,
} from '../../src/history.js';

describe('history.ts', () => {
  // Clear history before each test to ensure isolation
  beforeEach(() => {
    clearHistory();
  });

  describe('addExecutionRecord', () => {
    it('should add a new execution record', () => {
      const record = addExecutionRecord(
        'console.log("test")',
        { exitCode: 0, stdout: 'test', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      expect(record.id).toMatch(/^exec_/);
      expect(record.code).toBe('console.log("test")');
      expect(record.exitCode).toBe(0);
      expect(record.stdout).toBe('test');
      expect(record.stderr).toBe('');
      expect(record.validated).toBe(true);
      expect(record.debug).toBe(false);
      expect(record.timeout).toBe(30000);
      expect(record.timestamp).toBeInstanceOf(Date);
    });

    it('should add records to the front of history (newest first)', () => {
      addExecutionRecord(
        'first',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      addExecutionRecord(
        'second',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getFullHistory();
      expect(history[0].code).toBe('second');
      expect(history[1].code).toBe('first');
    });

    it('should remove oldest records when exceeding MAX_HISTORY', () => {
      const maxHistory = getMaxHistorySize();
      
      // Add more records than MAX_HISTORY
      for (let i = 0; i < maxHistory + 3; i++) {
        addExecutionRecord(
          `code ${i}`,
          { exitCode: 0, stdout: '', stderr: '' },
          { validated: true, debug: false, timeout: 30000 }
        );
      }

      expect(getHistoryCount()).toBe(maxHistory);
      
      // Verify oldest records were removed
      const history = getFullHistory();
      expect(history[0].code).toBe(`code ${maxHistory + 2}`);
      expect(history[maxHistory - 1].code).toBe('code 3');
    });

    it('should generate unique IDs for each record', () => {
      const record1 = addExecutionRecord(
        'code1',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      const record2 = addExecutionRecord(
        'code2',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      expect(record1.id).not.toBe(record2.id);
    });

    it('should handle failed executions', () => {
      const record = addExecutionRecord(
        'throw new Error("fail")',
        { exitCode: 1, stdout: '', stderr: 'Error: fail' },
        { validated: true, debug: true, timeout: 60000 }
      );

      expect(record.exitCode).toBe(1);
      expect(record.stderr).toBe('Error: fail');
      expect(record.debug).toBe(true);
    });
  });

  describe('getExecutionHistory', () => {
    it('should return empty array when no history', () => {
      const history = getExecutionHistory();
      expect(history).toEqual([]);
    });

    it('should return execution previews with correct fields', () => {
      addExecutionRecord(
        'console.log("hello")',
        { exitCode: 0, stdout: 'hello', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBeDefined();
      expect(history[0].timestamp).toBeDefined();
      expect(history[0].exitCode).toBe(0);
      expect(history[0].codePreview).toBe('console.log("hello")');
      expect(history[0].success).toBe(true);
    });

    it('should truncate long code previews to 100 characters', () => {
      const longCode = 'a'.repeat(150);
      addExecutionRecord(
        longCode,
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].codePreview).toBe('a'.repeat(100) + '...');
    });

    it('should not truncate code under 100 characters', () => {
      const shortCode = 'a'.repeat(50);
      addExecutionRecord(
        shortCode,
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].codePreview).toBe(shortCode);
    });

    it('should correctly identify failed executions', () => {
      addExecutionRecord(
        'failing code',
        { exitCode: 1, stdout: '', stderr: 'error' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].success).toBe(false);
      expect(history[0].exitCode).toBe(1);
    });

    it('should return timestamp in ISO format', () => {
      addExecutionRecord(
        'code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      // ISO format check: should be parseable and contain T and Z
      expect(() => new Date(history[0].timestamp)).not.toThrow();
      expect(history[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getExecutionById', () => {
    it('should return undefined for non-existent ID', () => {
      const result = getExecutionById('non_existent_id');
      expect(result).toBeUndefined();
    });

    it('should return undefined when history is empty', () => {
      const result = getExecutionById('exec_test_0001');
      expect(result).toBeUndefined();
    });

    it('should find existing record by ID', () => {
      const record = addExecutionRecord(
        'findable code',
        { exitCode: 0, stdout: 'output', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const found = getExecutionById(record.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(record.id);
      expect(found?.code).toBe('findable code');
      expect(found?.stdout).toBe('output');
    });

    it('should find record among multiple records', () => {
      const record1 = addExecutionRecord(
        'code1',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      const record2 = addExecutionRecord(
        'code2',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      const record3 = addExecutionRecord(
        'code3',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      // Find middle record
      const found = getExecutionById(record2.id);
      expect(found?.code).toBe('code2');

      // Find first record
      const foundFirst = getExecutionById(record1.id);
      expect(foundFirst?.code).toBe('code1');

      // Find last record
      const foundLast = getExecutionById(record3.id);
      expect(foundLast?.code).toBe('code3');
    });
  });

  describe('getFullHistory', () => {
    it('should return empty array when no history', () => {
      const history = getFullHistory();
      expect(history).toEqual([]);
    });

    it('should return copy of history array', () => {
      addExecutionRecord(
        'code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history1 = getFullHistory();
      const history2 = getFullHistory();

      // Should be different arrays (copies)
      expect(history1).not.toBe(history2);
      // But same content
      expect(history1).toEqual(history2);
    });

    it('should return complete ExecutionRecord objects', () => {
      addExecutionRecord(
        'test code',
        { exitCode: 0, stdout: 'out', stderr: 'err' },
        { validated: true, debug: true, timeout: 5000 }
      );

      const history = getFullHistory();
      const record = history[0];

      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeInstanceOf(Date);
      expect(record.code).toBe('test code');
      expect(record.exitCode).toBe(0);
      expect(record.stdout).toBe('out');
      expect(record.stderr).toBe('err');
      expect(record.validated).toBe(true);
      expect(record.debug).toBe(true);
      expect(record.timeout).toBe(5000);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history when records exist', () => {
      addExecutionRecord(
        'code1',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      addExecutionRecord(
        'code2',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      expect(getHistoryCount()).toBe(2);

      clearHistory();

      expect(getHistoryCount()).toBe(0);
      expect(getFullHistory()).toEqual([]);
    });

    it('should work on already empty history', () => {
      // Should not throw
      expect(() => clearHistory()).not.toThrow();
      expect(getHistoryCount()).toBe(0);
    });

    it('should allow adding records after clearing', () => {
      addExecutionRecord(
        'old code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      
      clearHistory();
      
      const newRecord = addExecutionRecord(
        'new code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      expect(getHistoryCount()).toBe(1);
      expect(getFullHistory()[0].code).toBe('new code');
      expect(newRecord.id).toMatch(/^exec_/);
    });
  });

  describe('getMaxHistorySize', () => {
    it('should return the maximum history size constant', () => {
      const maxSize = getMaxHistorySize();
      expect(typeof maxSize).toBe('number');
      expect(maxSize).toBeGreaterThan(0);
    });

    it('should return consistent value', () => {
      expect(getMaxHistorySize()).toBe(getMaxHistorySize());
    });
  });

  describe('getHistoryCount', () => {
    it('should return 0 when history is empty', () => {
      expect(getHistoryCount()).toBe(0);
    });

    it('should return correct count after adding records', () => {
      expect(getHistoryCount()).toBe(0);

      addExecutionRecord(
        'code1',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      expect(getHistoryCount()).toBe(1);

      addExecutionRecord(
        'code2',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      expect(getHistoryCount()).toBe(2);
    });

    it('should return correct count after clearing', () => {
      addExecutionRecord(
        'code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      expect(getHistoryCount()).toBe(1);

      clearHistory();
      expect(getHistoryCount()).toBe(0);
    });
  });

  describe('generateExecutionId (implicit through addExecutionRecord)', () => {
    it('should generate IDs with exec_ prefix', () => {
      const record = addExecutionRecord(
        'code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      expect(record.id.startsWith('exec_')).toBe(true);
    });

    it('should generate IDs with timestamp and counter components', () => {
      const record = addExecutionRecord(
        'code',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      // ID format: exec_<timestamp_base36>_<counter_base36>
      const parts = record.id.split('_');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('exec');
      // Timestamp component should be non-empty
      expect(parts[1].length).toBeGreaterThan(0);
      // Counter component should be padded to 4 chars
      expect(parts[2].length).toBe(4);
    });

    it('should increment counter for sequential records', () => {
      const record1 = addExecutionRecord(
        'code1',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );
      const record2 = addExecutionRecord(
        'code2',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      // Counter component should be different
      const counter1 = record1.id.split('_')[2];
      const counter2 = record2.id.split('_')[2];
      expect(counter1).not.toBe(counter2);
    });
  });

  describe('code preview truncation edge cases', () => {
    it('should handle exactly 100 character code', () => {
      const exactCode = 'a'.repeat(100);
      addExecutionRecord(
        exactCode,
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].codePreview).toBe(exactCode);
    });

    it('should handle 101 character code', () => {
      const longCode = 'a'.repeat(101);
      addExecutionRecord(
        longCode,
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].codePreview).toBe('a'.repeat(100) + '...');
    });

    it('should handle empty code', () => {
      addExecutionRecord(
        '',
        { exitCode: 0, stdout: '', stderr: '' },
        { validated: true, debug: false, timeout: 30000 }
      );

      const history = getExecutionHistory();
      expect(history[0].codePreview).toBe('');
    });
  });
});