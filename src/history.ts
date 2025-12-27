/**
 * Execution History Management
 * 
 * Stores recent code executions in memory for replay functionality.
 */

/**
 * Record of a single code execution
 */
export interface ExecutionRecord {
  /** Unique identifier for this execution */
  id: string;
  /** Timestamp when execution occurred */
  timestamp: Date;
  /** The code that was executed */
  code: string;
  /** Exit code from the execution */
  exitCode: number;
  /** Standard output from execution */
  stdout: string;
  /** Standard error from execution */
  stderr: string;
  /** Whether validation was enabled */
  validated: boolean;
  /** Whether debug mode was enabled */
  debug: boolean;
  /** Timeout used for execution */
  timeout: number;
}

/** Maximum number of execution records to keep in history */
const MAX_HISTORY = 10;

/** In-memory storage for execution history */
const executionHistory: ExecutionRecord[] = [];

/** Counter for generating unique IDs */
let executionCounter = 0;

/**
 * Generate a unique execution ID
 */
function generateExecutionId(): string {
  executionCounter++;
  const timestamp = Date.now().toString(36);
  const counter = executionCounter.toString(36).padStart(4, '0');
  return `exec_${timestamp}_${counter}`;
}

/**
 * Add an execution record to history.
 * Removes oldest records if history exceeds MAX_HISTORY.
 * 
 * @param code - The code that was executed
 * @param result - The execution result (exitCode, stdout, stderr)
 * @param options - Execution options (validated, debug, timeout)
 * @returns The created execution record
 */
export function addExecutionRecord(
  code: string,
  result: { exitCode: number; stdout: string; stderr: string },
  options: { validated: boolean; debug: boolean; timeout: number }
): ExecutionRecord {
  const record: ExecutionRecord = {
    id: generateExecutionId(),
    timestamp: new Date(),
    code,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    validated: options.validated,
    debug: options.debug,
    timeout: options.timeout,
  };

  // Add to front of array (newest first)
  executionHistory.unshift(record);

  // Remove oldest if exceeds limit
  while (executionHistory.length > MAX_HISTORY) {
    executionHistory.pop();
  }

  return record;
}

/**
 * Get execution history as a list of previews.
 * 
 * @returns Array of execution record summaries
 */
export function getExecutionHistory(): Array<{
  id: string;
  timestamp: string;
  exitCode: number;
  codePreview: string;
  success: boolean;
}> {
  return executionHistory.map(record => ({
    id: record.id,
    timestamp: record.timestamp.toISOString(),
    exitCode: record.exitCode,
    codePreview: record.code.length > 100 
      ? record.code.substring(0, 100) + "..." 
      : record.code,
    success: record.exitCode === 0,
  }));
}

/**
 * Get a specific execution record by ID.
 * 
 * @param id - The execution ID to find
 * @returns The execution record or undefined if not found
 */
export function getExecutionById(id: string): ExecutionRecord | undefined {
  return executionHistory.find(record => record.id === id);
}

/**
 * Get the full execution history (for advanced use cases).
 * 
 * @returns The complete execution history array
 */
export function getFullHistory(): ExecutionRecord[] {
  return [...executionHistory];
}

/**
 * Clear all execution history.
 */
export function clearHistory(): void {
  executionHistory.length = 0;
}

/**
 * Get the maximum history size.
 */
export function getMaxHistorySize(): number {
  return MAX_HISTORY;
}

/**
 * Get current history count.
 */
export function getHistoryCount(): number {
  return executionHistory.length;
}