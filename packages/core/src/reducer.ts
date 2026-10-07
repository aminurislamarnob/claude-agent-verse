import type { Office, DomainEvent } from "./types.js";

/**
 * Pure reducer: (office, domainEvent) → office
 *
 * This is the single test seam for the project.
 * All state transitions go through here.
 */
export function reduce(office: Office, event: DomainEvent): Office {
  switch (event.type) {
    case "session_appeared": {
      return {
        ...office,
        sessions: {
          ...office.sessions,
          [event.pid]: {
            pid: event.pid,
            sessionId: event.sessionId,
            cwd: event.cwd,
            name: event.name,
            state: event.state,
            projectKey: event.projectKey,
            startedAt: event.startedAt,
          },
        },
      };
    }

    case "session_busy": {
      const session = office.sessions[event.pid];
      if (!session) return office;
      return {
        ...office,
        sessions: {
          ...office.sessions,
          [event.pid]: { ...session, state: "busy" },
        },
      };
    }

    case "session_idle": {
      const session = office.sessions[event.pid];
      if (!session) return office;
      return {
        ...office,
        sessions: {
          ...office.sessions,
          [event.pid]: { ...session, state: "idle" },
        },
      };
    }

    case "session_ended": {
      const { [event.pid]: _removed, ...rest } = office.sessions;
      return { ...office, sessions: rest };
    }

    default:
      // Unknown event types are silently skipped (guardrail).
      return office;
  }
}

/** Create an empty Office. */
export function emptyOffice(): Office {
  return { sessions: {} };
}
