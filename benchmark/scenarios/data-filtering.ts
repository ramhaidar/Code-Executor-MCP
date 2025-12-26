/**
 * Scenario: Fetch 10,000 row spreadsheet, filter to 5 pending orders
 * Demonstrates the context efficiency of filtering in code
 * 
 * In direct approach: All 10,000 rows pass through model context
 * In code execution: Only the 5 matching rows are returned
 */

import type { BenchmarkScenario, ToolDefinition } from '../src/types.js';
import { generateLargeSpreadsheet, generateRealisticToolDefinitions } from './helpers.js';

// Get all tool definitions to simulate a real MCP environment
const allToolDefinitions = generateRealisticToolDefinitions() as ToolDefinition[];

// The single tool that's actually used
const getSheetTool: ToolDefinition = {
  name: 'getSheet',
  description: 'Get data from a Google Sheets spreadsheet',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range' },
      valueRenderOption: { type: 'string', enum: ['FORMATTED_VALUE', 'UNFORMATTED_VALUE'] }
    },
    required: ['sheetId']
  }
};

// Generate 10,000 rows of spreadsheet data
// This simulates a real business spreadsheet with orders
const fullSpreadsheet = generateLargeSpreadsheet(10000);

// The filtered result - only 5 pending orders
// In the generated data, every 5th row has status 'pending' (rows 0, 5, 10, ...)
const filteredResult = JSON.stringify([
  { OrderId: 'ORD-000001', Date: '2024-01-01', Customer: 'Customer 1', Email: 'customer1@example.com', Product: 'Widget A', Quantity: 1, UnitPrice: 99.9, Status: 'pending', Region: 'North', Notes: 'Order notes for order 1. Processing normally.' },
  { OrderId: 'ORD-000006', Date: '2024-01-06', Customer: 'Customer 6', Email: 'customer6@example.com', Product: 'Service Plan', Quantity: 6, UnitPrice: 149.85, Status: 'pending', Region: 'North', Notes: 'Order notes for order 6. Processing normally.' },
  { OrderId: 'ORD-000011', Date: '2024-01-11', Customer: 'Customer 11', Email: 'customer11@example.com', Product: 'Widget A', Quantity: 1, UnitPrice: 199.8, Status: 'pending', Region: 'North', Notes: 'Order notes for order 11. Processing normally.' },
  { OrderId: 'ORD-000016', Date: '2024-01-16', Customer: 'Customer 16', Email: 'customer16@example.com', Product: 'Service Plan', Quantity: 6, UnitPrice: 249.75, Status: 'pending', Region: 'North', Notes: 'Order notes for order 16. Processing normally.' },
  { OrderId: 'ORD-000021', Date: '2024-01-21', Customer: 'Customer 21', Email: 'customer21@example.com', Product: 'Widget A', Quantity: 1, UnitPrice: 299.7, Status: 'pending', Region: 'North', Notes: 'Order notes for order 21. Processing normally.' }
], null, 2);

export const dataFiltering: BenchmarkScenario = {
  name: 'Data Filtering',
  description: 'Process 10,000 row spreadsheet, return only 5 pending orders. Demonstrates massive token waste when filtering happens in model context vs code.',

  // Direct approach: All tools loaded upfront
  toolDefinitions: allToolDefinitions,

  // In direct approach, ALL 10,000 rows pass through model context
  intermediateResults: [
    {
      toolName: 'getSheet',
      // The full 10,000 row spreadsheet flows through model context
      result: fullSpreadsheet,
      passedToModel: true
    }
  ],

  // Code execution approach - filtering happens in code
  codeExecutionApproach: {
    code: `import { getSheet } from '../servers/gsheets/index.js';

const response = await getSheet.call({ sheetId: 'abc123' });
const allRows = JSON.parse(response);

// Filter in code - only matching rows enter model context
const pending = allRows
  .filter(row => row.Status === 'pending')
  .slice(0, 5);

console.log(\`Found \${pending.length} pending orders\`);
console.log(JSON.stringify(pending, null, 2));`,
    // Only the single tool that was actually used
    loadedDefinitions: [getSheetTool],
    // Only the 5 filtered rows are returned to model
    finalResult: `Found 5 pending orders\n${filteredResult}`
  }
};