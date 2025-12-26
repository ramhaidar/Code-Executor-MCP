/**
 * Benchmark scenarios index
 * Export all scenarios for the benchmark runner
 */

export { simpleToolCall } from './simple-tool-call.js';
export { multiToolWorkflow } from './multi-tool-workflow.js';
export { dataFiltering } from './data-filtering.js';
export { loopOperations } from './loop-operations.js';

// Re-export helpers for use in custom scenarios
export {
  generateLongTranscript,
  generateLargeSpreadsheet,
  generateChannelMessages,
  generateRealisticToolDefinitions
} from './helpers.js';

import { simpleToolCall } from './simple-tool-call.js';
import { multiToolWorkflow } from './multi-tool-workflow.js';
import { dataFiltering } from './data-filtering.js';
import { loopOperations } from './loop-operations.js';
import type { BenchmarkScenario } from '../src/types.js';

/**
 * All benchmark scenarios in recommended execution order
 */
export const allScenarios: BenchmarkScenario[] = [
  simpleToolCall,
  multiToolWorkflow,
  dataFiltering,
  loopOperations,
];