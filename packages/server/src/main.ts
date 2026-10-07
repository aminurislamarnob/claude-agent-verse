/**
 * Server main entry point.
 *
 * - Polls the session registry every ~1s
 * - Runs domain events through the core reducer
 * - Pushes the Office snapshot to connected browsers via WebSocket
 * - Serves the web frontend's static files
 * - Binds to 127.0.0.1 only
 */

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { reduce, emptyOffice } from "@claude-agent-verse/core";
import type { Office, DomainEvent } from "@claude-agent-verse/core";
import { scan, emptyScanSnapshot, claudeHome } from "./scanner.js";
import type { ScanSnapshot } from "./scanner.js";
import { generateToken, isAllowedOrigin, isValidToken } from "./auth.js";
import { FileTailer } from "./tailer.js";

const HOST = "127.0.0.1";
const PORT = parseInt(process.env.PORT ?? "4800", 10);
const POLL_INTERVAL_MS = 1000;

const browserToken = generateToken();

// Resolve the web package's dist directory for serving static files.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = join(__dirname, "..", "..", "web", "dist");

// ── State ────────────────────────────────────────────────────

let office: Office = emptyOffice();
let scanSnapshot: ScanSnapshot = emptyScanSnapshot();
const tailers = new Map<number, FileTailer>();
const subagentTailers = new Map<string, FileTailer>();
const finishedSubagents = new Set<string>();

// ── MIME types ───────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ── HTTP server (serves static files for the web frontend) ──

const server = createServer(async (req, res) => {
  // Origin check — only allow requests from the same origin.
  if (!isAllowedOrigin(req.headers.origin, `${HOST}:${PORT}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // API endpoint: GET /api/office — returns current Office as JSON.
  if (req.url === "/api/office") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(office));
    return;
  }

  // Static file serving for the web frontend.
  let filePath = req.url?.split("?")[0];
  if (!filePath || filePath === "/") {
    filePath = "/index.html";
  }

  // Security: prevent path traversal.
  filePath = filePath.replace(/\.\./g, "");

  const fullPath = join(WEB_DIST, filePath);
  const ext = extname(fullPath);
  const contentType = MIME[ext] ?? "application/octet-stream";

  try {
    const content = await readFile(fullPath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    // If file not found, serve index.html (SPA fallback).
    try {
      const indexContent = await readFile(join(WEB_DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(indexContent);
    } catch {
      res.writeHead(404);
      res.end("Not found — run `pnpm --filter web build` first.");
    }
  }
});

// ── WebSocket server ─────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  // Origin check for WebSocket connections.
  if (!isAllowedOrigin(req.headers.origin, `${HOST}:${PORT}`)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Token check for WebSocket connections.
  if (!isValidToken(req.url, browserToken)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  // Send full Office snapshot on connect.
  ws.send(JSON.stringify({ type: "snapshot", office }));
});

/** Broadcast a message to all connected clients. */
function broadcast(data: object): void {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}

// ── Event dispatch ───────────────────────────────────────────

function dispatch(event: DomainEvent): void {
  office = reduce(office, event);

  if (event.type === "session_appeared") {
    const slug = event.cwd.replace(/\//g, "-");
    const transcriptPath = join(
      claudeHome(),
      "projects",
      slug,
      `${event.sessionId}.jsonl`
    );

    const tailer = new FileTailer(transcriptPath);
    tailers.set(event.pid, tailer);

    tailer.on("line", (line) => {
      dispatch({ type: "transcript_line", pid: event.pid, line });
    });

    tailer.start().catch((err) => {
      console.error(`[tailer] Failed to start tailing for pid ${event.pid}:`, err);
    });
  } else if (event.type === "session_ended") {
    const tailer = tailers.get(event.pid);
    if (tailer) {
      tailer.stop();
      tailers.delete(event.pid);
    }
    // Clean up subagent tailers and finished states
    for (const [key, subTailer] of subagentTailers.entries()) {
      if (key.startsWith(`${event.pid}-`)) {
        subTailer.stop();
        subagentTailers.delete(key);
      }
    }
    for (const key of finishedSubagents) {
      if (key.startsWith(`${event.pid}-`)) {
        finishedSubagents.delete(key);
      }
    }
  }

  broadcast({ type: "snapshot", office });
}

// ── Poll loop ────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const result = await scan(scanSnapshot);
    scanSnapshot = result.snapshot;

    for (const event of result.events) {
      dispatch(event);
    }

    // Discover subagents for active sessions
    for (const session of Object.values(office.sessions)) {
      const slug = session.cwd.replace(/\//g, "-");
      const subagentsDir = join(claudeHome(), "projects", slug, "subagents");
      try {
        const files = await readdir(subagentsDir);
        const metaFiles = files.filter(f => f.endsWith(".meta.json"));
        for (const metaFile of metaFiles) {
          const subagentId = metaFile.replace("agent-", "").replace(".meta.json", "");
          const key = `${session.pid}-${subagentId}`;
          if (!subagentTailers.has(key) && !finishedSubagents.has(key)) {
            const metaContent = await readFile(join(subagentsDir, metaFile), "utf-8");
            const meta = JSON.parse(metaContent);

            dispatch({
              type: "subagent_appeared",
              pid: session.pid,
              subagentId,
              agentType: meta.agentType || "Agent",
              description: meta.description || "",
              toolUseId: meta.toolUseId,
            });

            const jsonlPath = join(subagentsDir, `agent-${subagentId}.jsonl`);
            const tailer = new FileTailer(jsonlPath);
            subagentTailers.set(key, tailer);

            tailer.on("line", (line) => {
              dispatch({ type: "subagent_transcript_line", pid: session.pid, subagentId, line });

              if (line.type === "assistant" && Array.isArray(line.message?.content)) {
                const hasToolUse = line.message.content.some((c: any) => c.type === "tool_use");
                if (!hasToolUse) {
                  dispatch({ type: "subagent_ended", pid: session.pid, subagentId });
                  tailer.stop();
                  subagentTailers.delete(key);
                  finishedSubagents.add(key);
                }
              }
            });

            tailer.start().catch(() => {});
          }
        }
      } catch (err: any) {
        // subagents dir doesn't exist yet, ignore
      }
    }
  } catch (err) {
    console.error("[poll] Error scanning sessions:", err);
  }
}

// ── Start ────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`\n  🏢 Claude Agent Verse`);
  console.log(`  ─────────────────────`);
  console.log(`  Debug list: http://${HOST}:${PORT}?token=${browserToken}`);
  console.log(`  WebSocket:  ws://${HOST}:${PORT}?token=${browserToken}`);
  console.log(`  Polling sessions every ${POLL_INTERVAL_MS}ms\n`);

  // Initial scan.
  poll();

  // Start polling.
  setInterval(poll, POLL_INTERVAL_MS);
});
