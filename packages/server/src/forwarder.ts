import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { request } from "node:http";

function getClaudeHome(): string {
  return process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
}

async function forward(): Promise<void> {
  const timeoutId = setTimeout(() => {
    process.exit(0);
  }, 1000);

  try {
    // 1. Read stdin
    let rawBody = "";
    for await (const chunk of process.stdin) {
      rawBody += chunk;
    }

    let hookData;
    try {
      hookData = JSON.parse(rawBody);
    } catch {
      process.exit(0);
    }

    // Wrap in DomainEvent
    const domainEvent = {
      type: "hook_event",
      pid: process.ppid,
      hookData,
    };
    const body = JSON.stringify(domainEvent);

    // 2. Read discovery file
    const discoveryPath = join(getClaudeHome(), "agent-verse-discovery.json");
    let discoveryData: { port: number; hookToken: string };
    try {
      const content = await readFile(discoveryPath, "utf-8");
      discoveryData = JSON.parse(content);
    } catch {
      process.exit(0); // Server not running or file unreadable
    }

    // 3. Send HTTP request
    const req = request(
      {
        hostname: "127.0.0.1",
        port: discoveryData.port,
        path: "/api/hooks",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${discoveryData.hookToken}`,
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          clearTimeout(timeoutId);
          process.exit(0);
        });
      }
    );

    req.on("error", () => {
      process.exit(0);
    });
    
    req.on("timeout", () => {
      req.destroy();
      process.exit(0);
    });
    req.setTimeout(1000);

    req.write(body);
    req.end();
  } catch {
    process.exit(0);
  }
}

forward();
