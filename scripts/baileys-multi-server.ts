/**
 * Multi-Session Baileys Server — 1 Bot Per Driver
 * 
 * Run with: npx tsx scripts/baileys-multi-server.ts
 * 
 * This process manages multiple Baileys sessions (one per driver).
 * It exposes HTTP + WebSocket endpoints for session management.
 * Bot logic is processed INLINE — no external webhook needed.
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
 *   POST /sessions/:id/offer-ride   — Offer a ride to a driver
 *   GET  /sessions/:id/state        — Get driver bot state
 * 
 * WebSocket:
 *   ws://localhost:PORT/ws          — Real-time events (QR updates, connections, etc.)
 * 
 * Environment variables:
 *   PORT              — HTTP server port (default: 3002)
 *   SESSIONS_DIR      — Where to store Baileys auth data (default: .baileys-sessions)
 *   MAX_SESSIONS      — Maximum concurrent sessions (default: 50)
 *   MINIMAX_API_KEY   — (Optional) MiniMax AI fallback for unrecognized messages
 *   CONVEX_URL        — (Optional) Convex backend URL for syncing state
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager, getSessionManager, SessionInfo, IncomingDriverMessage } from "../lib/whatsapp/session-manager";
import { matchIntent, Intent } from "../lib/whatsapp/intent-matcher";
import { getTransition, DriverWhatsappState, DriverState } from "../lib/whatsapp/state-machine";
import { templates } from "../lib/whatsapp/message-templates";
import { getAIFallback } from "../lib/whatsapp/ai-fallback";
import QRCode from "qrcode";

const PORT = parseInt(process.env.PORT || "3002");
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "";

const manager = getSessionManager();
const wsClients: Set<WebSocket> = new Set();

// ─── In-Memory Driver State ───

type RegistrationState = "unregistered" | "registering_name" | "registering_area" | "registered";

interface DriverBotState {
  state: DriverState;
  availability: "online" | "offline";
  registration: RegistrationState;
  currentRide?: {
    rideCode: string;
    customerName: string;
    pickup: string;
    dropoff: string;
    price: number;
  };
  name?: string;
  area?: string;
  phone?: string;
  todayOrders: number;
  todayEarnings: number;
  lastMessageAt: number;
}

const driverStates = new Map<string, DriverBotState>();

function getDriverState(sessionId: string): DriverBotState {
  if (!driverStates.has(sessionId)) {
    driverStates.set(sessionId, {
      state: "idle",
      availability: "offline",
      registration: "unregistered",
      todayOrders: 0,
      todayEarnings: 0,
      lastMessageAt: Date.now(),
    });
  }
  return driverStates.get(sessionId)!;
}

// ─── Bot Message Handler (inline, no Convex dependency) ───

async function handleDriverMessage(
  sessionId: string,
  msg: IncomingDriverMessage,
): Promise<string | null> {
  const text = msg.text?.trim();
  if (!text) return null;

  const ds = getDriverState(sessionId);
  ds.lastMessageAt = Date.now();
  ds.phone = msg.driverPhone;

  console.log(`[Bot] Session ${sessionId} | Reg: ${ds.registration} | State: ${ds.state} | Avail: ${ds.availability} | Msg: "${text}"`);

  // ─── Registration flow (must complete before any commands) ───

  if (ds.registration === "unregistered") {
    // Welcome not sent yet (edge case) — ask for name
    ds.registration = "registering_name";
    return `Hai! Selamat datang di NEMU Ojek 🏍️\n\nMau daftar jadi driver? Ketik nama lengkap kamu:`;
  }

  if (ds.registration === "registering_name") {
    ds.name = text;
    ds.registration = "registering_area";
    return `Oke ${ds.name}! Sekarang ketik area/kota kamu (contoh: Jakarta Selatan):`;
  }

  if (ds.registration === "registering_area") {
    ds.area = text;
    ds.registration = "registered";
    return `✅ Pendaftaran selesai!\n\nNama: ${ds.name}\nArea: ${ds.area}\n\nKetik SIAP untuk mulai terima order\nKetik HELP untuk bantuan`;
  }

  // ─── Below here: only registered drivers ───

  // Match intent
  const intent = matchIntent(text);
  console.log(`[Bot] Intent: ${intent}`);

  // ─── Special handlers that bypass state machine ───

  // HELP / BANTUAN — always available
  if (intent === "BANTUAN") {
    return templates.help();
  }

  // ─── State-based handling ───

  // GO_ONLINE (siap, mulai, online, narik)
  if (intent === "GO_ONLINE") {
    if (ds.availability === "online" && ds.state === "online") {
      return templates.alreadyOnline();
    }
    ds.state = "online";
    ds.availability = "online";
    syncStateToConvex(sessionId, ds);
    const name = ds.name || "Driver";
    return `✅ Status kamu: ONLINE\nKamu akan menerima order. Tunggu ya... 🏍️`;
  }

  // GO_OFFLINE (off, stop, istirahat, berhenti)
  if (intent === "GO_OFFLINE") {
    if (ds.availability === "offline" && (ds.state === "idle" || ds.state === "online")) {
      return `Kamu udah offline kok. Ketik SIAP kalau mau narik lagi.`;
    }
    const prevState = ds.state;
    ds.state = "idle";
    ds.availability = "offline";
    syncStateToConvex(sessionId, ds);
    return `✅ Status: OFFLINE\nKamu gak akan terima order.\n\n📊 Hari ini: ${ds.todayOrders} order | Rp ${ds.todayEarnings.toLocaleString("id-ID")}\n\nIstirahat dulu ya 💪 Ketik SIAP kapan aja buat narik lagi.`;
  }

  // ─── Order flow ───

  // TERIMA (accept ride)
  if (intent === "TERIMA") {
    if (ds.state !== "offered" || !ds.currentRide) {
      return `Gak ada order yang bisa diterima sekarang. ${getStateHint(ds.state)}`;
    }
    ds.state = "picking_up";
    syncStateToConvex(sessionId, ds);
    return `✅ Order diterima!\n\n📍 Jemput ${ds.currentRide.customerName} di:\n${ds.currentRide.pickup}\n\nUdah sampe? Ketik SAMPE`;
  }

  // TOLAK (reject ride)
  if (intent === "TOLAK") {
    if (ds.state !== "offered" || !ds.currentRide) {
      return `Gak ada order yang bisa ditolak sekarang. ${getStateHint(ds.state)}`;
    }
    ds.currentRide = undefined;
    ds.state = "online";
    syncStateToConvex(sessionId, ds);
    return `👍 Order ditolak.\nTunggu order berikutnya ya...`;
  }

  // TIBA / SAMPE (arrived at pickup)
  if (intent === "TIBA") {
    if (ds.state !== "picking_up") {
      return `Kamu belum dalam perjalanan jemput. ${getStateHint(ds.state)}`;
    }
    ds.state = "at_pickup";
    syncStateToConvex(sessionId, ds);
    const customerName = ds.currentRide?.customerName || "Penumpang";
    return `👍 ${customerName} udah dikasih tau kamu di depan.\nPenumpang naik? Ketik JALAN`;
  }

  // JEMPUT / JALAN (pickup passenger, start ride)
  if (intent === "JEMPUT") {
    if (ds.state !== "at_pickup") {
      return `Kamu belum di lokasi jemput. ${getStateHint(ds.state)}`;
    }
    ds.state = "on_ride";
    syncStateToConvex(sessionId, ds);
    const dropoff = ds.currentRide?.dropoff || "Tujuan";
    return `🛣️ Anter ke ${dropoff}\n\nUdah nyampe tujuan? Ketik DONE`;
  }

  // SELESAI / DONE (complete ride)
  if (intent === "SELESAI") {
    if (ds.state !== "on_ride") {
      return `Kamu gak lagi dalam perjalanan. ${getStateHint(ds.state)}`;
    }
    const price = ds.currentRide?.price || 0;
    ds.todayOrders++;
    ds.todayEarnings += price;
    ds.currentRide = undefined;
    ds.state = "online";
    syncStateToConvex(sessionId, ds);
    return `✅ Order selesai!\n\n💰 Rp ${price.toLocaleString("id-ID")} masuk ke saldo\n\n📊 Hari ini: ${ds.todayOrders} order | Rp ${ds.todayEarnings.toLocaleString("id-ID")}\n\nTunggu order berikutnya ya...`;
  }

  // PENGHASILAN / GAJI
  if (intent === "PENGHASILAN") {
    return `💰 Penghasilan hari ini:\n🏍️ ${ds.todayOrders} order\n💰 Rp ${ds.todayEarnings.toLocaleString("id-ID")}\n\nKetik TARIK buat cairkan saldo.`;
  }

  // TARIK / WITHDRAW
  if (intent === "TARIK") {
    if (ds.todayEarnings === 0) {
      return `Saldo kamu masih kosong nih. Narik dulu ya! 💪`;
    }
    return `💰 Saldo: Rp ${ds.todayEarnings.toLocaleString("id-ID")}\nFitur penarikan belum tersedia di MVP. Stay tuned! 🚀`;
  }

  // DAFTAR (registration — simplified for MVP)
  if (intent === "DAFTAR") {
    return `Kamu udah terdaftar otomatis sebagai driver! 😊\nKetik SIAP buat mulai narik.`;
  }

  // ─── Waiting for response during offered state ───
  if (ds.state === "offered") {
    return `Mau ambil order ini? Balas TERIMA atau TOLAK`;
  }

  // ─── TIDAK_DIKENAL — simple help hint (AI fallback disabled) ───
  if (intent === "TIDAK_DIKENAL") {
    return `Hmm, aku gak ngerti nih 🤔\nKetik HELP buat liat daftar perintah.`;
  }

  // Intent recognized but no specific handler → give context hint
  return `${getStateHint(ds.state)}`;
}

function getStateHint(state: DriverState): string {
  switch (state) {
    case "idle": return "Ketik SIAP buat online dulu.";
    case "online": return "Tunggu order masuk ya, atau ketik STOP buat istirahat.";
    case "offered": return "Balas TERIMA atau TOLAK buat order yang ditawarin.";
    case "picking_up": return "Ketik SAMPE kalau udah di lokasi jemput.";
    case "at_pickup": return "Ketik JALAN kalau penumpang udah naik.";
    case "on_ride": return "Ketik DONE kalau udah nyampe tujuan.";
    default: return "Ketik HELP buat bantuan.";
  }
}

// ─── Optional Convex sync (fire-and-forget) ───

async function syncStateToConvex(sessionId: string, ds: DriverBotState): Promise<void> {
  if (!CONVEX_URL) return;
  try {
    // We could POST to a Convex HTTP action here
    // For MVP, just log the state change
    console.log(`[Convex Sync] Session ${sessionId}: state=${ds.state}, avail=${ds.availability}`);
  } catch (e) {
    console.warn("[Convex Sync] Failed:", e);
  }
}

// ─── WebSocket broadcast ───

function broadcast(event: string, data: any) {
  const msg = JSON.stringify({ event, data, timestamp: Date.now() });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ─── Session events → WebSocket + Bot Logic ───

manager.on("qr", async (sessionId: string, qr: string) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    broadcast("qr", { sessionId, qr: qrDataUrl });
  } catch (e) {
    broadcast("qr", { sessionId, qrRaw: qr });
  }
});

// Track welcome sent per session (1x only)
const welcomeSent = new Set<string>();

manager.on("connected", async (sessionId: string, phone: string) => {
  broadcast("connected", { sessionId, phone });

  const ds = getDriverState(sessionId);
  ds.phone = phone;

  // Send welcome ONCE per session — invite to register
  if (welcomeSent.has(sessionId)) {
    console.log(`[Bot] Welcome already sent to ${sessionId}, skipping`);
    return;
  }
  welcomeSent.add(sessionId);

  // Only send if unregistered
  if (ds.registration !== "registered") {
    console.log(`[Bot] Sending registration invite to ${sessionId} (${phone})`);
    setTimeout(async () => {
      try {
        const sentResult = await manager.sendToDriver(
          sessionId,
          `Hai! Selamat datang di NEMU Ojek 🏍️\n\nMau daftar jadi driver? Ketik nama lengkap kamu:`,
        );
        if (sentResult?.key?.id) {
          botSentMessages.add(sentResult.key.id);
          setTimeout(() => botSentMessages.delete(sentResult.key.id!), 30000);
        }
        // Move to registering_name so next message = name input
        ds.registration = "registering_name";
      } catch (e) {
        console.error(`[Bot] Failed to send welcome to ${sessionId}:`, e);
      }
    }, 2000);
  } else {
    console.log(`[Bot] ${sessionId} already registered, skipping welcome`);
  }
});

manager.on("disconnected", (sessionId: string, reason: string) => {
  broadcast("disconnected", { sessionId, reason });
});

manager.on("logged_out", (sessionId: string) => {
  broadcast("logged_out", { sessionId });
  // Clean up driver state on logout
  driverStates.delete(sessionId);
});

// ─── MAIN: Process messages through bot logic instead of webhook ───

// Track messages sent by bot to avoid feedback loops
const botSentMessages = new Set<string>();

manager.on("message", async (sessionId: string, message: IncomingDriverMessage) => {
  broadcast("message", { sessionId, text: message.text, fromMe: message.fromMe });

  // Skip empty messages
  if (!message.text?.trim()) return;

  // Skip messages from others (only process driver's own messages)
  if (!message.fromMe && !message.isSelfChat) return;

  // CRITICAL: Skip bot's own replies to prevent infinite loop
  // Check by messageId first, then by text content as fallback
  if (message.messageId && botSentMessages.has(message.messageId)) {
    botSentMessages.delete(message.messageId);
    return;
  }
  // Also skip if the text matches known bot reply patterns
  const botPatterns = ["✅ Status", "🏍️ Selamat datang", "📊 Hari ini", "🔔 ORDER BARU", "👍 Order ditolak", "🛣️ Anter ke", "💰 Order selesai", "Kamu udah online", "Gak ada order", "Kamu belum"];
  if (message.fromMe && botPatterns.some(p => message.text!.startsWith(p))) {
    console.log(`[Bot] Skipping own reply: "${message.text!.substring(0, 50)}..."`);
    return;
  }

  try {
    const reply = await handleDriverMessage(sessionId, message);
    if (reply) {
      const sentResult = await manager.sendToDriver(sessionId, reply);
      // Track sent message ID to skip when it comes back as fromMe
      const sentMsgId = sentResult?.key?.id;
      if (sentMsgId) {
        botSentMessages.add(sentMsgId);
        setTimeout(() => botSentMessages.delete(sentMsgId), 30000);
      }
      broadcast("bot_reply", { sessionId, reply });
    }
  } catch (error) {
    console.error(`[Bot] Error handling message for ${sessionId}:`, error);
    try {
      await manager.sendToDriver(sessionId, templates.genericError());
    } catch (e) {
      // Can't even send error reply
    }
  }
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
      return json(res, { ok: true, ...stats, botActive: true });
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

      // GET /sessions/:id/state — Get driver bot state
      if (req.method === "GET" && segments[2] === "state") {
        const info = manager.getSession(sessionId);
        if (!info) return json(res, { error: "Session not found" }, 404);
        const ds = driverStates.get(sessionId);
        return json(res, {
          ok: true,
          sessionId,
          phone: info.phone,
          connectionStatus: info.status,
          botState: ds || { state: "idle", availability: "offline", todayOrders: 0, todayEarnings: 0 },
        });
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

      // POST /sessions/:id/offer-ride — Offer a ride to driver
      if (req.method === "POST" && segments[2] === "offer-ride") {
        const body = JSON.parse(await readBody(req));
        const { customerName, pickup, dropoff, price, rideCode } = body;

        if (!customerName || !pickup || !dropoff || !price) {
          return json(res, { error: "customerName, pickup, dropoff, and price are required" }, 400);
        }

        const info = manager.getSession(sessionId);
        if (!info) return json(res, { error: "Session not found" }, 404);
        if (info.status !== "connected") {
          return json(res, { error: "Session not connected" }, 400);
        }

        // Update driver state to offered
        const ds = getDriverState(sessionId);
        if (ds.availability !== "online") {
          return json(res, { error: "Driver is offline", driverState: ds.state, availability: ds.availability }, 400);
        }
        if (ds.state === "offered" || ds.state === "picking_up" || ds.state === "at_pickup" || ds.state === "on_ride") {
          return json(res, { error: "Driver is busy with another ride", driverState: ds.state }, 400);
        }

        const code = rideCode || `RIDE-${Date.now()}`;
        ds.state = "offered";
        ds.currentRide = {
          rideCode: code,
          customerName,
          pickup,
          dropoff,
          price: Number(price),
        };

        // Send formatted order notification
        const orderText = `🔔 ORDER BARU!\n\n👤 ${customerName}\n📍 ${pickup} → ${dropoff}\n💰 Rp ${Number(price).toLocaleString("id-ID")}\n\nKetik TERIMA atau TOLAK`;

        const ok = await manager.sendToDriver(sessionId, orderText);
        broadcast("ride_offered", { sessionId, rideCode: code, customerName, pickup, dropoff, price });
        syncStateToConvex(sessionId, ds);

        return json(res, { ok, rideCode: code, driverState: ds.state });
      }

      // DELETE /sessions/:id
      if (req.method === "DELETE" && segments.length === 2) {
        await manager.deleteSession(sessionId);
        driverStates.delete(sessionId); // Clean up bot state too
        return json(res, { ok: true });
      }
    }

    // GET /driver-states — Debug: list all driver states
    if (req.method === "GET" && path === "/driver-states") {
      const states: Record<string, any> = {};
      for (const [id, ds] of driverStates) {
        states[id] = { ...ds };
      }
      return json(res, { ok: true, states });
    }

    // Legacy compatibility: POST /send (single session mode)
    if (req.method === "POST" && path === "/send") {
      const body = JSON.parse(await readBody(req));
      const { text, sessionId, driverId } = body;
      if (!text) return json(res, { error: "text required" }, 400);

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
      botActive: true,
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
console.log("  🤖 Bot Logic: INLINE (no webhook)");
console.log("  1 Bot Per Driver Architecture");
console.log("==========================================");
console.log(`  HTTP Port:     ${PORT}`);
console.log(`  WebSocket:     ws://localhost:${PORT}/ws`);
console.log(`  Sessions Dir:  ${process.env.SESSIONS_DIR || ".baileys-sessions"}`);
console.log(`  Max Sessions:  ${process.env.MAX_SESSIONS || "50"}`);
console.log(`  AI Fallback:   ${process.env.MINIMAX_API_KEY ? "✅ MiniMax" : "❌ Generic replies"}`);
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
