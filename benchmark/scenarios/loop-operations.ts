/**
 * Scenario: Poll for deployment completion (like the Slack example from Anthropic blog)
 * Shows how loops in code are more efficient than repeated tool calls through model
 * 
 * Direct approach: Each poll iteration goes through model context (5x overhead)
 * Code execution: Loop runs in code, only final result returned
 */

import type { BenchmarkScenario, ToolDefinition } from '../src/types.js';
import { generateChannelMessages, generateRealisticToolDefinitions } from './helpers.js';

// Get all tool definitions to simulate a real MCP environment
const allToolDefinitions = generateRealisticToolDefinitions() as ToolDefinition[];

// The single tool that's actually used
const getChannelHistoryTool: ToolDefinition = {
  name: 'getChannelHistory',
  description: 'Get message history from a Slack channel',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel ID' },
      limit: { type: 'number', description: 'Number of messages' },
      oldest: { type: 'string', description: 'Start timestamp' },
      latest: { type: 'string', description: 'End timestamp' }
    },
    required: ['channel']
  }
};

// Generate channel messages for each poll iteration
// Each poll returns 100 messages (simulating an active deployment channel)
const pollIteration1 = generateChannelMessages(100, false);
const pollIteration2 = generateChannelMessages(100, false);
const pollIteration3 = generateChannelMessages(100, false);
const pollIteration4 = generateChannelMessages(100, false);
const pollIteration5 = generateChannelMessages(100, true); // Deployment complete!

export const loopOperations: BenchmarkScenario = {
  name: 'Loop Operations',
  description: 'Poll Slack channel for deployment notification (5 iterations with 100 messages each). Demonstrates the overhead of iterative operations through model context.',

  // Direct approach: All tools loaded upfront
  toolDefinitions: allToolDefinitions,

  // Direct approach: Each poll iteration goes through model context
  // Model sees 100 messages × 5 iterations = 500 messages total
  intermediateResults: [
    {
      toolName: 'getChannelHistory',
      result: pollIteration1,
      passedToModel: true
    },
    {
      toolName: 'getChannelHistory',
      result: pollIteration2,
      passedToModel: true
    },
    {
      toolName: 'getChannelHistory',
      result: pollIteration3,
      passedToModel: true
    },
    {
      toolName: 'getChannelHistory',
      result: pollIteration4,
      passedToModel: true
    },
    {
      toolName: 'getChannelHistory',
      result: pollIteration5,
      passedToModel: true
    }
  ],

  // Code execution approach - loop runs in code
  codeExecutionApproach: {
    code: `import { getChannelHistory } from '../servers/slack/index.js';

// Poll until deployment notification found
let found = false;
let attempts = 0;
const maxAttempts = 10;

while (!found && attempts < maxAttempts) {
  attempts++;
  const response = await getChannelHistory.call({ channel: 'C123456', limit: 100 });
  const messages = JSON.parse(response);
  
  found = messages.some(m => m.text.includes('deployment complete'));
  
  if (!found) {
    // Wait 5 seconds between polls
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

if (found) {
  console.log(\`Deployment notification received after \${attempts} polls\`);
} else {
  console.log('Deployment notification not found within timeout');
}`,
    // Only the single tool that was actually used
    loadedDefinitions: [getChannelHistoryTool],
    // Only the final result is returned to model
    finalResult: 'Deployment notification received after 5 polls'
  }
};