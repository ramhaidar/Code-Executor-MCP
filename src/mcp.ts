import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig, isServerEnabled, type Config, type ServerConfig } from "./config.js";
import { formatErrorForJson } from "./helpers.js";
import { spawn, execSync } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname } from "node:path";

// Platform helper - exported for testing
export function getPlatform(): string {
  return process.platform;
}

// Default timeout/retry values
const DEFAULT_TIMEOUT = 120000; // 120 seconds - reasonable for slow servers and complex operations
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

// Store server process stderr for diagnostics
const serverStderr = new Map<string, string>();

// Store connected clients by server name
const clients = new Map<string, Client>();

// Track connection timestamps and durations for connection pooling status
const connectionTimestamps = new Map<string, Date>();
const connectionDurations = new Map<string, number>();

// Cached config
let cachedConfig: Config | null = null;

/**
 * Get config, loading it if not cached
 */
async function getConfig(): Promise<Config> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }
  return cachedConfig;
}

/**
 * Get server config by name
 * @throws Error if server not found in config
 */
async function getServerConfig(serverName: string): Promise<ServerConfig> {
  const config = await getConfig();
  const serverConfig = config.servers[serverName];
  if (!serverConfig) {
    // Config validation ensures at least one server exists, so available is never empty
    const available = Object.keys(config.servers).join(", ");
    throw new Error(
      `Server "${serverName}" not found in config. Available: ${available}`
    );
  }
  return serverConfig;
}

/**
 * Delay helper for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a command exists on the system
 */
