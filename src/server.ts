#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, execSync } from "node:child_process";
import { readdir, readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadSkillsConfig, loadConfig, isSkillEnabled, isServerEnabled, resolveSkillPath, initConfigPaths, getConfigPath, getSkillsConfigPath, shouldSkipGetStarted, type SkillsConfig } from "./config.js";
import { checkServerHealth, testServerConnection, listConfiguredServers, getServerStderr, getConnectionStatus } from "./mcp.js";
import { addExecutionRecord, getExecutionHistory, getExecutionById, getHistoryCount, getMaxHistorySize } from "./history.js";
import { formatErrorForJson } from "./helpers.js";

// Initialize config paths from CLI arguments (before any other operations)
initConfigPaths(process.argv.slice(2));

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SERVERS_DIR = join(PROJECT_ROOT, "servers");
const SCRIPTS_DIR = join(PROJECT_ROOT, "scripts");
const WORKSPACE_DIR = join(PROJECT_ROOT, "workspace");

// Cached skills config
let cachedSkillsConfig: SkillsConfig | null = null;

// Track if get_started has been called in this session
// Initialize based on --skip-get-started flag or CODE_EXECUTOR_SKIP_GET_STARTED env var
let hasCalledGetStarted = shouldSkipGetStarted();

/**
 * Generate a reminder to call get_started if it hasn't been called yet.
 * Returns empty string if get_started was already called.
 */
function getStartedReminder(): string {
  if (hasCalledGetStarted) {
    return "";
  }
  return "\n\n⚠️ **NEW TO CODE EXECUTOR?** Call the `get_started` tool first to learn the correct workflow and avoid common import/usage mistakes. This will save you debugging time!";
}

/**
 * Generate a blocking error response for tools that require get_started to be called first.
 * Returns null if get_started was already called (tool can proceed).
 */
function requireGetStarted(): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
  if (hasCalledGetStarted) {
    return null;
  }
  return {
    content: [
      {
        type: "text",
        text: `❌ BLOCKED: You must call 'get_started' tool FIRST before using any other tools.

This is required to learn the correct import patterns and avoid common mistakes that waste time.

👉 Call: get_started
Then come back to use other tools.`,
      },
    ],
    isError: true,
  };
}

/**
 * Get skills config, loading it if not cached
 */
async function getSkillsConfig(): Promise<SkillsConfig> {
  if (!cachedSkillsConfig) {
    cachedSkillsConfig = await loadSkillsConfig();
  }
  return cachedSkillsConfig;
}

// Create MCP server
const server = new McpServer({
  name: "code-executor",
  version: "1.0.0",
});

// Helper: Check if path exists
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Helper: Ensure directory exists
async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Convert kebab-case or other formats to camelCase
 * Examples:
 *   clear-history → clearHistory
 *   process_thought → processThought
 */
function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert camelCase to kebab-case
 * Examples:
 *   clearHistory → clear-history
 *   processThought → process-thought
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Check if a value looks like an example rather than an enum value.
 * Examples typically:
 *   - Start with e.g. or i.e.
 *   - Contain colons (like "start: 1")
 *   - Are wrapped in quotes (like "'/mongodb/docs'")
 *   - Look like paths (start with /)
 */
function isExampleValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  // Check for example indicators
  if (trimmed === 'e.g.' || trimmed === 'i.e.' ||
    trimmed.startsWith('e.g.') || trimmed.startsWith('i.e.')) {
    return true;
  }

  // Check for colon (metadata like "start: 1", "default: 1")
  if (value.includes(':')) {
    return true;
  }

  // Check for quoted values (examples are often quoted)
  if (/^['"].*['"]$/.test(value.trim())) {
    return true;
  }

  // Check for path-like values (start with /)
  if (value.trim().startsWith('/') || value.trim().startsWith("'/") || value.trim().startsWith('"/')) {
    return true;
  }

  return false;
}

/**
 * Extract enum-like values from a description string.
 * Looks for patterns like:
 *   - "Valid values: A, B, C"
 *   - "(A, B, C)"
 *   - "one of: A, B, C"
 *   - "must be A, B, or C"
 *   - "The thinking stage (Problem Definition, Research, Analysis, Synthesis, Conclusion)"
 *
 * Filters out example patterns like:
 *   - "(e.g., '/mongodb/docs', '/vercel/next.js')" - examples, not enums
 *   - "(start: 1, default: 1)" - metadata, not enums
 *
 * Returns undefined if no enum-like pattern is found.
 */
