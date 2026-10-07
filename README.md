# Claude Agent Verse

A tiny local, browser-based 3D office for looking after the Claude Code agents running on your machine. Every live session is a character at a desk, clustered by project; subagents are interns who pull up a chair. Body language shows state at a glance — working (with the current tool), thinking, idle, error, and a raised hand when an agent is **waiting on you**.

v1 is observe-only, single-user, and localhost-only.

**Status:** specced, not yet built. See the v1 spec: [#1](https://github.com/aminurislamarnob/claude-agent-verse/issues/1).

## Planned stack

- pnpm monorepo on Node 24: `core` (domain types + pure state reducer), `server` (session registry + transcript tailing, hook receiver, WebSocket), `web` (Vite + React Three Fiber + drei)
- Optional Claude Code hook forwarder for exact real-time state, installed/uninstalled via explicit commands
