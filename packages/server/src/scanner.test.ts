import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyScanSnapshot, projectSlug, scan } from "./scanner.js";

describe("projectSlug", () => {
  it("turns every non-alphanumeric character into a dash, as Claude Code does", () => {
    expect(projectSlug("/Users/me/Herd/my.site/.claude/worktrees/a_b")).toBe("-Users-me-Herd-my-site--claude-worktrees-a-b");
  });
});

describe("scan", () => {
  let home: string;
  const entry = (status: string, statusUpdatedAt: number, sessionId = "s-1") =>
    // The test process itself is the "live" Claude Code pid.
    JSON.stringify({ pid: process.pid, sessionId, cwd: home, name: "demo", startedAt: 1, status, statusUpdatedAt });

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agent-verse-"));
    await mkdir(join(home, "sessions"));
    process.env.CLAUDE_HOME = home;
  });
  afterEach(async () => {
    delete process.env.CLAUDE_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("reports the registry status with the session, then only when it changes", async () => {
    const file = join(home, "sessions", `${process.pid}.json`);
    await writeFile(file, entry("busy", 100));
    const first = await scan(emptyScanSnapshot());
    expect(first.events.map((e) => e.type)).toEqual(["session_appeared", "session_status"]);
    expect(first.events[1]).toMatchObject({ status: "busy", at: 100, sessionId: "s-1" });

    const quiet = await scan(first.snapshot);
    expect(quiet.events).toEqual([]);

    await writeFile(file, entry("idle", 200, "s-2"));
    const changed = await scan(quiet.snapshot);
    expect(changed.events).toEqual([{ type: "session_status", pid: process.pid, status: "idle", at: 200, sessionId: "s-2" }]);
  });
});
