// =============================================================================
// config — load / save / validate the Sentrail CLI configuration
// =============================================================================
// Config lives at ~/.sentrail/config.json and holds the credentials and
// endpoints the local proxy needs. The file is written with 0600 permissions
// because it contains an API key.
// =============================================================================

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SentrailConfig {
  /** Sentrail gateway API key (agk_...). */
  apiKey: string;
  /** Workspace the agent acts within. */
  workspaceId: string;
  /** Upstream MCP server the proxy forwards allowed calls to. */
  upstreamMcpUrl: string;
  /** Base URL of the Sentrail cloud edge functions. */
  cloudUrl: string;
  /** Local port the proxy listens on. */
  port: number;
  /** Logging verbosity. */
  logLevel: LogLevel;
}

export const DEFAULT_CLOUD_URL = "https://hnqedtdheqreqdvpjmyw.supabase.co/functions/v1";
export const DEFAULT_PORT = 3773;
export const DEFAULT_LOG_LEVEL: LogLevel = "info";
export const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export const CONFIG_DIR = join(homedir(), ".sentrail");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/** Sentrail gateway keys are `agk_` followed by a URL-safe token. */
export function isValidApiKey(key: string): boolean {
  return /^agk_[A-Za-z0-9_-]{8,}$/.test(key.trim());
}

/** A best-effort http(s) URL check. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** Mask an API key for display: agk_ab…cd. */
export function maskApiKey(key: string): string {
  if (!key) return "(not set)";
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Load and lightly validate the config. Returns null when none exists. */
export async function loadConfig(): Promise<SentrailConfig | null> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  const parsed = JSON.parse(raw) as Partial<SentrailConfig>;
  return {
    apiKey: String(parsed.apiKey ?? ""),
    workspaceId: String(parsed.workspaceId ?? ""),
    upstreamMcpUrl: String(parsed.upstreamMcpUrl ?? ""),
    cloudUrl: String(parsed.cloudUrl ?? DEFAULT_CLOUD_URL),
    port: Number(parsed.port ?? DEFAULT_PORT),
    logLevel: (LOG_LEVELS.includes(parsed.logLevel as LogLevel)
      ? (parsed.logLevel as LogLevel)
      : DEFAULT_LOG_LEVEL),
  };
}

/** Persist the config to ~/.sentrail/config.json with 0600 permissions. */
export async function saveConfig(config: SentrailConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** The MCP config snippet a user pastes into their agent (Claude Code / Cursor). */
export function mcpConfigSnippet(config: Pick<SentrailConfig, "port">): string {
  const block = {
    mcpServers: {
      sentrail: {
        url: `http://localhost:${config.port}`,
      },
    },
  };
  return JSON.stringify(block, null, 2);
}
