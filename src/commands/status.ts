// =============================================================================
// sentrail status — show configuration and (later) live proxy status
// =============================================================================

import chalk from "chalk";
import { CONFIG_PATH, loadConfig, maskApiKey } from "../config.js";

export async function runStatus(): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    console.log(chalk.yellow("\n  No config found. Run `sentrail init` first.\n"));
    return;
  }

  console.log(chalk.bold("\n  Sentrail configuration\n"));
  console.log(`  ${chalk.dim("Config file")}    ${CONFIG_PATH}`);
  console.log(`  ${chalk.dim("API key")}        ${maskApiKey(config.apiKey)}`);
  console.log(`  ${chalk.dim("Workspace")}      ${config.workspaceId || chalk.red("(not set)")}`);
  console.log(`  ${chalk.dim("Upstream MCP")}   ${config.upstreamMcpUrl || chalk.yellow("(not set)")}`);
  console.log(`  ${chalk.dim("Cloud URL")}      ${config.cloudUrl}`);
  console.log(`  ${chalk.dim("Proxy port")}     ${config.port}`);
  console.log(`  ${chalk.dim("Log level")}      ${config.logLevel}`);

  // Live status (policy sync, recent blocks, connection health) is reported
  // once the proxy server lands in a later build.
  console.log(chalk.dim("\n  Live proxy status will appear here once `sentrail start` is available.\n"));
}
