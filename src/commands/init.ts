// =============================================================================
// sentrail init — interactive first-run setup
// =============================================================================

import chalk from "chalk";
import {
  DEFAULT_CLOUD_URL,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  LOG_LEVELS,
  type LogLevel,
  type SentrailConfig,
  CONFIG_PATH,
  isValidApiKey,
  isValidHttpUrl,
  isValidPort,
  loadConfig,
  mcpConfigSnippet,
  saveConfig,
} from "../config.js";
import { createPrompter } from "../prompt.js";

export async function runInit(): Promise<void> {
  console.log(chalk.bold("\n  Sentrail CLI setup\n"));
  console.log(
    chalk.dim(
      "  This writes ~/.sentrail/config.json. Your API key is stored locally\n" +
        "  with 0600 permissions and never leaves your machine except to call\n" +
        "  the Sentrail cloud you configure below.\n",
    ),
  );

  const existing = await loadConfig();
  if (existing) {
    console.log(chalk.yellow(`  An existing config was found at ${CONFIG_PATH}.`));
    console.log(chalk.dim("  Press enter to keep the current value shown in parentheses.\n"));
  }

  const prompter = createPrompter();
  try {
    const apiKey = await prompter.ask("Sentrail API key (agk_…)", {
      defaultValue: existing?.apiKey,
      validate: (v) =>
        isValidApiKey(v) ? null : "Must look like agk_… (at least 8 characters after the prefix).",
    });

    const workspaceId = await prompter.ask("Workspace ID", {
      defaultValue: existing?.workspaceId,
      validate: (v) => (v.trim().length > 0 ? null : "Workspace ID is required."),
    });

    const upstreamMcpUrl = await prompter.ask("Upstream MCP server URL", {
      defaultValue: existing?.upstreamMcpUrl,
      validate: (v) =>
        v.trim().length === 0 || isValidHttpUrl(v)
          ? null
          : "Must be a valid http(s) URL (or leave blank to set later).",
    });

    const cloudUrl = await prompter.ask("Sentrail cloud URL", {
      defaultValue: existing?.cloudUrl ?? DEFAULT_CLOUD_URL,
      validate: (v) => (isValidHttpUrl(v) ? null : "Must be a valid http(s) URL."),
    });

    const port = Number(
      await prompter.ask("Local proxy port", {
        defaultValue: String(existing?.port ?? DEFAULT_PORT),
        validate: (v) =>
          isValidPort(Number(v)) ? null : "Must be an integer between 1 and 65535.",
      }),
    );

    const logLevel = (await prompter.ask(`Log level (${LOG_LEVELS.join(" | ")})`, {
      defaultValue: existing?.logLevel ?? DEFAULT_LOG_LEVEL,
      validate: (v) =>
        LOG_LEVELS.includes(v as LogLevel) ? null : `Must be one of: ${LOG_LEVELS.join(", ")}.`,
    })) as LogLevel;

    const config: SentrailConfig = {
      apiKey,
      workspaceId,
      upstreamMcpUrl,
      cloudUrl,
      port,
      logLevel,
    };

    await saveConfig(config);
    console.log(chalk.green(`\n  ✓ Saved ${CONFIG_PATH}\n`));

    printMcpInstructions(config);
  } finally {
    prompter.close();
  }
}

function printMcpInstructions(config: SentrailConfig): void {
  console.log(chalk.bold("  Connect your coding agent\n"));
  console.log(
    chalk.dim("  Add this to your MCP config (e.g., ~/.claude/mcp.json or your\n" +
      "  Cursor / Codex MCP settings):\n"),
  );
  console.log(indent(mcpConfigSnippet(config)));
  console.log(
    chalk.dim(`\n  Then start the interceptor:  ${chalk.reset.bold("sentrail start")}\n`),
  );
}

function indent(text: string, spaces = 4): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
