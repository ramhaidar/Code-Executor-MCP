import { loadConfig, getConfigPath } from "../src/config.js";

async function main() {
  console.log("CONFIG_PATH:", getConfigPath());
  const config = await loadConfig();
  console.log("Loaded config:", JSON.stringify(config, null, 2));
  console.log("context7 command:", config.servers.context7.command);
}

main().catch(console.error);