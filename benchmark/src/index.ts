#!/usr/bin/env node
/**
 * Code Executor MCP Benchmark
 * Main entry point - runs benchmarks and outputs results
 */

import { runAllBenchmarks, calculateAggregateStats } from './runner.js';
import { formatConsoleReport, saveResultsJson, saveMarkdownReport } from './reporter.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'results');

async function main() {
  console.log('🚀 Running Code Executor MCP Benchmarks...\n');

  try {
    // Run all benchmarks
    const results = await runAllBenchmarks();
    const aggregate = calculateAggregateStats(results);

    // Output to console
    console.log(formatConsoleReport(results, aggregate));

    // Save results
    const jsonPath = await saveResultsJson(results, RESULTS_DIR);
    console.log(`\n📁 JSON results saved to: ${jsonPath}`);

    const mdPath = await saveMarkdownReport(results, aggregate, RESULTS_DIR);
    console.log(`📄 Markdown report saved to: ${mdPath}`);

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log(`✨ Average token savings: ${aggregate.averageSavingsPercent.toFixed(1)}%`);
    console.log(`📊 Range: ${aggregate.minSavingsPercent.toFixed(1)}% - ${aggregate.maxSavingsPercent.toFixed(1)}%`);

  } catch (err) {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
  }
}

main();