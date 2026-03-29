/**
 * Nemu Ojek WhatsApp Bot — Main Orchestrator
 *
 * Architecture:
 *   - Central Bot (1 number): handles passenger ride booking + admin
 *   - Driver Sessions (multi-session): each driver gets their own bot via QR linked device
 *   - Dispatch Poller: polls Convex for new rides, notifies drivers
 *   - HTTP API: QR retrieval, session management, health check
 */

const http = require("http");
const path = require("path");
const { ConvexHttpClient } = require("convex/browser");

const { ensureDirs, SESSIONS_DIR, LOGS_DIR } = require("./utils");
const { startCentralBot, setConvexClient: setCentralConvex, getStatus } = require("./central-bot");
const {
  setConvexClient: setDriverConvex,
  createDriverSession,
  removeDriverSession,
  getSessionInfo,
  listSessions,
  getDriverSocket,
  restoreSessions,
} = require("./driver-sessions");
const { notifyDriverNewRide, markDriverRideCompleted, getDriverState } = require("./driver-handler");
const { getRideStatus } = require("./api-client");
const mainAgent = require("./agents/main-agent");

// ─── Config ───
const CONVEX_URL = process.env.CONVEX_URL;
const HTTP_PORT = process.env.BOT_PORT || 3001;
const DISPATCH_POLL_MS = 5000;

// ─── Init ───
ensureDirs(SESSIONS_DIR, LOGS_DIR);

let convexClient = null;
if (CONVEX_URL) {
  convexClient = new ConvexHttpClient(CONVEX_URL);
  setCentralConvex(convexClient);
  setDriverConvex(convexClient);
  mainAgent.init(convexClient);
}

// ─── Dispatch Poller ───
// Polls Convex for rides that need driver assignment, notifies the appropriate driver

const notifiedRides = new Set();

async function pollDispatch() {
  if (!convexClient) return;

  try {
    // Get rides that are dispatching or assigned/awaiting response
    const rides = await convexClient.query("rides:listRides");
    const activeRides = (rides || []).filter((r) =>
      ["assigned", "awaiting_driver_response"].includes(r.status)
    );

    for (const ride of activeRides) {
      const rideCode = ride.code;
      if (!ride.assignedDriverId) continue;

      const notifyKey = `${rideCode}:${ride.assignedDriverId}`;
      if (notifiedRides.has(notifyKey)) continue;

      // Find the driver's session socket
      const driverInfo = getDriverSocket(ride.assignedDriverId);
      if (!driverInfo) continue;

      const { sock, phone } = driverInfo;
      const jid = `${phone}@s.whatsapp.net`;

      const sent = await notifyDriverNewRide(sock, jid, ride.assignedDriverId, ride);
      if (sent) {
        notifiedRides.add(notifyKey);
        console.log(`[dispatch] Notified driver ${ride.assignedDriverId} for ride ${rideCode}`);
      }
    }

    // Check for completed rides and update driver state
    const completedRides = (rides || []).filter((r) => r.status === "completed");
    for (const ride of completedRides) {
      if (ride.assignedDriverId) {
        markDriverRideCompleted(ride.assignedDriverId);
      }
    }

    // Cleanup old notified rides
    if (notifiedRides.size > 1000) {
      const arr = [...notifiedRides];
      arr.splice(0, 500);
      notifiedRides.clear();
      arr.forEach((k) => notifiedRides.add(k));
    }
  } catch (e) {
    console.warn("[dispatch] poll error:", e.message);
  }
}

// ─── HTTP API Server ───

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health") {
    const centralStatus = getStatus();
    const driverSessions = listSessions();
    res.end(JSON.stringify({
      ok: true,
      centralBot: centralStatus,
      driverSessions: {
        total: driverSessions.length,
        connected: driverSessions.filter((s) => s.connected).length,
      },
    }));
    return;
  }

  // Central bot QR status
  if (pathname === "/qr-status") {
    res.end(JSON.stringify(getStatus()));
    return;
  }

  // ─── Driver Session API ───

  // List all driver sessions
  if (pathname === "/sessions" && req.method === "GET") {
    res.end(JSON.stringify({ sessions: listSessions() }));
    return;
  }

  // Create a new driver session
  if (pathname === "/sessions" && req.method === "POST") {
    const body = await parseBody(req);
    const { sessionId, driverId, apiToken, name } = body;

    if (!sessionId) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "sessionId is required" }));
      return;
    }

    try {
      await createDriverSession(sessionId, driverId, apiToken, name);
      const info = getSessionInfo(sessionId);
      res.end(JSON.stringify({ ok: true, session: info }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Get session QR / info
  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const info = getSessionInfo(sessionId);
    if (!info) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    res.end(JSON.stringify(info));
    return;
  }

  // Delete a driver session
  if (sessionMatch && req.method === "DELETE") {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const removed = await removeDriverSession(sessionId);
    res.end(JSON.stringify({ ok: removed }));
    return;
  }

  // QR code for a specific session
  const qrMatch = pathname.match(/^\/qr\/([^/]+)$/);
  if (qrMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(qrMatch[1]);
    const info = getSessionInfo(sessionId);
    if (!info) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    res.end(JSON.stringify({ sessionId, qr: info.qr, connected: info.connected }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── Startup ───

async function main() {
  console.log("🏍️ Nemu Ojek Bot Starting...\n");

  // Start HTTP server
  server.listen(HTTP_PORT, () => {
    console.log(`[http] API server running on port ${HTTP_PORT}`);
  });

  // Start central bot
  console.log("[central-bot] Starting central passenger bot...");
  const centralSock = await startCentralBot();

  // Pass central socket to main agent for admin notifications
  if (centralSock) {
    mainAgent.setCentral(centralSock);
  }

  // Restore existing driver sessions
  console.log("[driver-sessions] Restoring driver sessions...");
  await restoreSessions();

  // Start AI Main Agent (handles dispatch, monitoring, validation)
  // Falls back to rule-based if no LLM API key configured
  console.log("[main-agent] Starting AI orchestrator...");
  mainAgent.start();

  console.log("\n✅ Nemu Ojek Bot is running!");
  console.log(`   Central bot: ${getStatus().connected ? "connected" : "waiting for QR scan"}`);
  console.log(`   Driver sessions: ${listSessions().length} active`);
  console.log(`   AI Agent: ${require("./agents/llm-provider").isAvailable() ? "active" : "rule-based (no API key)"}`);
  console.log(`   HTTP API: http://localhost:${HTTP_PORT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
