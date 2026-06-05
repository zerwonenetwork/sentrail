// =============================================================================
// Placeholder handlers for commands implemented in later Phase 5 batches.
// They are registered now so `sentrail --help` lists the full command surface,
// but they exit cleanly with a notice rather than pretending to work.
// =============================================================================

import chalk from "chalk";

function comingSoon(command: string, arrivesIn: string): void {
  console.log(
    chalk.yellow(`\n  \`sentrail ${command}\` is not available in this build yet.`),
  );
  console.log(chalk.dim(`  It is implemented in ${arrivesIn}.\n`));
}

export function runTest(): void {
  comingSoon("test", "the MCP proxy build (Phase 5 Batch 2)");
}
