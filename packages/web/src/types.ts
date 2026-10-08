// ── Types (subset of @claude-agent-verse/core) ───────────────

export type AgentState = "working" | "thinking" | "idle" | "error" | "ended" | "waiting_on_user";

export interface Subagent {
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  state: AgentState;
  currentTool?: string;
}

export interface FeedEvent {
  id: string;
  role: "user" | "assistant";
  type: "text" | "tool_use" | "tool_result" | "error";
  excerpt: string;
}

export interface Session {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  state: AgentState;
  projectKey: string;
  startedAt: number;
  title?: string;
  lastPrompt?: string;
  gitBranch?: string;
  currentTool?: string;
  feed: FeedEvent[];
  subagents?: Record<string, Subagent>;
  /** Idle long enough that the character has left its desk for the break area. */
  onBreak?: boolean;
}

export interface Office {
  sessions: Record<number, Session>;
  waitingCount: number;
}
