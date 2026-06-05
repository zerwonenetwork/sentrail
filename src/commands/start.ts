// =============================================================================
// sentrail start — boot the local MCP interceptor proxy.
// =============================================================================

import chalk from "chalk";
import { isValidApiKey, loadConfig } from "../config.js";
import { startProxy } from "../proxy.js";

export async function runStart(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log(chalk.yellow("\n  No config found. Run `sentrail init` first.\n"));
    process.exitCode = 1;
    return;
  }
  if (!config.apiKey || !config.workspaceId) {
    console.log(chalk.yellow("\n  Config is incomplete (missing API key or workspace). Run `sentrail init`.\n"));
    process.exitCode = 1;
    return;
  }
  // Error case: invalid API key format. Fail fast with a clear message instead
  // of starting a proxy whose every cloud call will be rejected.
  if (!isValidApiKey(config.apiKey)) {
    console.log(chalk.red("\n  Configured API key is not a valid Sentrail key (expected agk_…). Run `sentrail init`.\n"));
    process.exitCode = 1;
    return;
  }
  if (!config.upstreamMcpUrl) {
    console.log(
      chalk.yellow("\n  Warning: no upstream MCP URL configured — tool calls cannot be forwarded.\n"),
    );
  }

  const handle = await startProxy(config);

  console.log(chalk.bold("\n  Sentrail interceptor running\n"));
  console.log(`  ${chalk.dim("Listening")}     http://localhost:${handle.port}`);
  console.log(`  ${chalk.dim("Upstream")}      ${config.upstreamMcpUrl || chalk.yellow("(not set)")}`);
  console.log(`  ${chalk.dim("Cloud")}         ${config.cloudUrl}`);
  console.log(`  ${chalk.dim("Workspace")}     ${config.workspaceId}`);
  console.log(chalk.dim("\n  Every tools/call is checked against your Sentrail policies before it runs."));
  console.log(chalk.dim("  Press Ctrl+C to stop.\n"));

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      console.log(chalk.dim("\n  Shutting down…\n"));
      handle.close().then(resolve).catch(() => resolve());
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
