# Sentrail CLI

**Sentrail is a governance gateway for AI coding agents.** It sits between your
agent (Claude Code, Cursor, Codex, any MCP client) and the tools it can run, and
enforces allow / block / require-approval policies on every action **before** it
executes — so an agent can't `rm -rf`, force-push to `main`, or `DROP TABLE`
without your say-so.

---

## Quick Start (under 2 minutes)

```bash
# 1. Install
npm install -g sentrail

# 2. Configure (API key, workspace, upstream MCP server)
sentrail init

# 3. Start the local interceptor
sentrail start
```

`sentrail init` prints an MCP config snippet — paste it into your agent
(e.g. `~/.claude/mcp.json` or your Cursor / Codex MCP settings):

```json
{
  "mcpServers": {
    "sentrail": {
      "url": "http://localhost:3773"
    }
  }
}
```

Want to see it work first, with no setup? Run the simulated demo:

```bash
sentrail demo
```

---

## How It Works

```
┌──────────────────┐   MCP (tools/call)   ┌────────────────────┐   evaluate-action   ┌─────────────────┐
│  Claude Code /   │ ───────────────────▶ │  Sentrail Local    │ ──────────────────▶ │  Sentrail Cloud │
│  Cursor / Codex  │                      │  (localhost:3773)  │                     │  policy engine  │
│                  │ ◀─────────────────── │                    │ ◀────────────────── │                 │
└──────────────────┘  allow / block /     └────────────────────┘   decision +        └─────────────────┘
                      hold-for-approval             │              approval status
                                                    │ if allowed / approved
                                                    ▼
                                          ┌────────────────────┐
                                          │  Real upstream MCP │
                                          │       server       │
                                          └────────────────────┘
```

1. Your agent calls a tool through Sentrail instead of the real MCP server.
2. Sentrail **classifies** the call (e.g. `rm -rf` → `file.delete_recursive`, critical).
3. It asks the Sentrail cloud policy engine for a decision.
4. **allow** → forwarded upstream · **block** → returned as an MCP error ·
   **require_approval** → held until a human approves or denies.

---

## What Gets Blocked

Out of the box, Sentrail classifies and can gate the actions that wreck
production:

| Action | Classified as | Default risk |
|--------|---------------|--------------|
| `rm -rf` / `rm -r` / `rm --recursive` | `file.delete_recursive` | critical |
| `git push --force` / `-f` | `git.force_push` | critical |
| `DROP TABLE` / `DROP DATABASE` / `TRUNCATE` | `sql.destructive` | critical |
| `curl … | bash` / `wget … | sh` | `shell.remote_exec` | critical |
| `chmod 777` | `file.permission_change` | high |
| `sudo …` | `shell.sudo` | high |
| `docker rm` / `docker rmi` | `container.delete` | high |
| `kubectl delete` | `k8s.delete` | high |
| `git reset --hard` | `git.reset_hard` | high |
| `git branch -D` | `git.branch_delete` | medium |
| `ls`, `cat`, `grep`, `find`, … | `shell.read` | low (allowed) |

What actually happens (block / approve / allow) is decided by **your** workspace
policies in the Sentrail cloud — the classifier just surfaces the action and risk.

---

## Supported Agents

Any MCP-compatible client, including:

- **Claude Code**
- **Cursor**
- **Codex**
- Custom MCP agents

If it speaks the Model Context Protocol over HTTP, it works.

---

## Configuration Reference

Config lives at `~/.sentrail/config.json` (written with `0600` permissions
because it holds your API key). Set it with `sentrail init` or edit by hand.

| Field | Default | Description |
|-------|---------|-------------|
| `apiKey` | — | Sentrail gateway API key (`agk_…`). Required. |
| `workspaceId` | — | Workspace the agent acts within. Required. |
| `upstreamMcpUrl` | — | The real MCP server allowed calls are forwarded to. |
| `cloudUrl` | `https://…supabase.co/functions/v1` | Sentrail cloud edge-function base URL. |
| `port` | `3773` | Local port the interceptor listens on. |
| `logLevel` | `info` | `debug` \| `info` \| `warn` \| `error`. |

Inspect current settings any time with `sentrail status`.

---

## Commands

| Command | What it does |
|---------|--------------|
| `sentrail init` | Interactive setup; writes config and prints the MCP snippet. |
| `sentrail start` | Start the local interceptor proxy. |
| `sentrail status` | Show current configuration (API key masked). |
| `sentrail demo` | Run the simulated demo (no cloud or upstream needed). |
| `sentrail test` | *(coming soon)* fire a simulated destructive action end-to-end. |

---

## FAQ

**Does this add latency?**
One policy check per *write* tool call — a single round-trip to the Sentrail
cloud. Read-only commands are classified locally and added latency is negligible.
The interceptor only forwards a call after it's allowed (or approved).

**What if the cloud is down?**
Sentrail **fails closed**: write actions are blocked and read-only actions are
allowed. Your agent never silently bypasses policy because the network hiccuped.

**Can I self-host?**
Yes — point `cloudUrl` at your own deployment of the Sentrail edge functions.
The CLI talks to `evaluate-action` and `mcp-gate/status/:id`; anything serving
those endpoints works.

**What MCP methods are supported?**
`initialize`, `tools/list`, and `ping` pass through to your upstream server.
`tools/call` is intercepted and policy-checked. Every other method is **denied
by default**, so an agent can't route side-effecting work around the policy
engine (e.g. via `resources/*` or a custom method).

---

## License

UNLICENSED — internal beta.
