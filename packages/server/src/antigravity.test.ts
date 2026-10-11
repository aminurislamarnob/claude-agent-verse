import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyOffice, reduce } from "@claude-agent-verse/core";
import type { Office } from "@claude-agent-verse/core";
import { AG_LIVE_MS, emptyAgScanSnapshot, scanAntigravity, workspaceFromStep } from "./antigravity.js";

const FIXTURE = fileURLToPath(
  new URL("../fixtures/basic/gemini/antigravity/brain/7c1f0a52-3e9b-4d1a-9f60-2b8e5d4c1a90/.system_generated/logs/transcript.jsonl", import.meta.url),
);

describe("scanAntigravity", () => {
  let home: string;

  async function conversation(root: string, id: string, lines = "") {
    const logs = join(home, root, "brain", id, ".system_generated", "logs");
    await mkdir(logs, { recursive: true });
    const file = join(logs, "transcript.jsonl");
    await writeFile(file, lines);
    return file;
  }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agent-verse-agy-"));
    process.env.ANTIGRAVITY_HOME = home;
  });
  afterEach(async () => {
    delete process.env.ANTIGRAVITY_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("finds conversations from every Antigravity surface and keeps their ids stable", async () => {
    await conversation("antigravity", "conv-app");
    await conversation("antigravity-cli", "conv-cli");
    // A brain folder without a transcript yet, and stray files beside it, are not conversations.
    await mkdir(join(home, "antigravity-ide", "brain", "conv-empty"), { recursive: true });
    await writeFile(join(home, "oauth_creds.json"), "{}");

    const first = await scanAntigravity(emptyAgScanSnapshot());
    const office = first.events.reduce(reduce, emptyOffice());
    const sessions = Object.values(office.sessions);
    expect(sessions.map((s) => [s.sessionId, s.agent, s.projectKey]).sort()).toEqual([
      ["conv-app", "antigravity", "antigravity"],
      ["conv-cli", "antigravity", "antigravity"],
    ]);
    expect(sessions.every((s) => s.pid < 0)).toBe(true);

    const again = await scanAntigravity(first.snapshot);
    expect(again.events).toEqual([]);
    expect([...again.snapshot.conversations.values()]).toEqual([...first.snapshot.conversations.values()]);
  });

  it("leaves out conversations nobody has touched lately, and lets them go when they fall quiet", async () => {
    const old = await conversation("antigravity", "conv-old");
    const live = await conversation("antigravity", "conv-live");
    const past = new Date(Date.now() - AG_LIVE_MS - 60_000);
    await utimes(old, past, past);

    const first = await scanAntigravity(emptyAgScanSnapshot());
    let office: Office = first.events.reduce(reduce, emptyOffice());
    expect(Object.values(office.sessions).map((s) => s.sessionId)).toEqual(["conv-live"]);

    await utimes(live, past, past);
    const later = await scanAntigravity(first.snapshot);
    office = later.events.reduce(reduce, office);
    expect(office.sessions).toEqual({});
  });

  it("drives the agent from its transcript", async () => {
    await conversation("antigravity", "7c1f0a52-3e9b-4d1a-9f60-2b8e5d4c1a90", await readFile(FIXTURE, "utf-8"));
    const { events } = await scanAntigravity(emptyAgScanSnapshot());
    const appeared = events[0];
    if (appeared?.type !== "session_appeared") throw new Error("expected the conversation to appear");

    const steps = (await readFile(FIXTURE, "utf-8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const office = [
      ...events,
      ...steps.map((line) => ({ type: "transcript_line" as const, pid: appeared.pid, line })),
    ].reduce(reduce, emptyOffice());

    const s = office.sessions[appeared.pid]!;
    expect(s.title).toBe("Add a dark mode toggle to the settings page");
    expect(s.state).toBe("idle");
    expect(s.feed.some((e) => e.excerpt === "Used tool: run_command")).toBe(true);
  });
});

describe("workspaceFromStep", () => {
  beforeEach(() => {
    process.env.ANTIGRAVITY_HOME = "/home/dev/.gemini";
  });
  afterEach(() => {
    delete process.env.ANTIGRAVITY_HOME;
  });

  const call = (args: unknown) => ({ type: "PLANNER_RESPONSE", tool_calls: [{ name: "tool", args }] });

  it("prefers a command's working directory", () => {
    expect(workspaceFromStep(call({ CommandLine: "pnpm test", Cwd: "/work/acme-app" }))).toBe("/work/acme-app");
  });

  it("uses the folder of a file the agent edits", () => {
    expect(workspaceFromStep(call({ TargetFile: "/work/acme-app/src/theme.ts" }))).toBe("/work/acme-app/src");
  });

  it("reads arguments sent as a JSON string", () => {
    expect(workspaceFromStep(call(JSON.stringify({ DirectoryPath: "/work/acme-app" })))).toBe("/work/acme-app");
  });

  it("ignores Antigravity's own brain folder, relative paths and steps without tools", () => {
    expect(workspaceFromStep(call({ TargetFile: "/home/dev/.gemini/antigravity/brain/abc/task.md" }))).toBeUndefined();
    expect(workspaceFromStep(call({ TargetFile: "src/theme.ts" }))).toBeUndefined();
    expect(workspaceFromStep({ type: "USER_INPUT", content: "/work/acme-app" })).toBeUndefined();
    expect(workspaceFromStep(null)).toBeUndefined();
  });
});
