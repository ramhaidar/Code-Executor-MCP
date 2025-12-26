/**
 * Core type definitions for the benchmark system
 * Measures token savings between direct MCP tool calls vs code execution patterns
 */

/**
 * Tool definition shape matching MCP tool format
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Intermediate result in direct call approach
 * Represents data passed back to the model between tool calls
 */
export interface IntermediateResult {
  toolName: string;
  result: string;
  passedToModel: boolean;
}

/**
 * Token metrics for a single approach
 */
export interface TokenMetrics {
  toolDefinitionTokens: number;
  intermediateResultTokens: number;
  codeTokens: number;
  totalTokens: number;
}

/**
 * Benchmark scenario definition
 * Describes a complete test case comparing both approaches
 */
export interface BenchmarkScenario {
  name: string;
  description: string;
  /** Tool definitions that would be loaded in direct approach */
  toolDefinitions: ToolDefinition[];
  /** Simulated intermediate results passed to model in direct approach */
  intermediateResults: IntermediateResult[];
  /** Code execution approach details */
  codeExecutionApproach: {
    /** Code that would be executed */
    code: string;
    /** Files/tools loaded on-demand during execution */
    loadedDefinitions: ToolDefinition[];
    /** Final result returned to model */
    finalResult: string;
  };
}

/**
 * Benchmark result metrics
 * Complete results from running a benchmark scenario
 */
export interface BenchmarkResult {
  scenario: string;
  directApproach: TokenMetrics;
  codeExecutionApproach: TokenMetrics;
  savings: {
    tokens: number;
    percentage: number;
  };
  timestamp: string;
}