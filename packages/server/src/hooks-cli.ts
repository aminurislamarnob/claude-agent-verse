import { readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export const HOOKS = [
  "SessionStart",
  "SessionEnd",
  "Notification",
  "PermissionRequest",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SubagentStart",
  "SubagentStop"
];

export const TAG = "# claude-agent-verse";

export function getForwarderCommand(): string {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const forwarderPath = join(dir, "forwarder.ts");
  return `tsx ${forwarderPath} ${TAG}`;
}

async function getSettingsPath(): Promise<string> {
  return process.env.CLAUDE_HOME 
    ? join(process.env.CLAUDE_HOME, "settings.json")
    : join(homedir(), ".claude.json");
}

export function isTagged(entry: any): boolean {
  if (typeof entry === "string") {
    return entry.includes(TAG);
  }
  if (entry && typeof entry === "object" && typeof entry.command === "string") {
    return entry.command.includes(TAG);
  }
  return false;
}

export function updateHooks(settings: any, command: "install" | "uninstall", forwarderCommand: string): { changed: boolean, nextSettings: any } {
  const nextSettings = JSON.parse(JSON.stringify(settings)); // deep copy
  if (!nextSettings.hooks) {
    nextSettings.hooks = {};
  }

  const newHookEntry = {
    type: "command",
    command: forwarderCommand
  };

  let changed = false;

  for (const hookName of HOOKS) {
    let current = nextSettings.hooks[hookName];
    const wasArray = Array.isArray(current);
    const wasMissing = current === undefined;
    
    let currentArr = wasArray ? [...current] : (wasMissing ? [] : [current]);

    if (command === "install") {
      const exists = currentArr.some(isTagged);
      if (!exists) {
        currentArr.push(newHookEntry);
        changed = true;
      }
    } else if (command === "uninstall") {
      const beforeLen = currentArr.length;
      currentArr = currentArr.filter((entry: any) => !isTagged(entry));
      if (currentArr.length !== beforeLen) {
        changed = true;
      }
    }

    if (currentArr.length === 0) {
      delete nextSettings.hooks[hookName];
    } else if (currentArr.length === 1 && !wasArray) {
      nextSettings.hooks[hookName] = currentArr[0];
    } else {
      nextSettings.hooks[hookName] = currentArr;
    }
  }

  if (Object.keys(nextSettings.hooks).length === 0) {
    delete nextSettings.hooks;
  }

  return { changed, nextSettings };
}

async function main() {
  const command = process.argv[2];
  if (command !== "install" && command !== "uninstall") {
    console.error("Usage: tsx src/hooks-cli.ts <install|uninstall>");
    process.exit(1);
  }

  const settingsPath = await getSettingsPath();
  let settings: any = {};

  try {
    const content = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(content);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      console.error(`Failed to read ${settingsPath}:`, err);
      process.exit(1);
    }
  }

  const forwarderCmd = getForwarderCommand();
  const { changed, nextSettings } = updateHooks(settings, command, forwarderCmd);

  if (!changed) {
    console.log(`No changes needed for ${command}.`);
    return;
  }

  const backupPath = `${settingsPath}.bak`;
  try {
    await stat(settingsPath);
    await copyFile(settingsPath, backupPath);
    console.log(`Backed up original settings to ${backupPath}`);
  } catch (err: any) {
    // If it doesn't exist, we don't back it up
  }

  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(nextSettings, null, 2) + "\n");

  try {
    const diff = execSync(`diff -u "${settingsPath}" "${tempPath}" || true`).toString();
    console.log("\nChanges:");
    console.log(diff);
  } catch {
    console.log("\nChanges applied (diff unavailable).");
  }

  await writeFile(settingsPath, JSON.stringify(nextSettings, null, 2) + "\n");
  console.log(`Successfully completed ${command}.`);
}

if (import.meta.url.endsWith(process.argv[1])) {
  main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
}
