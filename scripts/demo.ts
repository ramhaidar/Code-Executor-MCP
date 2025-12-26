import * as fs from "fs/promises";
import { connectServer, disconnectAll } from "../src/mcp.js";
import * as context7 from "../servers/context7/index.js";

async function main() {
  console.log("=== Code Executor MCP Demo ===\n");

  // 1. Connect to MCP server
  console.log("1. Connecting to context7 MCP server...");
  await connectServer("context7");
  console.log("   Connected!");

  // 2. Demonstrate MCP tool usage
  console.log("\n2. Looking up library ID for 'luxon'...");
  try {
    const libraryId = await context7.resolveLibraryId.call({ libraryName: "luxon" });
    console.log("   Library ID:", JSON.stringify(libraryId, null, 2));
  } catch (err) {
    console.log("   Error:", (err as Error).message);
  }

  // 3. Read skill reference materials
  console.log("\n3. Reading skill reference...");
  const skillContent = await fs.readFile("./skills/time-helper/SKILL.md", "utf-8");

  // Parse YAML frontmatter to extract skill name and description (handle CRLF/LF)
  const frontmatterMatch = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    const skillName = nameMatch ? nameMatch[1].trim() : "unknown";
    const skillDesc = descMatch ? descMatch[1].trim() : "No description";
    console.log(`   Skill: ${skillName}`);
    console.log(`   Description: ${skillDesc}`);
  } else {
    console.log("   Skill loaded (no frontmatter found)");
  }

  // 4. Write output to workspace
  console.log("\n4. Writing to workspace...");
  await fs.mkdir("./workspace", { recursive: true });
  await fs.writeFile(
    "./workspace/demo-result.json",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message: "Demo completed successfully",
    }, null, 2)
  );
  console.log("   Wrote workspace/demo-result.json");

  // 5. Disconnect
  console.log("\n5. Disconnecting...");
  await disconnectAll();
  console.log("   Disconnected!");

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);