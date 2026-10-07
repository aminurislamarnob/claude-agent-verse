import type { Office, DomainEvent, Session, FeedEvent, Subagent, AgentState } from "./types.js";

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function processTranscriptLine(session: Session, line: any): Session {
  const next = { ...session };

  if (line.gitBranch) {
    next.gitBranch = line.gitBranch;
  }

  if (line.type === "ai-title" && line.aiTitle) {
    next.title = line.aiTitle;
    return next;
  }

  if (line.type === "last-prompt" && line.lastPrompt) {
    next.lastPrompt = line.lastPrompt;
    return next;
  }

  const content = line.message?.content;
  let newFeedEvent: FeedEvent | null = null;
  const uuid = line.uuid || Date.now().toString();
  const timestamp = line.timestamp ? new Date(line.timestamp).getTime() : Date.now();

  if (line.type === "assistant") {
    if (Array.isArray(content)) {
      const toolUse = content.find((c: any) => c.type === "tool_use");
      if (toolUse) {
        next.state = "working";
        next.currentTool = toolUse.name;
        next.toolStartedAt = timestamp;
        newFeedEvent = {
          id: uuid,
          role: "assistant",
          type: "tool_use",
          excerpt: `Used tool: ${toolUse.name}`,
        };
      } else {
        next.state = "idle";
        next.currentTool = undefined;
        next.toolStartedAt = undefined;
        const textBlock = content.find((c: any) => c.type === "text");
        if (textBlock && textBlock.text) {
          newFeedEvent = {
            id: uuid,
            role: "assistant",
            type: "text",
            excerpt: truncate(textBlock.text, 100),
          };
        }
      }
    }
  } else if (line.type === "user") {
    if (Array.isArray(content)) {
      const toolResult = content.find((c: any) => c.type === "tool_result");
      if (toolResult) {
        if (toolResult.is_error) {
          next.state = "error";
          next.currentTool = undefined;
          next.toolStartedAt = undefined;
          newFeedEvent = {
            id: uuid,
            role: "user",
            type: "error",
            excerpt: "Tool error occurred.",
          };
        } else {
          next.state = "thinking";
          next.currentTool = undefined;
          next.toolStartedAt = undefined;
          newFeedEvent = {
            id: uuid,
            role: "user",
            type: "tool_result",
            excerpt: `Tool finished: ${line.toolUseResult?.commandName || "success"}`,
          };
        }
      } else {
        next.state = "thinking";
        next.currentTool = undefined;
        next.toolStartedAt = undefined;
        const textBlock = content.find((c: any) => c.type === "text");
        if (textBlock && textBlock.text) {
          newFeedEvent = {
            id: uuid,
            role: "user",
            type: "text",
            excerpt: truncate(textBlock.text, 100),
          };
        }
      }
    } else if (typeof content === "string") {
      next.state = "thinking";
      next.currentTool = undefined;
      next.toolStartedAt = undefined;
      newFeedEvent = {
        id: uuid,
        role: "user",
        type: "text",
        excerpt: truncate(content, 100),
      };
    }
  }

  if (newFeedEvent) {
    next.feed = [...next.feed, newFeedEvent].slice(-20);
  }

  return next;
}

function processSubagentTranscriptLine(subagent: Subagent, line: any): Subagent {
  const next = { ...subagent };
  const content = line.message?.content;
  const timestamp = line.timestamp ? new Date(line.timestamp).getTime() : Date.now();

  if (line.type === "assistant") {
    if (Array.isArray(content)) {
      const toolUse = content.find((c: any) => c.type === "tool_use");
      if (toolUse) {
        next.state = "working";
        next.currentTool = toolUse.name;
        next.toolStartedAt = timestamp;
      } else {
        next.state = "idle";
        next.currentTool = undefined;
        next.toolStartedAt = undefined;
      }
    }
  } else if (line.type === "user") {
    if (Array.isArray(content)) {
      const toolResult = content.find((c: any) => c.type === "tool_result");
      if (toolResult) {
        if (toolResult.is_error) {
          next.state = "error";
          next.currentTool = undefined;
          next.toolStartedAt = undefined;
        } else {
          next.state = "thinking";
          next.currentTool = undefined;
          next.toolStartedAt = undefined;
        }
      } else {
        next.state = "thinking";
        next.currentTool = undefined;
        next.toolStartedAt = undefined;
      }
    } else if (typeof content === "string") {
      next.state = "thinking";
      next.currentTool = undefined;
      next.toolStartedAt = undefined;
    }
  }
  return next;
}

