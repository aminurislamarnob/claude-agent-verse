# Claude Agent Verse

A tiny local, browser-based 3D office for looking after the Claude Code (and Antigravity) agents running on your machine. Every live session is a character at a desk, clustered by project; subagents are interns who pull up a chair. Body language shows state at a glance — working (with the current tool), thinking, idle, error, and an amber "!" paddle held up when an agent is **waiting on you**.

v1 is observe-only, single-user, and localhost-only.

See the v1 spec: [#1](https://github.com/aminurislamarnob/claude-agent-verse/issues/1).

## Run it

```sh
pnpm install
pnpm --filter @claude-agent-verse/web build   # the server serves web/dist
pnpm dev                                       # prints the tokenized localhost URL
```

Append `&preview` to the printed URL to see a synthetic office that cycles through every agent state, or `&preview=still` to freeze it. Preview never talks to the server.

## Daylight

The office keeps your local time. Sun comes in through the west windows and swings round the room over the day, the city outside fades to lights at dusk, and the pendants, floor lamp and desk lamps come on in the evening; the wall clock over the coffee bar shows the real time. To review a particular hour, append `&time=HH` or `&time=HH:MM` to the URL to pin the clock, or `&time=cycle` to run a whole day in under a minute.

## Rooms

Each kind of AI coding agent has its own room, shown one at a time. Tabs in the top bar switch rooms and show each room's agent count and how many of its agents are waiting on you; the browser tab title counts every room.

- **Claude Code** — every live Claude Code session, from its session registry and transcripts (plus the optional hook).
- **Antigravity** — Google Antigravity conversations (2.0 app / Agent Manager, IDE and CLI), read passively from `~/.gemini/{antigravity,antigravity-ide,antigravity-cli}/brain/<id>/.system_generated/logs/transcript.jsonl`. Antigravity has no process registry, so a conversation is shown while its transcript was written in the last 30 minutes, and it joins its project's pod once a tool call names a path in it. Set `ANTIGRAVITY_HOME` to read from somewhere other than `~/.gemini`. There is no Antigravity hook yet, so "waiting on you" is inferred from a tool call that runs past the threshold.

Antigravity's transcript format is not a public API; steps the adapter doesn't recognise are skipped.

## Stack

- pnpm monorepo on Node 24: `core` (domain types + pure state reducer), `server` (session registry + transcript tailing, hook receiver, WebSocket), `web` (Vite + React Three Fiber + drei)
- Optional Claude Code hook forwarder for exact real-time state, installed/uninstalled via explicit commands
