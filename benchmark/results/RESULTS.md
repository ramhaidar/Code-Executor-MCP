# Code Executor MCP Benchmark Results

**Generated:** 2025-12-26T00:12:07.111Z

## Overview

This benchmark measures token savings achieved by using the Code Executor MCP pattern
compared to traditional direct MCP tool calls. The code execution approach allows
the model to write and execute code that orchestrates multiple tool calls, dramatically
reducing the number of tokens that need to pass through the context window.

For more details on this pattern, see the [Anthropic blog post on effective agents](https://www.anthropic.com/research/building-effective-agents).

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Direct Tokens | 726,201 |
| Total Code Execution Tokens | 1,150 |
| Total Tokens Saved | 725,051 |
| Average Savings | 97.6% |
| Min Savings | 93.6% |
| Max Savings | 99.9% |

## Detailed Results

| Scenario | Direct Tokens | Code Execution Tokens | Savings (Tokens) | Savings (%) |
|----------|---------------|----------------------|------------------|-------------|
| Simple Tool Call | 1,181 | 76 | 1,105 | 93.6% |
| Multi-Tool Workflow | 11,763 | 198 | 11,565 | 98.3% |
| Data Filtering | 697,287 | 650 | 696,637 | 99.9% |
| Loop Operations | 15,970 | 226 | 15,744 | 98.6% |

## Token Breakdown by Scenario

### Simple Tool Call

**Direct Approach:**
- Tool Definition Tokens: 1,079
- Intermediate Result Tokens: 102
- Total: 1,181

**Code Execution Approach:**
- Tool Definition Tokens: 34
- Code Tokens: 40
- Final Result Tokens: 2
- Total: 76

### Multi-Tool Workflow

**Direct Approach:**
- Tool Definition Tokens: 1,079
- Intermediate Result Tokens: 10,684
- Total: 11,763

**Code Execution Approach:**
- Tool Definition Tokens: 89
- Code Tokens: 104
- Final Result Tokens: 5
- Total: 198

### Data Filtering

**Direct Approach:**
- Tool Definition Tokens: 1,079
- Intermediate Result Tokens: 696,208
- Total: 697,287

**Code Execution Approach:**
- Tool Definition Tokens: 49
- Code Tokens: 98
- Final Result Tokens: 503
- Total: 650

### Loop Operations

**Direct Approach:**
- Tool Definition Tokens: 1,079
- Intermediate Result Tokens: 14,891
- Total: 15,970

**Code Execution Approach:**
- Tool Definition Tokens: 56
- Code Tokens: 163
- Final Result Tokens: 7
- Total: 226

## Methodology

### Direct Approach
In the traditional approach, each tool call requires:
1. All tool definitions to be loaded into the context
2. Each intermediate result to pass back through the model
3. Multiple round-trips for multi-step operations

### Code Execution Approach
With the Code Executor MCP pattern:
1. Tool definitions are loaded on-demand within the execution environment
2. Intermediate results are processed locally without passing through the model
3. Only the final, filtered result returns to the model

### Token Counting
Tokens are counted using the `tiktoken` library with the `cl100k_base` encoding,
which is compatible with modern Claude and GPT tokenizers.
