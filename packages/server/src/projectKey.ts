import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getProjectKey(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], { cwd });
    const url = stdout.trim();
    if (url) {
      const parts = url.split("/");
      const last = parts[parts.length - 1];
      return last.replace(/\.git$/, "");
    }
  } catch (err) {
    // Ignore and fallback
  }

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    return basename(stdout.trim());
  } catch (err) {
    return basename(cwd);
  }
}
