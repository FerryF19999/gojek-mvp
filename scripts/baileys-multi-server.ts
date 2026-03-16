/**
 * Multi-Session Baileys Server — 1 Bot Per Driver
 * 
 * Run with: npx tsx scripts/baileys-multi-server.ts
 * 
 * This process manages multiple Baileys sessions (one per driver).
 * It exposes HTTP + WebSocket endpoints for session management.
 * 
 * HTTP Endpoints:
 *   GET  /status                    — Server stats
 *   GET  /sessions                  — List all sessions
 *   POST /sessions/create           — Create a new session { sessionId, driverId? }
 *   GET  /sessions/:id              — Get session info
 *   GET  /sessions/:id/qr           — Get current QR code (base64 PNG)
 *   POST /sessions/:id/send         — Send message { text } to driver's self-chat
 *   POST /sessions/:id/send-to      — Send message { phone, text } to any number
 *   DELETE /sessions/:id            — Delete session
 *   POST /sessions/:id/notify       — Send order notification to driver
 * 
 * WebSocket:
 *   ws://localhost:PORT/ws          — Real-time events (QR updates, connections, etc.)
 * 
 * Environment variables:
 *   WEBHOOK_URL       — URL to forward messages to (default: http://localhost:3000/api/whatsapp/webhook)
 *   WEBHOOK_SECRET    — Secret for webhook auth
 *   PORT              — HTTP server port (default: 3002)
 *   SESSIONS_DIR      — Where to store Baileys auth data (default: .baileys-sessions)
 *   MAX_SESSIONS      — Maximum concurrent sessions (default: 50)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager, getSessionManager, SessionInfo } from "../lib/whatsapp/session-manager";
import QRCode from "qrcode";

const PORT = parseInt(process.env.PORT || "3002");

const manager = getSessionManager();
const wsClients: Set<WebSocket> = new Set();

// ─── WebSocket broadcast ───

function broadcast(event: string, data: any) {
  const msg = JSON.stringify({ event, data, timestamp: Date.now() });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ─── Session events → WebSocket ───

manager.on("qr", async (sessionId: string, qr: string) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    broadcast("qr", { sessionId, qr: qrDataUrl });
  } catch (e) {
    broadcast("qr", { sessionId, qrRaw: qr });
  }
});

manager.on("connected", (sessionId: string, phone: string) => {
  broadcast("connected", { sessionId, phone });
});

manager.on("disconnected", (sessionId: string, reason: string) => {
  broadcast("disconnected", { sessionId, reason });
});

manager.on("logged_out", (sessionId: string) => {
  broadcast("logged_out", { sessionId });
});

manager.on("message", (sessionId: string, message: any) => {
  broadcast("message", { sessionId, text: message.text, fromMe: message.fromMe });
});

// ─── HTTP helpers ───

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

function json(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function parseUrl(url: string): { path: string; segments: string[] } {
  const path = (url || "/").split("?")[0];
  const segments = path.split("/").filter(Boolean);
  return { path, segments };
}

// ─── HTTP Server ───

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const { path, segments } = parseUrl(req.url || "/");

  try {
    // GET /status
    if (req.method === "GET" && path === "/status") {
      const stats = manager.getStats();
      return json(res, { ok: true, ...stats });
    }

    // GET /sessions
    if (req.method === "GET" && path === "/sessions") {
      const sessions = manager.getAllSessions();
      return json(res, { ok: true, sessions });
    }

    // POST /sessions/create
    if (req.method === "POST" && path === "/sessions/create") {
      const body = JSON.parse(await readBody(req));
      const sessionId = body.sessionId || `driver-${Date.now()}`;
      const driverId = body.driverId;

      const info = await manager.createSession(sessionId, driverId);
      return json(res, { ok: true, session: info }, 201);
    }

    // Routes with session ID: /sessions/:id/*
    if (segments[0] === "sessions" && segments.length >= 2) {
      const sessionId = segments[1];

      // GET /sessions/:id
      if (req.method === "GET" && segments.length === 2) {
        const info = manager.getSession(sessionId);
        if (!info) return json(res, { error: "Session not found" }, 404);
        return json(res, { ok: true, session: info });
      }

      // GET /sessions/:id/qr
      if (req.method === "GET" && segments[2] === "qr") {
        const info = manager.getSession(sessionId);
        if (!info) return json(res, { error: "Session not found" }, 404);

        if (info.status === "connected") {
          return json(res, { ok: true, status: "connected", phone: info.phone });
        }

        if (!info.qrCode) {
          return json(res, { ok: true, status: info.status, qr: null, message: "QR not yet generated, wait..." });
        }

        try {
          const qrDataUrl = await QRCode.toDataURL(info.qrCode, { width: 300, margin: 2 });
          return json(res, { ok: true, status: info.status, qr: qrDataUrl });
        } catch (e) {
          return json(res, { ok: true, status: info.status, qrRaw: info.qrCode });
        }
      }

      // POST /sessions/:id/send — Send to driver's self-chat
      if (req.method === "POST" && segments[2] === "send") {
        const body = JSON.parse(await readBody(req));
        if (!body.text) return json(res, { error: "text required" }, 400);

        const ok = await manager.sendToDriver(sessionId, body.text);
        return json(res, { ok });
      }

      // POST /sessions/:id/send-to — Send to any number
      if (req.method === "POST" && segments[2] === "send-to") {
        const body = JSON.parse(await readBody(req));
        if (!body.phone || !body.text) return json(res, { error: "phone and text required" }, 400);

        const ok = await manager.sendMessage(sessionId, body.phone, body.text);
        return json(res, { ok });
      }

      // POST /sessions/:id/notify — Send order notification
      if (req.method === "POST" && segments[2] === "notify") {
        const body = JSON.parse(await readBody(req));
        if (!body.text) return json(res, { error: "text required" }, 400);

        const ok = await manager.sendToDriver(sessionId, body.text);
        return json(res, { ok, method: "self-chat" });
      }

      // DELETE /sessions/:id
      if (req.method === "DELETE" && segments.length === 2) {
        await manager.deleteSession(sessionId);
        return json(res, { ok: true });
      }
    }

    // Legacy compatibility: POST /send (single session mode)
    if (req.method === "POST" && path === "/send") {
      const body = JSON.parse(await readBody(req));
      const { phone, text, sessionId, driverId } = body;
      if (!text) return json(res, { error: "text required" }, 400);

      // If sessionId provided, use it; otherwise try driverId
      if (sessionId) {
        const ok = await manager.sendToDriver(sessionId, text);
        return json(res, { ok });
      }
      if (driverId) {
        const ok = await manager.sendToDriverById(driverId, text);
        return json(res, { ok });
      }

      return json(res, { error: "sessionId or driverId required" }, 400);
    }

    json(res, { error: "Not found" }, 404);
  } catch (error: any) {
    console.error("[HTTP] Error:", error);
    json(res, { error: error.message }, 500);
  }
});

// ─── WebSocket Server ───

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected (${wsClients.size} total)`);

  // Send current state
  ws.send(JSON.stringify({
    event: "init",
    data: {
      stats: manager.getStats(),
      sessions: manager.getAllSessions(),
    },
    timestamp: Date.now(),
  }));

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wsClients.size} total)`);
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Handle client commands via WS
      if (msg.action === "create_session") {
        const info = await manager.createSession(msg.sessionId || `driver-${Date.now()}`, msg.driverId);
        ws.send(JSON.stringify({ event: "session_created", data: info, timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });
});

// ─── Startup ───

console.log("==========================================");
console.log("  NEMU Ojek — Multi-Session WhatsApp Bot");
console.log("  1 Bot Per Driver Architecture");
console.log("==========================================");
console.log(`  HTTP Port:     ${PORT}`);
console.log(`  WebSocket:     ws://localhost:${PORT}/ws`);
console.log(`  Sessions Dir:  ${process.env.SESSIONS_DIR || ".baileys-sessions"}`);
console.log(`  Max Sessions:  ${process.env.MAX_SESSIONS || "50"}`);
console.log("==========================================\n");

server.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);

  // Restore existing sessions
  await manager.restoreAllSessions();

  const stats = manager.getStats();
  console.log(`[Server] Restored ${stats.total} sessions (${stats.connected} connected)`);
});

// ─── Graceful shutdown ───

process.on("SIGINT", async () => {
  console.log("\n[Server] Shutting down...");
  await manager.shutdown();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await manager.shutdown();
  server.close();
  process.exit(0);
});
