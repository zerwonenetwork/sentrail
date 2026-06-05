#!/usr/bin/env node
// =============================================================================
// sentrail — local interceptor CLI entry point
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runStart } from "./commands/start.js";
import { runDemo } from "./commands/demo.js";
import { runTest } from "./commands/placeholder.js";

const program = new Command();

program
  .name("sentrail")
  .description(
    "Sentrail local interceptor — enforce allow/block/approval policies on AI " +
      "coding agent tool calls before they execute.",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Interactive setup: API key, workspace, upstream MCP URL, port")
  .action(async () => {
    await runInit();
  });

program
  .command("start")
  .description("Start the local MCP proxy server")
  .action(async () => {
    await runStart();
  });

program
  .command("status")
  .description("Show connection status, policy sync, and recent blocks")
  .action(async () => {
    await runStatus();
  });

program
  .command("test")
  .description("Run a simulated destructive action to verify blocking works")
  .action(() => {
    runTest();
  });

program
  .command("demo")
  .description("Run the full demo sequence (rm -rf, force push, DROP TABLE, …)")
  .action(async () => {
    await runDemo();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exitCode = 1;
});
