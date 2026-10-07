# Claude Agent Verse — agent guide

A local, browser-based 3D office for watching the Claude Code sessions running on this machine. The spec is GitHub issue #1; the work is broken into its sub-issues (#2–#12), each a tracer-bullet vertical slice with native "blocked by" links.

## Workflow

1. **Pick a frontier ticket**: an open sub-issue of #1 labelled `ready-for-agent` whose blockers are all closed. Lowest number first when several qualify.
2. **Read #1 in full, then the ticket.** The spec's domain model (Office, Session, Subagent/intern, Agent State, project key, domain event) is the project vocabulary; use those names in code.
3. **Work on a branch** named `issue-<N>-<slug>`.
4. **Write reducer tests first** (Vitest), then make them pass. The pure reducer `(office, domainEvent) → office` in `core` is the single test seam: feed fixture inputs through adapters + reducer and assert only on the resulting Office. The 3D layer is checked visually via replay mode.
5. **Done** means every acceptance criterion in the ticket is checked off and the full test suite is green. Then open a PR whose body says `Closes #<N>`.

## Guardrails

- The user's global Claude Code settings change only through the hook `install` / `uninstall` commands, run by the user. During development, register the hook forwarder in a throwaway settings file.
- Read only the session registry JSON entries and transcripts. The per-session key/token files beside the registry entries are credentials: leave them unopened.
- Commit only scrubbed fixtures: synthetic paths, project names and content. Real transcripts stay on the machine.
- The server binds to 127.0.0.1 and requires the Origin check plus tokens (from #3 onward). Keep every new endpoint behind them.
- Claude Code's on-disk formats are not a public API: adapters skip unknown event types and fields rather than throwing.