function computeOfficeState(office: Office, now?: number): Office {
  let waitingCount = 0;
  let changed = false;
  const nextSessions = { ...office.sessions };

  for (const pid of Object.keys(nextSessions)) {
    const session = nextSessions[Number(pid)];
    let sessionChanged = false;
    let nextSession = { ...session };

    // Check parent session
    if (now !== undefined && nextSession.state === "working" && nextSession.toolStartedAt) {
      if (now - nextSession.toolStartedAt >= office.waitingThresholdMs) {
        nextSession.state = "waiting_on_user";
        sessionChanged = true;
      }
    }

    if (nextSession.state === "waiting_on_user") {
      waitingCount++;
    }

    // Check subagents
    let subagentsChanged = false;
    const nextSubagents = { ...nextSession.subagents };
    for (const subId of Object.keys(nextSubagents)) {
      const sub = nextSubagents[subId];
      if (now !== undefined && sub.state === "working" && sub.toolStartedAt) {
        if (now - sub.toolStartedAt >= office.waitingThresholdMs) {
          nextSubagents[subId] = { ...sub, state: "waiting_on_user" };
          subagentsChanged = true;
        }
      }
      if (nextSubagents[subId].state === "waiting_on_user") {
        waitingCount++;
      }
    }

    if (subagentsChanged) {
      nextSession.subagents = nextSubagents;
      sessionChanged = true;
    }

    if (sessionChanged) {
      nextSessions[Number(pid)] = nextSession;
      changed = true;
    }
  }

  // Update count if it changed, or if sessions changed
  if (changed || waitingCount !== office.waitingCount) {
    return { ...office, sessions: nextSessions, waitingCount };
  }

  return office;
}

export function reduce(office: Office, event: DomainEvent): Office {
  let next = office;

  switch (event.type) {
    case "session_appeared": {
      if (!office.sessions[event.pid]) {
        next = {
          ...office,
          sessions: {
            ...office.sessions,
            [event.pid]: {
              pid: event.pid,
              sessionId: event.sessionId,
              cwd: event.cwd,
              name: event.name,
              state: "idle",
              projectKey: event.projectKey,
              startedAt: event.startedAt,
              feed: [],
              subagents: {},
            },
          },
        };
      }
      break;
    }

    case "session_ended": {
      const { [event.pid]: _removed, ...rest } = office.sessions;
      next = { ...office, sessions: rest };
      break;
    }

    case "transcript_line": {
      const session = office.sessions[event.pid];
      if (session) {
        next = {
          ...office,
          sessions: {
            ...office.sessions,
            [event.pid]: processTranscriptLine(session, event.line),
          },
        };
      }
      break;
    }

    case "subagent_appeared": {
      const session = office.sessions[event.pid];
      if (session) {
        const newSubagent: Subagent = {
          subagentId: event.subagentId,
          agentType: event.agentType,
          description: event.description,
          toolUseId: event.toolUseId,
          state: "idle",
        };
        next = {
          ...office,
          sessions: {
            ...office.sessions,
            [event.pid]: {
              ...session,
              subagents: {
                ...session.subagents,
                [event.subagentId]: newSubagent,
              }
            }
          }
        };
      }
      break;
    }

    case "subagent_ended": {
      const session = office.sessions[event.pid];
      if (session) {
        const { [event.subagentId]: _removed, ...restSubagents } = session.subagents;
        next = {
          ...office,
          sessions: {
            ...office.sessions,
            [event.pid]: {
              ...session,
              subagents: restSubagents,
            }
          }
        };
      }
      break;
    }

    case "subagent_transcript_line": {
      const session = office.sessions[event.pid];
      if (session) {
        const subagent = session.subagents[event.subagentId];
        if (subagent) {
          next = {
            ...office,
            sessions: {
              ...office.sessions,
              [event.pid]: {
                ...session,
                subagents: {
                  ...session.subagents,
                  [event.subagentId]: processSubagentTranscriptLine(subagent, event.line),
                }
              }
            }
          };
        }
      }
      break;
    }

    case "tick": {
      return computeOfficeState(next, event.now);
    }
  }

  // Also try to compute office state after any transcript updates that might clear a waiting state.
  return computeOfficeState(next);
}

export function emptyOffice(): Office {
  return { sessions: {}, waitingCount: 0, waitingThresholdMs: 15000 };
}
