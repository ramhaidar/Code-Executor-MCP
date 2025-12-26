/**
 * Token counting utilities for the benchmark system
 * Uses tiktoken for accurate token counting compatible with Claude/GPT tokenizers
 */

import { get_encoding, type Tiktoken } from "tiktoken";
import type {
  ToolDefinition,
  IntermediateResult,
  BenchmarkScenario,
  TokenMetrics,
} from "./types.js";

let encoder: Tiktoken | null = null;

/**
 * Initialize the tokenizer (call once at startup)
 */
export async function initTokenizer(): Promise<void> {
  if (encoder) return;
  encoder = get_encoding("cl100k_base");
}

/**
 * Count tokens in a string
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  if (!encoder) {
    throw new Error("Tokenizer not initialized. Call initTokenizer() first.");
  }
  return encoder.encode(text).length;
}

/**
 * Format a tool definition similarly to how Claude sees it
 */
function formatToolDefinition(tool: ToolDefinition): string {
  const lines: string[] = [
    `Tool: ${tool.name}`,
    `Description: ${tool.description}`,
    "Parameters:",
  ];

  const schema = tool.inputSchema;
  const properties = (schema.properties as Record<string, unknown>) || {};
  const required = (schema.required as string[]) || [];

  for (const [name, prop] of Object.entries(properties)) {
    const propObj = prop as Record<string, unknown>;
    const type = propObj.type || "unknown";
    const desc = propObj.description || "";
    const req = required.includes(name) ? " (required)" : "";
    lines.push(`  - ${name} (${type}${req}): ${desc}`);
  }

  return lines.join("\n");
}

/**
 * Count tokens for a tool definition
 */
export function countToolDefinitionTokens(tool: ToolDefinition): number {
  if (!tool) return 0;
  const formatted = formatToolDefinition(tool);
  return countTokens(formatted);
}

/**
 * Count tokens for multiple tool definitions
 */
export function countAllToolDefinitionTokens(tools: ToolDefinition[]): number {
  if (!tools || tools.length === 0) return 0;
  return tools.reduce((sum, tool) => sum + countToolDefinitionTokens(tool), 0);
}

/**
 * Count tokens for intermediate results
 */
export function countIntermediateResultTokens(
  results: IntermediateResult[]
): number {
  if (!results || results.length === 0) return 0;

  let total = 0;
  for (const result of results) {
    if (result.passedToModel) {
      const formatted = `[${result.toolName}]: ${result.result}`;
      total += countTokens(formatted);
    }
  }
  return total;
}

/**
 * Calculate token metrics for both approaches
 */
export function calculateMetrics(scenario: BenchmarkScenario): {
  directApproach: TokenMetrics;
  codeExecutionApproach: TokenMetrics;
} {
  // Direct approach metrics
  const directToolTokens = countAllToolDefinitionTokens(scenario.toolDefinitions);
  const directIntermediateTokens = countIntermediateResultTokens(
    scenario.intermediateResults
  );

  const directApproach: TokenMetrics = {
    toolDefinitionTokens: directToolTokens,
    intermediateResultTokens: directIntermediateTokens,
    codeTokens: 0,
    totalTokens: directToolTokens + directIntermediateTokens,
  };

  // Code execution approach metrics
  const codeTokens = countTokens(scenario.codeExecutionApproach.code);
  const loadedToolTokens = countAllToolDefinitionTokens(
    scenario.codeExecutionApproach.loadedDefinitions
  );
  const finalResultTokens = countTokens(
    scenario.codeExecutionApproach.finalResult
  );

  const codeExecutionApproach: TokenMetrics = {
    toolDefinitionTokens: loadedToolTokens,
    intermediateResultTokens: finalResultTokens,
    codeTokens: codeTokens,
    totalTokens: loadedToolTokens + finalResultTokens + codeTokens,
  };

  return { directApproach, codeExecutionApproach };
}

/**
 * Cleanup tokenizer resources
 */
export function cleanupTokenizer(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}