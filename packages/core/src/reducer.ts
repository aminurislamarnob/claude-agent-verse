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

  if (line.type === "assistant") {
    if (Array.isArray(content)) {
      const toolUse = content.find((c: any) => c.type === "tool_use");
      if (toolUse) {
        next.state = "working";
        next.currentTool = toolUse.name;
        newFeedEvent = {
          id: uuid,
          role: "assistant",
          type: "tool_use",
          excerpt: `Used tool: ${toolUse.name}`,
        };
      } else {
        next.state = "idle";
        next.currentTool = undefined;
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
          newFeedEvent = {
            id: uuid,
            role: "user",
            type: "error",
            excerpt: "Tool error occurred.",
          };
        } else {
          next.state = "thinking";
          next.currentTool = undefined;
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

  if (line.type === "assistant") {
    if (Array.isArray(content)) {
      const toolUse = content.find((c: any) => c.type === "tool_use");
      if (toolUse) {
        next.state = "working";
        next.currentTool = toolUse.name;
      } else {
        next.state = "idle";
        next.currentTool = undefined;
      }
    }
  } else if (line.type === "user") {
    if (Array.isArray(content)) {
      const toolResult = content.find((c: any) => c.type === "tool_result");
      if (toolResult) {
        if (toolResult.is_error) {
          next.state = "error";
          next.currentTool = undefined;
        } else {
          next.state = "thinking";
          next.currentTool = undefined;
        }
      } else {
        next.state = "thinking";
        next.currentTool = undefined;
      }
    } else if (typeof content === "string") {
      next.state = "thinking";
      next.currentTool = undefined;
    }
  }
  return next;
}

export function reduce(office: Office, event: DomainEvent): Office {
  switch (event.type) {
    case "session_appeared": {
      // If we already know about this session, do not override its state
      // that we've accumulated from transcripts.
      if (office.sessions[event.pid]) {
        return office;
      }
      return {
        ...office,
        sessions: {
          ...office.sessions,
          [event.pid]: {
            pid: event.pid,
            sessionId: event.sessionId,
            cwd: event.cwd,
            name: event.name,
            state: "idle", // initial state until transcript tailing catches up
            projectKey: event.projectKey,
            startedAt: event.startedAt,
            feed: [],
            subagents: {},
          },
        },
      };
    }

    case "session_ended": {
      const { [event.pid]: _removed, ...rest } = office.sessions;
      return { ...office, sessions: rest };
    }

    case "transcript_line": {
      const session = office.sessions[event.pid];
      if (!session) return office;
      return {
        ...office,
        sessions: {
          ...office.sessions,
          [event.pid]: processTranscriptLine(session, event.line),
        },
      };
    }

    case "subagent_appeared": {
      const session = office.sessions[event.pid];
      if (!session) return office;
      
      const newSubagent: Subagent = {
        subagentId: event.subagentId,
        agentType: event.agentType,
        description: event.description,
        toolUseId: event.toolUseId,
        state: "idle",
      };

      return {
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

    case "subagent_ended": {
      const session = office.sessions[event.pid];
      if (!session) return office;

      const { [event.subagentId]: _removed, ...restSubagents } = session.subagents;

      return {
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

    case "subagent_transcript_line": {
      const session = office.sessions[event.pid];
      if (!session) return office;
      const subagent = session.subagents[event.subagentId];
      if (!subagent) return office;

      return {
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

    default:
      return office;
  }
}

export function emptyOffice(): Office {
  return { sessions: {} };
}
