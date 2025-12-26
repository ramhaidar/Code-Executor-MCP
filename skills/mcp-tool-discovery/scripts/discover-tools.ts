/**
 * MCP Tool Discovery Script
 * 
 * Lists all available MCP servers and their tools with parameter information.
 * Run with: execute_code or import into your scripts.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = join(__dirname, '../../../servers');

interface ToolInfo {
  name: string;
  schema: Record<string, unknown> | null;
  requiredParams: string[];
  optionalParams: string[];
}

interface ServerInfo {
  name: string;
  tools: ToolInfo[];
}

/**
 * Discover all tools for a specific server
 */
export async function discoverServerTools(serverName: string): Promise<ServerInfo> {
  const serverDir = join(SERVERS_DIR, serverName);
  const entries = await readdir(serverDir);
  const toolFiles = entries.filter(f => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.d.ts'));
  
  const tools: ToolInfo[] = [];
  
  for (const file of toolFiles) {
    const toolName = file.replace('.ts', '');
    const content = await readFile(join(serverDir, file), 'utf-8');
    
    // Extract SCHEMA
    const schemaMatch = content.match(/export const SCHEMA\s*=\s*(\{[\s\S]*?\})\s*as const;/);
    let schema: Record<string, unknown> | null = null;
    let requiredParams: string[] = [];
    let optionalParams: string[] = [];
    
    if (schemaMatch) {
      try {
        schema = new Function(`return ${schemaMatch[1]}`)();
        const properties = (schema?.properties || {}) as Record<string, unknown>;
        const required = (schema?.required || []) as string[];
        
        for (const paramName of Object.keys(properties)) {
          if (required.includes(paramName)) {
            requiredParams.push(paramName);
          } else {
            optionalParams.push(paramName);
          }
        }
      } catch {
        // Schema parse failed
      }
    }
    
    tools.push({
      name: toolName,
      schema,
      requiredParams,
      optionalParams,
    });
  }
  
  return { name: serverName, tools };
}

/**
 * Discover all available MCP servers and their tools
 */
export async function discoverAllServers(): Promise<ServerInfo[]> {
  const entries = await readdir(SERVERS_DIR, { withFileTypes: true });
  const serverDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  
  const servers: ServerInfo[] = [];
  for (const serverName of serverDirs) {
    try {
      const info = await discoverServerTools(serverName);
      servers.push(info);
    } catch {
      // Skip servers that can't be read
    }
  }
  
  return servers;
}

/**
 * Print a formatted summary of all servers and tools
 */
export async function printDiscoverySummary(): Promise<void> {
  const servers = await discoverAllServers();
  
  console.log('=== MCP Tool Discovery ===\n');
  
  for (const server of servers) {
    console.log(`📦 Server: ${server.name}`);
    console.log(`   Import: import * as ${server.name.replace(/[^a-zA-Z0-9_]/g, '_')} from '../servers/${server.name}/index.js';`);
    console.log(`   Tools (${server.tools.length}):`);
    
    for (const tool of server.tools) {
      const reqStr = tool.requiredParams.length > 0 ? tool.requiredParams.join(', ') : 'none';
      const optStr = tool.optionalParams.length > 0 ? ` [optional: ${tool.optionalParams.join(', ')}]` : '';
      console.log(`     • ${tool.name} (required: ${reqStr})${optStr}`);
    }
    console.log('');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('discover-tools.ts')) {
  printDiscoverySummary().catch(console.error);
}