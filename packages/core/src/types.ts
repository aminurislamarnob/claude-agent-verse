// ── Domain types ──────────────────────────────────────────────
// These follow the vocabulary from the spec (GitHub issue #1).

/**
 * Agent State — the visible state of a session character.
 * For issue #2, we only need "busy" and "idle".
 * Later issues will add "thinking", "waiting_on_user", "error", "finished".
 */
export type AgentState = "busy" | "idle";

/**
 * Session — one running Claude Code process.
 * Maps to a character at a desk in the 3D office.
 */
export interface Session {
  /** Claude Code process ID (unique while alive). */
  pid: number;
  /** Stable session UUID assigned by Claude Code. */
  sessionId: string;
  /** Working directory of the session. */
  cwd: string;
  /** Human-readable session name (auto-generated or user-set). */
  name: string;
  /** Current agent state. */
  state: AgentState;
  /** Project key — git repo name or folder basename. */
  projectKey: string;
  /** Epoch ms when the session started. */
  startedAt: number;
}

/**
 * Office — the top-level domain aggregate.
 * Contains all live sessions indexed by PID.
 */
export interface Office {
  /** Live sessions keyed by PID. */
  sessions: Record<number, Session>;
}

// ── Domain events ─────────────────────────────────────────────

export interface SessionAppeared {
  type: "session_appeared";
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  state: AgentState;
  projectKey: string;
  startedAt: number;
}

export interface SessionBusy {
  type: "session_busy";
  pid: number;
}

export interface SessionIdle {
  type: "session_idle";
  pid: number;
}

export interface SessionEnded {
  type: "session_ended";
  pid: number;
}

export type DomainEvent =
  | SessionAppeared
  | SessionBusy
  | SessionIdle
  | SessionEnded;
