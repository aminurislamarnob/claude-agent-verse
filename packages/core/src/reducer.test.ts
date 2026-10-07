import { describe, it, expect } from "vitest";
import { reduce, emptyOffice } from "./reducer.js";
import type { Office, DomainEvent, SessionAppeared } from "./types.js";

// ── Fixture helpers ──────────────────────────────────────────

function appeared(overrides: Partial<SessionAppeared> = {}): SessionAppeared {
  return {
    type: "session_appeared",
    pid: 1001,
    sessionId: "aaa-bbb-ccc",
    cwd: "/projects/acme-app",
    name: "fix-login-bug",
    projectKey: "acme-app",
    startedAt: 1700000000000,
    ...overrides,
  };
}

function officeWith(...events: DomainEvent[]): Office {
  return events.reduce(reduce, emptyOffice());
}

// ── Tests ────────────────────────────────────────────────────

describe("reducer", () => {
  it("starts with an empty office", () => {
    const office = emptyOffice();
    expect(office.sessions).toEqual({});
  });

  describe("session_appeared", () => {
    it("adds a session to the office", () => {
      const office = officeWith(appeared());
      expect(Object.keys(office.sessions)).toHaveLength(1);
      const s = office.sessions[1001]!;
      expect(s.pid).toBe(1001);
      expect(s.sessionId).toBe("aaa-bbb-ccc");
      expect(s.cwd).toBe("/projects/acme-app");
      expect(s.name).toBe("fix-login-bug");
      expect(s.state).toBe("idle");
      expect(s.projectKey).toBe("acme-app");
      expect(s.startedAt).toBe(1700000000000);
      expect(s.feed).toEqual([]);
    });
  });

  describe("transcript_line", () => {
    it("processes ai-title", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: { type: "ai-title", aiTitle: "Fix login flow" },
        }
      );
      expect(office.sessions[1001]!.title).toBe("Fix login flow");
    });

    it("processes gitBranch and last-prompt", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: { gitBranch: "feature/login-bug" },
        },
        {
          type: "transcript_line",
          pid: 1001,
          line: { type: "last-prompt", lastPrompt: "Can you fix the login?" },
        }
      );
      expect(office.sessions[1001]!.gitBranch).toBe("feature/login-bug");
      expect(office.sessions[1001]!.lastPrompt).toBe("Can you fix the login?");
    });

    it("transitions to working when tool is used", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            type: "assistant",
            message: {
              content: [
                { type: "text", text: "I will use Bash" },
                { type: "tool_use", name: "Bash", id: "tool_1" }
              ]
            }
          }
        }
      );
      const s = office.sessions[1001]!;
      expect(s.state).toBe("working");
      expect(s.currentTool).toBe("Bash");
      expect(s.feed.length).toBe(1);
      expect(s.feed[0].type).toBe("tool_use");
    });

    it("transitions to error when tool result is error", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            type: "user",
            message: {
              content: [
                { type: "tool_result", tool_use_id: "tool_1", is_error: true, content: "Command failed" }
              ]
            }
          }
        }
      );
      const s = office.sessions[1001]!;
      expect(s.state).toBe("error");
      expect(s.currentTool).toBeUndefined();
    });

    it("transitions to thinking when user provides successful tool result", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            type: "user",
            message: {
              content: [
                { type: "tool_result", tool_use_id: "tool_1", is_error: false, content: "Success" }
              ]
            }
          }
        }
      );
      const s = office.sessions[1001]!;
      expect(s.state).toBe("thinking");
    });

    it("transitions to thinking when user provides text", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            type: "user",
            message: {
              content: [
                { type: "text", text: "Please continue" }
              ]
            }
          }
        }
      );
      const s = office.sessions[1001]!;
      expect(s.state).toBe("thinking");
    });

    it("transitions to idle when assistant responds with text without tools", () => {
      const office = officeWith(
        appeared(),
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            type: "assistant",
            message: {
              content: [
                { type: "text", text: "I am done." }
              ]
            }
          }
        }
      );
      const s = office.sessions[1001]!;
      expect(s.state).toBe("idle");
    });
  });

  describe("session_ended", () => {
    it("removes the session from the office", () => {
      const office = officeWith(appeared(), { type: "session_ended", pid: 1001 });
      expect(Object.keys(office.sessions)).toHaveLength(0);
    });
  });

  describe("subagent lifecycle", () => {
    it("can spawn and run a subagent", () => {
      let office = emptyOffice();
      office = reduce(office, appeared());

      // Spawn
      office = reduce(office, {
        type: "subagent_appeared",
        pid: 1001,
        subagentId: "agent-123",
        agentType: "Researcher",
        description: "Find files",
        toolUseId: "toolu_xyz",
      });

      expect(office.sessions[1001]!.subagents["agent-123"]).toBeDefined();
      expect(office.sessions[1001]!.subagents["agent-123"].state).toBe("idle");

      // Work
      office = reduce(office, {
        type: "subagent_transcript_line",
        pid: 1001,
        subagentId: "agent-123",
        line: {
          type: "assistant",
          message: { content: [{ type: "tool_use", name: "Grep" }] }
        }
      });
      expect(office.sessions[1001]!.subagents["agent-123"].state).toBe("working");
      expect(office.sessions[1001]!.subagents["agent-123"].currentTool).toBe("Grep");

      // End
      office = reduce(office, {
        type: "subagent_ended",
        pid: 1001,
        subagentId: "agent-123",
      });
      expect(office.sessions[1001]!.subagents["agent-123"]).toBeUndefined();
    });
  });

  describe("catch-up", () => {
    it("yields the same Office as continuous observation", () => {
      // Continuous observation
      let office = emptyOffice();
      office = reduce(office, appeared({ state: "idle" }));
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: { type: "ai-title", aiTitle: "Fix login bug" }
      });
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: { gitBranch: "feature/login" }
      });
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: {
          uuid: "u1",
          timestamp: "2024-01-01T00:00:00Z",
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Bash", id: "t1" }
            ]
          }
        }
      });
      office = reduce(office, {
        type: "subagent_appeared",
        pid: 1001,
        subagentId: "agent-999",
        agentType: "Coder",
        description: "Write tests",
        toolUseId: "t1",
      });
      office = reduce(office, {
        type: "subagent_transcript_line",
        pid: 1001,
        subagentId: "agent-999",
        line: {
          uuid: "s1",
          timestamp: "2024-01-01T00:00:01Z",
          type: "assistant",
          message: { content: [{ type: "tool_use", name: "Editor" }] }
        }
      });
      const continuousOffice = office;

      // Catch-up (all at once)
      const catchUpOffice = officeWith(
        appeared({ state: "idle" }),
        {
          type: "transcript_line",
          pid: 1001,
          line: { type: "ai-title", aiTitle: "Fix login bug" }
        },
        {
          type: "transcript_line",
          pid: 1001,
          line: { gitBranch: "feature/login" }
        },
        {
          type: "transcript_line",
          pid: 1001,
          line: {
            uuid: "u1",
            timestamp: "2024-01-01T00:00:00Z",
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Bash", id: "t1" }
              ]
            }
          }
        },
        {
          type: "subagent_appeared",
          pid: 1001,
          subagentId: "agent-999",
          agentType: "Coder",
          description: "Write tests",
          toolUseId: "t1",
        },
        {
          type: "subagent_transcript_line",
          pid: 1001,
          subagentId: "agent-999",
          line: {
            uuid: "s1",
            timestamp: "2024-01-01T00:00:01Z",
            type: "assistant",
            message: { content: [{ type: "tool_use", name: "Editor" }] }
          }
        }
      );

      expect(catchUpOffice).toEqual(continuousOffice);
      expect(catchUpOffice.sessions[1001]!.state).toBe("working");
      expect(catchUpOffice.sessions[1001]!.currentTool).toBe("Bash");
      expect(catchUpOffice.sessions[1001]!.title).toBe("Fix login bug");
      expect(catchUpOffice.sessions[1001]!.gitBranch).toBe("feature/login");
      expect(catchUpOffice.sessions[1001]!.subagents["agent-999"].state).toBe("working");
    });
  });

  describe("waiting_on_user inference", () => {
    it("transitions to waiting_on_user after threshold", () => {
      let office = emptyOffice();
      office = reduce(office, appeared());

      // Start working at T=1000
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: {
          timestamp: new Date(1000).toISOString(),
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Bash", id: "tool_1" }
            ]
          }
        }
      });

      expect(office.sessions[1001]!.state).toBe("working");
      expect(office.waitingCount).toBe(0);

      // Tick before threshold (T=2000)
      office = reduce(office, { type: "tick", now: 2000 });
      expect(office.sessions[1001]!.state).toBe("working");
      expect(office.waitingCount).toBe(0);

      // Tick after threshold (T=17000)
      office = reduce(office, { type: "tick", now: 17000 });
      expect(office.sessions[1001]!.state).toBe("waiting_on_user");
      expect(office.waitingCount).toBe(1);
    });

    it("clears waiting state when result arrives", () => {
      let office = emptyOffice();
      office = reduce(office, appeared());

      // Start working at T=1000
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: {
          timestamp: new Date(1000).toISOString(),
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Bash", id: "tool_1" }
            ]
          }
        }
      });

      // Tick after threshold
      office = reduce(office, { type: "tick", now: 17000 });
      expect(office.sessions[1001]!.state).toBe("waiting_on_user");

      // Result arrives
      office = reduce(office, {
        type: "transcript_line",
        pid: 1001,
        line: {
          timestamp: new Date(18000).toISOString(),
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tool_1", is_error: false, content: "Done" }
            ]
          }
        }
      });

      expect(office.sessions[1001]!.state).toBe("thinking");
      expect(office.waitingCount).toBe(0);
    });

    it("applies to subagents as well", () => {
      let office = emptyOffice();
      office = reduce(office, appeared());
      office = reduce(office, {
        type: "subagent_appeared",
        pid: 1001,
        subagentId: "sub-1",
        agentType: "Coder",
        description: "",
        toolUseId: "t1"
      });

      // Subagent works
      office = reduce(office, {
        type: "subagent_transcript_line",
        pid: 1001,
        subagentId: "sub-1",
        line: {
          timestamp: new Date(1000).toISOString(),
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "Bash", id: "t2" }
            ]
          }
        }
      });

      // Tick past threshold
      office = reduce(office, { type: "tick", now: 20000 });
      
      expect(office.sessions[1001]!.subagents["sub-1"].state).toBe("waiting_on_user");
      expect(office.waitingCount).toBe(1);
    });
  });

  describe("unknown event types", () => {
    it("are silently skipped", () => {
      const office = officeWith(appeared());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const after = reduce(office, { type: "some_future_event" } as any);
      expect(after).toEqual(office);
    });
  });
});
