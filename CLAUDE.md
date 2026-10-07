@AGENTS.md

## Claude Code specifics

- This project observes Claude Code itself, so your own session is a live test subject: it sits in the session registry, writes a transcript, and spawns subagents you can watch. Use it to verify features end to end in the debug list or 3D office.
- Use `gh` for tickets: `gh issue view <N> -R aminurislamarnob/claude-agent-verse` to read one, and the issue's "blocked by" links to confirm it is on the frontier.
- Hooks you see firing in this session belong to other tools installed globally (Orca, Agent Flow, Superset). The forwarder this project builds must coexist with them, which makes your own environment a realistic fixture source — scrub anything you copy from it.
