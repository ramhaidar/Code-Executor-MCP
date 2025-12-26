# Code Executor MCP - Complete Tools Reference

This document provides detailed documentation for all tools available in Code Executor MCP.

---

## Table of Contents

1. [Discovery Tools](#discovery-tools)
   - [get_started](#get_started)
   - [list_available_servers](#list_available_servers)
   - [list_servers](#list_servers)
   - [list_servers_metadata](#list_servers_metadata)
   - [list_server_tools](#list_server_tools)
   - [get_tool_schema](#get_tool_schema)

2. [Code Execution Tools](#code-execution-tools)
   - [execute_code](#execute_code)
   - [run_script](#run_script)
   - [validate_code](#validate_code)

3. [Skills Tools](#skills-tools)
   - [list_skills](#list_skills)
   - [list_skills_metadata](#list_skills_metadata)
   - [read_skill](#read_skill)

4. [Workspace Tools](#workspace-tools)
   - [list_workspace_files](#list_workspace_files)
   - [read_workspace_file](#read_workspace_file)
   - [list_scripts](#list_scripts)

5. [Diagnostics Tools](#diagnostics-tools)
   - [check_server_health](#check_server_health)
   - [test_server_connection](#test_server_connection)
   - [get_server_stderr](#get_server_stderr)

---

## Discovery Tools

### get_started

**Description:** Get a quick tutorial on how to use Code Executor MCP. Call this FIRST when starting a new session to learn the correct workflow and avoid common mistakes.

**Parameters:** None

**Returns:** A comprehensive tutorial covering:
- Essential workflow (discover → list tools → get schema → execute)
- Correct import patterns
- Common mistakes to avoid
- Code templates
- Key features

**Example:**
```
Tool: get_started
Args: {}
```

> **Note:** By default, this tool must be called first before using any other tools. Other tools will return a blocking error if `get_started` hasn't been called in the session.
>
> To disable this blocking requirement:
> - Set environment variable: `CODE_EXECUTOR_SKIP_GET_STARTED=true`
> - Or use CLI argument: `--skip-get-started`
>
> Even with blocking disabled, calling `get_started` is recommended for learning the correct workflow and import patterns.

---

### list_available_servers

**Description:** List MCP servers that are enabled and have wrappers generated. Quick way to see what's ready to use.

**Parameters:** None

**Returns:**
```json
{
  "servers": [
    {
      "name": "context7",
      "wrapperDir": "context7",
      "tools": ["resolve-library-id", "get-library-docs"],
      "status": "ready"
    }
  ],
  "orphanedWrappers": [],
  "summary": {
    "ready": 1,
    "disabled": 0,
    "noWrapper": 0,
    "orphaned": 0
  }
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `ready` | Server is enabled and wrapper exists |
| `disabled` | Server is disabled in `mcp.json` |
| `no-wrapper` | Server is enabled but no wrapper generated (run `pnpm run gen`) |

**Example:**
```
Tool: list_available_servers
Args: {}
```

---

### list_servers

**Description:** List available MCP server wrappers in the `servers/` directory.

**Parameters:** None

**Returns:**
```json
{
  "servers": ["context7", "filesystem"]
}
```

**Example:**
```
Tool: list_servers
Args: {}
```

---

### list_servers_metadata

**Description:** Get name and description of all configured MCP servers. Use this for a quick overview of available servers without connecting to them.

**Parameters:** None

**Returns:**
```json
{
  "servers": [
    {
      "name": "context7",
      "description": "Fetches up-to-date library documentation and code examples"
    }
  ]
}
```

**Example:**
```
Tool: list_servers_metadata
Args: {}
```

---

### list_server_tools

**Description:** List available tools for a specific MCP server wrapper with import examples and parameter info.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | string | Yes | Server name (e.g., 'context7') |

**Returns:** Formatted text output containing:
- Server name
- Import all statement
- For each tool:
  - Name
  - Import statement
  - Usage example
  - Required parameters
  - Optional parameters
  - Enum constraints (if any)

**Example:**
```
Tool: list_server_tools
Args: { "server": "context7" }
```

**Sample Output:**
```
Server: context7
Import all: import * as context7 from '../servers/context7/index.js';

Tools:
  - resolve-library-id
    Import: import * as tool from '../servers/context7/resolve-library-id.js';
    Usage: await tool.call({ libraryName: "..." });
    Required params: libraryName
    Optional params: (none)

  - get-library-docs
    Import: import * as tool from '../servers/context7/get-library-docs.js';
    Usage: await tool.call({ context7CompatibleLibraryID: "..." });
    Required params: context7CompatibleLibraryID
    Optional params: topic, tokens
```

---

### get_tool_schema

**Description:** Get the full JSON schema for a specific tool, including required/optional parameters and types.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | string | Yes | Server name (e.g., 'context7') |
| `tool` | string | Yes | Tool name (e.g., 'get-library-docs') |

**Returns:**
```json
{
  "server": "context7",
  "tool": "get-library-docs",
  "schema": {
    "type": "object",
    "properties": {
      "context7CompatibleLibraryID": {
        "type": "string",
        "description": "The library ID"
      },
      "topic": {
        "type": "string",
        "description": "Optional topic to focus on"
      }
    },
    "required": ["context7CompatibleLibraryID"]
  },
  "parameters": [
    {
      "name": "context7CompatibleLibraryID",
      "type": "string",
      "required": true,
      "description": "The library ID"
    },
    {
      "name": "topic",
      "type": "string",
      "required": false,
      "description": "Optional topic to focus on"
    }
  ]
}
```

**Example:**
```
Tool: get_tool_schema
Args: { "server": "context7", "tool": "get-library-docs" }
```

---

## Code Execution Tools

### execute_code

**Description:** Execute TypeScript code that can import from `servers/` wrappers and `skills/`. Validates syntax by default before execution to catch errors early. Adds optional auto-cleanup to close MCP connections and let the process exit once work is done. Supports both static imports (`import { x } from 'y'`) and dynamic imports (`await import('y')`).

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | Yes | - | TypeScript code to execute. Can import from `../servers/<server>` and read from `../skills/`. |
| `timeout` | number | No | 120000 | Execution timeout in milliseconds |
| `autoExit` | boolean | No | true | Auto-clean up MCP connections when the event loop goes idle. Set to false if you need to manage cleanup manually. |
| `validate` | boolean | No | true | Validate TypeScript syntax before execution. Set to false to skip validation for faster execution. |

**Returns:**
```json
{
  "exitCode": 0,
  "stdout": "...",
  "stderr": ""
}
```

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Execution error |
| 124 | Timeout exceeded |

**Import Patterns:**
```typescript
// Pattern 1: Import entire server
import * as context7 from '../servers/context7/index.js';
await context7.resolveLibraryId.call({ libraryName: "react" });

// Pattern 2: Import specific tool
import { resolveLibraryId } from '../servers/context7/index.js';
await resolveLibraryId.call({ libraryName: "react" });

// Pattern 3: Direct file import
import * as tool from '../servers/context7/resolve-library-id.js';
await tool.call({ libraryName: "react" });
```

**Example:**
```
Tool: execute_code
Args: {
  "code": "import * as context7 from '../servers/context7/index.js';\n\nconst result = await context7.resolveLibraryId.call({ libraryName: 'react' });\nconsole.log(JSON.stringify(result, null, 2));",
  "timeout": 60000
}
```

**Important Notes:**
- Code runs from `workspace/` directory as the current working directory
- Only `console.log` output is captured and returned
- Use `.call()` on tool wrappers - they are objects, not functions
- ESM requires explicit `.js` extensions in imports

---

### run_script

**Description:** Run a TypeScript script file from the `scripts/` directory.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filename` | string | Yes | - | Script filename (e.g., 'demo.ts') |
| `timeout` | number | No | 120000 | Execution timeout in milliseconds |

**Returns:**
```json
{
  "exitCode": 0,
  "stdout": "...",
  "stderr": ""
}
```

**Example:**
```
Tool: run_script
Args: { "filename": "demo.ts" }
```

---

### validate_code

**Description:** Validate TypeScript code syntax before execution. Checks for syntax errors without running the code. Useful for catching typos and malformed code early.

> **Note:** `execute_code` now validates by default, so this tool is mainly useful for checking code without executing it.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | TypeScript code to validate |

**Returns:**
```json
{
  "valid": true,
  "errors": null,
  "hint": "Code syntax is valid. You can proceed with execute_code."
}
```

Or on error:
```json
{
  "valid": false,
  "errors": "error TS1005: ';' expected...",
  "hint": "Fix the errors above before executing the code."
}
```

**Example:**
```
Tool: validate_code
Args: { "code": "const x: string = 'hello';\nconsole.log(x);" }
```

---

## Skills Tools

### list_skills

**Description:** List available skills in `skills/` directory.

**Parameters:** None

**Returns:**
```json
{
  "skills": [
    {
      "name": "context7-usage",
      "description": "How to use Context7 MCP for library documentation",
      "tags": ["mcp", "documentation"]
    }
  ]
}
```

**Example:**
```
Tool: list_skills
Args: {}
```

---

### list_skills_metadata

**Description:** Get name and description of all enabled skills. Use this for a quick overview of available skills without reading full content.

**Parameters:** None

**Returns:**
```json
{
  "skills": [
    {
      "name": "context7-usage",
      "description": "How to use Context7 MCP for library documentation"
    }
  ]
}
```

**Example:**
```
Tool: list_skills_metadata
Args: {}
```

---

### read_skill

**Description:** Read the content of a skill's `SKILL.md` file or other files within the skill directory.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skill` | string | Yes | Skill name (e.g., 'time-helper') |
| `file` | string | No | Optional specific file path within skill (e.g., 'references/iana_timezones.md') |

**Returns:** The content of the requested file (text).

**Example - Read main SKILL.md:**
```
Tool: read_skill
Args: { "skill": "context7-usage" }
```

**Example - Read specific file within skill:**
```
Tool: read_skill
Args: { "skill": "time-helper", "file": "references/iana_timezones.md" }
```

---

## Workspace Tools

### list_workspace_files

**Description:** List files in the `workspace/` directory.

**Parameters:** None

**Returns:**
```json
{
  "files": ["output.json", "data.txt"]
}
```

> **Note:** Temporary files (starting with `_temp_`) are filtered out from the list.

**Example:**
```
Tool: list_workspace_files
Args: {}
```

---

### read_workspace_file

**Description:** Read a file from the `workspace/` directory.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filename` | string | Yes | Filename to read from workspace/ |

**Returns:** The content of the file (text).

**Example:**
```
Tool: read_workspace_file
Args: { "filename": "output.json" }
```

---

### list_scripts

**Description:** List available script files in `scripts/` directory.

**Parameters:** None

**Returns:**
```json
{
  "scripts": ["demo.ts", "diagnose.ts", "test-config.ts"]
}
```

**Example:**
```
Tool: list_scripts
Args: {}
```

---

## Diagnostics Tools

### check_server_health

**Description:** Check the health and configuration of an MCP server. Use this to diagnose connection issues.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | string | No | Server name to check. If omitted, lists all configured servers. |

**Returns (without server parameter):**
```json
{
  "servers": [
    {
      "name": "context7",
      "enabled": true,
      "hasWrapper": true
    }
  ],
  "hint": "Use check_server_health with a specific server name for detailed diagnostics"
}
```

**Returns (with server parameter):**
```json
{
  "server": "context7",
  "status": "healthy",
  "enabled": true,
  "hasWrapper": true,
  "command": "node",
  "args": ["mcps/context7-mcp/dist/index.js"],
  "note": "Health checks run in the MCP server process..."
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `healthy` | Server is configured and accessible |
| `disabled` | Server is disabled in config |
| `no-wrapper` | No wrapper generated |
| `error` | Configuration or connection error |

**Example:**
```
Tool: check_server_health
Args: { "server": "context7" }
```

---

### test_server_connection

**Description:** Test connecting to an MCP server and measure connection time. Forces a fresh connection.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | string | Yes | Server name to test connection |

**Returns:**
```json
{
  "server": "context7",
  "success": true,
  "connectionTimeMs": 1234,
  "toolCount": 2,
  "tools": ["resolve-library-id", "get-library-docs"]
}
```

Or on failure:
```json
{
  "server": "context7",
  "success": false,
  "error": "Connection timeout after 30000ms"
}
```

**Example:**
```
Tool: test_server_connection
Args: { "server": "context7" }
```

---

### get_server_stderr

**Description:** Get the captured stderr output from a server's last connection attempt. Useful for debugging.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | string | Yes | Server name to get stderr for |

**Returns:**
```json
{
  "server": "context7",
  "stderr": "Server started on port 3000\nLoaded 2 tools"
}
```

Or if no stderr captured:
```json
{
  "server": "context7",
  "stderr": null,
  "message": "No stderr captured. The server may not have been connected yet or produced no stderr output."
}
```

**Example:**
```
Tool: get_server_stderr
Args: { "server": "context7" }
```

---

## Workflow Summary

### Recommended Workflow

1. **Start session** → Call `get_started` to learn the patterns
2. **Discover servers** → Call `list_available_servers` to see ready servers
3. **Explore tools** → Call `list_server_tools` for a specific server
4. **Get details** → Call `get_tool_schema` for full parameter info
5. **Execute code** → Call `execute_code` with your TypeScript code

### Import Cheat Sheet

```typescript
// ✅ Correct patterns
import * as server from '../servers/context7/index.js';
await server.resolveLibraryId.call({ libraryName: "react" });

// ❌ Common mistakes
import { x } from '../servers/context7'     // Missing /index.js
import { x } from '../servers/context7/index' // Missing .js
await tool({ args })                         // Missing .call()
```

### Quick Reference

| Need | Tool |
|------|------|
| Tutorial | `get_started` |
| What servers exist? | `list_available_servers` |
| What tools does a server have? | `list_server_tools` |
| Full parameter details | `get_tool_schema` |
| Run TypeScript code | `execute_code` |
| Run saved script | `run_script` |
| Check syntax only | `validate_code` |
| Server not working? | `check_server_health`, `test_server_connection` |
| Debug server errors | `get_server_stderr` |