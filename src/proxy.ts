// =============================================================================
// proxy — the local MCP interceptor.
// =============================================================================
// Runs an HTTP JSON-RPC MCP server that a coding agent (Claude Code / Cursor /
// Codex) connects to. Every tools/call is classified and checked against the
// Sentrail cloud policy engine BEFORE it is forwarded to the real upstream MCP
// server. allow → forward; block → MCP error; require_approval → poll for a
// human decision, then forward or reject.
//
// initialize / tools/list / ping are passed through to the upstream. Any other
// method is denied by default (consistent with the cloud mcp-gate), so an agent
// cannot route side-effecting work around the policy engine.
//
// Implemented with Node's http module + fetch (no MCP SDK dependency) so it
// stays small, dependency-light, and unit-testable. The wire format matches the
// cloud mcp-gate (JSON-RPC over HTTP POST).
// =============================================================================

import { createServer, type Server } from "node:http";
import { classifyToolCall, extractCommand, type Classification } from "./classifiers/index.js";
import { createLogger, type Logger } from "./logger.js";
import type { SentrailConfig } from "./config.js";

const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
const APPROVAL_POLL_INTERVAL_MS = 3_000;

// Per-request network timeouts so a slow/hung cloud or upstream never hangs the
// agent. On timeout the fetch rejects (AbortError) and the caller fails closed
// (cloud) or returns a clear MCP error (upstream).
const CLOUD_TIMEOUT_MS = 15_000;
const UPSTREAM_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 10_000;

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

// ---------------------------------------------------------------------------
// Minimal structural types so we don't depend on lib.dom for fetch/Response.
// ---------------------------------------------------------------------------
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
}

export interface Decision {
  decision: "allow" | "block" | "require_approval";
  reason: string;
  policyName?: string | null;
  approvalRequestId?: string | null;
}

export type ApprovalOutcome = "approved" | "denied" | "timeout";

export interface ProxyDeps {
  fetchImpl: FetchLike;
  logger: Logger;
  approvalTimeoutMs: number;
  pollIntervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ProxyOptions {
  fetchImpl?: FetchLike;
  logger?: Logger;
  approvalTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface ProxyHandle {
  port: number;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function resolveDeps(options: ProxyOptions, config: SentrailConfig): ProxyDeps {
  const g = globalThis as unknown as { fetch?: FetchLike };
  return {
    fetchImpl: options.fetchImpl ?? g.fetch!,
    logger: options.logger ?? createLogger(config.logLevel),
    approvalTimeoutMs: options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs ?? APPROVAL_POLL_INTERVAL_MS,
    sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: options.now ?? Date.now,
  };
}

// ---------------------------------------------------------------------------
// Upstream forwarding
// ---------------------------------------------------------------------------

/** Parse an upstream response body that may be JSON or an SSE event stream. */
function parseMaybeSse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Streamable-HTTP servers may return text/event-stream: pull the last data line.
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    for (const line of dataLines.reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // keep looking
      }
    }
    return null;
  }
}

