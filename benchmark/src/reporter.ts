/**
 * Reporter module for benchmark results
 * Generates console output, markdown reports, and JSON files
 */

import chalk from 'chalk';
import type { BenchmarkResult } from './types.js';
import type { AggregateStats } from './runner.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Create a visual progress bar for savings percentage
 */
function createProgressBar(percentage: number, width: number = 12): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Get color function based on savings percentage
 */
function getSavingsColor(percentage: number): (text: string) => string {
  if (percentage >= 90) return chalk.green;
  if (percentage >= 50) return chalk.yellow;
  return chalk.red;
}

/**
 * Pad string to fixed width
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : ' '.repeat(width - str.length) + str;
}

/**
 * Format results as console output with colors
 */
export function formatConsoleReport(results: BenchmarkResult[], aggregate: AggregateStats): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.cyan('╔' + '═'.repeat(67) + '╗'));
  lines.push(chalk.cyan('║') + chalk.bold.white('                      BENCHMARK RESULTS                              ') + chalk.cyan('║'));
  lines.push(chalk.cyan('╚' + '═'.repeat(67) + '╝'));
  lines.push('');

  // Table header
  lines.push(chalk.gray('┌' + '─'.repeat(23) + '┬' + '─'.repeat(13) + '┬' + '─'.repeat(15) + '┬' + '─'.repeat(16) + '┐'));
  lines.push(chalk.gray('│') + chalk.bold(' Scenario              ') + chalk.gray('│') + chalk.bold(' Direct      ') + chalk.gray('│') + chalk.bold(' Code Exec     ') + chalk.gray('│') + chalk.bold(' Savings        ') + chalk.gray('│'));
  lines.push(chalk.gray('├' + '─'.repeat(23) + '┼' + '─'.repeat(13) + '┼' + '─'.repeat(15) + '┼' + '─'.repeat(16) + '┤'));

  // Table rows
  for (const result of results) {
    const scenarioName = padRight(result.scenario, 21);
    const directTokens = padLeft(formatNumber(result.directApproach.totalTokens), 11);
    const codeExecTokens = padLeft(formatNumber(result.codeExecutionApproach.totalTokens), 13);
    const savingsPercent = result.savings.percentage.toFixed(1) + '%';
    const progressBar = createProgressBar(result.savings.percentage);
    const colorFn = getSavingsColor(result.savings.percentage);

    lines.push(
      chalk.gray('│') + ' ' + scenarioName + ' ' +
      chalk.gray('│') + ' ' + directTokens + ' ' +
      chalk.gray('│') + ' ' + codeExecTokens + ' ' +
      chalk.gray('│') + ' ' + colorFn(padLeft(savingsPercent, 5)) + ' ' + colorFn(progressBar) + chalk.gray('│')
    );
  }

  lines.push(chalk.gray('└' + '─'.repeat(23) + '┴' + '─'.repeat(13) + '┴' + '─'.repeat(15) + '┴' + '─'.repeat(16) + '┘'));

  // Summary
  lines.push('');
  lines.push(chalk.bold('Summary:'));
  lines.push(`  Total tokens (direct):         ${chalk.cyan(formatNumber(aggregate.totalDirectTokens))}`);
  lines.push(`  Total tokens (code execution): ${chalk.cyan(formatNumber(aggregate.totalCodeExecutionTokens))}`);

  const totalSavingsPercent = aggregate.totalDirectTokens > 0
    ? ((aggregate.totalSavings / aggregate.totalDirectTokens) * 100).toFixed(1)
    : '0.0';
  const totalColorFn = getSavingsColor(parseFloat(totalSavingsPercent));
  lines.push(`  Total savings:                 ${totalColorFn(formatNumber(aggregate.totalSavings) + ' tokens (' + totalSavingsPercent + '%)')}`);

  return lines.join('\n');
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(results: BenchmarkResult[], aggregate: AggregateStats): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // Title and header
  lines.push('# Code Executor MCP Benchmark Results');
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push('');

  // Introduction
  lines.push('## Overview');
  lines.push('');
  lines.push('This benchmark measures token savings achieved by using the Code Executor MCP pattern');
  lines.push('compared to traditional direct MCP tool calls. The code execution approach allows');
  lines.push('the model to write and execute code that orchestrates multiple tool calls, dramatically');
  lines.push('reducing the number of tokens that need to pass through the context window.');
  lines.push('');
  lines.push('For more details on this pattern, see the [Anthropic blog post on effective agents](https://www.anthropic.com/research/building-effective-agents).');
  lines.push('');

  // Summary statistics
  lines.push('## Summary Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Direct Tokens | ${formatNumber(aggregate.totalDirectTokens)} |`);
  lines.push(`| Total Code Execution Tokens | ${formatNumber(aggregate.totalCodeExecutionTokens)} |`);
  lines.push(`| Total Tokens Saved | ${formatNumber(aggregate.totalSavings)} |`);
  lines.push(`| Average Savings | ${aggregate.averageSavingsPercent.toFixed(1)}% |`);
  lines.push(`| Min Savings | ${aggregate.minSavingsPercent.toFixed(1)}% |`);
  lines.push(`| Max Savings | ${aggregate.maxSavingsPercent.toFixed(1)}% |`);
  lines.push('');

  // Detailed results table
  lines.push('## Detailed Results');
  lines.push('');
  lines.push('| Scenario | Direct Tokens | Code Execution Tokens | Savings (Tokens) | Savings (%) |');
  lines.push('|----------|---------------|----------------------|------------------|-------------|');

  for (const result of results) {
    lines.push(
      `| ${result.scenario} | ${formatNumber(result.directApproach.totalTokens)} | ` +
      `${formatNumber(result.codeExecutionApproach.totalTokens)} | ` +
      `${formatNumber(result.savings.tokens)} | ${result.savings.percentage.toFixed(1)}% |`
    );
  }

  lines.push('');

  // Token breakdown for each scenario
  lines.push('## Token Breakdown by Scenario');
  lines.push('');

  for (const result of results) {
    lines.push(`### ${result.scenario}`);
    lines.push('');
    lines.push('**Direct Approach:**');
    lines.push(`- Tool Definition Tokens: ${formatNumber(result.directApproach.toolDefinitionTokens)}`);
    lines.push(`- Intermediate Result Tokens: ${formatNumber(result.directApproach.intermediateResultTokens)}`);
    lines.push(`- Total: ${formatNumber(result.directApproach.totalTokens)}`);
    lines.push('');
    lines.push('**Code Execution Approach:**');
    lines.push(`- Tool Definition Tokens: ${formatNumber(result.codeExecutionApproach.toolDefinitionTokens)}`);
    lines.push(`- Code Tokens: ${formatNumber(result.codeExecutionApproach.codeTokens)}`);
    lines.push(`- Final Result Tokens: ${formatNumber(result.codeExecutionApproach.intermediateResultTokens)}`);
    lines.push(`- Total: ${formatNumber(result.codeExecutionApproach.totalTokens)}`);
    lines.push('');
  }

  // Methodology
  lines.push('## Methodology');
  lines.push('');
  lines.push('### Direct Approach');
  lines.push('In the traditional approach, each tool call requires:');
  lines.push('1. All tool definitions to be loaded into the context');
  lines.push('2. Each intermediate result to pass back through the model');
  lines.push('3. Multiple round-trips for multi-step operations');
  lines.push('');
  lines.push('### Code Execution Approach');
  lines.push('With the Code Executor MCP pattern:');
  lines.push('1. Tool definitions are loaded on-demand within the execution environment');
  lines.push('2. Intermediate results are processed locally without passing through the model');
  lines.push('3. Only the final, filtered result returns to the model');
  lines.push('');
  lines.push('### Token Counting');
  lines.push('Tokens are counted using the `tiktoken` library with the `cl100k_base` encoding,');
  lines.push('which is compatible with modern Claude and GPT tokenizers.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Save results to JSON file
 */
export async function saveResultsJson(results: BenchmarkResult[], outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filename = `benchmark-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = join(outputDir, filename);

  const output = {
    timestamp: new Date().toISOString(),
    results
  };

  await writeFile(filepath, JSON.stringify(output, null, 2));
  return filepath;
}

/**
 * Save markdown report
 */
export async function saveMarkdownReport(
  results: BenchmarkResult[],
  aggregate: AggregateStats,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filename = 'RESULTS.md';
  const filepath = join(outputDir, filename);
  const content = generateMarkdownReport(results, aggregate);
  await writeFile(filepath, content);
  return filepath;
}