function extractEnumFromDescription(description: string): string[] | undefined {
  // Pattern 1: Parenthesized list with comma-separated values
  // e.g., "(Problem Definition, Research, Analysis, Synthesis, Conclusion)"
  const parenMatch = description.match(/\(([^)]+(?:,\s*[^)]+)+)\)/);
  if (parenMatch) {
    const rawContent = parenMatch[1];

    // Skip if the content starts with "e.g." or "i.e." - these are examples
    if (/^\s*(e\.g\.|i\.e\.)/i.test(rawContent)) {
      // This is an example list, not an enum - skip Pattern 1
    } else {
      const values = rawContent
        .split(/,\s*/)
        .map(v => v.trim())
        .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

      // Only return if we have 2-10 values (reasonable enum size)
      if (values.length >= 2 && values.length <= 10) {
        return values;
      }
    }
  }

  // Pattern 2: "Valid values:" or "Allowed values:" followed by list
  const validMatch = description.match(/(?:valid|allowed)\s+values?:\s*([^.]+)/i);
  if (validMatch) {
    const values = validMatch[1]
      .split(/[,|]|\s+or\s+/)
      .map(v => v.trim().replace(/^["']|["']$/g, ''))
      .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

    if (values.length >= 2 && values.length <= 10) {
      return values;
    }
  }

  // Pattern 3: "one of:" or "must be one of:" followed by list
  const oneOfMatch = description.match(/(?:one of|must be):\s*([^.]+)/i);
  if (oneOfMatch) {
    const values = oneOfMatch[1]
      .split(/[,|]|\s+or\s+/)
      .map(v => v.trim().replace(/^["']|["']$/g, ''))
      .filter(v => v.length > 0 && v.length < 50 && !isExampleValue(v));

    if (values.length >= 2 && values.length <= 10) {
      return values;
    }
  }

  return undefined;
}

// Helper: Kill process tree (cross-platform)
function killProcessTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      // Windows: use taskkill to kill entire process tree
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      // Unix: kill process group
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Fallback to regular kill
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    // Process may already be dead, ignore errors
  }
}

/**
 * Extract static import statements from code and separate them from the body.
 * Static imports must be at module top-level, so we hoist them above any wrapper.
 *
 * Handles:
 * - import { x } from 'module';
 * - import * as x from 'module';
 * - import x from 'module';
 * - import 'module';
 * - Multi-line imports with { ... }
 */
function hoistImports(code: string): { imports: string; body: string } {
  const lines = code.split('\n');
  const importLines: string[] = [];
  const bodyLines: string[] = [];

  let inMultiLineImport = false;
  let multiLineBuffer = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if we're continuing a multi-line import
    if (inMultiLineImport) {
      multiLineBuffer += '\n' + line;
      // Check if this line ends the import (has 'from' and ends with semicolon or quote)
      if (trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) {
        importLines.push(multiLineBuffer);
        multiLineBuffer = '';
        inMultiLineImport = false;
      } else if (trimmed.endsWith(';')) {
        // Side-effect import ending
        importLines.push(multiLineBuffer);
        multiLineBuffer = '';
        inMultiLineImport = false;
      }
      continue;
    }

    // Check if this is a static import statement
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      // Check if it's a complete single-line import
      if ((trimmed.includes('from') && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) ||
        (trimmed.startsWith("import '") || trimmed.startsWith('import "'))) {
        // Complete single-line import
        importLines.push(line);
      } else if (trimmed.includes('from') === false && trimmed.includes('{')) {
        // Multi-line import starting (e.g., "import {")
        inMultiLineImport = true;
        multiLineBuffer = line;
      } else if (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"')) {
        // Complete import
        importLines.push(line);
      } else {
        // Start of multi-line import
        inMultiLineImport = true;
        multiLineBuffer = line;
      }
    } else {
      bodyLines.push(line);
    }
  }

  // If we ended while still in a multi-line import, treat it as body (malformed)
  if (inMultiLineImport && multiLineBuffer) {
    bodyLines.unshift(multiLineBuffer);
  }

  return {
    imports: importLines.join('\n'),
    body: bodyLines.join('\n')
  };
}

// Helper: Validate TypeScript code syntax
async function validateTypeScript(code: string): Promise<{ valid: boolean; errors: string | null }> {
  await ensureDir(WORKSPACE_DIR);

  // Create a temporary file for validation
  const tempFile = join(WORKSPACE_DIR, `_validate_${Date.now()}.ts`);
  await writeFile(tempFile, code, "utf-8");

  return new Promise((resolve) => {
    // Use tsc --noEmit to check syntax without generating output
    const child = spawn("npx", ["tsc", "--noEmit", "--skipLibCheck", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", tempFile], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", async (exitCode: number | null) => {
      // Clean up temp file
      await unlink(tempFile).catch(() => { });

      const isValid = exitCode === 0;
      const errors = (stdout + stderr).trim();

      resolve({
        valid: isValid,
        errors: isValid ? null : errors || "Unknown validation error",
      });
    });

    child.on("error", async (err: Error) => {
      await unlink(tempFile).catch(() => { });
      resolve({
        valid: false,
        errors: `Validation failed: ${err.message}`,
      });
    });
  });
}

// Helper: Execute TypeScript code via tsx
async function executeCode(
  code: string,
  timeout: number = 120000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  await ensureDir(WORKSPACE_DIR);

  // Create a temporary script file
  // Note: Import hoisting is done in the tool handler before calling this function
  const tempFile = join(WORKSPACE_DIR, `_temp_${Date.now()}.ts`);
  await writeFile(tempFile, code, "utf-8");

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const child = spawn("npx", ["tsx", tempFile], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      shell: true,
      // Don't use spawn's timeout - it doesn't work reliably on Windows with shell: true
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();
    let lastOutputAt = startTime;  // Track when output was last received

    const cleanup = async () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // Clean up temp file (best effort)
      await unlink(tempFile).catch(() => { });
    };

    const resolveOnce = async (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (resolved) return;
      resolved = true;
      await cleanup();
      resolve(result);
    };

    // Set up manual timeout with process tree killing and output activity tracking
    timeoutId = setTimeout(() => {
      if (resolved) return;

      // Kill the entire process tree
      if (child.pid) {
        killProcessTree(child.pid);
      }

      // Calculate output activity metrics
      const timeSinceLastOutput = Date.now() - lastOutputAt;
      const totalRuntime = Date.now() - startTime;
      const hadAnyOutput = stdout.length > 0 || stderr.length > 0;

      // Heuristic: if no output for >80% of timeout, likely stuck/infinite loop
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      let tip: string;

      if (!hadAnyOutput) {
        diagnosis = "NO OUTPUT - Likely INFINITE LOOP or code blocked before any output";
        tip = "Check for infinite loops, blocking operations, or missing console.log statements";
      } else if (likelyInfiniteLoop) {
        diagnosis = "STALLED - Code produced output but then stopped (possible infinite loop after initial work)";
        tip = "Check for infinite loops or blocking operations after the last output";
      } else {
        diagnosis = "SLOW OPERATION - Code was actively producing output when timeout hit";
        tip = "Increase timeout with { timeout: 120000 } parameter";
      }

      resolveOnce({
        exitCode: 124, // Standard timeout exit code (like GNU timeout)
        stdout,
        stderr: stderr +
          `\n[TIMEOUT] Execution exceeded ${timeout}ms limit.` +
          `\n  Total runtime: ${totalRuntime}ms` +
          `\n  Time since last output: ${timeSinceLastOutput}ms` +
          `\n  Had output: ${hadAnyOutput}` +
          `\n  Diagnosis: ${diagnosis}` +
          `\n  Tip: ${tip}`,
      });
    }, timeout);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      lastOutputAt = Date.now();  // Update on each output
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      lastOutputAt = Date.now();  // Update on each output
    });

    child.on("error", (err: Error) => {
      resolveOnce({
        exitCode: 1,
        stdout,
        stderr: stderr + `\nExecution error: ${err.message}`,
      });
    });

    child.on("close", (code: number | null) => {
      resolveOnce({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

// Helper: Run a script file
async function runScriptFile(
  filename: string,
  timeout: number = 120000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const scriptPath = resolve(SCRIPTS_DIR, filename);

  if (!(await pathExists(scriptPath))) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Script not found: ${filename}`,
    };
  }

  await ensureDir(WORKSPACE_DIR);

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const child = spawn("npx", ["tsx", scriptPath], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      shell: true,
      // Don't use spawn's timeout - it doesn't work reliably on Windows with shell: true
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();
    let lastOutputAt = startTime;  // Track when output was last received

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const resolveOnce = (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    // Set up manual timeout with process tree killing and output activity tracking
    timeoutId = setTimeout(() => {
      if (resolved) return;

      // Kill the entire process tree
      if (child.pid) {
        killProcessTree(child.pid);
      }

      // Calculate output activity metrics
      const timeSinceLastOutput = Date.now() - lastOutputAt;
      const totalRuntime = Date.now() - startTime;
      const hadAnyOutput = stdout.length > 0 || stderr.length > 0;

      // Heuristic: if no output for >80% of timeout, likely stuck/infinite loop
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      let tip: string;

      if (!hadAnyOutput) {
        diagnosis = "NO OUTPUT - Likely INFINITE LOOP or code blocked before any output";
        tip = "Check for infinite loops, blocking operations, or missing console.log statements";
      } else if (likelyInfiniteLoop) {
        diagnosis = "STALLED - Code produced output but then stopped (possible infinite loop after initial work)";
        tip = "Check for infinite loops or blocking operations after the last output";
      } else {
        diagnosis = "SLOW OPERATION - Code was actively producing output when timeout hit";
        tip = "Increase timeout with { timeout: 120000 } parameter";
      }

      resolveOnce({
        exitCode: 124, // Standard timeout exit code (like GNU timeout)
        stdout,
        stderr: stderr +
          `\n[TIMEOUT] Execution exceeded ${timeout}ms limit.` +
          `\n  Total runtime: ${totalRuntime}ms` +
          `\n  Time since last output: ${timeSinceLastOutput}ms` +
          `\n  Had output: ${hadAnyOutput}` +
          `\n  Diagnosis: ${diagnosis}` +
          `\n  Tip: ${tip}`,
      });
    }, timeout);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      lastOutputAt = Date.now();  // Update on each output
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      lastOutputAt = Date.now();  // Update on each output
    });

    child.on("error", (err: Error) => {
      resolveOnce({
        exitCode: 1,
        stdout,
        stderr: stderr + `\nExecution error: ${err.message}`,
      });
    });

    child.on("close", (code: number | null) => {
      resolveOnce({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

// =============================================================================
// TOOL: get_started
// =============================================================================
server.tool(
  "get_started",
  "Get a quick tutorial on how to use Code Executor MCP. Call this FIRST when starting a new session to learn the correct workflow and avoid common mistakes.",
  {},
  async () => {
    // Mark that get_started has been called
    hasCalledGetStarted = true;

    const tutorial = `# Code Executor MCP - Quick Start Guide

## Overview

Code Executor MCP lets you write TypeScript code that calls MCP tools from connected servers.
Instead of calling tools directly, you write code that imports generated wrapper files.

---

## ⚠️ MANDATORY WORKFLOW - Follow ALL Steps In Order!

### Step 1: list_available_servers (REQUIRED FIRST)
\`\`\`
Tool: list_available_servers
\`\`\`
**Purpose**: Shows which servers are ready to use
- **"ready"** → Server wrapper exists, you can proceed
- **"disabled"** → Server is disabled in mcp.json
- **"no-wrapper"** → Need to run \`pnpm run gen\` first

⚠️ **DO NOT SKIP THIS STEP** - You must know which servers are available before proceeding!

### Step 2: list_server_tools (REQUIRED BEFORE execute_code)
\`\`\`
Tool: list_server_tools
Args: { "server": "YOUR_SERVER_NAME" }
\`\`\`
**Purpose**: Shows EXACT import paths and tool names you must use
- Shows the **exact import statement** to copy
- Shows **required vs optional** parameters
- Shows **enum values** if any exist

⚠️ **COPY THE IMPORT STATEMENT FROM THIS OUTPUT** - Don't guess the import path!

### Step 3: execute_code (Only After Steps 1-2!)
\`\`\`
Tool: execute_code
Args: { "code": "YOUR_CODE", "debug": true }
\`\`\`
**Tips**:
- Use \`debug: true\` to see connection/call progress
- Always include \`console.log()\` to see results
- Results ONLY appear via console.log - return values are not shown

---

## ✅ Correct Import Patterns

\`\`\`typescript
// ✅ Pattern 1: Import callable tools (RECOMMENDED)
import { resolveLibraryId } from '../servers/context7/index.js';
const result = await resolveLibraryId({ libraryName: "react" });

// ✅ Pattern 2: Import with .call() (also works)
import { resolveLibraryId } from '../servers/context7/index.js';
const result = await resolveLibraryId.call({ libraryName: "react" });

// ✅ Pattern 3: Import entire server
import * as context7 from '../servers/context7/index.js';
const result = await context7.resolveLibraryId({ libraryName: "react" });

// ✅ Pattern 4: Direct file import
import * as tool from '../servers/context7/resolve-library-id.js';
const result = await tool.call({ libraryName: "react" });
\`\`\`

---

## ❌ Common Mistakes & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| \`Cannot find module '../servers/X'\` | Missing \`/index.js\` | Add \`/index.js\` to import path |
| \`Cannot find module '../servers/X/index'\` | Missing \`.js\` extension | Add \`.js\` extension |
| \`X is not exported from module\` | Wrong export name | Use \`list_server_tools\` to get correct name |
| \`is not a function\` | Using wrong call pattern | Use \`tool({ args })\` or \`tool.call({ args })\` |
| Execution hangs (no output) | Server not responding | Use \`debug: true\` to diagnose |
| Only first console.log appears | Code error after first log | Check stderr for errors |

---

## 🔧 Debugging Hanging Execution

If your code hangs (no output after initial log), use debug mode:

\`\`\`
execute_code({
  code: "...",
  debug: true  // ← Enables verbose logging
})
\`\`\`

Debug output shows:
- \`[server] Connecting...\` - Starting connection
- \`[server] Calling toolName...\` - Making tool call
- \`[server] Call completed.\` - Tool returned

If it hangs at "Connecting", use these diagnostic tools:
\`\`\`
check_server_health({ server: "server-name" })
test_server_connection({ server: "server-name" })
get_server_stderr({ server: "server-name" })
\`\`\`

---

## 📝 Complete Example (Follow This Pattern!)

\`\`\`typescript
// I called list_available_servers and saw "context7" is "ready"
// I called list_server_tools("context7") and copied this import:
import { resolveLibraryId, getLibraryDocs } from '../servers/context7/index.js';

// Step 1: Find library ID
const libs = await resolveLibraryId({ libraryName: "react" });
console.log("Libraries found:", JSON.stringify(libs, null, 2));

// Step 2: Get docs using ID from step 1
// (In real code, extract the ID from libs result first)
const docs = await getLibraryDocs({
  context7CompatibleLibraryID: "/facebook/react",
  topic: "hooks useState"
});
console.log("Documentation:", docs);
\`\`\`

---

## 🔧 Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| \`validate\` | true | TypeScript syntax check before execution |
| \`debug\` | false | Verbose logging for MCP connections |
| \`timeout\` | 120000 | Execution timeout in milliseconds |
| \`autoExit\` | true | Auto-cleanup MCP connections when done |

---

## 📚 Available Tools Reference

| Category | Tool | Purpose |
|----------|------|---------|
| **Discovery** | \`list_available_servers\` | See ready servers (CALL FIRST!) |
| **Discovery** | \`list_server_tools\` | See tools & imports (CALL BEFORE execute_code!) |
| **Discovery** | \`get_tool_schema\` | Full parameter schema with enums |
| **Execution** | \`execute_code\` | Run TypeScript code |
| **Execution** | \`run_script\` | Run script from scripts/ |
| **Execution** | \`validate_code\` | Check syntax without running |
| **Diagnostics** | \`check_server_health\` | Server config & status |
| **Diagnostics** | \`test_server_connection\` | Test fresh connection |
| **Diagnostics** | \`get_server_stderr\` | Server error output |
| **Skills** | \`list_skills\` | Available knowledge packs |
| **Skills** | \`read_skill\` | Read skill documentation |

---

## ⚠️ REMEMBER

1. **ALWAYS call list_available_servers first** to verify server is "ready"
2. **ALWAYS call list_server_tools second** to get exact import paths
3. **COPY import statements** from list_server_tools output - don't guess!
4. **Use debug: true** when execution hangs to see where it stalls
5. **Use console.log()** to see results - return values are not shown

---

**NEXT STEP**: Call \`list_available_servers\` now to see what's ready!
`;

    return {
      content: [
        {
          type: "text",
          text: tutorial,
        },
      ],
    };
  }
);

// Helper: Execute TypeScript code via tsx with optional debug environment
async function executeCodeWithEnv(
  code: string,
  timeout: number = 120000,
  env?: Record<string, string>
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  await ensureDir(WORKSPACE_DIR);

  // Create a temporary script file
  const tempFile = join(WORKSPACE_DIR, `_temp_${Date.now()}.ts`);
  await writeFile(tempFile, code, "utf-8");

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const child = spawn("npx", ["tsx", tempFile], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...env },
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();
    let lastOutputAt = startTime;

    const cleanup = async () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      await unlink(tempFile).catch(() => { });
    };

    const resolveOnce = async (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (resolved) return;
      resolved = true;
      await cleanup();
      resolve(result);
    };

    timeoutId = setTimeout(() => {
      if (resolved) return;

      if (child.pid) {
        killProcessTree(child.pid);
      }

      const timeSinceLastOutput = Date.now() - lastOutputAt;
      const totalRuntime = Date.now() - startTime;
      const hadAnyOutput = stdout.length > 0 || stderr.length > 0;
      const likelyInfiniteLoop = timeSinceLastOutput > (timeout * 0.8);

      let diagnosis: string;
      let tip: string;

      if (!hadAnyOutput) {
        diagnosis = "NO OUTPUT - Likely INFINITE LOOP or code blocked before any output";
        tip = "Check for infinite loops, blocking operations, or missing console.log statements";
      } else if (likelyInfiniteLoop) {
        diagnosis = "STALLED - Code produced output but then stopped (possible infinite loop after initial work)";
        tip = "Check for infinite loops or blocking operations after the last output";
      } else {
        diagnosis = "SLOW OPERATION - Code was actively producing output when timeout hit";
        tip = "Increase timeout with { timeout: 120000 } parameter";
      }

      resolveOnce({
        exitCode: 124,
        stdout,
        stderr: stderr +
          `\n[TIMEOUT] Execution exceeded ${timeout}ms limit.` +
          `\n  Total runtime: ${totalRuntime}ms` +
          `\n  Time since last output: ${timeSinceLastOutput}ms` +
          `\n  Had output: ${hadAnyOutput}` +
          `\n  Diagnosis: ${diagnosis}` +
          `\n  Tip: ${tip}`,
      });
    }, timeout);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      lastOutputAt = Date.now();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      lastOutputAt = Date.now();
    });

    child.on("error", (err: Error) => {
      resolveOnce({
        exitCode: 1,
        stdout,
        stderr: stderr + `\nExecution error: ${err.message}`,
      });
    });

    child.on("close", (code: number | null) => {
      resolveOnce({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

// =============================================================================
// TOOL: execute_code
// =============================================================================
server.tool(
  "execute_code",
  "Execute TypeScript code that can import from servers/ wrappers and skills/. Validates syntax by default before execution to catch errors early. Adds optional auto-cleanup to close MCP connections and let the process exit once work is done. Supports both static imports (import { x } from 'y') and dynamic imports (await import('y')).",
  {
    code: z.string().describe("TypeScript code to execute. Can import from '../servers/<server>' and read from '../skills/'. Both static and dynamic imports are supported."),
    timeout: z.number().optional().describe("Execution timeout in milliseconds (default: 120000)"),
    autoExit: z
      .boolean()
      .optional()
      .describe("Auto-clean up MCP connections when the event loop goes idle (default: true). Set to false if you need to manage cleanup manually."),
    validate: z
      .boolean()
      .optional()
      .describe("Validate TypeScript syntax before execution (default: true). Set to false to skip validation for faster execution."),
    debug: z
      .boolean()
      .optional()
      .describe("Enable verbose debug logging for MCP connections and tool calls (default: false). Use this to diagnose hanging executions."),
    maxResponseLength: z
      .number()
      .optional()
      .describe("Maximum length of stdout to return (characters). Default: unlimited. Use this to prevent large responses from consuming too many tokens."),
    truncateResponse: z
      .boolean()
      .optional()
      .describe("If true, truncate long responses instead of just adding a warning. Default: false"),
  },
  async ({ code, timeout, autoExit = true, validate = true, debug = false, maxResponseLength, truncateResponse = false }) => {
    // BLOCK execution if get_started hasn't been called yet
    if (!hasCalledGetStarted) {
      return {
        content: [
          {
            type: "text",
            text: `❌ BLOCKED: You must call 'get_started' tool FIRST before using execute_code.

This is required to learn the correct import patterns and avoid common mistakes that waste time.

The get_started tool will teach you:
• Correct import syntax (ESM requires .js extensions)
• How to use .call() on tool wrappers (they're objects, not functions)
• Server naming conventions (folder names match mcp.json)
• Available discovery tools (list_available_servers, list_server_tools)

👉 Call: get_started
Then come back to execute_code.`,
          },
        ],
        isError: true,
      };
    }

    // Validate TypeScript syntax before execution (if enabled)
    if (validate) {
      const validationResult = await validateTypeScript(code);
      if (!validationResult.valid) {
        // Process errors with line mapping and hints
        let processedErrors = validationResult.errors || "Unknown validation error";
        processedErrors = mapValidationErrors(processedErrors, `_validate_`);
        processedErrors = addValidationHints(processedErrors);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                exitCode: 1,
                stdout: "",
                stderr: `TypeScript validation failed:\n${processedErrors}\n\nFix the syntax errors above before executing the code.`,
                validationFailed: true,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }

    // Hoist static imports first (they must be at module top-level)
    const { imports, body } = hoistImports(code);
    const effectiveTimeout = timeout ?? 120000;

    let finalCode: string;

    if (autoExit) {
      const wrappedBody = [
        "import { disconnectAll as __ce_disconnectAll } from \"../src/mcp.js\";",
        "",
        "let __ce_cleaned = false;",
        "const __ce_cleanup = async () => {",
        "  if (__ce_cleaned) return;",
        "  __ce_cleaned = true;",
        "  try {",
        "    await __ce_disconnectAll();",
        "  } catch (err) {",
        "    console.error(\"[code-executor] Cleanup error:\", err);",
        "  }",
        "};",
        "",
        "const __ce_exit = async (code?: number) => {",
        "  await __ce_cleanup();",
        "  const exitCode = code ?? (process.exitCode ?? 0);",
        "  process.exit(exitCode);",
        "};",
        "",
        "process.once(\"SIGINT\", () => { void __ce_exit(130); });",
        "process.once(\"SIGTERM\", () => { void __ce_exit(143); });",
        "",
        "const __ce_main = async () => {",
        body,
        "};",
        "",
        "__ce_main()",
        "  .catch((err) => {",
        "    console.error(err);",
        "    if (process.exitCode === undefined) {",
        "      process.exitCode = 1;",
        "    }",
        "  })",
        "  .finally(() => {",
        "    void __ce_exit();",
        "  });",
      ].join("\n");

      finalCode = [imports, wrappedBody].filter((p) => p && p.trim().length > 0).join("\n\n");
    } else {
      finalCode = [imports, body].filter((p) => p && p.trim().length > 0).join("\n\n");
    }

    // Prepare environment with debug flag if enabled
    const env: Record<string, string> = {};
    if (debug) {
      env.CODE_EXECUTOR_DEBUG = "1";
    }

    const result = await executeCodeWithEnv(finalCode, effectiveTimeout, env);

    // Add helpful hint on common import errors (using JSON-safe formatting)
    let hint = "";
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toLowerCase();
      const stdout = result.stdout.toLowerCase();
      const combined = stderr + stdout;

      if (combined.includes("cannot find module") ||
        combined.includes("err_module_not_found") ||
        combined.includes("is not exported") ||
        combined.includes("does not provide an export")) {
        hint = JSON.stringify({
          tip: "Import error detected",
          causes: [
            "Missing '/index.js' - use: import * as x from '../servers/SERVER/index.js'",
            "Missing '.js' extension - ESM requires explicit .js",
            "Wrong export name - use list_server_tools to see available exports",
            "Call 'get_started' tool for a complete tutorial on correct patterns"
          ]
        });
      } else if (combined.includes("is not a function") ||
        combined.includes("call is not a function")) {
        hint = JSON.stringify({
          tip: "Function call error",
          causes: [
            "Tools are objects, not functions - use: await tool.call({ args })",
            "NOT: await tool({ args })",
            "Call 'get_started' tool for correct usage patterns"
          ]
        });
      }
    }

    // Handle response truncation
    let stdout = result.stdout;
    let truncationNotice = "";
    if (maxResponseLength && stdout.length > maxResponseLength) {
      if (truncateResponse) {
        const originalLength = stdout.length;
        stdout = stdout.substring(0, maxResponseLength);
        truncationNotice = `\n\n... [TRUNCATED: ${originalLength - maxResponseLength} more characters. Original length: ${originalLength}]`;
      } else {
        truncationNotice = `\n\n⚠️ Response is ${stdout.length} characters. ` +
          `Consider using maxResponseLength parameter to truncate, or set truncateResponse: true.`;
      }
    }

    // Save execution record to history
    const executionRecord = addExecutionRecord(
      code,
      result,
      { validated: validate, debug, timeout: effectiveTimeout }
    );

    // Parse hint back to object if it exists, for proper JSON nesting
    let parsedHint: object | undefined;
    if (hint) {
      try {
        parsedHint = JSON.parse(hint);
      } catch {
        // If parsing fails, include as string
        parsedHint = undefined;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              exitCode: result.exitCode,
              stdout: stdout + truncationNotice,
              stderr: result.stderr,
              executionId: executionRecord.id,
              ...(parsedHint ? { hint: parsedHint } : {}),
              ...(maxResponseLength && stdout.length > maxResponseLength ? {
                originalLength: result.stdout.length,
                truncated: truncateResponse
              } : {}),
            },
            null,
            2
          ),
        },
      ],
      isError: result.exitCode !== 0,
    };
  }
);

// =============================================================================
// TOOL: run_script
// =============================================================================
server.tool(
  "run_script",
  "Run a TypeScript script file from the scripts/ directory",
  {
    filename: z.string().describe("Script filename (e.g., 'demo.ts')"),
    timeout: z.number().optional().describe("Execution timeout in milliseconds (default: 120000)"),
  },
  async ({ filename, timeout }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    const result = await runScriptFile(filename, timeout ?? 120000);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }, null, 2),
        },
      ],
      isError: result.exitCode !== 0,
    };
  }
);