export async function commandExists(command: string, platform?: string): Promise<boolean> {
  const currentPlatform = platform ?? getPlatform();
  try {
    if (currentPlatform === "win32") {
      // On Windows, use 'where' command
      execSync(`where ${command}`, { stdio: "ignore" });
    } else {
      // On Unix, use 'which' command
      execSync(`which ${command}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file path exists and is accessible
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the last stderr output from a server connection attempt
 */
export function getServerStderr(serverName: string): string | undefined {
  return serverStderr.get(serverName);
}

/**
 * Clear stored stderr for a server
 */
export function clearServerStderr(serverName: string): void {
  serverStderr.delete(serverName);
}

/**
 * Diagnose why a server command might fail
 */
export async function diagnoseServerCommand(serverName: string): Promise<{
  commandExists: boolean;
  commandPath: string;
  argsValid: boolean;
  suggestions: string[];
}> {
  const serverConfig = await getServerConfig(serverName);
  const command = serverConfig.command;
  const args = serverConfig.args ?? [];
  const suggestions: string[] = [];

  // Check if command exists
  const cmdExists = await commandExists(command);
  if (!cmdExists) {
    suggestions.push(`Command "${command}" not found in PATH`);
    suggestions.push(`Try using the full path to the executable`);
  }

  // Check if first arg (often a script path) exists
  // Skip known subcommands that aren't file paths
  const knownSubcommands = ["run", "sync", "pip", "venv", "init", "add", "remove", "lock", "tree"];
  let argsValid = true;
  if (args.length > 0) {
    const firstArg = args[0];
    // Skip flags like /c, -c, --flag and known subcommands
    if (!firstArg.startsWith("-") && !firstArg.startsWith("/") && !knownSubcommands.includes(firstArg)) {
      const exists = await fileExists(firstArg);
      if (!exists) {
        argsValid = false;
        suggestions.push(`Script/file not found: ${firstArg}`);
      }
    }
  }

  // Check for common issues
  if (command === "cmd" && args[0] === "/c" && args.length > 1) {
    const scriptPath = args[1];
    const exists = await fileExists(scriptPath);
    if (!exists) {
      argsValid = false;
      suggestions.push(`Windows script not found: ${scriptPath}`);
    }
  }

  if (command === "node" && args.length > 0) {
    const scriptPath = args[0];
    const exists = await fileExists(scriptPath);
    if (!exists) {
      argsValid = false;
      suggestions.push(`Node script not found: ${scriptPath}`);
    }
  }

  // Check for uv-specific project issues
  if (command === "uv" && args.includes("--project")) {
      const projectIdx = args.indexOf("--project");
      if (projectIdx >= 0 && args[projectIdx + 1]) {
        const projectPath = args[projectIdx + 1];
        const exists = await fileExists(projectPath);
        if (!exists) {
          argsValid = false;
          suggestions.push(`UV project directory not found: ${projectPath}`);
        } else {
          // Check if uv.lock exists (dependencies synced)
          const lockPath = projectPath.replace(/\\/g, "/") + "/uv.lock";
          const lockExists = await fileExists(lockPath);
          if (!lockExists) {
            suggestions.push(`UV project may need 'uv sync' to install dependencies: ${projectPath}`);
          }
      }
    }
  }

  return {
    commandExists: cmdExists,
    commandPath: command,
    argsValid,
    suggestions,
  };
}

/**
 * Create a promise that rejects after a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/**
 * Connect to a specific MCP server by name with retry logic
 * @throws Error if server not found or connection fails after all retries
 */
export async function connectServer(serverName: string): Promise<Client> {
  // Return existing client if already connected
  const existing = clients.get(serverName);
  if (existing) {
    return existing;
  }

  const serverConfig = await getServerConfig(serverName);

  // Check if server is enabled
  if (!isServerEnabled(serverConfig)) {
    throw new Error(
      `Server "${serverName}" is disabled in configuration.\n` +
      `To enable it, set "enabled": true in mcp.json for this server.`
    );
  }

  const timeout = serverConfig.timeout ?? DEFAULT_TIMEOUT;
  const retries = serverConfig.retries ?? DEFAULT_RETRIES;
  const retryDelay = serverConfig.retryDelay ?? DEFAULT_RETRY_DELAY;

  // Clear previous stderr
  clearServerStderr(serverName);

  // Pre-flight check: verify command exists
  const cmdExists = await commandExists(serverConfig.command);
  if (!cmdExists) {
    const diagnosis = await diagnoseServerCommand(serverName);
    throw new Error(
      `Server "${serverName}" command not found: "${serverConfig.command}"\n\n` +
      `Diagnostics:\n` +
      diagnosis.suggestions.map(s => `  - ${s}`).join("\n") + "\n\n" +
      `Make sure the command is installed and available in PATH.`
    );
  }

  let lastError: Error | null = null;
  let capturedStderr = "";

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Create transport with stdio
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: serverConfig.env as Record<string, string> | undefined,
        stderr: "pipe",
      });

      // Set up stderr handler to capture server stderr output
      // The stderr stream is available immediately after transport creation when stderr: "pipe"
      const stderrStream = transport.stderr;
      if (stderrStream && 'on' in stderrStream) {
        stderrStream.on('data', (data: Buffer) => {
          capturedStderr += data.toString();
          serverStderr.set(serverName, capturedStderr);
        });
      }

      // Create client
      const client = new Client(
        { name: "code-executor-mcp", version: "1.0.0" },
        { capabilities: {} }
      );

      // Connect with timeout
      const connectStartTime = Date.now();
      await withTimeout(
        client.connect(transport),
        timeout,
        `Connection timed out after ${timeout}ms. The server process may be slow to start or not responding.`
      );
      const connectionTime = Date.now() - connectStartTime;

      clients.set(serverName, client);
      connectionTimestamps.set(serverName, new Date());
      connectionDurations.set(serverName, connectionTime);
      return client;
    } catch (err) {
      lastError = err as Error;
      const attemptNum = attempt + 1;

      // Capture any stderr from the error
      if ((err as NodeJS.ErrnoException).message) {
        capturedStderr += `\nAttempt ${attemptNum} error: ${(err as Error).message}`;
        serverStderr.set(serverName, capturedStderr);
      }

      if (attempt < retries - 1) {
        const backoffDelay = retryDelay * Math.pow(2, attempt);
        console.error(
          `[${serverName}] Connection attempt ${attemptNum}/${retries} failed: ${lastError.message}. Retrying in ${backoffDelay}ms...`
        );
        await delay(backoffDelay);
      } else {
        console.error(
          `[${serverName}] Connection attempt ${attemptNum}/${retries} failed: ${lastError.message}. No more retries.`
        );
      }
    }
  }

  // Get detailed diagnostics for the error message
  const diagnosis = await diagnoseServerCommand(serverName);
  const config = await getConfig();
  const availableServers = Object.keys(config.servers).filter(name => {
    const cfg = config.servers[name];
    return isServerEnabled(cfg);
  });

  // Build comprehensive error message
  let errorMsg = `Failed to connect to server "${serverName}" after ${retries} attempts.\n`;
  errorMsg += `Last error: ${lastError?.message}\n\n`;

  if (capturedStderr.trim()) {
    errorMsg += `Server stderr output:\n${capturedStderr.trim()}\n\n`;
  }

  errorMsg += `Diagnostics:\n`;
  // Command exists is always true here because we passed the pre-flight check (line 230-239)
  errorMsg += `  - Command exists: Yes\n`;
  errorMsg += `  - Args valid: ${diagnosis.argsValid ? "Yes" : "No"}\n`;

  if (diagnosis.suggestions.length > 0) {
    errorMsg += `\nIssues found:\n`;
    errorMsg += diagnosis.suggestions.map(s => `  - ${s}`).join("\n") + "\n";
  }

  errorMsg += `\nSuggestions:\n`;
  errorMsg += `  1. Check that the server command exists and is executable\n`;
  errorMsg += `  2. Verify the server config in mcp.json:\n`;
  errorMsg += `     - command: "${serverConfig.command}"\n`;
  errorMsg += `     - args: ${JSON.stringify(serverConfig.args ?? [])}\n`;
  errorMsg += `  3. Try increasing timeout (current: ${timeout}ms) or retries (current: ${retries})\n`;
  errorMsg += `  4. Run the server command manually to check for errors\n`;
  errorMsg += `  5. Use check_server_health tool for detailed diagnostics\n\n`;
  // Config validation ensures at least one server exists
  errorMsg += `Available enabled servers: ${availableServers.join(", ")}`;

  throw new Error(errorMsg);
}

/**
 * Connect to all servers defined in config
 */
export async function connectAllServers(): Promise<void> {
  const config = await getConfig();
  const serverNames = Object.keys(config.servers);

  await Promise.all(serverNames.map((name) => connectServer(name)));
}

/**
 * Get an already connected client
 */
export function getClient(serverName: string): Client | undefined {
  return clients.get(serverName);
}

/**
 * Tool definition interface
 */
export interface Tool {
  name: string;
  description?: string;
  inputSchema?: object;
}

/**
 * List tools available on a server
 * @throws Error if server not connected or listTools fails
 */
export async function listTools(serverName: string): Promise<Tool[]> {
  const client = clients.get(serverName);
  if (!client) {
    const config = await getConfig();
    // Config validation ensures at least one server exists
    const availableServers = Object.keys(config.servers);
    throw new Error(
      `Server "${serverName}" not connected.\n\n` +
      `Suggestion: The server should auto-connect on first tool use. If this error persists, try:\n` +
      `  import { connectServer } from "./mcp.js";\n` +
      `  await connectServer("${serverName}");\n\n` +
      `Available servers: ${availableServers.join(", ")}`
    );
  }

  try {
    const result = await client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as object | undefined,
    }));
  } catch (err) {
    throw new Error(
      `Failed to list tools for server "${serverName}".\n` +
      `Error: ${(err as Error).message}\n\n` +
      `Suggestions:\n` +
      `  1. The server may have disconnected. Try reconnecting:\n` +
      `     await connectServer("${serverName}");\n` +
      `  2. Check if the server process is still running\n` +
      `  3. Review server logs for errors`
    );
  }
}

/**
 * Call a tool on a server
 * @throws Error if server not connected or tool call fails
 */
export async function callTool(
  serverName: string,
  toolName: string,
  args: unknown,
  timeout?: number
): Promise<unknown> {
  const client = clients.get(serverName);
  if (!client) {
    const config = await getConfig();
    // Config validation ensures at least one server exists
    const availableServers = Object.keys(config.servers);
    throw new Error(
      `Server "${serverName}" not connected.\n\n` +
      `Suggestion: The server should auto-connect on first tool use. If this error persists, try:\n` +
      `  import { connectServer } from "./mcp.js";\n` +
      `  await connectServer("${serverName}");\n\n` +
      `Available servers: ${availableServers.join(", ")}`
    );
  }

  // Get timeout from parameter, server config, or default
  const serverConfig = await getServerConfig(serverName);
  const callTimeout = timeout ?? (serverConfig as { callTimeout?: number }).callTimeout ?? serverConfig.timeout ?? DEFAULT_TIMEOUT;

  try {
    const result = await withTimeout(
      client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      }),
      callTimeout,
      `Tool call "${toolName}" timed out after ${callTimeout}ms`
    );
    return result.content;
  } catch (err) {
    const errorMessage = (err as Error).message;
    const argsStr = args ? JSON.stringify(args, null, 2) : "{}";
    
    // Analyze error message for common patterns
    const hints: string[] = [];
    
    // Check if this is a timeout error
    const isTimeout = errorMessage.includes("timed out");
    
    if (isTimeout) {
      hints.push(`Tool call exceeded timeout of ${callTimeout}ms`);
      hints.push("Consider increasing timeout in mcp.json (callTimeout or timeout)");
      hints.push("The server may be overloaded or the operation is slow");
    }
    
    if (errorMessage.toLowerCase().includes("required")) {
      hints.push("Check that all REQUIRED parameters are provided");
      hints.push("Use get_tool_schema tool to see which parameters are required");
    }
    
    // Enhanced enum/validation error detection
    const lowerError = errorMessage.toLowerCase();
    if (lowerError.includes("enum") ||
        lowerError.includes("valid") ||
        lowerError.includes("allowed") ||
        lowerError.includes("invalid") ||
        lowerError.includes("stage") ||
        lowerError.includes("mode") ||
        lowerError.includes("must be one of") ||
        lowerError.includes("not a valid")) {
      hints.push("⚠️ Parameter value may not match expected enum values");
      hints.push("💡 TIP: The error message above often lists the valid values!");
      hints.push(`📋 Use get_tool_schema("${serverName}", "${toolName}") to see all valid values`);
      hints.push(`📦 Or import SCHEMA: import { SCHEMA } from '../servers/${serverName}/${toolName}.js'`);
    }
    
    if (lowerError.includes("type") ||
        lowerError.includes("expected")) {
      hints.push("Check that parameter types are correct (string vs number, etc.)");
    }
    if (lowerError.includes("undefined") ||
        lowerError.includes("null")) {
      hints.push("Check that no required parameters are undefined or null");
    }
    
    const hintsSection = hints.length > 0
      ? `\n\nHints:\n${hints.map(h => `  • ${h}`).join("\n")}`
      : "";
    
    // Use formatErrorForJson for safe error formatting
    const formattedError = formatErrorForJson(err);
    
    throw new Error(
      `Failed to call tool "${toolName}" on server "${serverName}".\n` +
      `Error: ${errorMessage}\n` +
      `Error details: ${formattedError}\n\n` +
      `Arguments provided:\n${argsStr}` +
      `\nTimeout: ${callTimeout}ms${hintsSection}\n\n` +
      `Debugging steps:\n` +
      `  1. Use list_server_tools("${serverName}") to see available tools\n` +
      `  2. Import { SCHEMA } from the tool module to see parameter requirements\n` +
      `  3. Check the generated .d.ts file for TypeScript type definitions\n` +
      `  4. Verify parameter names match exactly (case-sensitive)\n` +
      `  5. If timeout, try increasing callTimeout in server config`
    );
  }
}

/**
 * Parse MCP response format into a more usable form.
 * MCP responses come as an array of content blocks like:
 * [{ type: "text", text: "{\"status\": \"success\"}" }]
 *
 * This function extracts and parses the content for easier use.
 *
 * @param result - Raw MCP tool call result
 * @returns Parsed content (JSON parsed if possible, otherwise raw text)
 */
export function parseMcpResponse(result: unknown): unknown {
  // Handle array of content blocks (standard MCP format)
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as { type?: string; text?: string };
    if (first.type === 'text' && typeof first.text === 'string') {
      // Try to parse as JSON
      try {
        return JSON.parse(first.text);
      } catch {
        // Not JSON, return raw text
        return first.text;
      }
    }
    // Return first item if not text type
    return first;
  }
  
  // Handle single content block
  if (result && typeof result === 'object' && 'type' in result) {
    const block = result as { type?: string; text?: string };
    if (block.type === 'text' && typeof block.text === 'string') {
      try {
        return JSON.parse(block.text);
      } catch {
        return block.text;
      }
    }
  }
  
  // Return as-is if not in expected format
  return result;
}

/**
 * Disconnect all clients
 */
export async function disconnectAll(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [name, client] of clients) {
    closePromises.push(
      client.close().catch((err) => {
        console.error(`Error closing client "${name}":`, err);
      })
    );
  }

  await Promise.all(closePromises);
  clients.clear();
  serverStderr.clear();
  connectionTimestamps.clear();
  connectionDurations.clear();
  cachedConfig = null;
}

/**
 * Check server health with detailed diagnostics
 */
export async function checkServerHealth(serverName: string): Promise<{
  status: "connected" | "disconnected" | "error";
  commandExists: boolean;
  argsValid: boolean;
  isEnabled: boolean;
  toolCount?: number;
  error?: string;
  stderr?: string;
  suggestions: string[];
  config: {
    command: string;
    args: string[];
    timeout: number;
    retries: number;
  };
}> {
  const suggestions: string[] = [];
  
  try {
    const serverConfig = await getServerConfig(serverName);
    const isEnabled = isServerEnabled(serverConfig);
    
    if (!isEnabled) {
      suggestions.push(`Server is disabled. Set "enabled": true in mcp.json`);
    }

    const diagnosis = await diagnoseServerCommand(serverName);
    suggestions.push(...diagnosis.suggestions);

    const config = {
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      timeout: serverConfig.timeout ?? DEFAULT_TIMEOUT,
      retries: serverConfig.retries ?? DEFAULT_RETRIES,
    };

    // Check if already connected
    const existingClient = clients.get(serverName);
    if (existingClient) {
      try {
        const tools = await existingClient.listTools();
        return {
          status: "connected",
          commandExists: diagnosis.commandExists,
          argsValid: diagnosis.argsValid,
          isEnabled,
          toolCount: tools.tools.length,
          suggestions,
          config,
        };
      } catch {
        // Client exists but may be stale
        clients.delete(serverName);
      }
    }

    // Not connected, return diagnostic info without attempting connection
    return {
      status: "disconnected",
      commandExists: diagnosis.commandExists,
      argsValid: diagnosis.argsValid,
      isEnabled,
      stderr: getServerStderr(serverName),
      suggestions,
      config,
    };
  } catch (err) {
    return {
      status: "error",
      commandExists: false,
      argsValid: false,
      isEnabled: false,
      error: (err as Error).message,
      stderr: getServerStderr(serverName),
      suggestions,
      config: {
        command: "unknown",
        args: [],
        timeout: DEFAULT_TIMEOUT,
        retries: DEFAULT_RETRIES,
      },
    };
  }
}

/**
 * Test server connection with detailed timing info
 */
export async function testServerConnection(serverName: string): Promise<{
  success: boolean;
  connectionTimeMs?: number;
  toolCount?: number;
  error?: string;
  stderr?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Clear any existing connection to force a fresh test
    const existingClient = clients.get(serverName);
    if (existingClient) {
      await existingClient.close().catch(() => {});
      clients.delete(serverName);
    }
    clearServerStderr(serverName);

    const client = await connectServer(serverName);
    const connectionTimeMs = Date.now() - startTime;

    const tools = await client.listTools();

    return {
      success: true,
      connectionTimeMs,
      toolCount: tools.tools.length,
    };
  } catch (err) {
    return {
      success: false,
      connectionTimeMs: Date.now() - startTime,
      error: (err as Error).message,
      stderr: getServerStderr(serverName),
    };
  }
}

/**
 * Get connection status info for a server
 */
export function getConnectionStatus(serverName: string): {
  connected: boolean;
  lastConnected?: Date;
  connectionTimeMs?: number;
} {
  const connected = clients.has(serverName);
  const lastConnected = connectionTimestamps.get(serverName);
  const connectionTimeMs = connectionDurations.get(serverName);
  
  return {
    connected,
    lastConnected,
    connectionTimeMs,
  };
}

/**
 * List all configured servers with their status
 */
export async function listConfiguredServers(): Promise<Array<{
  name: string;
  enabled: boolean;
  connected: boolean;
  lastConnected?: Date;
  connectionTimeMs?: number;
  command: string;
  tags?: string[];
}>> {
  const config = await getConfig();
  const result: Array<{
    name: string;
    enabled: boolean;
    connected: boolean;
    lastConnected?: Date;
    connectionTimeMs?: number;
    command: string;
    tags?: string[];
  }> = [];

  for (const [name, serverConfig] of Object.entries(config.servers)) {
    const connectionStatus = getConnectionStatus(name);
    result.push({
      name,
      enabled: isServerEnabled(serverConfig),
      connected: connectionStatus.connected,
      lastConnected: connectionStatus.lastConnected,
      connectionTimeMs: connectionStatus.connectionTimeMs,
      command: serverConfig.command,
      tags: serverConfig.tags,
    });
  }

  return result;
}