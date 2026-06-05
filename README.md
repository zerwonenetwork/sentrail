<div align="center">

# Sentrail

**Stop AI coding agents from deleting repos, force-pushing, or dropping tables without approval.**

[![npm version](https://img.shields.io/npm/v/sentrail?color=teal&label=sentrail)](https://www.npmjs.com/package/sentrail)
[![npm downloads](https://img.shields.io/npm/dm/sentrail?color=teal)](https://www.npmjs.com/package/sentrail)
[![License](https://img.shields.io/badge/license-UNLICENSED-gray)](https://sentrail.dev)

[Website](https://sentrail.dev) · [Docs](https://sentrail.dev/docs) · [Dashboard](https://sentrail.dev/app)

</div>

---

Sentrail sits between your AI agent and the tools it uses. Every `tools/call` — including shell commands — is classified and checked against your policies **before** it executes.

```
rm -rf /prod    →   🛑 BLOCKED
git push -f     →   ⏳ APPROVAL REQUIRED
cat README.md   →   ✅ ALLOWED
```

---

## Install

```bash
npm install -g sentrail
```

Requires Node.js 18+.

---

## Quick Start

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   1. npm install -g sentrail                        │
│                                                     │
│   2. sentrail init                                  │
│      ↳ enter API key + workspace + upstream MCP    │
│      ↳ get the MCP config snippet                  │
│                                                     │
│   3. paste snippet into Claude Code / Cursor        │
│      { "mcpServers": { "sentrail": {               │
│          "url": "http://localhost:3773" } } }       │
│                                                     │
│   4. sentrail start                                 │
│      ↳ proxy running on localhost:3773             │
│      ↳ every tool call is now policy-gated         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Not ready to connect a real agent? See it work in 30 seconds:

```bash
sentrail demo
```

---

## How It Works

```
  Claude Code / Cursor / Codex
           │
           │  MCP tools/call
           ▼
  ┌─────────────────────┐
  │   Sentrail Local    │  ← localhost:3773
  │   (this package)   │
  └────────┬────────────┘
           │
           │  classify command
           │  rm -rf → file.delete_recursive / critical
           │
           │  POST /evaluate-action
           ▼
  ┌─────────────────────┐
  │   Sentrail Cloud    │  ← your workspace policies
  │   policy engine     │
  └────────┬────────────┘
           │
      ┌────┴─────────────────────┐
      │                          │
   allow                      block / require_approval
      │                          │
      ▼                          ▼
  upstream MCP              MCP error / hold
  server                    for human review
```

1. Agent calls a tool → Sentrail intercepts it
2. Command is classified locally (`rm -rf` → critical, `ls` → low)
3. Cloud policy engine decides: allow / block / require approval
4. **allow** → forwarded to real upstream, result returned
5. **block** → MCP error returned, upstream never called
6. **require_approval** → held in terminal + dashboard until a human decides

If the cloud is unreachable, Sentrail **fails closed** — writes are blocked, reads pass through.

---

## What Gets Blocked

| Command | Action | Risk |
|---------|--------|------|
| `rm -rf` / `rm -r` | `file.delete_recursive` | 🔴 critical |
| `git push --force` / `-f` | `git.force_push` | 🔴 critical |
| `DROP TABLE` / `TRUNCATE` | `sql.destructive` | 🔴 critical |
| `curl … \| bash` / `wget … \| sh` | `shell.remote_exec` | 🔴 critical |
| `chmod 777` | `file.permission_change` | 🟠 high |
| `sudo …` | `shell.sudo` | 🟠 high |
| `docker rm` / `docker rmi` | `container.delete` | 🟠 high |
| `kubectl delete` | `k8s.delete` | 🟠 high |
| `git reset --hard` | `git.reset_hard` | 🟠 high |
| `git push` (no force) | `git.push` | 🟡 medium |
| `git branch -D` | `git.branch_delete` | 🟡 medium |
| `ls`, `cat`, `grep`, `find` | `shell.read` | 🟢 low — allowed |

What actually happens (block / approve / allow) is controlled by your workspace policies in the Sentrail dashboard.

---

## Supported Agents

Any MCP-compatible client:

- **Claude Code** — `~/.claude/mcp_servers.json`
- **Cursor** — Settings → MCP
- **Codex** — MCP config
- Any custom agent using MCP over HTTP

---

## Commands

```bash
sentrail init     # first-time setup — API key, workspace, upstream MCP URL
sentrail start    # start the local proxy on port 3773
sentrail status   # show current config (API key masked)
sentrail demo     # simulated demo — no cloud or upstream needed
```

---

## Configuration

Config lives at `~/.sentrail/config.json` (0600 permissions — it holds your API key).

| Field | Default | Description |
|-------|---------|-------------|
| `apiKey` | — | Sentrail gateway API key (`agk_…`) |
| `workspaceId` | — | Your workspace UUID |
| `upstreamMcpUrl` | — | The real MCP server to forward allowed calls to |
| `cloudUrl` | Sentrail cloud | Change for self-hosted deployments |
| `port` | `3773` | Local port for the proxy |
| `logLevel` | `info` | `debug` / `info` / `warn` / `error` |

---

## FAQ

**Does this add latency?**
One cloud round-trip per write action (~50–100ms). Read-only commands are classified locally with no added latency.

**What if the Sentrail cloud is down?**
Fail-closed: write actions are blocked, reads are allowed. Your agent never silently bypasses policy.

**Can I self-host?**
Yes. Point `cloudUrl` at your own Sentrail deployment. The CLI only calls `/evaluate-action` and `/mcp-gate/status/:id`.

**Which MCP methods pass through?**
`initialize`, `tools/list`, `ping` — forwarded to upstream. `tools/call` — intercepted and policy-checked. Everything else is denied by default.

---

## Links

- **Dashboard:** [sentrail.dev/app](https://sentrail.dev/app)
- **Docs:** [sentrail.dev/docs](https://sentrail.dev/docs)
- **Issues:** [github.com/zerwonenetwork/sentrail/issues](https://github.com/zerwonenetwork/sentrail/issues)

---

<div align="center">
<sub>Built by <a href="https://sentrail.dev">Sentrail</a> · ZerwOne Network LLC</sub>
</div>
