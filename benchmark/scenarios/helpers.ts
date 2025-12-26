/**
 * Helper functions for generating realistic test data for benchmark scenarios
 */

/**
 * Generate a meeting transcript of approximately the specified character count
 * Simulates a 2-hour meeting transcript (~50,000 characters for full version)
 */
export function generateLongTranscript(charCount: number = 50000): string {
  const speakers = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];
  const topics = [
    'quarterly metrics', 'product roadmap', 'customer feedback',
    'technical debt', 'hiring plans', 'budget allocation',
    'sprint planning', 'API design', 'security review'
  ];

  const segments: string[] = [];
  let currentLength = 0;
  let timestamp = 0;

  while (currentLength < charCount) {
    const speaker = speakers[Math.floor(timestamp / 5) % speakers.length];
    const topic = topics[Math.floor(timestamp / 10) % topics.length];
    const minutes = Math.floor(timestamp / 60);
    const seconds = timestamp % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const segment = `[${timeStr}] ${speaker}: Let me share my thoughts on ${topic}. ` +
      `Based on our analysis, we've seen significant improvements in key areas. ` +
      `The data shows a 15% increase compared to last quarter. ` +
      `I think we should focus on maintaining this momentum while addressing ` +
      `the concerns raised by the team. Any questions before I continue?\n\n`;

    segments.push(segment);
    currentLength += segment.length;
    timestamp += 30;
  }

  return segments.join('').slice(0, charCount);
}

/**
 * Generate a spreadsheet with the specified number of rows
 * Each row represents an order with realistic business data
 */
export function generateLargeSpreadsheet(rowCount: number): string {
  const statuses = ['pending', 'shipped', 'delivered', 'cancelled', 'processing'];
  const products = ['Widget A', 'Widget B', 'Gadget Pro', 'Service Plan', 'Enterprise License'];
  const regions = ['North', 'South', 'East', 'West', 'Central'];

  const rows: object[] = [];

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      OrderId: `ORD-${String(i + 1).padStart(6, '0')}`,
      Date: new Date(2024, Math.floor(i / 1000) % 12, (i % 28) + 1).toISOString().split('T')[0],
      Customer: `Customer ${i + 1}`,
      Email: `customer${i + 1}@example.com`,
      Product: products[i % products.length],
      Quantity: (i % 10) + 1,
      UnitPrice: ((i % 50) + 10) * 9.99,
      Status: statuses[i % statuses.length],
      Region: regions[i % regions.length],
      Notes: `Order notes for order ${i + 1}. Processing normally.`
    });
  }

  return JSON.stringify(rows);
}

/**
 * Generate Slack-like channel messages
 * Optionally includes deployment notification in the last batch
 */
export function generateChannelMessages(count: number, includeDeployment: boolean = false): string {
  const users = ['alice', 'bob', 'carol', 'deploy-bot', 'ci-system'];
  const messageTypes = [
    'Just pushed a fix for the login issue',
    'Can someone review PR #1234?',
    'Meeting in 10 minutes',
    'Updated the documentation',
    'Running tests now...',
    'Looks good to me!',
    'Fixed the flaky test',
    'Merged to main',
    'Starting deployment...'
  ];

  const messages: object[] = [];
  const baseTs = 1703500000;

  for (let i = 0; i < count; i++) {
    messages.push({
      ts: String(baseTs + i * 60),
      user: users[i % users.length],
      text: messageTypes[i % messageTypes.length],
      type: 'message',
      channel: 'C123456'
    });
  }

  if (includeDeployment) {
    messages.push({
      ts: String(baseTs + count * 60),
      user: 'deploy-bot',
      text: '✅ deployment complete - v2.3.4 is now live in production',
      type: 'message',
      channel: 'C123456'
    });
  }

  return JSON.stringify(messages);
}

/**
 * Generate realistic MCP tool definitions for common services
 * Returns array of tool definitions that simulate a typical MCP environment
 */
