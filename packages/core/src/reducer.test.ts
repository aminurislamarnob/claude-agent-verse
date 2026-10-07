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
    state: "idle",
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
    });

    it("can add multiple sessions", () => {
      const office = officeWith(
        appeared({ pid: 1001 }),
        appeared({ pid: 1002, sessionId: "ddd-eee-fff", name: "add-tests" }),
      );
      expect(Object.keys(office.sessions)).toHaveLength(2);
      expect(office.sessions[1001]).toBeDefined();
      expect(office.sessions[1002]).toBeDefined();
    });
  });

  describe("session_busy", () => {
    it("sets an existing session to busy", () => {
      const office = officeWith(appeared({ state: "idle" }), {
        type: "session_busy",
        pid: 1001,
      });
      expect(office.sessions[1001]!.state).toBe("busy");
    });

    it("is a no-op for unknown pid", () => {
      const office = officeWith({ type: "session_busy", pid: 9999 });
      expect(Object.keys(office.sessions)).toHaveLength(0);
    });
  });

  describe("session_idle", () => {
    it("sets an existing session to idle", () => {
      const office = officeWith(
        appeared({ state: "busy" }),
        { type: "session_idle", pid: 1001 },
      );
      expect(office.sessions[1001]!.state).toBe("idle");
    });

    it("is a no-op for unknown pid", () => {
      const office = officeWith({ type: "session_idle", pid: 9999 });
      expect(Object.keys(office.sessions)).toHaveLength(0);
    });
  });

  describe("session_ended", () => {
    it("removes the session from the office", () => {
      const office = officeWith(appeared(), { type: "session_ended", pid: 1001 });
      expect(Object.keys(office.sessions)).toHaveLength(0);
    });

    it("is a no-op for unknown pid", () => {
      const before = officeWith(appeared());
      const after = reduce(before, { type: "session_ended", pid: 9999 });
      expect(Object.keys(after.sessions)).toHaveLength(1);
    });
  });

  describe("full lifecycle: appear → busy → idle → ended", () => {
    it("transitions correctly through the whole lifecycle", () => {
      let office = emptyOffice();

      // appear (idle)
      office = reduce(office, appeared({ state: "idle" }));
      expect(office.sessions[1001]!.state).toBe("idle");

      // busy
      office = reduce(office, { type: "session_busy", pid: 1001 });
      expect(office.sessions[1001]!.state).toBe("busy");

      // idle again
      office = reduce(office, { type: "session_idle", pid: 1001 });
      expect(office.sessions[1001]!.state).toBe("idle");

      // busy again
      office = reduce(office, { type: "session_busy", pid: 1001 });
      expect(office.sessions[1001]!.state).toBe("busy");

      // ended
      office = reduce(office, { type: "session_ended", pid: 1001 });
      expect(office.sessions[1001]).toBeUndefined();
      expect(Object.keys(office.sessions)).toHaveLength(0);
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
