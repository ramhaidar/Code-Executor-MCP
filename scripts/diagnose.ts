#!/usr/bin/env npx tsx
/**
 * Diagnostic script for Code Executor MCP
 * 
 * This script tests all configured MCP servers and reports their status.
 * Run with: pnpm exec tsx scripts/diagnose.ts
 * 
 * Options:
 *   --verbose    Show detailed output including stderr
 *   --test       Actually test connections (slower but more thorough)
 *   --server=X   Only diagnose a specific server
 */

import { loadConfig, isServerEnabled, initConfigPaths, getConfigPath } from "../src/config.js";
import { 
  commandExists, 
  diagnoseServerCommand, 
  checkServerHealth, 
  testServerConnection,
  disconnectAll 
} from "../src/mcp.js";
import { access } from "node:fs/promises";

// Parse CLI arguments
const args = process.argv.slice(2);
initConfigPaths(args);

const verbose = args.includes("--verbose") || args.includes("-v");
const testConnections = args.includes("--test") || args.includes("-t");
const serverArg = args.find(a => a.startsWith("--server="));
const specificServer = serverArg ? serverArg.split("=")[1] : null;

// ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color?: keyof typeof colors): void {
  if (color) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  } else {
    console.log(message);
  }
}

function logStatus(status: "ok" | "warn" | "error", message: string): void {
  const icon = status === "ok" ? "✓" : status === "warn" ? "⚠" : "✗";
  const color = status === "ok" ? "green" : status === "warn" ? "yellow" : "red";
  log(`  ${icon} ${message}`, color);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function diagnoseServer(
  serverName: string,
  serverConfig: {
    command: string;
    args?: string[];
    enabled?: boolean;
    timeout?: number;
    retries?: number;
    tags?: string[];
  }
): Promise<{ passed: number; failed: number; warnings: number }> {
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  log(`\n${colors.bright}Server: ${serverName}${colors.reset}`, "cyan");
  log(`  Command: ${serverConfig.command} ${(serverConfig.args ?? []).join(" ")}`, "dim");
  
  if (serverConfig.tags?.length) {
    log(`  Tags: ${serverConfig.tags.join(", ")}`, "dim");
  }

  // Check if enabled
  const enabled = isServerEnabled(serverConfig as Parameters<typeof isServerEnabled>[0]);
  if (!enabled) {
    logStatus("warn", "Server is DISABLED in configuration");
    warnings++;
    return { passed, failed, warnings };
  }
  logStatus("ok", "Server is enabled");
  passed++;

  // Check command exists
  const cmdExists = await commandExists(serverConfig.command);
  if (cmdExists) {
    logStatus("ok", `Command "${serverConfig.command}" found in PATH`);
    passed++;
  } else {
    logStatus("error", `Command "${serverConfig.command}" NOT found in PATH`);
    failed++;
  }

  // Diagnose command and args
  const diagnosis = await diagnoseServerCommand(serverName);
  
  if (diagnosis.argsValid) {
    logStatus("ok", "Arguments appear valid");
    passed++;
  } else {
    logStatus("error", "Arguments have issues");
    failed++;
  }

  if (diagnosis.suggestions.length > 0) {
    log("  Suggestions:", "yellow");
    for (const suggestion of diagnosis.suggestions) {
      log(`    - ${suggestion}`, "yellow");
    }
  }

  // Check specific paths in args
  const argsToCheck = serverConfig.args ?? [];
  for (const arg of argsToCheck) {
    // Skip flags
    if (arg.startsWith("-") || arg.startsWith("/") && arg.length <= 2) continue;
    
    // Check if it looks like a path
    if (arg.includes("/") || arg.includes("\\") || arg.endsWith(".js") || arg.endsWith(".py") || arg.endsWith(".CMD")) {
      const exists = await fileExists(arg);
      if (exists) {
        if (verbose) {
          logStatus("ok", `Path exists: ${arg}`);
        }
        passed++;
      } else {
        logStatus("error", `Path NOT found: ${arg}`);
        failed++;
      }
    }
  }

  // Test actual connection if requested
  if (testConnections) {
    log("  Testing connection...", "dim");
    const result = await testServerConnection(serverName);
    
    if (result.success) {
      logStatus("ok", `Connected in ${result.connectionTimeMs}ms, found ${result.toolCount} tools`);
      passed++;
    } else {
      logStatus("error", `Connection failed: ${result.error}`);
      failed++;
      
      if (verbose && result.stderr) {
        log("  Server stderr:", "dim");
        for (const line of result.stderr.split("\n")) {
          log(`    ${line}`, "dim");
        }
      }
    }
  }

  return { passed, failed, warnings };
}

async function main(): Promise<void> {
  log("\n╔════════════════════════════════════════════════════════════╗", "cyan");
  log("║         Code Executor MCP - Server Diagnostics             ║", "cyan");
  log("╚════════════════════════════════════════════════════════════╝", "cyan");

  log(`\nConfig file: ${getConfigPath()}`, "dim");
  
  if (testConnections) {
    log("Mode: Full connection testing (--test)", "yellow");
  } else {
    log("Mode: Configuration check only (use --test for connection testing)", "dim");
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    log(`\n✗ Failed to load config: ${(err as Error).message}`, "red");
    process.exit(1);
  }

  const serverNames = Object.keys(config.servers);
  log(`\nFound ${serverNames.length} configured server(s)`, "bright");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const serverName of serverNames) {
    if (specificServer && serverName !== specificServer) {
      continue;
    }

    const serverConfig = config.servers[serverName];
    const result = await diagnoseServer(serverName, serverConfig);
    
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalWarnings += result.warnings;
  }

  // Cleanup connections
  await disconnectAll();

  // Summary
  log("\n" + "═".repeat(60), "cyan");
  log("Summary:", "bright");
  logStatus("ok", `${totalPassed} checks passed`);
  if (totalWarnings > 0) {
    logStatus("warn", `${totalWarnings} warnings`);
  }
  if (totalFailed > 0) {
    logStatus("error", `${totalFailed} checks failed`);
  }

  if (totalFailed > 0) {
    log("\nTroubleshooting tips:", "yellow");
    log("  1. Ensure all server commands are installed and in PATH", "dim");
    log("  2. Check that script paths in args are correct", "dim");
    log("  3. Try running server commands manually to see errors", "dim");
    log("  4. Use --verbose flag for more detailed output", "dim");
    log("  5. Use --test flag to test actual connections", "dim");
    process.exit(1);
  }

  log("\n✓ All checks passed!", "green");
}

main().catch((err) => {
  log(`\n✗ Diagnostic failed: ${err.message}`, "red");
  process.exit(1);
});