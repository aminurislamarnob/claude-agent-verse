export type {
  AgentState,
  Session,
  Office,
  DomainEvent,
  SessionAppeared,
  SessionBusy,
  SessionIdle,
  SessionEnded,
} from "./types.js";

export { reduce, emptyOffice } from "./reducer.js";
