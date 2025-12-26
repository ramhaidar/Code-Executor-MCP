import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

// Default config path constants - at repo root
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(__dirname, "..", "mcp.json");
const DEFAULT_SKILLS_CONFIG_PATH = join(__dirname, "..", "skills.json");

// Environment variable names
const ENV_MCP_CONFIG = "CODE_EXECUTOR_MCP_CONFIG";
const ENV_SKILLS_CONFIG = "CODE_EXECUTOR_SKILLS_CONFIG";
const ENV_SKIP_GET_STARTED = "CODE_EXECUTOR_SKIP_GET_STARTED";

// Runtime config paths (can be overridden via CLI args or env vars)
let configPath = process.env[ENV_MCP_CONFIG] || DEFAULT_CONFIG_PATH;
let skillsConfigPath = process.env[ENV_SKILLS_CONFIG] || DEFAULT_SKILLS_CONFIG_PATH;

// Skip get_started blocking (can be overridden via CLI args or env vars)
let skipGetStarted = parseBoolean(process.env[ENV_SKIP_GET_STARTED]);

/**
 * Parse a string value as a boolean.
 * Returns true for "true", "1", "yes" (case-insensitive), false otherwise.
 */
function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

// Export getters for current paths (for debugging/logging)
export function getConfigPath(): string {
  return configPath;
}

export function getSkillsConfigPath(): string {
  return skillsConfigPath;
}

/**
 * Check if get_started blocking should be skipped.
 * @returns true if blocking should be skipped
 */
export function shouldSkipGetStarted(): boolean {
  return skipGetStarted;
}

/**
 * Initialize config paths from CLI arguments.
 * Priority: CLI args > environment variables > defaults
 *
 * @param args - CLI arguments (process.argv.slice(2))
 */
export function initConfigPaths(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--mcp-config" && args[i + 1]) {
      configPath = resolve(args[i + 1]);
      i++; // Skip the next arg (the path value)
    } else if (arg.startsWith("--mcp-config=")) {
      configPath = resolve(arg.split("=")[1]);
    } else if (arg === "--skills-config" && args[i + 1]) {
      skillsConfigPath = resolve(args[i + 1]);
      i++; // Skip the next arg (the path value)
    } else if (arg.startsWith("--skills-config=")) {
      skillsConfigPath = resolve(arg.split("=")[1]);
    } else if (arg === "--skip-get-started") {
      skipGetStarted = true;
    }
  }
}

// =============================================================================
// MCP SERVER CONFIG SCHEMA
// =============================================================================

const ServerConfigSchema = z.object({
  enabled: z.boolean().optional(), // defaults to true if omitted
  description: z.string().optional(), // human-readable description of what this server does
  transport: z.literal("stdio"),
  command: z.string().min(1, "command is required"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(), // connection timeout in ms, defaults to 30000
  /** Timeout for individual tool calls in ms (separate from connection timeout). Defaults to 60000. */
  callTimeout: z.number().positive().optional(),
  retries: z.number().int().min(0).optional(), // number of retry attempts, defaults to 3
  retryDelay: z.number().positive().optional(), // base delay between retries in ms, defaults to 1000
});

const ConfigSchema = z.object({
  servers: z.record(ServerConfigSchema).refine(
    (servers) => Object.keys(servers).length > 0,
    "At least one server must be configured"
  ),
});

// TypeScript interfaces (derived from Zod schemas)
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// SKILLS CONFIG SCHEMA
// =============================================================================

const SkillConfigSchema = z.object({
  enabled: z.boolean().optional(), // defaults to true if omitted
  path: z.string().optional(),     // defaults to ./skills/<skill-name> if omitted
  tags: z.array(z.string()).optional(),
});

const SkillsConfigSchema = z.object({
  skills: z.record(SkillConfigSchema),
});

// TypeScript interfaces for skills
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

/**
 * Loads and validates mcp.json configuration.
 * Uses configPath which can be set via CLI args, env vars, or defaults.
 * @throws Error if file doesn't exist or validation fails
 */
export async function loadConfig(): Promise<Config> {
  let content: string;

  try {
    content = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw new Error(`Failed to read config file: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Config validation failed:\n${issues}`);
  }

  return result.data;
}

/**
 * Loads and validates skills.json configuration.
 * Uses skillsConfigPath which can be set via CLI args, env vars, or defaults.
 * @throws Error if file doesn't exist or validation fails
 */
export async function loadSkillsConfig(): Promise<SkillsConfig> {
  let content: string;

  try {
    content = await readFile(skillsConfigPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Skills config file not found: ${skillsConfigPath}`);
    }
    throw new Error(`Failed to read skills config file: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in skills config file: ${skillsConfigPath}`);
  }

  const result = SkillsConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Skills config validation failed:\n${issues}`);
  }

  return result.data;
}

/**
 * Helper to check if a skill is enabled (defaults to true if not specified)
 */
export function isSkillEnabled(config: SkillConfig): boolean {
  return config.enabled !== false;
}

/**
 * Helper to resolve skill path (defaults to ./skills/<skill-name> if not specified)
 */
export function resolveSkillPath(skillName: string, config: SkillConfig): string {
  return config.path ?? join(__dirname, "..", "skills", skillName);
}

/**
 * Helper to check if a server is enabled (defaults to true if not specified)
 */
export function isServerEnabled(config: ServerConfig): boolean {
  return config.enabled !== false;
}