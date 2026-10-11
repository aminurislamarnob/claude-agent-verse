import type { AgentKind, Office, Session } from "../types";
import { palette } from "./theme";

// ── Rooms ────────────────────────────────────────────────────
// One room per kind of agent, shown one at a time. Rooms share the floor plan and
// furniture; the name, accent and wall colour make it obvious which one you're in.

export interface RoomTheme {
  kind: AgentKind;
  name: string;
  accent: string;
  /** Glow of the neon sign; brighter than the accent. */
  neon: string;
  wall: string;
  /** Shown in an empty room. */
  hint: string;
}

export const ROOMS: readonly RoomTheme[] = [
  {
    kind: "claude",
    name: "Claude Code",
    accent: palette.accent,
    neon: "#ff8a5c",
    wall: palette.wall,
    hint: "Start a Claude Code session and its agent will walk in within a second.",
  },
  {
    kind: "antigravity",
    name: "Antigravity",
    accent: "#4f7cff",
    neon: "#7aa2ff",
    wall: "#e6ebf3",
    hint: "Start a conversation in Antigravity and its agent will walk in within a second.",
  },
];

export function roomOf(session: Pick<Session, "agent">): AgentKind {
  return session.agent ?? "claude";
}

export function roomTheme(kind: AgentKind): RoomTheme {
  return ROOMS.find((r) => r.kind === kind) ?? ROOMS[0];
}

/** Agents waiting on you, interns included, as the server counts them. */
export function waitingIn(sessions: Session[]): number {
  let n = 0;
  for (const s of sessions) {
    if (s.state === "waiting_on_user") n++;
    for (const sub of Object.values(s.subagents ?? {})) if (sub.state === "waiting_on_user") n++;
  }
  return n;
}

/** The part of the office that sits in one room. */
export function officeInRoom(office: Office, kind: AgentKind): Office {
  const sessions = Object.values(office.sessions).filter((s) => roomOf(s) === kind);
  return { sessions: Object.fromEntries(sessions.map((s) => [s.pid, s])), waitingCount: waitingIn(sessions) };
}