/** Forward a raw JSON-RPC request to the upstream MCP server and return its envelope. */
export async function forwardToUpstream(
  config: SentrailConfig,
  rpc: JsonRpcRequest,
  deps: ProxyDeps,
): Promise<unknown> {
  if (!config.upstreamMcpUrl) {
    throw new Error("No upstream MCP URL configured");
  }
  // Error case: upstream unreachable / slow. The timeout aborts the request so
  // the agent never hangs; the rejection propagates to a clear MCP error.
  const res = await deps.fetchImpl(config.upstreamMcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(rpc),
    signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  const parsed = parseMaybeSse(text);
  if (parsed === null) {
    throw new Error(`Upstream returned an unparseable response (status ${res.status})`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Cloud policy evaluation
// ---------------------------------------------------------------------------

function failClosed(classification: Classification, reason: string): Decision {
  // Reads (low risk) are allowed when the cloud is unreachable; everything else
  // is blocked. This matches the fail-closed posture for write actions.
  if (classification.riskLevel === "low") {
    return { decision: "allow", reason: `Cloud unreachable; allowing read (${reason})` };
  }
  return {
    decision: "block",
    reason: `Sentrail cloud unreachable — failing closed (${reason})`,
    policyName: "fail-closed",
  };
}

function extractPolicyName(data: Record<string, unknown>): string | null {
  if (typeof data.matchedPolicyName === "string") return data.matchedPolicyName;
  const reason = typeof data.reason === "string" ? data.reason : "";
  const match = reason.match(/Matched policy:\s*(.+)$/);
  if (match?.[1]) return match[1].trim();
  if (typeof data.matchedPolicyId === "string") return data.matchedPolicyId;
  return null;
}

/** Ask the Sentrail cloud evaluate-action endpoint for a decision. */
export async function evaluateWithCloud(
  config: SentrailConfig,
  classification: Classification,
  payload: Record<string, unknown>,
  deps: ProxyDeps,
): Promise<Decision> {
  const url = `${config.cloudUrl}/evaluate-action`;
  try {
    const res = await deps.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        workspaceId: config.workspaceId,
        tool: "mcp",
        action: classification.action,
        riskLevel: classification.riskLevel,
        agentName: "sentrail-local",
        payload,
      }),
      signal: timeoutSignal(CLOUD_TIMEOUT_MS),
    });

    // Error case: invalid/expired API key (401/403) — surface as a block with a
    // clear reason rather than silently allowing the action.
    if (res.status === 401 || res.status === 403) {
      deps.logger.error(`  cloud rejected the API key (${res.status}) — check 'sentrail init'`);
      return {
        decision: "block",
        reason: "Sentrail API key was rejected by the cloud (401/403)",
        policyName: "auth",
      };
    }

    if (!res.ok) {
      deps.logger.warn(`  cloud evaluate-action returned ${res.status}`);
      return failClosed(classification, `cloud status ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const decision = data.decision as Decision["decision"];
    if (decision !== "allow" && decision !== "block" && decision !== "require_approval") {
      return failClosed(classification, "cloud returned an unrecognized decision");
    }
    return {
      decision,
      reason: typeof data.reason === "string" ? data.reason : "",
      policyName: extractPolicyName(data),
      approvalRequestId:
        typeof data.approvalRequestId === "string" ? data.approvalRequestId : null,
    };
  } catch (err) {
    return failClosed(classification, err instanceof Error ? err.message : String(err));
  }
}

/** Poll the cloud for a human approval decision until decided or timed out. */
export async function pollApprovalDecision(
  config: SentrailConfig,
  approvalRequestId: string,
  deps: ProxyDeps,
): Promise<ApprovalOutcome> {
  const statusUrl = `${config.cloudUrl}/mcp-gate/status/${approvalRequestId}`;
  const deadline = deps.now() + deps.approvalTimeoutMs;

  while (deps.now() < deadline) {
    await deps.sleep(deps.pollIntervalMs);
    try {
      const res = await deps.fetchImpl(statusUrl, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: timeoutSignal(STATUS_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const status = String(data.status ?? "");
        if (["approved", "executed", "completed"].includes(status)) return "approved";
        if (["denied", "failed", "expired"].includes(status)) return "denied";
      }
    } catch {
      // transient — keep polling until the deadline
    }
  }
  return "timeout";
}

// ---------------------------------------------------------------------------
// tools/call interception
// ---------------------------------------------------------------------------

export async function handleToolsCall(
  config: SentrailConfig,
  id: unknown,
  params: Record<string, unknown> | undefined,
  deps: ProxyDeps,
): Promise<unknown> {
  const name = typeof params?.name === "string" ? params.name : "";

  if (!name) {
    return rpcError(id, -32602, "tools/call missing 'name'");
  }

  // Error case: malformed arguments. If 'arguments' is present but is not a
  // plain object, we cannot classify it safely — fail closed (block) and warn,
  // rather than guessing and forwarding a potentially destructive call.
  const rawArgs = params?.arguments;
  if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
    deps.logger.warn(`  malformed tool call arguments for "${name}" — blocking (fail-closed)`);
    return rpcError(
      id,
      -32000,
      `🛑 Blocked by Sentrail: malformed tool call arguments. Policy: fail-closed`,
    );
  }
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const classification = classifyToolCall(name, args);
  const command = extractCommand(args);
  const payload = {
    name,
    command,
    classifiedTool: classification.tool,
    summary: classification.summary,
    arguments: args,
  };

  const decision = await evaluateWithCloud(config, classification, payload, deps);

  if (decision.decision === "block") {
    deps.logger.block(`  🛑 BLOCK   ${name}  ·  ${decision.reason}`);
    return rpcError(
      id,
      -32000,
      `🛑 Blocked by Sentrail: ${decision.reason}. Policy: ${decision.policyName ?? "default"}`,
    );
  }

  if (decision.decision === "require_approval") {
    deps.logger.pending(`  ⏳ APPROVAL REQUIRED   ${name}  ·  ${classification.summary}`);
    if (!decision.approvalRequestId) {
      // No approval id to poll → fail closed.
      return rpcError(
        id,
        -32000,
        `🛑 Blocked by Sentrail: approval required but no approval id was returned. Policy: ${decision.policyName ?? "default"}`,
      );
    }
    const outcome = await pollApprovalDecision(config, decision.approvalRequestId, deps);
    if (outcome === "approved") {
      deps.logger.allow(`  ✅ APPROVED   ${name}`);
      return forwardToolsCall(config, id, name, args, deps);
    }
    // Error case: approval timeout → deny by default (fail closed).
    if (outcome === "timeout") {
      deps.logger.block(`  ❌ DENIED   ${name}  ·  approval_timeout`);
      return rpcError(id, -32000, `🛑 Blocked by Sentrail: approval timed out (approval_timeout). Policy: ${decision.policyName ?? "approval"}`);
    }
    deps.logger.block(`  ❌ DENIED   ${name}  ·  approval denied`);
    return rpcError(id, -32000, `🛑 Blocked by Sentrail: approval denied. Policy: ${decision.policyName ?? "approval"}`);
  }

  // allow
  deps.logger.allow(`  ✅ ALLOW   ${name}  ·  ${classification.summary}`);
  return forwardToolsCall(config, id, name, args, deps);
}

async function forwardToolsCall(
  config: SentrailConfig,
  id: unknown,
  name: string,
  args: Record<string, unknown>,
  deps: ProxyDeps,
): Promise<unknown> {
  try {
    return await forwardToUpstream(
      config,
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
      deps,
    );
  } catch (err) {
    return rpcError(id, -32001, `Upstream tool call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Top-level RPC dispatch
// ---------------------------------------------------------------------------

const PASS_THROUGH = new Set(["initialize", "tools/list", "ping"]);

/** Dispatch a single JSON-RPC request. Returns null for notifications. */
export async function handleRpc(
  config: SentrailConfig,
  rpc: JsonRpcRequest,
  deps: ProxyDeps,
): Promise<unknown | null> {
  const method = String(rpc.method ?? "");

  // Notifications carry no id and expect no response.
  if (method.startsWith("notifications/")) {
    return null;
  }

  if (method === "tools/call") {
    return handleToolsCall(config, rpc.id, rpc.params, deps);
  }

  if (PASS_THROUGH.has(method)) {
    try {
      return await forwardToUpstream(config, rpc, deps);
    } catch (err) {
      deps.logger.warn(`  upstream ${method} failed: ${err instanceof Error ? err.message : String(err)}`);
      // Local fallbacks so the agent can still complete a handshake.
      if (method === "initialize") {
        return rpcResult(rpc.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "sentrail-proxy", version: "0.1.0" },
        });
      }
      if (method === "ping") return rpcResult(rpc.id, {});
      return rpcResult(rpc.id, { tools: [] });
    }
  }

  // Deny-by-default for unrecognized methods.
  deps.logger.block(`  🛑 BLOCK   unknown method "${method}"`);
  return rpcError(rpc.id, -32601, "Method not permitted by Sentrail policy");
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export async function startProxy(
  config: SentrailConfig,
  options: ProxyOptions = {},
): Promise<ProxyHandle> {
  const deps = resolveDeps(options, config);

  const server: Server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rpcError(null, -32600, "Only POST is supported")));
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        let rpc: JsonRpcRequest;
        try {
          rpc = JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRpcRequest;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(rpcError(null, -32700, "Parse error")));
          return;
        }

        try {
          const response = await handleRpc(config, rpc, deps);
          if (response === null) {
            // Notification — acknowledge with no body.
            res.writeHead(202);
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify(
              rpcError(rpc.id, -32603, err instanceof Error ? err.message : "Internal error"),
            ),
          );
        }
      })();
    });
  });

  await new Promise<void>((resolve) => server.listen(config.port, resolve));

  return {
    port: config.port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
