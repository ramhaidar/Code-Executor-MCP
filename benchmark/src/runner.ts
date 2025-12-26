/**
 * Benchmark runner module
 * Executes benchmark scenarios and calculates metrics
 */

import { initTokenizer, calculateMetrics, cleanupTokenizer } from './token-counter.js';
import { allScenarios } from '../scenarios/index.js';
import type { BenchmarkResult, BenchmarkScenario } from './types.js';

/**
 * Aggregate statistics across all benchmark results
 */
export interface AggregateStats {
  totalDirectTokens: number;
  totalCodeExecutionTokens: number;
  totalSavings: number;
  averageSavingsPercent: number;
  minSavingsPercent: number;
  maxSavingsPercent: number;
}

/**
 * Run a single benchmark scenario and return results
 */
export async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
  const metrics = calculateMetrics(scenario);

  const directTokens = metrics.directApproach.totalTokens;
  const codeExecTokens = metrics.codeExecutionApproach.totalTokens;
  const savedTokens = directTokens - codeExecTokens;
  const savingsPercent = directTokens > 0 ? (savedTokens / directTokens) * 100 : 0;

  return {
    scenario: scenario.name,
    directApproach: metrics.directApproach,
    codeExecutionApproach: metrics.codeExecutionApproach,
    savings: {
      tokens: savedTokens,
      percentage: savingsPercent
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Run all benchmark scenarios
 */
export async function runAllBenchmarks(): Promise<BenchmarkResult[]> {
  await initTokenizer();

  const results: BenchmarkResult[] = [];

  for (const scenario of allScenarios) {
    const result = await runScenario(scenario);
    results.push(result);
  }

  cleanupTokenizer();

  return results;
}

/**
 * Calculate aggregate statistics across all results
 */
export function calculateAggregateStats(results: BenchmarkResult[]): AggregateStats {
  if (results.length === 0) {
    return {
      totalDirectTokens: 0,
      totalCodeExecutionTokens: 0,
      totalSavings: 0,
      averageSavingsPercent: 0,
      minSavingsPercent: 0,
      maxSavingsPercent: 0
    };
  }

  const totalDirectTokens = results.reduce(
    (sum, r) => sum + r.directApproach.totalTokens,
    0
  );

  const totalCodeExecutionTokens = results.reduce(
    (sum, r) => sum + r.codeExecutionApproach.totalTokens,
    0
  );

  const totalSavings = totalDirectTokens - totalCodeExecutionTokens;

  const savingsPercentages = results.map(r => r.savings.percentage);
  const averageSavingsPercent = savingsPercentages.reduce((a, b) => a + b, 0) / savingsPercentages.length;
  const minSavingsPercent = Math.min(...savingsPercentages);
  const maxSavingsPercent = Math.max(...savingsPercentages);

  return {
    totalDirectTokens,
    totalCodeExecutionTokens,
    totalSavings,
    averageSavingsPercent,
    minSavingsPercent,
    maxSavingsPercent
  };
}