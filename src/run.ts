import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const WORKSPACE_DIR = join(PROJECT_ROOT, "workspace");

/**
 * Ensure workspace directory exists
 */
async function ensureWorkspace(): Promise<void> {
  await mkdir(WORKSPACE_DIR, { recursive: true });
}

/**
 * Check if a file exists
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
 * Execute a TypeScript script using tsx
 * @param scriptPath - Path to the script (relative to project root or absolute)
 * @returns Exit code, stdout, and stderr
 */
export async function runScript(scriptPath: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  // Resolve script path relative to project root if not absolute
  const resolvedPath = resolve(PROJECT_ROOT, scriptPath);

  // Validate script exists
  if (!(await fileExists(resolvedPath))) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Script not found: ${resolvedPath}`,
    };
  }

  // Ensure workspace directory exists
  await ensureWorkspace();

  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", resolvedPath], {
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

    child.on("error", (err: Error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + `\nExecution error: ${err.message}`,
      });
    });

    child.on("close", (code: number | null) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

// CLI entry point
const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: tsx src/run.ts <script.ts>");
  process.exit(1);
}

runScript(scriptPath)
  .then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error("Execution failed:", err);
    process.exit(1);
  });