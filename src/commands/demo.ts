// =============================================================================
// sentrail demo — fully simulated walkthrough (no cloud, no upstream needed).
// =============================================================================
// Runs four representative tool calls through the real classifier and shows the
// decision Sentrail would make. This is the 15-minute-call demo, so the output
// is paced and color-coded to read like a live interception stream.
// =============================================================================

import chalk from "chalk";
import { loadConfig } from "../config.js";
import { classifyToolCall, type Classification } from "../classifiers/index.js";
import { createPrompter } from "../prompt.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const STEP_PAUSE = 750;
const LINE_PAUSE = 450;

const RISK_COLORS = {
  low: chalk.green,
  medium: chalk.yellow,
  high: chalk.hex("#ff8c00"),
  critical: chalk.red,
} as const;

function riskBadge(c: Classification): string {
  return RISK_COLORS[c.riskLevel](`${c.action} · ${c.riskLevel}`);
}

/** Print the inbound agent tool call and its server-side classification. */
async function announce(toolName: string, command: string): Promise<Classification> {
  console.log(`${chalk.dim("  ▸ agent calls")} ${chalk.bold(toolName)} ${chalk.dim("→")} ${command}`);
  await sleep(LINE_PAUSE);
  const classification = classifyToolCall(toolName, { command });
  console.log(`    ${chalk.dim("classified")}  ${riskBadge(classification)}`);
  await sleep(LINE_PAUSE);
  return classification;
}

export async function runDemo(): Promise<void> {
  console.log(chalk.bold.cyan("\n  ╭───────────────────────────────────────────────────────────╮"));
  console.log(chalk.bold.cyan("  │   Sentrail — live policy interception (simulated demo)     │"));
  console.log(chalk.bold.cyan("  ╰───────────────────────────────────────────────────────────╯\n"));

  const config = await loadConfig();
  if (!config) {
    console.log(chalk.yellow("  ⚠ Not initialized — running in simulation mode (run `sentrail init` for real use).\n"));
  } else {
    console.log(chalk.dim(`  Workspace ${config.workspaceId} · cloud ${config.cloudUrl}`));
    console.log(chalk.dim("  (this demo is simulated — no calls are made to the cloud or any upstream)\n"));
  }
  await sleep(STEP_PAUSE);

  let blocked = 0;
  let approvalGated = 0;
  let allowed = 0;

  // --- 1. rm -rf → BLOCK ----------------------------------------------------
  console.log(chalk.bold("  1 · destructive file deletion"));
  await announce("bash", "rm -rf /tmp/sentrail-demo-dir");
  console.log(chalk.red("    🛑 BLOCKED — Destructive file deletion (rm -rf) blocked by Sentrail policy\n"));
  blocked++;
  await sleep(STEP_PAUSE);

  // --- 2. git push --force → REQUIRE APPROVAL -------------------------------
  console.log(chalk.bold("  2 · force push to a protected branch"));
  await announce("bash", "git push --force origin main");
  console.log(chalk.yellow("    ⏳ APPROVAL REQUIRED — Force push to main requires human approval"));
  await sleep(LINE_PAUSE);

  const prompter = createPrompter();
  let approved = false;
  try {
    const answer = await prompter.ask("    Approve this action? (y/n)", {
      defaultValue: "y",
      validate: (v) =>
        /^(y|yes|n|no)$/i.test(v.trim()) ? null : "Please answer y or n.",
    });
    approved = /^(y|yes)$/i.test(answer.trim());
  } finally {
    prompter.close();
  }

  if (approved) {
    console.log(chalk.green("    ✅ APPROVED — Action forwarded to upstream\n"));
  } else {
    console.log(chalk.red("    ❌ DENIED — Action rejected by policy reviewer\n"));
  }
  approvalGated++;
  await sleep(STEP_PAUSE);

  // --- 3. DROP TABLE → BLOCK ------------------------------------------------
  console.log(chalk.bold("  3 · destructive SQL"));
  await announce("bash", "psql -c 'DROP TABLE users'");
  console.log(chalk.red("    🛑 BLOCKED — Destructive SQL operation (DROP TABLE) blocked by Sentrail policy\n"));
  blocked++;
  await sleep(STEP_PAUSE);

  // --- 4. cat README → ALLOW ------------------------------------------------
  console.log(chalk.bold("  4 · read-only command"));
  await announce("bash", "cat README.md");
  console.log(chalk.green("    ✅ ALLOWED — Read-only operation permitted\n"));
  allowed++;
  await sleep(STEP_PAUSE);

  // --- summary --------------------------------------------------------------
  console.log(chalk.bold("  ───────────────────────────────────────────────────────────"));
  console.log(
    `  ${chalk.bold("4 actions evaluated:")} ` +
      `${chalk.red(`${blocked} blocked`)}, ` +
      `${chalk.yellow(`${approvalGated} approval-gated`)}, ` +
      `${chalk.green(`${allowed} allowed`)}.`,
  );
  console.log(chalk.dim("\n  Your agents are governed."));
  console.log(
    `  ${chalk.dim("Run")} ${chalk.bold("sentrail start")} ${chalk.dim("to protect your real workflows.")}\n`,
  );
}