export function generateRealisticToolDefinitions(): object[] {
  return [
    {
      name: 'resolve-library-id',
      description: 'Resolve a library name to its Context7 library ID',
      inputSchema: {
        type: 'object',
        properties: {
          libraryName: { type: 'string', description: 'Library name to resolve' }
        },
        required: ['libraryName']
      }
    },
    {
      name: 'get-library-docs',
      description: 'Fetch documentation for a library by ID',
      inputSchema: {
        type: 'object',
        properties: {
          libraryId: { type: 'string', description: 'Context7 library ID' },
          topic: { type: 'string', description: 'Optional topic to focus on' },
          tokens: { type: 'number', description: 'Max tokens to return' }
        },
        required: ['libraryId']
      }
    },
    {
      name: 'search-libraries',
      description: 'Search for libraries matching a query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['query']
      }
    },
    {
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
    },
    {
      name: 'listFiles',
      description: 'List files in a Google Drive folder',
      inputSchema: {
        type: 'object',
        properties: {
          folderId: { type: 'string' },
          pageSize: { type: 'number' },
          pageToken: { type: 'string' }
        },
        required: ['folderId']
      }
    },
    {
      name: 'createDocument',
      description: 'Create a new Google Drive document',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          folderId: { type: 'string' }
        },
        required: ['title']
      }
    },
    {
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
    },
    {
      name: 'queryRecords',
      description: 'Query Salesforce records using SOQL',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SOQL query' },
          limit: { type: 'number' }
        },
        required: ['query']
      }
    },
    {
      name: 'createRecord',
      description: 'Create a new Salesforce record',
      inputSchema: {
        type: 'object',
        properties: {
          objectType: { type: 'string' },
          data: { type: 'object' }
        },
        required: ['objectType', 'data']
      }
    },
    {
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
    },
    {
      name: 'updateSheet',
      description: 'Update cells in a Google Sheets spreadsheet',
      inputSchema: {
        type: 'object',
        properties: {
          sheetId: { type: 'string' },
          range: { type: 'string' },
          values: { type: 'array' }
        },
        required: ['sheetId', 'range', 'values']
      }
    },
    {
      name: 'appendRows',
      description: 'Append rows to a Google Sheets spreadsheet',
      inputSchema: {
        type: 'object',
        properties: {
          sheetId: { type: 'string' },
          range: { type: 'string' },
          values: { type: 'array' }
        },
        required: ['sheetId', 'values']
      }
    },
    {
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
    },
    {
      name: 'postMessage',
      description: 'Post a message to a Slack channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          text: { type: 'string' },
          blocks: { type: 'array' },
          thread_ts: { type: 'string' }
        },
        required: ['channel', 'text']
      }
    },
    {
      name: 'listChannels',
      description: 'List Slack channels',
      inputSchema: {
        type: 'object',
        properties: {
          types: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'searchMessages',
      description: 'Search Slack messages',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          sort: { type: 'string', enum: ['score', 'timestamp'] },
          count: { type: 'number' }
        },
        required: ['query']
      }
    },
    {
      name: 'getUserInfo',
      description: 'Get Slack user information',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'User ID' }
        },
        required: ['user']
      }
    },
    {
      name: 'createIssue',
      description: 'Create a GitHub issue',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array' }
        },
        required: ['owner', 'repo', 'title']
      }
    },
    {
      name: 'listPullRequests',
      description: 'List GitHub pull requests',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] }
        },
        required: ['owner', 'repo']
      }
    },
    {
      name: 'getFileContents',
      description: 'Get contents of a file from GitHub',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          path: { type: 'string' },
          ref: { type: 'string' }
        },
        required: ['owner', 'repo', 'path']
      }
    },
    {
      name: 'runWorkflow',
      description: 'Trigger a GitHub Actions workflow',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          workflow_id: { type: 'string' },
          ref: { type: 'string' },
          inputs: { type: 'object' }
        },
        required: ['owner', 'repo', 'workflow_id', 'ref']
      }
    },
    {
      name: 'sendEmail',
      description: 'Send an email via Gmail',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'array', items: { type: 'string' } },
          subject: { type: 'string' },
          body: { type: 'string' },
          cc: { type: 'array' },
          attachments: { type: 'array' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    {
      name: 'searchEmails',
      description: 'Search Gmail messages',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number' }
        },
        required: ['query']
      }
    },
    {
      name: 'createCalendarEvent',
      description: 'Create a Google Calendar event',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          attendees: { type: 'array' },
          description: { type: 'string' }
        },
        required: ['summary', 'start', 'end']
      }
    },
    {
      name: 'listCalendarEvents',
      description: 'List Google Calendar events',
      inputSchema: {
        type: 'object',
        properties: {
          timeMin: { type: 'string' },
          timeMax: { type: 'string' },
          maxResults: { type: 'number' }
        }
      }
    }
  ];
}