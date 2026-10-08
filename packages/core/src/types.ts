// ── Domain types ──────────────────────────────────────────────
// These follow the vocabulary from the spec (GitHub issue #1).

/**
 * Agent State — the visible state of a session character.
 */
export type AgentState = "working" | "thinking" | "idle" | "error" | "ended" | "waiting_on_user";

export interface FeedEvent {
  id: string;
  role: "user" | "assistant";
  type: "text" | "tool_use" | "tool_result" | "error";
  excerpt: string;
}

export interface Subagent {
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  state: AgentState;
  currentTool?: string;
  /** Epoch ms when the current tool started */
  toolStartedAt?: number;
}

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

  /** Session title derived from transcript ai-title */
  title?: string;
  /** Last prompt given to the agent */
  lastPrompt?: string;
  /** Git branch active in the cwd */
  gitBranch?: string;
  /** Name of the tool currently being used (when state is 'working') */
  currentTool?: string;
  /** Epoch ms when the current tool started */
  toolStartedAt?: number;
  /** Short recent-event feed (max 20 entries) */
  feed: FeedEvent[];
  /** Subagents spawned by this session */
  subagents: Record<string, Subagent>;
  /** Explicit hook waiting state to override transcript inference */
  hookWaiting?: boolean;
  /** Epoch ms of the latest user or assistant transcript line */
  lastActivityAt?: number;
  /** Idle for at least the break threshold: the character leaves its desk */
  onBreak?: boolean;
}

/**
 * Office — the top-level domain aggregate.
 * Contains all live sessions indexed by PID.
 */
export interface Office {
  /** Live sessions keyed by PID. */
  sessions: Record<number, Session>;
  /** Number of sessions in waiting_on_user state. */
  waitingCount: number;
  /** Configurable threshold for waiting inference. */
  waitingThresholdMs: number;
  /** How long a session stays idle before it goes on break. */
  breakThresholdMs: number;
}

// ── Domain events ─────────────────────────────────────────────

export interface SessionAppeared {
  type: "session_appeared";
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  projectKey: string;
  startedAt: number;
}

export interface SessionEnded {
  type: "session_ended";
  pid: number;
}

export interface TranscriptLine {
  type: "transcript_line";
  pid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line: any;
}

export interface SubagentAppeared {
  type: "subagent_appeared";
  pid: number;
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
}

export interface SubagentEnded {
  type: "subagent_ended";
  pid: number;
  subagentId: string;
}

export interface SubagentTranscriptLine {
  type: "subagent_transcript_line";
  pid: number;
  subagentId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line: any;
}

export interface Tick {
  type: "tick";
  now: number;
}

export interface HookEvent {
  type: "hook_event";
  pid: number;
  hookData: {
    type: string;
    [key: string]: any;
  };
}

export type DomainEvent =
  | SessionAppeared
  | SessionEnded
  | TranscriptLine
  | SubagentAppeared
  | SubagentEnded
  | SubagentTranscriptLine
  | Tick
  | HookEvent;