// =============================================================================
// TOOL: list_servers
// =============================================================================
server.tool(
  "list_servers",
  "List available MCP server wrappers in servers/ directory",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const entries = await readdir(SERVERS_DIR, { withFileTypes: true });
      const servers = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ servers }, null, 2) + getStartedReminder(),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing servers: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_available_servers
// =============================================================================
server.tool(
  "list_available_servers",
  "List MCP servers that are enabled and have wrappers generated. Quick way to see what's ready to use. Also shows connection pooling status.",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const config = await loadConfig();
      const available: Array<{
        name: string;
        wrapperDir: string;
        tools: string[];
        status: "ready" | "no-wrapper" | "disabled";
        connected?: boolean;
        lastConnected?: string;
        connectionTimeMs?: number;
      }> = [];

      for (const [serverName, serverConfig] of Object.entries(config.servers)) {
        const wrapperDir = serverName;
        const wrapperPath = join(SERVERS_DIR, wrapperDir);
        const hasWrapper = await pathExists(wrapperPath);
        const isEnabled = isServerEnabled(serverConfig);

        // Get connection status for all servers
        const connectionStatus = getConnectionStatus(serverName);

        if (!isEnabled) {
          available.push({
            name: serverName,
            wrapperDir,
            tools: [],
            status: "disabled",
            connected: connectionStatus.connected,
            lastConnected: connectionStatus.lastConnected?.toISOString(),
            connectionTimeMs: connectionStatus.connectionTimeMs,
          });
          continue;
        }

        if (!hasWrapper) {
          available.push({
            name: serverName,
            wrapperDir,
            tools: [],
            status: "no-wrapper",
            connected: connectionStatus.connected,
            lastConnected: connectionStatus.lastConnected?.toISOString(),
            connectionTimeMs: connectionStatus.connectionTimeMs,
          });
          continue;
        }

        // Get tool list
        const entries = await readdir(wrapperPath);
        const tools = entries
          .filter(f => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".d.ts"))
          .map(f => f.replace(".ts", ""));

        available.push({
          name: serverName,
          wrapperDir,
          tools,
          status: "ready",
          connected: connectionStatus.connected,
          lastConnected: connectionStatus.lastConnected?.toISOString(),
          connectionTimeMs: connectionStatus.connectionTimeMs,
        });
      }

      // Also check for orphaned wrappers (wrappers without config)
      const serverDirs = await readdir(SERVERS_DIR, { withFileTypes: true });
      const configuredWrappers = new Set(Object.keys(config.servers));

      const orphaned = serverDirs
        .filter(d => d.isDirectory() && !configuredWrappers.has(d.name))
        .map(d => d.name);

      // Count connected servers
      const connectedCount = available.filter(s => s.connected).length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              servers: available,
              orphanedWrappers: orphaned.length > 0 ? orphaned : undefined,
              summary: {
                ready: available.filter(s => s.status === "ready").length,
                disabled: available.filter(s => s.status === "disabled").length,
                noWrapper: available.filter(s => s.status === "no-wrapper").length,
                orphaned: orphaned.length,
                connected: connectedCount,
              },
              hint: orphaned.length > 0
                ? "Orphaned wrappers exist without server config. Add them to mcp.json or delete the directories."
                : connectedCount > 0
                  ? `${connectedCount} server(s) have active connections (connection pooling).`
                  : undefined,
            }, null, 2) + getStartedReminder(),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing servers: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_server_tools
