// =============================================================================
// git classifier — finer-grained classification for git operations.
// =============================================================================

import type { Classification } from "./shell.js";

const PROTECTED_BRANCH = /\b(main|master|prod|production)\b/i;

export function classifyGitCommand(rawCommand: string): Classification {
  const raw = (rawCommand ?? "").trim();
  // The router may pass a bare subcommand (e.g. "push --force") when the MCP
  // tool itself is named "git". Normalize so the regexes below always see a
  // full "git …" invocation. Case is preserved for the -D check.
  const command = /^git\b/i.test(raw) ? raw : `git ${raw}`;
  const c = command.toLowerCase();

  const isPush = /\bgit\s+push\b/.test(c);
  const isForce = isPush && /(--force\b|--force-with-lease\b|\s-f\b)/.test(c);

  if (isForce) {
    const protectedTarget = PROTECTED_BRANCH.test(c);
    return {
      tool: "git",
      action: "git.force_push",
      riskLevel: "critical",
      summary: protectedTarget
        ? "Force push to a protected branch (main/master/prod)"
        : "Force push (rewrites remote history)",
    };
  }

  if (/\bgit\s+reset\s+--hard\b/.test(c)) {
    return {
      tool: "git",
      action: "git.reset_hard",
      riskLevel: "high",
      summary: "Hard reset discards local changes",
    };
  }

  // -D is case-sensitive (force delete); check the original command.
  if (/\bgit\s+branch\s+-D\b/.test(command)) {
    return {
      tool: "git",
      action: "git.branch_delete",
      riskLevel: "medium",
      summary: "Force-delete a git branch",
    };
  }

  if (isPush) {
    return {
      tool: "git",
      action: "git.push",
      riskLevel: "medium",
      summary: "Git push",
    };
  }

  return {
    tool: "git",
    action: "git.command",
    riskLevel: "low",
    summary: "Git operation",
  };
}
