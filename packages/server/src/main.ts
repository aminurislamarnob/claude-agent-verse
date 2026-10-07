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
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { reduce, emptyOffice } from "@claude-agent-verse/core";
import type { Office, DomainEvent } from "@claude-agent-verse/core";
import { scan, emptyScanSnapshot } from "./scanner.js";
import type { ScanSnapshot } from "./scanner.js";
import { generateToken, isAllowedOrigin, isValidToken } from "./auth.js";

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

// ── Poll loop ────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const result = await scan(scanSnapshot);
    scanSnapshot = result.snapshot;

    if (result.events.length > 0) {
      // Apply events through the reducer.
      for (const event of result.events) {
        office = reduce(office, event);
      }

      // Push updates to all connected browsers.
      broadcast({ type: "snapshot", office });
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
