// =============================================================================
// classifier router — pick a classifier based on the MCP tool name, and extract
// the command string from the tool arguments.
// =============================================================================

import { classifyShellCommand, type Classification, type RiskLevel } from "./shell.js";
import { classifyGitCommand } from "./git.js";

export type { Classification, RiskLevel };
export { classifyShellCommand, classifyGitCommand };

// MCP tool names that coding agents commonly use to run shell commands.
const SHELL_TOOLS = new Set([
  "bash", "shell", "terminal", "execute_command", "run_command", "exec", "command",
]);

// Argument keys that commonly hold the command/code/query string.
const COMMAND_KEYS = ["command", "cmd", "script", "code", "input", "query", "sql"];

/** Pull the most likely command string out of a tool-call arguments object. */
export function extractCommand(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  for (const key of COMMAND_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  // Fall back to concatenating any string-valued arguments.
  return Object.values(args)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .trim();
}

/** Route a tool call to the appropriate classifier. */
export function classifyToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
): Classification {
  const name = (toolName ?? "").toLowerCase();
  const command = extractCommand(args);

  if (SHELL_TOOLS.has(name)) {
    return classifyShellCommand(command);
  }
  if (name === "git") {
    return classifyGitCommand(command);
  }
  return classifyGenericTool(toolName ?? "tool", command);
}

/**
 * Generic fallback for unknown MCP tools — infer risk from the tool name,
 * mirroring the cloud mcp-gate's inferRiskLevel heuristic.
 */
function classifyGenericTool(toolName: string, command: string): Classification {
  const name = toolName.toLowerCase();
  const summary = command ? `${toolName}: ${command.slice(0, 80)}` : `Tool call: ${toolName}`;

  if (/delete|destroy|drop|remove|\brm\b|truncate|purge/.test(name)) {
    return { tool: toolName, action: toolName, riskLevel: "high", summary };
  }
  if (/create|update|write|post|send|merge|deploy|push|exec|run/.test(name)) {
    return { tool: toolName, action: toolName, riskLevel: "medium", summary };
  }
  if (/^(get|list|read|search|fetch|describe|show)/.test(name)) {
    return { tool: toolName, action: toolName, riskLevel: "low", summary };
  }
  return { tool: toolName, action: toolName || "unknown_write", riskLevel: "medium", summary };
}
