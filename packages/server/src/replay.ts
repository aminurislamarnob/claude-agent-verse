import { readFile, readdir, mkdir, rm, appendFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

interface WriteAction {
  timestamp: number;
  execute: () => Promise<void>;
}

async function parseArgs() {
  const args = process.argv.slice(2);
  let fixture = "";
  let speed = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fixture") fixture = args[++i];
    if (args[i] === "--speed") speed = parseFloat(args[++i]);
  }

  if (!fixture) {
    console.error("Usage: pnpm replay --fixture <path> [--speed <multiplier>]");
    process.exit(1);
  }

  return { fixture: join(process.cwd(), fixture), speed };
}

async function collectWrites(fixtureDir: string, destDir: string): Promise<WriteAction[]> {
  const writes: WriteAction[] = [];

  // Parse sessions
  try {
    const sessionsDir = join(fixtureDir, "sessions");
    const sessionFiles = await readdir(sessionsDir);
    for (const file of sessionFiles) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(join(sessionsDir, file), "utf-8");
      const parsed = JSON.parse(content);
      const timestamp = parsed.startedAt || Date.now();
      writes.push({
        timestamp,
        execute: async () => {
          const dest = join(destDir, "sessions", file);
          await mkdir(dirname(dest), { recursive: true });
          await writeFile(dest, content, "utf-8");
        },
      });
    }
  } catch {}

  // Parse projects
  try {
    const projectsDir = join(fixtureDir, "projects");
    const projects = await readdir(projectsDir);
    for (const project of projects) {
      const projPath = join(projectsDir, project);
      const files = await readdir(projPath);

      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const content = await readFile(join(projPath, file), "utf-8");
          const lines = content.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              let timestamp = Date.now();
              if (parsed.timestamp) {
                timestamp = new Date(parsed.timestamp).getTime();
              }
              writes.push({
                timestamp,
                execute: async () => {
                  const dest = join(destDir, "projects", project, file);
                  await mkdir(dirname(dest), { recursive: true });
                  await appendFile(dest, line + "\n", "utf-8");
                },
              });
            } catch {}
          }
        }
      }

      // Subagents live beside each session transcript: <project>/<sessionId>/subagents
      for (const sessionDir of files.filter((f) => !f.endsWith(".jsonl"))) {
        try {
          const subagentsDir = join(projPath, sessionDir, "subagents");
          const subFiles = await readdir(subagentsDir);
          for (const file of subFiles) {
            if (file.endsWith(".meta.json")) {
              const content = await readFile(join(subagentsDir, file), "utf-8");
              const jsonlContent = await readFile(join(subagentsDir, file.replace(".meta.json", ".jsonl")), "utf-8").catch(() => "");
              let timestamp = Date.now();
              const firstLine = jsonlContent.split("\n")[0];
              if (firstLine) {
                try {
                  const parsed = JSON.parse(firstLine);
                  if (parsed.timestamp) timestamp = new Date(parsed.timestamp).getTime() - 1;
                } catch {}
              }
              writes.push({
                timestamp,
                execute: async () => {
                  const dest = join(destDir, "projects", project, sessionDir, "subagents", file);
                  await mkdir(dirname(dest), { recursive: true });
                  await writeFile(dest, content, "utf-8");
                },
              });
            } else if (file.endsWith(".jsonl")) {
              const content = await readFile(join(subagentsDir, file), "utf-8");
              const lines = content.split("\n").filter((l) => l.trim());
              for (const line of lines) {
                try {
                  const parsed = JSON.parse(line);
                  let timestamp = Date.now();
                  if (parsed.timestamp) {
                    timestamp = new Date(parsed.timestamp).getTime();
                  }
                  writes.push({
                    timestamp,
                    execute: async () => {
                      const dest = join(destDir, "projects", project, sessionDir, "subagents", file);
                      await mkdir(dirname(dest), { recursive: true });
                      await appendFile(dest, line + "\n", "utf-8");
                    },
                  });
                } catch {}
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return writes.sort((a, b) => a.timestamp - b.timestamp);
}

async function main() {
  const { fixture, speed } = await parseArgs();
  const claudeHome = join(process.cwd(), "tmp", "replay", Date.now().toString());

  console.log(`[replay] Fixture: ${fixture}`);
  console.log(`[replay] Speed: ${speed}x`);
  console.log(`[replay] Mock CLAUDE_HOME: ${claudeHome}`);

  const writes = await collectWrites(fixture, claudeHome);
  if (writes.length === 0) {
    console.error("[replay] No events found in fixture.");
    process.exit(1);
  }

  // Create empty dirs
  await mkdir(join(claudeHome, "sessions"), { recursive: true });
  await mkdir(join(claudeHome, "projects"), { recursive: true });

  // Start main.ts
  const server = spawn("npx", ["tsx", join(__dirname, "main.ts")], {
    env: {
      ...process.env,
      CLAUDE_HOME: claudeHome,
      CLAUDE_REPLAY_MODE: "1",
    },
    stdio: "inherit",
  });

  server.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  // Give server time to start
  await new Promise((res) => setTimeout(res, 1000));

  console.log(`[replay] Starting playback of ${writes.length} events...`);
  
  const startTime = Date.now();
  const firstEventTime = writes[0].timestamp;

  for (const write of writes) {
    const elapsedReal = Date.now() - startTime;
    const elapsedSimulated = write.timestamp - firstEventTime;
    const targetReal = elapsedSimulated / speed;

    if (targetReal > elapsedReal) {
      await new Promise((res) => setTimeout(res, targetReal - elapsedReal));
    }

    await write.execute();
  }

  console.log("[replay] Playback complete. Server remains running.");
}

main().catch(console.error);
