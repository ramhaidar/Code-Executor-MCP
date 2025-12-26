# Code Executor MCP - Token Savings Benchmark

This benchmark system measures the token efficiency gains of the "code execution with MCP" pattern compared to traditional direct tool calls.

## Background

The claim that "token savings can reach 98%+" is based on the analysis from [Anthropic's engineering blog post](https://www.anthropic.com/engineering/claude-code-execution-mcp) on building more efficient agents with MCP. This benchmark system validates that claim with concrete measurements.

## The Problem with Direct Tool Calls

Traditional MCP usage has two token-consuming patterns:

1. **Tool Definition Overhead**: All tool definitions are loaded upfront into the context window
2. **Intermediate Result Overhead**: Every tool result passes through the model context

## The Code Execution Solution

Instead of calling tools directly, agents write TypeScript code that:
- Loads only the tool definitions needed for the current task (progressive disclosure)
- Processes and filters data in code before returning to the model
- Uses control flow (loops, conditionals) without round-trips to the model

## Running the Benchmark

### Prerequisites

```bash
cd benchmark
pnpm install
```

### Run Benchmarks

```bash
pnpm run benchmark
```

### Output

The benchmark produces:
- **Console output**: Colored table showing results for each scenario
- **JSON results**: `results/benchmark-YYYY-MM-DD.json`
- **Markdown report**: `results/RESULTS.md`

## Benchmark Scenarios

### 1. Simple Tool Call
- **Scenario**: Single tool call to fetch library documentation
- **Direct approach**: Load 25 tool definitions + pass result through context
- **Code execution**: Load 1 tool definition + return minimal result
- **Expected savings**: ~95%

### 2. Multi-Tool Workflow
- **Scenario**: Fetch document from one service, update in another (Google Drive → Salesforce pattern)
- **Direct approach**: Load tools + 50,000 character transcript passes through model twice
- **Code execution**: Load 2 tools + transcript never enters model context
- **Expected savings**: ~99%

### 3. Data Filtering
- **Scenario**: Process 10,000 row spreadsheet, return 5 matching results
- **Direct approach**: Full spreadsheet (~2MB) passes through model
- **Code execution**: Filter in code, return only 5 rows (~2KB)
- **Expected savings**: ~99.8%

### 4. Loop Operations
- **Scenario**: Poll for deployment notification (5 iterations × 100 messages)
- **Direct approach**: Each iteration passes through model context
- **Code execution**: Loop runs in code, only final result returned
- **Expected savings**: ~99.5%

## Methodology

### Token Counting
- Uses `tiktoken` with `cl100k_base` encoding (compatible with GPT-4/Claude)
- Tool definitions formatted as they appear in model context
- Only intermediate results marked as `passedToModel: true` are counted

### Metrics Calculated
| Metric | Description |
|--------|-------------|
| Tool Definition Tokens | Tokens used for tool schemas |
| Intermediate Result Tokens | Tokens for data passing through model |
| Code Tokens | Tokens for the TypeScript code (code execution only) |
| Total Tokens | Sum of all token categories |
| Savings % | (Direct - Code) / Direct × 100 |

## Understanding Results

### Sample Output
```
╔═══════════════════════════════════════════════════════════════╗
║                   BENCHMARK RESULTS                            ║
╚═══════════════════════════════════════════════════════════════╝

┌─────────────────────┬─────────────┬───────────────┬────────────┐
│ Scenario            │ Direct      │ Code Exec     │ Savings    │
├─────────────────────┼─────────────┼───────────────┼────────────┤
│ Simple Tool Call    │ 45,234      │ 1,523         │ 96.6%      │
│ Multi-Tool Workflow │ 152,456     │ 2,134         │ 98.6%      │
│ Data Filtering      │ 534,123     │ 1,892         │ 99.6%      │
│ Loop Operations     │ 89,234      │ 1,456         │ 98.4%      │
└─────────────────────┴─────────────┴───────────────┴────────────┘
```

### Key Insights
- **Simple operations** show significant savings (95%+) due to progressive disclosure
- **Data-intensive operations** show massive savings (99%+) due to filtering in code
- **Iterative operations** benefit from control flow in code vs. agent loop

## Adding New Scenarios

1. Create a new file in `scenarios/`:
```typescript
import type { BenchmarkScenario } from '../src/types.js';

export const myScenario: BenchmarkScenario = {
  name: "My Scenario",
  description: "Description of what this measures",
  toolDefinitions: [...],
  intermediateResults: [...],
  codeExecutionApproach: {
    code: "...",
    loadedDefinitions: [...],
    finalResult: "..."
  }
};
```

2. Export from `scenarios/index.ts`

3. Run benchmark to see results

## Technical Details

### File Structure
```
benchmark/
├── src/
│   ├── types.ts          # Type definitions
│   ├── token-counter.ts  # Token counting with tiktoken
│   ├── runner.ts         # Benchmark execution
│   ├── reporter.ts       # Report generation
│   └── index.ts          # CLI entry point
├── scenarios/
│   ├── helpers.ts        # Data generation helpers
│   ├── simple-tool-call.ts
│   ├── multi-tool-workflow.ts
│   ├── data-filtering.ts
│   └── loop-operations.ts
└── results/              # Generated reports
```

### Dependencies
- `tiktoken`: Token counting compatible with modern LLMs
- `chalk`: Colored terminal output

## References

- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/claude-code-execution-mcp)
- [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- [Model Context Protocol](https://modelcontextprotocol.io/)