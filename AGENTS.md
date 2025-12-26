# Agents Guide

This guide explains how LLM-based agents should interact with **Code Executor MCP**. It focuses on the execute_code pattern, wrapper imports, and operational guardrails.

## What this server does
- Executes TypeScript from `workspace/` on demand via MCP tools.
- Lets agents import generated wrappers in `servers/` to call other MCP servers.
- Returns only `console.log` output to the model; everything else stays in the runtime for token efficiency.

## Package management (pnpm only)
> **Mandatory:** Use `pnpm` exclusively for installs and scripts. Do **not** use `npm` or `yarn` for this project.

- Install dependencies: `pnpm install`
- Build: `pnpm build`
- Generate wrappers: `pnpm run gen`

## Core tools for agents
| Tool | When to use |
|------|-------------|
| `get_started` | One-time primer on this server’s capabilities and path conventions. |
| `list_available_servers` | See which MCP servers are enabled in `mcp.json`. |
| `list_server_tools` | Discover tools and parameters for a specific server. |
| `get_tool_schema` | Fetch detailed schema before crafting calls. |
| `execute_code` | Run TypeScript from `workspace/`, import wrappers from `../servers/...`. |
| `run_script` | Execute a checked-in script from `scripts/` (TypeScript). |
| `list_skills` / `read_skill` | Browse skill packs under `skills/` for reference material. |

## Execution model essentials
- **cwd**: All code runs with current working directory `workspace/`.
- **Imports**: Use relative paths like `../servers/<name>/index.js` or specific tool files. Remember `.js` extensions.
- **Logging**: Only `console.log` output is returned to the agent. Keep logs concise to save tokens.
- **State**: Files written with relative paths stay under `workspace/` for isolation.

## Workflow tips
- Load tool definitions on-demand instead of reading every wrapper; this preserves context.
- Favor progressive disclosure: inspect `list_server_tools` first, then open only the needed tool file.
- Validate code with `validate_code` (if available) before executing long workflows to avoid reruns.
- Prefer small, composable helper functions saved in `workspace/` if you need to reuse logic across calls.

## Safety & reliability
- Treat `mcp.json` and any credentials in `env` fields as sensitive; do not log them.
- Avoid excessive logging of large payloads; summarize instead.
- When handling files, stay within `workspace/` unless explicitly required to read project docs (e.g., `../skills/...`).
- Use explicit timeouts in `execute_code` for long-running tasks when appropriate.

## Troubleshooting quick checks
- **Import errors**: Ensure `.js` extensions and correct relative paths from `workspace/`.
- **Missing wrappers**: Run `pnpm run gen` to regenerate after changing `mcp.json`.
- **Server connectivity**: Verify the target MCP server is enabled and healthy; use `check_server_health` / `test_server_connection` when available.

## Recommended agent prompting pattern
1) Call `list_available_servers` to see what’s enabled.
2) Read `mcp.json` if you need descriptions or transport details.
3) Inspect the relevant tool file in `servers/<server>/` for parameters.
4) Write TypeScript that imports only what you need and logs succinct results.
5) Execute via `execute_code`, then iterate based on logged output.

Keep iterations tight, return minimal logs, and remember: **pnpm only.**