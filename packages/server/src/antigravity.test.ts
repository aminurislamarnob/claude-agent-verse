import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyOffice, reduce } from "@claude-agent-verse/core";
import type { Office } from "@claude-agent-verse/core";
import { AG_LIVE_MS, emptyAgScanSnapshot, scanAntigravity, toolPathFromStep, workspaceDir } from "./antigravity.js";

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

describe("toolPathFromStep", () => {
  beforeEach(() => {
    process.env.ANTIGRAVITY_HOME = "/home/dev/.gemini";
  });
  afterEach(() => {
    delete process.env.ANTIGRAVITY_HOME;
  });

  const call = (args: unknown) => ({ type: "PLANNER_RESPONSE", tool_calls: [{ name: "tool", args }] });

  it("prefers a command's working directory over the file it touches", () => {
    expect(toolPathFromStep(call({ CommandLine: "pnpm test", Cwd: "/work/acme-app" }))).toBe("/work/acme-app");
    expect(toolPathFromStep(call({ TargetFile: "/work/acme-app/src/theme.ts", Cwd: "/work/acme-app" }))).toBe("/work/acme-app");
  });

  it("names the file the agent edits, as written", () => {
    expect(toolPathFromStep(call({ TargetFile: "/work/acme-app/src/theme.ts" }))).toBe("/work/acme-app/src/theme.ts");
  });

  it("reads arguments sent as a JSON string", () => {
    expect(toolPathFromStep(call(JSON.stringify({ DirectoryPath: "/work/acme-app" })))).toBe("/work/acme-app");
  });

  it("ignores Antigravity's own brain folder, relative paths and steps without tools", () => {
    expect(toolPathFromStep(call({ TargetFile: "/home/dev/.gemini/antigravity/brain/abc/task.md" }))).toBeUndefined();
    expect(toolPathFromStep(call({ TargetFile: "src/theme.ts" }))).toBeUndefined();
    expect(toolPathFromStep({ type: "USER_INPUT", content: "/work/acme-app" })).toBeUndefined();
    expect(toolPathFromStep(null)).toBeUndefined();
  });
});

describe("workspaceDir", () => {
  let root: string;
  let app: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agent-verse-ws-"));
    app = join(root, "acme-app");
    await mkdir(join(app, "src"), { recursive: true });
    await mkdir(join(root, "acme.app"), { recursive: true });
    await writeFile(join(app, "Makefile"), "");
    await writeFile(join(app, ".env"), "");
    await writeFile(join(app, "src", "theme.ts"), "");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keeps a folder, even one with a dot in its name", async () => {
    expect(await workspaceDir(app)).toBe(app);
    expect(await workspaceDir(join(root, "acme.app"))).toBe(join(root, "acme.app"));
  });

  it("uses the folder of a file, even one without an extension", async () => {
    expect(await workspaceDir(join(app, "src", "theme.ts"))).toBe(join(app, "src"));
    expect(await workspaceDir(join(app, "Makefile"))).toBe(app);
    expect(await workspaceDir(join(app, ".env"))).toBe(app);
  });

  it("uses the nearest existing folder for a file about to be written", async () => {
    expect(await workspaceDir(join(app, "src", "new.ts"))).toBe(join(app, "src"));
    expect(await workspaceDir(join(app, "src", "theme", "dark.ts"))).toBe(join(app, "src"));
  });

  it("reads a path that is not on this machine by its name", async () => {
    const elsewhere = join("/", `agent-verse-nowhere-${Date.now()}`, "proj");
    expect(await workspaceDir(join(elsewhere, "src", "x.ts"))).toBe(join(elsewhere, "src"));
    expect(await workspaceDir(elsewhere)).toBe(elsewhere);
  });
});
