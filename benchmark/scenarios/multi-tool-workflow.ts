/**
 * Scenario: Fetch transcript from one service and update in another
 * This demonstrates the "50,000 token" example from the Anthropic blog post
 * where a 2-hour meeting transcript flows through the model twice
 */

import type { BenchmarkScenario, ToolDefinition } from '../src/types.js';
import { generateLongTranscript, generateRealisticToolDefinitions } from './helpers.js';

// Get all tool definitions to simulate a real MCP environment
const allToolDefinitions = generateRealisticToolDefinitions() as ToolDefinition[];

// The two tools that are actually used
const getDocumentTool: ToolDefinition = {
  name: 'getDocument',
  description: 'Retrieve a document from Google Drive by ID',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'The document ID' },
      format: { type: 'string', enum: ['text', 'html', 'pdf'] }
    },
    required: ['documentId']
  }
};

const updateRecordTool: ToolDefinition = {
  name: 'updateRecord',
  description: 'Update a Salesforce record',
  inputSchema: {
    type: 'object',
    properties: {
      objectType: { type: 'string', description: 'Salesforce object type' },
      recordId: { type: 'string', description: 'Record ID to update' },
      data: { type: 'object', description: 'Fields to update' }
    },
    required: ['objectType', 'recordId', 'data']
  }
};

// Generate a 50,000 character transcript (~12,500 tokens)
// This simulates a 2-hour meeting recording transcript
const meetingTranscript = generateLongTranscript(50000);

export const multiToolWorkflow: BenchmarkScenario = {
  name: 'Multi-Tool Workflow',
  description: 'Fetch 2-hour meeting transcript from Google Drive and update Salesforce lead notes. Demonstrates the "50,000 token" problem where large data passes through model twice.',

  // Direct approach: All tools loaded upfront
  toolDefinitions: allToolDefinitions,

  // In direct approach, the transcript passes through the model context
  // First when returned from getDocument, then when sent to updateRecord
  intermediateResults: [
    {
      toolName: 'getDocument',
      // The full 50,000 character transcript flows through model context
      result: JSON.stringify({
        documentId: 'abc123',
        title: 'Q4 Planning Meeting - December 2024',
        mimeType: 'text/plain',
        content: meetingTranscript,
        lastModified: '2024-12-20T10:30:00Z',
        size: meetingTranscript.length
      }),
      passedToModel: true
    },
    {
      toolName: 'updateRecord',
      result: JSON.stringify({
        success: true,
        recordId: 'xyz789',
        objectType: 'Lead',
        fieldsUpdated: ['Notes', 'LastActivityDate']
      }),
      passedToModel: true
    }
  ],

  // Code execution approach - transcript never enters model context
  codeExecutionApproach: {
    code: `import { getDocument } from '../servers/gdrive/index.js';
import { updateRecord } from '../servers/salesforce/index.js';

// Read and transfer in code - transcript never enters model context
const doc = await getDocument.call({ documentId: 'abc123' });
await updateRecord.call({
  objectType: 'Lead',
  recordId: 'xyz789',
  data: { Notes: doc.content, LastActivityDate: new Date().toISOString() }
});

console.log('Updated lead with meeting transcript');`,
    // Only the 2 tools that were actually used
    loadedDefinitions: [getDocumentTool, updateRecordTool],
    finalResult: 'Updated lead with meeting transcript'
  }
};