// =============================================================================

/**
 * Generate a usage example string for a tool based on its parameters
 */
function generateUsageExample(
  toolName: string,
  parameters: Array<{ name: string; type: string; required: boolean }>
): string {
  if (parameters.length === 0) {
    return `await ${toolName}.call({});`;
  }

  const paramExamples = parameters
    .filter(p => p.required)
    .map(p => {
      // Generate example values based on type and name
      let exampleValue: string;
      if (p.type === "number" || p.type === "integer") {
        exampleValue = "1";
      } else if (p.type === "boolean") {
        exampleValue = "true";
      } else if (p.type === "array") {
        exampleValue = "[]";
      } else if (p.type === "object") {
        exampleValue = "{}";
      } else {
        // string or unknown - use placeholder
        exampleValue = `"..."`;
      }
      return `${p.name}: ${exampleValue}`;
    });

  return `await ${toolName}.call({ ${paramExamples.join(", ")} });`;
}

server.tool(
  "list_server_tools",
  "List available tools for a specific MCP server wrapper with import examples and parameter info",
  {
    server: z.string().describe("Server name (e.g., 'context7')"),
  },
  async ({ server: serverName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const serverDir = join(SERVERS_DIR, serverName);
      if (!(await pathExists(serverDir))) {
        return {
          content: [
            {
              type: "text",
              text: `Server not found: ${serverName}`,
            },
          ],
          isError: true,
        };
      }

      const entries = await readdir(serverDir);
      const toolFiles = entries.filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".d.ts"));

      const tools: Array<{
        name: string;
        import: string;
        usage: string;
        requiredParams: string[];
        optionalParams: string[];
        parameters?: Array<{ name: string; type: string; required: boolean; enum?: string[]; inferredEnum?: string[] }>;
      }> = [];

      for (const file of toolFiles) {
        // Use kebab-case (original filename) as the tool name for consistency
        const toolName = file.replace(".ts", "");
        const toolPath = join(serverDir, file);

        // Generate import statement using kebab-case filename (direct file import)
        const importStatement = `import * as tool from '../servers/${serverName}/${toolName}.js';`;

        try {
          const content = await readFile(toolPath, "utf-8");

          // Try to extract SCHEMA for parameter info
          const schemaMatch = content.match(/export const SCHEMA\s*=\s*(\{[\s\S]*?\})\s*as const;/);
          if (schemaMatch) {
            try {
              const schema = new Function(`return ${schemaMatch[1]}`)() as {
                properties?: Record<string, { type?: string; enum?: string[]; description?: string }>;
                required?: string[];
              };
              const properties = schema.properties || {};
              const required = schema.required || [];

              // Also try to extract the tool description from the file to find enum hints
              // Look for the JSDoc comment that contains "@param args" - that's the function doc with parameter info
              const allJsDocMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
              // Find the JSDoc that contains parameter descriptions (the one with "Args:" or "@param")
              const toolDescription = allJsDocMatches.find(doc =>
                doc.includes('Args:') || doc.includes('@param args.')
              ) || "";

              const parameters = Object.entries(properties).map(([name, prop]) => {
                // Try to infer enum values from description if no explicit enum
                let inferredEnum: string[] | undefined;
                if (!prop.enum) {
                  // First try property description
                  if (prop.description) {
                    inferredEnum = extractEnumFromDescription(prop.description);
                  }
                  // If not found, try to find in tool description (e.g., "stage: The thinking stage (A, B, C)")
                  // Use word boundary to ensure we match the exact parameter name
                  if (!inferredEnum && toolDescription) {
                    const paramPattern = new RegExp(`\\b${name}\\s*:\\s*[^(\\n]*\\(([^)]+)\\)`, 'i');
                    const paramMatch = toolDescription.match(paramPattern);
                    if (paramMatch) {
                      inferredEnum = extractEnumFromDescription(`(${paramMatch[1]})`);
                    }
                  }
                }
                return {
                  name,
                  type: prop.type || "unknown",
                  required: required.includes(name),
                  enum: prop.enum,
                  inferredEnum,
                };
              });

              const requiredParams = parameters.filter(p => p.required).map(p => p.name);
              const optionalParams = parameters.filter(p => !p.required).map(p => p.name);
              const usageExample = generateUsageExample("tool", parameters);

              tools.push({
                name: toolName,  // kebab-case
                import: importStatement,
                usage: usageExample,
                requiredParams,
                optionalParams,
                parameters,
              });
            } catch {
              // Schema parse failed, add with basic info
              tools.push({
                name: toolName,  // kebab-case
                import: importStatement,
                usage: `await tool.call({});`,
                requiredParams: [],
                optionalParams: [],
              });
            }
          } else {
            tools.push({
              name: toolName,  // kebab-case
              import: importStatement,
              usage: `await tool.call({});`,
              requiredParams: [],
              optionalParams: [],
            });
          }
        } catch {
          // File read failed, add with basic info
          tools.push({
            name: toolName,  // kebab-case
            import: importStatement,
            usage: `await tool.call({});`,
            requiredParams: [],
            optionalParams: [],
          });
        }
      }

      // Build formatted output
      let output = `Server: ${serverName}\n`;
      output += `Import all: import * as ${serverName.replace(/[^a-zA-Z0-9_]/g, '_')} from '../servers/${serverName}/index.js';\n\n`;
      output += `Tools:\n`;

      for (const tool of tools) {
        output += `  - ${tool.name}\n`;
        output += `    Import: ${tool.import}\n`;
        output += `    Usage: ${tool.usage}\n`;
        output += `    Required params: ${tool.requiredParams.length > 0 ? tool.requiredParams.join(", ") : "(none)"}\n`;
        if (tool.optionalParams.length > 0) {
          output += `    Optional params: ${tool.optionalParams.join(", ")}\n`;
        }
        // Add enum values display with better formatting (explicit and inferred)
        if (tool.parameters) {
          const enumParams = tool.parameters.filter(p => (p.enum && p.enum.length > 0) || (p.inferredEnum && p.inferredEnum.length > 0));
          if (enumParams.length > 0) {
            output += `    ⚠️ Enum constraints:\n`;
            for (const ep of enumParams) {
              const reqMarker = tool.requiredParams.includes(ep.name) ? " (REQUIRED)" : " (optional)";
              if (ep.enum && ep.enum.length > 0) {
                output += `      • ${ep.name}${reqMarker}: ${ep.enum.map(v => `"${v}"`).join(" | ")}\n`;
              } else if (ep.inferredEnum && ep.inferredEnum.length > 0) {
                output += `      • ${ep.name}${reqMarker} [inferred]: ${ep.inferredEnum.map(v => `"${v}"`).join(" | ")}\n`;
              }
            }
          }
        }
        output += `\n`;
      }

      // Add helpful tips
      output += `---\n`;
      output += `Tips:\n`;
      output += `  • Use get_tool_schema("${serverName}", "tool-name") for full parameter details including descriptions\n`;
      output += `  • Both static imports (import { x } from '...') and dynamic imports (await import('...')) are supported\n`;
      output += getStartedReminder();

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing tools: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_skills
// =============================================================================
server.tool(
  "list_skills",
  "List available skills in skills/ directory",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const skillsConfig = await getSkillsConfig();
      const skills: Array<{ name: string; description: string; tags?: string[] }> = [];

      for (const [skillName, skillConfig] of Object.entries(skillsConfig.skills)) {
        // Skip disabled skills
        if (!isSkillEnabled(skillConfig)) {
          continue;
        }

        const skillPath = resolveSkillPath(skillName, skillConfig);
        const skillMdPath = join(skillPath, "SKILL.md");

        if (await pathExists(skillMdPath)) {
          const content = await readFile(skillMdPath, "utf-8");
          // Extract description from YAML frontmatter
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          let description = "No description";
          if (match) {
            const descMatch = match[1].match(/^description:\s*(.+)$/m);
            if (descMatch) {
              description = descMatch[1].trim();
            }
          }
          skills.push({
            name: skillName,
            description,
            tags: skillConfig.tags,
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ skills }, null, 2) + getStartedReminder(),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing skills: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_skills_metadata
// =============================================================================
server.tool(
  "list_skills_metadata",
  "Get name and description of all enabled skills. Use this for a quick overview of available skills without reading full content.",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const skillsConfig = await getSkillsConfig();
      const skills: Array<{ name: string; description: string }> = [];

      for (const [skillName, skillConfig] of Object.entries(skillsConfig.skills)) {
        // Skip disabled skills
        if (!isSkillEnabled(skillConfig)) {
          continue;
        }

        const skillPath = resolveSkillPath(skillName, skillConfig);
        const skillMdPath = join(skillPath, "SKILL.md");

        if (await pathExists(skillMdPath)) {
          const content = await readFile(skillMdPath, "utf-8");
          // Extract description from YAML frontmatter
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          let description = "No description";
          if (match) {
            const descMatch = match[1].match(/^description:\s*(.+)$/m);
            if (descMatch) {
              description = descMatch[1].trim();
            }
          }
          skills.push({
            name: skillName,
            description,
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ skills }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing skills metadata: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_servers_metadata
// =============================================================================
server.tool(
  "list_servers_metadata",
  "Get name and description of all configured MCP servers. Use this for a quick overview of available servers without connecting to them.",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const config = await loadConfig();
      const servers: Array<{ name: string; description: string }> = [];

      for (const [serverName, serverConfig] of Object.entries(config.servers)) {
        servers.push({
          name: serverName,
          description: serverConfig.description ?? "No description",
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ servers }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing servers metadata: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: read_skill
// =============================================================================
server.tool(
  "read_skill",
  "Read the content of a skill's SKILL.md file",
  {
    skill: z.string().describe("Skill name (e.g., 'time-helper')"),
    file: z.string().optional().describe("Optional specific file path within skill (e.g., 'references/iana_timezones.md')"),
  },
  async ({ skill, file }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const skillsConfig = await getSkillsConfig();
      const skillConfig = skillsConfig.skills[skill];

      // Check if skill exists in config
      if (!skillConfig) {
        return {
          content: [
            {
              type: "text",
              text: `Skill "${skill}" not found in skills.json`,
            },
          ],
          isError: true,
        };
      }

      // Check if skill is enabled
      if (!isSkillEnabled(skillConfig)) {
        return {
          content: [
            {
              type: "text",
              text: `Skill "${skill}" is disabled`,
            },
          ],
          isError: true,
        };
      }

      const skillPath = resolveSkillPath(skill, skillConfig);
      const targetPath = file
        ? join(skillPath, file)
        : join(skillPath, "SKILL.md");

      if (!(await pathExists(targetPath))) {
        return {
          content: [
            {
              type: "text",
              text: `File not found: ${targetPath}`,
            },
          ],
          isError: true,
        };
      }

      const content = await readFile(targetPath, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading skill: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_workspace_files
// =============================================================================
server.tool(
  "list_workspace_files",
  "List files in the workspace/ directory",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      await ensureDir(WORKSPACE_DIR);
      const entries = await readdir(WORKSPACE_DIR, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && !e.name.startsWith("_temp_"))
        .map((e) => e.name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ files }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing workspace: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: read_workspace_file
// =============================================================================
server.tool(
  "read_workspace_file",
  "Read a file from the workspace/ directory",
  {
    filename: z.string().describe("Filename to read from workspace/"),
  },
  async ({ filename }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const filePath = join(WORKSPACE_DIR, filename);
      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text",
              text: `File not found: ${filename}`,
            },
          ],
          isError: true,
        };
      }

      const content = await readFile(filePath, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading file: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: list_scripts
// =============================================================================
server.tool(
  "list_scripts",
  "List available script files in scripts/ directory",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const entries = await readdir(SCRIPTS_DIR);
      const scripts = entries.filter((f) => f.endsWith(".ts"));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ scripts }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing scripts: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: check_server_health
// =============================================================================
server.tool(
  "check_server_health",
  "Check the health and configuration of an MCP server. Use this to diagnose connection issues.",
  {
    server: z.string().optional().describe("Server name to check. If omitted, lists all configured servers."),
  },
  async ({ server: serverName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      if (!serverName) {
        // List all configured servers with their status
        const servers = await listConfiguredServers();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                servers,
                hint: "Use check_server_health with a specific server name for detailed diagnostics",
              }, null, 2),
            },
          ],
        };
      }

      // Get detailed health info for specific server
      const health = await checkServerHealth(serverName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              server: serverName,
              ...health,
              note: "Health checks run in the MCP server process. Code execution spawns separate processes with their own connections. A healthy server here doesn't guarantee code execution will work - use test_server_connection for that.",
            }, null, 2),
          },
        ],
        isError: health.status === "error",
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error checking server health: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: test_server_connection
// =============================================================================
server.tool(
  "test_server_connection",
  "Test connecting to an MCP server and measure connection time. Forces a fresh connection.",
  {
    server: z.string().describe("Server name to test connection"),
  },
  async ({ server: serverName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const result = await testServerConnection(serverName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              server: serverName,
              ...result,
            }, null, 2),
          },
        ],
        isError: !result.success,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error testing connection: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TOOL: get_tool_schema
// =============================================================================
server.tool(
  "get_tool_schema",
  "Get the full JSON schema for a specific tool, including required/optional parameters and types",
  {
    server: z.string().describe("Server name (e.g., 'context7')"),
    tool: z.string().describe("Tool name (e.g., 'get-library-docs')"),
  },
  async ({ server: serverName, tool: toolName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      // Try the provided name first, then try converting from camelCase to kebab-case
      let toolPath = join(SERVERS_DIR, serverName, `${toolName}.ts`);
      let actualToolName = toolName;

      if (!(await pathExists(toolPath))) {
        // Try kebab-case version (in case user provided camelCase like "processThought")
        const kebabName = toKebabCase(toolName);
        const kebabPath = join(SERVERS_DIR, serverName, `${kebabName}.ts`);

        if (await pathExists(kebabPath)) {
          toolPath = kebabPath;
          actualToolName = kebabName;
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Tool not found: ${serverName}/${toolName}\n\nTried:\n  - ${toolName}.ts\n  - ${kebabName}.ts\n\nUse list_server_tools to see available tools.`,
              },
            ],
            isError: true,
          };
        }
      }

      const content = await readFile(toolPath, "utf-8");

      // Extract SCHEMA constant from the file
      const schemaMatch = content.match(/export const SCHEMA\s*=\s*(\{[\s\S]*?\})\s*as const;/);
      if (!schemaMatch) {
        return {
          content: [
            {
              type: "text",
              text: `No SCHEMA found in ${serverName}/${toolName}.ts`,
            },
          ],
          isError: true,
        };
      }

      // Parse the schema
      let schema: Record<string, unknown>;
      try {
        // Use Function constructor to safely evaluate the object literal
        schema = new Function(`return ${schemaMatch[1]}`)();
      } catch (parseErr) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to parse SCHEMA: ${(parseErr as Error).message}`,
            },
          ],
          isError: true,
        };
      }

      // Extract parameter info
      const properties = (schema.properties || {}) as Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>;
      const required = (schema.required || []) as string[];

      // Also try to extract the tool description from the file to find enum hints
      // Look for the JSDoc comment that contains "@param args" - that's the function doc with parameter info
      const allJsDocMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
      // Find the JSDoc that contains parameter descriptions (the one with "Args:" or "@param")
      const toolDescription = allJsDocMatches.find(doc =>
        doc.includes('Args:') || doc.includes('@param args.')
      ) || "";

      const parameters: Array<{
        name: string;
        type: string;
        required: boolean;
        description?: string;
        enum?: string[];
        inferredEnum?: string[];
        default?: unknown;
      }> = [];

      for (const [name, prop] of Object.entries(properties)) {
        // Try to infer enum values from description if no explicit enum
        let inferredEnum: string[] | undefined;
        if (!prop.enum) {
          // First try property description
          if (prop.description) {
            inferredEnum = extractEnumFromDescription(prop.description);
          }
          // If not found, try to find in tool description (e.g., "stage: The thinking stage (A, B, C)")
          // Use word boundary to ensure we match the exact parameter name
          if (!inferredEnum && toolDescription) {
            const paramPattern = new RegExp(`\\b${name}\\s*:\\s*[^(\\n]*\\(([^)]+)\\)`, 'i');
            const paramMatch = toolDescription.match(paramPattern);
            if (paramMatch) {
              inferredEnum = extractEnumFromDescription(`(${paramMatch[1]})`);
            }
          }
        }

        parameters.push({
          name,
          type: prop.type || "unknown",
          required: required.includes(name),
          description: prop.description,
          enum: prop.enum,
          inferredEnum,
          default: prop.default,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              server: serverName,
              tool: actualToolName,
              schema,
              parameters,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading tool schema: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// ERROR HINTS for common TypeScript validation errors
// =============================================================================
const ERROR_HINTS: Array<{
  pattern: RegExp;
  suggestion: string;
}> = [
  {
    pattern: /TS1002.*Unterminated string literal/i,
    suggestion: "💡 Check quote matching - you may have mismatched ' or \" characters"
  },
  {
    pattern: /Cannot find module '\.\.\/servers\/([^']+)'/i,
    suggestion: "💡 Import path error. Use: import * as tool from '../servers/{name}/index.js'"
  },
  {
    pattern: /is not exported from/i,
    suggestion: "💡 Wrong export name. Use list_server_tools to see correct export names"
  },
  {
    pattern: /TS2304.*Cannot find name/i,
    suggestion: "💡 Undefined variable. Check for typos or missing imports"
  },
  {
    pattern: /TS1005.*expected/i,
    suggestion: "💡 Syntax error - check for missing brackets, parentheses, or semicolons"
  },
  {
    pattern: /TS1003.*Identifier expected/i,
    suggestion: "💡 Expected an identifier (variable/function name). Check for reserved keywords or syntax issues"
  },
  {
    pattern: /TS2339.*does not exist on type/i,
    suggestion: "💡 Property doesn't exist. Check spelling or use type assertion if needed"
  },
  {
    pattern: /TS2345.*Argument of type.*is not assignable/i,
    suggestion: "💡 Type mismatch. Check the expected parameter types"
  },
  {
    pattern: /TS1128.*Declaration or statement expected/i,
    suggestion: "💡 Unexpected syntax. Check for extra/missing braces or statements outside functions"
  },
  {
    pattern: /TS2307.*Cannot find module/i,
    suggestion: "💡 Module not found. Ensure correct path and .js extension for ESM imports"
  }
];

/**
 * Add helpful hints to validation errors based on error patterns
 */
function addValidationHints(errors: string): string {
  let hints = "";
  for (const { pattern, suggestion } of ERROR_HINTS) {
    if (pattern.test(errors)) {
      hints += `\n${suggestion}`;
    }
  }
  return errors + (hints ? `\n\n--- Suggestions ---${hints}` : "");
}

/**
 * Map validation errors to replace temp file paths with user-friendly line references
 */
function mapValidationErrors(errors: string, tempFileName: string): string {
  // Extract just the filename from the path for matching
  const filenameOnly = tempFileName.replace(/\\/g, '/').split('/').pop() || tempFileName;
  
  // Pattern: workspace/_validate_XXXXX.ts(LINE,COL): error TSXXXX: message
  // Or: full/path/to/_validate_XXXXX.ts(LINE,COL): error TSXXXX: message
  const regex = new RegExp(
    `[^\\s(]*${filenameOnly.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\((\\d+),(\\d+)\\)`,
    'g'
  );
  
  return errors.replace(regex, 'Line $1, Column $2 in your code');
}

// =============================================================================
// TOOL: validate_code
// =============================================================================
server.tool(
  "validate_code",
  "Validate TypeScript code syntax before execution. Checks for syntax errors without running the code. Useful for catching typos and malformed code early. Note: execute_code now validates by default, so this tool is mainly useful for checking code without executing it.",
  {
    code: z.string().describe("TypeScript code to validate"),
  },
  async ({ code }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const result = await validateTypeScript(code);
      
      // Process errors if validation failed
      let processedErrors = result.errors;
      if (!result.valid && processedErrors) {
        // Map temp file paths to user-friendly line references
        processedErrors = mapValidationErrors(processedErrors, `_validate_`);
        // Add helpful hints based on error patterns
        processedErrors = addValidationHints(processedErrors);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              valid: result.valid,
              errors: processedErrors,
              hint: result.valid
                ? "Code syntax is valid. You can proceed with execute_code."
                : "Fix the errors above before executing the code.",
            }, null, 2),
          },
        ],
        isError: !result.valid,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error validating code: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// CODE TEMPLATES for common patterns
// =============================================================================
const CODE_TEMPLATES: Record<string, { description: string; code: string }> = {
  "single-tool-call": {
    description: "Call a single MCP tool and log the result",
    code: `// Single Tool Call Template
// Replace {SERVER} with your server name (e.g., 'context7')
// Replace {TOOL} with your tool name (e.g., 'resolve-library-id')
import * as tool from '../servers/{SERVER}/{TOOL}.js';

const result = await tool.call({
  // Add your parameters here
  // param1: "value1",
  // param2: "value2",
});

console.log("Result:", JSON.stringify(result, null, 2));
`
  },
  "multi-tool-workflow": {
    description: "Chain multiple tool calls together, using results from one in the next",
    code: `// Multi-Tool Workflow Template
// Replace {SERVER} with your server name
import { tool1, tool2 } from '../servers/{SERVER}/index.js';

// Step 1: First operation
const step1Result = await tool1({
  param1: "value"
});
console.log("Step 1 result:", JSON.stringify(step1Result, null, 2));

// Step 2: Use result from step 1
// Extract what you need from step1Result
const extractedValue = step1Result.content?.[0]?.text || "";

const step2Result = await tool2({
  param: extractedValue
});
console.log("Step 2 result:", JSON.stringify(step2Result, null, 2));

// Final output
console.log("Workflow complete!");
`
  },
  "error-handling": {
    description: "Robust error handling for MCP tool calls",
    code: `// Error Handling Template
import * as tool from '../servers/{SERVER}/{TOOL}.js';

try {
  const result = await tool.call({
    // Add your parameters here
  });
  
  // Check if the result indicates an error
  if (result.isError) {
    console.error("Tool returned error:", result.content?.[0]?.text);
    process.exit(1);
  }
  
  console.log("Success:", JSON.stringify(result, null, 2));
} catch (error) {
  // Handle connection or execution errors
  console.error("Execution failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
`
  },
  "file-io": {
    description: "Read and write files in the workspace",
    code: `// File I/O Template
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Files are relative to workspace/ directory when using relative paths
// Or use absolute paths for other locations

// Read a file
const inputPath = './input.json';  // workspace/input.json
const content = await readFile(inputPath, 'utf-8');
console.log("Read file:", content);

// Process the data
const data = JSON.parse(content);
const processed = { ...data, timestamp: new Date().toISOString() };

// Write output
const outputPath = './output.json';  // workspace/output.json
await writeFile(outputPath, JSON.stringify(processed, null, 2));
console.log("Wrote output to:", outputPath);
`
  },
  "parallel-calls": {
    description: "Execute multiple tool calls in parallel for better performance",
    code: `// Parallel Calls Template
import { tool1, tool2, tool3 } from '../servers/{SERVER}/index.js';

// Execute multiple independent calls in parallel
const [result1, result2, result3] = await Promise.all([
  tool1({ param: "value1" }),
  tool2({ param: "value2" }),
  tool3({ param: "value3" }),
]);

console.log("Result 1:", JSON.stringify(result1, null, 2));
console.log("Result 2:", JSON.stringify(result2, null, 2));
console.log("Result 3:", JSON.stringify(result3, null, 2));

// Or use Promise.allSettled for graceful handling of partial failures
const results = await Promise.allSettled([
  tool1({ param: "value1" }),
  tool2({ param: "value2" }),
]);

for (const [index, result] of results.entries()) {
  if (result.status === 'fulfilled') {
    console.log(\`Call \${index + 1} succeeded:\`, result.value);
  } else {
    console.error(\`Call \${index + 1} failed:\`, result.reason);
  }
}
`
  }
};

// =============================================================================
// TOOL: get_template
// =============================================================================
server.tool(
  "get_template",
  "Get pre-built code templates for common patterns. Use these as starting points for your code.",
  {
    pattern: z.enum([
      "single-tool-call",
      "multi-tool-workflow",
      "error-handling",
      "file-io",
      "parallel-calls"
    ]).describe("Template pattern to retrieve"),
    server: z.string().optional().describe("Server name to use in template placeholders (optional)"),
    tool: z.string().optional().describe("Tool name to use in template placeholders (optional)"),
  },
  async ({ pattern, server: serverName, tool: toolName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    const template = CODE_TEMPLATES[pattern];
    if (!template) {
      return {
        content: [
          {
            type: "text",
            text: `Template not found: ${pattern}. Available patterns: ${Object.keys(CODE_TEMPLATES).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    // Replace placeholders if server/tool names provided
    let code = template.code;
    if (serverName) {
      code = code.replace(/\{SERVER\}/g, serverName);
    }
    if (toolName) {
      code = code.replace(/\{TOOL\}/g, toolName);
    }

    // Build output with template info
    let output = `## ${pattern}\n`;
    output += `**Description:** ${template.description}\n\n`;
    output += `### Code Template\n\`\`\`typescript\n${code}\n\`\`\`\n\n`;
    
    // Add usage hints
    output += `### Usage\n`;
    if (!serverName || !toolName) {
      output += `Replace placeholders:\n`;
      if (!serverName) output += `  • \`{SERVER}\` → your server name (use list_available_servers)\n`;
      if (!toolName) output += `  • \`{TOOL}\` → your tool name (use list_server_tools)\n`;
    } else {
      output += `Template is ready to use with server '${serverName}'`;
      if (toolName) output += ` and tool '${toolName}'`;
      output += `.\n`;
    }
    
    output += `\n### Available Templates\n`;
    for (const [name, tmpl] of Object.entries(CODE_TEMPLATES)) {
      const marker = name === pattern ? "→ " : "  ";
      output += `${marker}• ${name}: ${tmpl.description}\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// =============================================================================
// TOOL: get_import
// =============================================================================

/**
 * Get tool exports from a server's index.ts file
 */
async function getToolExports(serverDir: string): Promise<string[]> {
  const indexPath = join(serverDir, "index.ts");
  if (!(await pathExists(indexPath))) {
    return [];
  }
  
  try {
    const content = await readFile(indexPath, "utf-8");
    // Match export { name1, name2 } from pattern
    const exportMatch = content.match(/export\s*{\s*([^}]+)\s*}\s*from/);
    if (exportMatch) {
      return exportMatch[1]
        .split(",")
        .map(name => name.trim())
        .filter(name => name.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

server.tool(
  "get_import",
  "Generate correct import statement for a server tool. Helps avoid import path errors.",
  {
    server: z.string().describe("Server name"),
    tool: z.string().optional().describe("Tool name (optional, for single import)"),
    style: z.enum(["namespace", "named", "direct"]).optional()
      .describe("Import style: namespace (import * as), named ({ tool }), or direct (single file). Default: namespace"),
  },
  async ({ server: serverName, tool: toolName, style = "namespace" }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    const serverDir = join(SERVERS_DIR, serverName);
    if (!(await pathExists(serverDir))) {
      return {
        content: [
          {
            type: "text",
            text: `Server not found: ${serverName}\n\nUse list_available_servers to see available servers.`,
          },
        ],
        isError: true,
      };
    }

    let importStatement: string;
    let usageExample: string;
    
    if (style === "namespace") {
      const safeName = serverName.replace(/[^a-zA-Z0-9_]/g, '_');
      importStatement = `import * as ${safeName} from '../servers/${serverName}/index.js';`;
      usageExample = `const result = await ${safeName}.toolName({ param: "value" });`;
    } else if (style === "named") {
      // Read index.ts to get export names
      const exports = await getToolExports(serverDir);
      if (exports.length === 0) {
        importStatement = `// No named exports found - use namespace import instead\nimport * as ${serverName.replace(/[^a-zA-Z0-9_]/g, '_')} from '../servers/${serverName}/index.js';`;
        usageExample = `const result = await ${serverName.replace(/[^a-zA-Z0-9_]/g, '_')}.toolName({ param: "value" });`;
      } else {
        importStatement = `import { ${exports.join(', ')} } from '../servers/${serverName}/index.js';`;
        usageExample = `const result = await ${exports[0]}({ param: "value" });`;
      }
    } else if (style === "direct") {
      if (!toolName) {
        return {
          content: [
            {
              type: "text",
              text: `Tool name required for direct import style.\n\nUsage: get_import({ server: "${serverName}", tool: "tool-name", style: "direct" })`,
            },
          ],
          isError: true,
        };
      }
      const safeName = toCamelCase(toolName);
      importStatement = `import * as ${safeName} from '../servers/${serverName}/${toolName}.js';`;
      usageExample = `const result = await ${safeName}.call({ param: "value" });`;
    } else {
      importStatement = `import * as ${serverName.replace(/[^a-zA-Z0-9_]/g, '_')} from '../servers/${serverName}/index.js';`;
      usageExample = `const result = await ${serverName.replace(/[^a-zA-Z0-9_]/g, '_')}.toolName({ param: "value" });`;
    }

    let output = `## Import Statement\n\n\`\`\`typescript\n${importStatement}\n\`\`\`\n\n`;
    output += `## Usage Example\n\n\`\`\`typescript\n${usageExample}\n\`\`\`\n\n`;
    output += `## Import Styles\n\n`;
    output += `| Style | Description |\n`;
    output += `|-------|-------------|\n`;
    output += `| namespace | Import all tools under one name: \`import * as server from '...'\` |\n`;
    output += `| named | Import specific tools: \`import { tool1, tool2 } from '...'\` |\n`;
    output += `| direct | Import single tool file: \`import * as tool from '.../tool.js'\` |\n`;

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  }
);

// =============================================================================
// TOOL: list_history
// =============================================================================
server.tool(
  "list_history",
  "List recent code executions with preview. Useful for reviewing past executions and finding IDs for replay.",
  {},
  async () => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    const history = getExecutionHistory();
    const count = getHistoryCount();
    const maxSize = getMaxHistorySize();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            executions: history,
            count,
            maxSize,
            hint: count > 0
              ? "Use replay_code with an execution ID to re-run a previous execution."
              : "No executions in history yet. Run some code with execute_code first.",
          }, null, 2),
        },
      ],
    };
  }
);

// =============================================================================
// TOOL: replay_code
// =============================================================================
server.tool(
  "replay_code",
  "Re-run a previous execution by ID. Get IDs from list_history.",
  {
    id: z.string().describe("Execution ID from history (e.g., 'exec_abc123_0001')"),
    timeout: z.number().optional().describe("Override timeout in milliseconds (optional)"),
    debug: z.boolean().optional().describe("Override debug setting (optional)"),
  },
  async ({ id, timeout: overrideTimeout, debug: overrideDebug }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    const record = getExecutionById(id);
    if (!record) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Execution not found: ${id}`,
              hint: "Use list_history to see available execution IDs.",
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Use original settings unless overridden
    const effectiveTimeout = overrideTimeout ?? record.timeout;
    const effectiveDebug = overrideDebug ?? record.debug;

    // Re-hoist imports from the original code
    const { imports, body } = hoistImports(record.code);

    let finalCode: string;
    // Always use autoExit for replays (consistent with original behavior)
    const wrappedBody = [
      "import { disconnectAll as __ce_disconnectAll } from \"../src/mcp.js\";",
      "",
      "let __ce_cleaned = false;",
      "const __ce_cleanup = async () => {",
      "  if (__ce_cleaned) return;",
      "  __ce_cleaned = true;",
      "  try {",
      "    await __ce_disconnectAll();",
      "  } catch (err) {",
      "    console.error(\"[code-executor] Cleanup error:\", err);",
      "  }",
      "};",
      "",
      "const __ce_exit = async (code?: number) => {",
      "  await __ce_cleanup();",
      "  const exitCode = code ?? (process.exitCode ?? 0);",
      "  process.exit(exitCode);",
      "};",
      "",
      "process.once(\"SIGINT\", () => { void __ce_exit(130); });",
      "process.once(\"SIGTERM\", () => { void __ce_exit(143); });",
      "",
      "const __ce_main = async () => {",
      body,
      "};",
      "",
      "__ce_main()",
      "  .catch((err) => {",
      "    console.error(err);",
      "    if (process.exitCode === undefined) {",
      "      process.exitCode = 1;",
      "    }",
      "  })",
      "  .finally(() => {",
      "    void __ce_exit();",
      "  });",
    ].join("\n");

    finalCode = [imports, wrappedBody].filter((p) => p && p.trim().length > 0).join("\n\n");

    // Prepare environment with debug flag if enabled
    const env: Record<string, string> = {};
    if (effectiveDebug) {
      env.CODE_EXECUTOR_DEBUG = "1";
    }

    const result = await executeCodeWithEnv(finalCode, effectiveTimeout, env);

    // Save the replay as a new execution record
    const newRecord = addExecutionRecord(
      record.code,
      result,
      { validated: false, debug: effectiveDebug, timeout: effectiveTimeout }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            replayedFrom: id,
            newExecutionId: newRecord.id,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }, null, 2),
        },
      ],
      isError: result.exitCode !== 0,
    };
  }
);

// =============================================================================
// TOOL: execute_batch
// =============================================================================
server.tool(
  "execute_batch",
  "Execute multiple code snippets in parallel. Useful for running independent operations concurrently.",
  {
    snippets: z.array(z.object({
      id: z.string().describe("Unique identifier for this snippet"),
      code: z.string().describe("TypeScript code to execute"),
    })).describe("Array of code snippets to execute"),
    timeout: z.number().optional().describe("Execution timeout in milliseconds for each snippet (default: 120000)"),
    validate: z.boolean().optional().describe("Validate TypeScript syntax before execution (default: true)"),
    debug: z.boolean().optional().describe("Enable debug logging (default: false)"),
  },
  async ({ snippets, timeout = 120000, validate = true, debug = false }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    if (snippets.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "No snippets provided",
              hint: "Provide at least one snippet with { id, code } in the snippets array.",
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Execute all snippets in parallel
    const results = await Promise.all(
      snippets.map(async (snippet) => {
        try {
          // Validate if enabled
          if (validate) {
            const validationResult = await validateTypeScript(snippet.code);
            if (!validationResult.valid) {
              let processedErrors = validationResult.errors || "Unknown validation error";
              processedErrors = mapValidationErrors(processedErrors, `_validate_`);
              processedErrors = addValidationHints(processedErrors);
              
              return {
                id: snippet.id,
                exitCode: 1,
                stdout: "",
                stderr: `TypeScript validation failed:\n${processedErrors}`,
                validationFailed: true,
              };
            }
          }

          // Hoist imports and wrap code
          const { imports, body } = hoistImports(snippet.code);
          
          const wrappedBody = [
            "import { disconnectAll as __ce_disconnectAll } from \"../src/mcp.js\";",
            "",
            "let __ce_cleaned = false;",
            "const __ce_cleanup = async () => {",
            "  if (__ce_cleaned) return;",
            "  __ce_cleaned = true;",
            "  try {",
            "    await __ce_disconnectAll();",
            "  } catch (err) {",
            "    console.error(\"[code-executor] Cleanup error:\", err);",
            "  }",
            "};",
            "",
            "const __ce_exit = async (code?: number) => {",
            "  await __ce_cleanup();",
            "  const exitCode = code ?? (process.exitCode ?? 0);",
            "  process.exit(exitCode);",
            "};",
            "",
            "process.once(\"SIGINT\", () => { void __ce_exit(130); });",
            "process.once(\"SIGTERM\", () => { void __ce_exit(143); });",
            "",
            "const __ce_main = async () => {",
            body,
            "};",
            "",
            "__ce_main()",
            "  .catch((err) => {",
            "    console.error(err);",
            "    if (process.exitCode === undefined) {",
            "      process.exitCode = 1;",
            "    }",
            "  })",
            "  .finally(() => {",
            "    void __ce_exit();",
            "  });",
          ].join("\n");

          const finalCode = [imports, wrappedBody].filter((p) => p && p.trim().length > 0).join("\n\n");

          // Prepare environment
          const env: Record<string, string> = {};
          if (debug) {
            env.CODE_EXECUTOR_DEBUG = "1";
          }

          const result = await executeCodeWithEnv(finalCode, timeout, env);

          // Save to history
          const executionRecord = addExecutionRecord(
            snippet.code,
            result,
            { validated: validate, debug, timeout }
          );

          return {
            id: snippet.id,
            executionId: executionRecord.id,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        } catch (error) {
          return {
            id: snippet.id,
            exitCode: 1,
            stdout: "",
            stderr: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      })
    );

    // Summary
    const successful = results.filter(r => r.exitCode === 0).length;
    const failed = results.length - successful;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results,
            summary: {
              total: results.length,
              successful,
              failed,
            },
          }, null, 2),
        },
      ],
      isError: failed > 0,
    };
  }
);

// =============================================================================
// TOOL: get_server_stderr
// =============================================================================
server.tool(
  "get_server_stderr",
  "Get the captured stderr output from a server's last connection attempt. Useful for debugging.",
  {
    server: z.string().describe("Server name to get stderr for"),
  },
  async ({ server: serverName }) => {
    const blocked = requireGetStarted();
    if (blocked) return blocked;

    try {
      const stderr = getServerStderr(serverName);

      if (!stderr) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                server: serverName,
                stderr: null,
                message: "No stderr captured. The server may not have been connected yet or produced no stderr output.",
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              server: serverName,
              stderr,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting stderr: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Start the server
// =============================================================================
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Code Executor MCP server running on stdio");
console.error(`  MCP config: ${getConfigPath()}`);
console.error(`  Skills config: ${getSkillsConfigPath()}`);