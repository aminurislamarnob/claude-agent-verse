export type {
  AgentKind,
  AgentState,
  Session,
  Office,
  DomainEvent,
  SessionAppeared,
  TranscriptLine,
  SessionEnded,
  SessionStatus,
  SessionWorkspace,
  Subagent,
  SubagentAppeared,
  SubagentEnded,
  SubagentTranscriptLine,
} from "./types.js";

export { reduce, emptyOffice } from "./reducer.js";
