// =============================================================================
// shell classifier — map a shell/bash command string to a Sentrail action.
// =============================================================================
// Mirrors the cloud action-classifier philosophy: a canonical action name plus
// a server-meaningful risk level. The local proxy sends these to the cloud
// policy engine (as tool="mcp") so existing policies can match on the action.
// =============================================================================

import { classifyGitCommand } from "./git.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Classification {
  /** Which classifier matched: "shell", "git", or the upstream tool name. */
  tool: string;
  /** Canonical action string (e.g. "file.delete_recursive"). */
  action: string;
  riskLevel: RiskLevel;
  /** Human-readable one-liner for terminal output. */
  summary: string;
}

const READ_ONLY_COMMANDS = new Set([
  "ls", "cat", "grep", "find", "echo", "pwd", "whoami", "head", "tail",
  "less", "more", "stat", "file", "which", "env", "date", "wc", "tree",
  "du", "df", "ps", "top", "uname", "hostname", "id", "history",
]);

function isGitInvocation(command: string): boolean {
  // git as the first token, or after a separator/pipe.
  return /(?:^|[\s;&|])git\s+\w/i.test(command);
}

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function classifyShellCommand(rawCommand: string): Classification {
  const command = (rawCommand ?? "").trim();
  const c = command.toLowerCase();

  if (!command) {
    return { tool: "shell", action: "shell.read", riskLevel: "low", summary: "Empty command" };
  }

  // --- critical, non-git ----------------------------------------------------
  if (/\b(curl|wget)\b[^|]*\|\s*(bash|sh|zsh)\b/i.test(c)) {
    return {
      tool: "shell",
      action: "shell.remote_exec",
      riskLevel: "critical",
      summary: "Pipe a remote script straight into a shell",
    };
  }

  if (/\brm\s+(-\w*r\w*|--recursive)\b/i.test(c)) {
    return {
      tool: "shell",
      action: "file.delete_recursive",
      riskLevel: "critical",
      summary: "Recursive file deletion (rm -rf)",
    };
  }

  if (/\b(drop\s+(table|database)|truncate)\b/i.test(c)) {
    return {
      tool: "shell",
      action: "sql.destructive",
      riskLevel: "critical",
      summary: "Destructive SQL (DROP/TRUNCATE)",
    };
  }

  // --- git commands get the dedicated git classifier ------------------------
  if (isGitInvocation(command)) {
    return classifyGitCommand(command);
  }

  // --- high -----------------------------------------------------------------
  if (/\bchmod\b[^|;&]*\b777\b/i.test(c)) {
    return {
      tool: "shell",
      action: "file.permission_change",
      riskLevel: "high",
      summary: "World-writable permission change (chmod 777)",
    };
  }

  if (/\bdocker\s+(rm|rmi)\b/i.test(c)) {
    return {
      tool: "shell",
      action: "container.delete",
      riskLevel: "high",
      summary: "Delete a Docker container/image",
    };
  }

  if (/\bkubectl\s+delete\b/i.test(c)) {
    return {
      tool: "shell",
      action: "k8s.delete",
      riskLevel: "high",
      summary: "Delete a Kubernetes resource",
    };
  }

  if (/\bsudo\b/i.test(c)) {
    return {
      tool: "shell",
      action: "shell.sudo",
      riskLevel: "high",
      summary: "Elevated command (sudo)",
    };
  }

  // --- read-only ------------------------------------------------------------
  if (READ_ONLY_COMMANDS.has(firstToken(command))) {
    return {
      tool: "shell",
      action: "shell.read",
      riskLevel: "low",
      summary: "Read-only shell command",
    };
  }

  // --- default: unmatched write-like ----------------------------------------
  return {
    tool: "shell",
    action: "unknown_write",
    riskLevel: "medium",
    summary: "Unclassified shell command",
  };
}
