/**
 * Multi-session Baileys manager for per-driver WhatsApp bots
 * Each driver gets their own Baileys connection via QR linked device
 */

const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { ensureDirs, normalizePhone, logLine, sendReply, checkSpam, enqueueIncoming } = require("./utils");
const { handleDriverMessage, initDriverState } = require("./driver-handler");

const DRIVER_AUTHS_DIR = path.join(__dirname, "driver-auths");
ensureDirs(DRIVER_AUTHS_DIR);

/**
 * Active driver sessions: Map<sessionId, { sock, driverId, phone, apiToken, qr, connected }>
 */
const activeSessions = new Map();

/**
 * Convex client reference (set via init)
 */
let convexClient = null;

function setConvexClient(client) {
  convexClient = client;
}

/**
 * Sync session status to Convex
 */
async function syncSessionToConvex(sessionId, status, phone, qr) {
  if (!convexClient) return;
  try {
    await convexClient.mutation("driverSessions:upsert", {
      sessionId,
      status,
      phone: phone || undefined,
      lastConnectedAt: status === "connected" ? Date.now() : undefined,
    });

    // Also update QR code
    if (qr !== undefined) {
      await convexClient.mutation("driverSessions:updateQR", {
        sessionId,
        qrCode: qr,
      });
    }
  } catch (e) {
    console.error(`[driver-sessions] sync to Convex failed for ${sessionId}:`, e.message);
  }
}

/**
 * Create a new driver session (generates QR for scanning)
 */
async function createDriverSession(sessionId, driverId, apiToken, name) {
  if (activeSessions.has(sessionId)) {
    console.log(`[driver-sessions] Session ${sessionId} already exists`);
    return activeSessions.get(sessionId);
  }

  const authDir = path.join(DRIVER_AUTHS_DIR, sessionId);
  ensureDirs(authDir);

  const sessionData = {
    sock: null,
    driverId,
    apiToken,
    name,
    phone: null,
    qr: null,
    connected: false,
    reconnecting: false,
  };

  activeSessions.set(sessionId, sessionData);

  // Sync to Convex
  await syncSessionToConvex(sessionId, "qr_pending", null, null);

  // Start the Baileys connection
  await startDriverConnection(sessionId, authDir, sessionData);

  return sessionData;
}

/**
 * Start Baileys connection for a driver session
 */
async function startDriverConnection(sessionId, authDir, sessionData) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    sessionData.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        sessionData.qr = qr;
        sessionData.connected = false;
        console.log(`[driver-sessions] QR generated for ${sessionId}`);
        await syncSessionToConvex(sessionId, "qr_pending", null, qr);
      }

      if (connection === "open") {
        sessionData.connected = true;
        sessionData.qr = null;
        sessionData.reconnecting = false;
        const phoneNumber = sock.user?.id?.split(":")[0] || sock.user?.id || null;
        sessionData.phone = phoneNumber;

        console.log(`[driver-sessions] ✅ ${sessionId} connected (${phoneNumber})`);
        await syncSessionToConvex(sessionId, "connected", phoneNumber, null);

        // Initialize driver state for message handling
        initDriverState(sessionData.driverId, sessionData.apiToken, sessionData.name);

        // Send welcome message to the driver's own number
        if (phoneNumber) {
          const jid = `${phoneNumber}@s.whatsapp.net`;
          try {
            await sock.sendMessage(jid, {
              text:
                `🏍️ *Selamat datang di Nemu Ojek!*\n\n` +
                `Bot driver kamu sudah aktif ✅\n\n` +
                `📋 *Perintah:*\n` +
                `• *checkin* — Mulai shift\n` +
                `• *checkout* — Selesai shift\n` +
                `• *saldo* — Cek penghasilan\n` +
                `• *status* — Cek status\n` +
                `• *help* — Bantuan\n\n` +
                `Ketik *checkin* untuk mulai terima orderan!`,
            });
          } catch (e) {
            console.warn(`[driver-sessions] Failed to send welcome to ${phoneNumber}:`, e.message);
          }
        }
      }

      if (connection === "close") {
        sessionData.connected = false;
        sessionData.qr = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(`[driver-sessions] ❌ ${sessionId} disconnected (code: ${code}, reconnect: ${shouldReconnect})`);

        if (shouldReconnect && !sessionData.reconnecting) {
          sessionData.reconnecting = true;
          await syncSessionToConvex(sessionId, "disconnected", sessionData.phone, null);
          setTimeout(() => startDriverConnection(sessionId, authDir, sessionData), 3000);
        } else {
          await syncSessionToConvex(sessionId, "logged_out", sessionData.phone, null);
          activeSessions.delete(sessionId);
          // Clean up auth files on logout
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch {}
        }
      }
    });

    // Handle incoming messages on the driver's personal bot
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const m of messages) {
        if (!m.message) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid.endsWith("@g.us") || m.key.fromMe) continue;

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          "";

        if (!text) continue;

        const phone = normalizePhone(jid.split("@")[0]);

        // Only handle messages from the driver themselves
        const driverPhone = sessionData.phone;
        if (driverPhone && phone !== normalizePhone(driverPhone)) {
          // Message from someone else chatting the driver - ignore bot handling
          continue;
        }

        const spam = checkSpam(phone);
        if (spam.blocked) continue;

        logLine("IN-DRIVER", phone, text);

        await enqueueIncoming(`driver-${sessionId}`, () =>
          handleDriverMessage(sock, jid, sessionData.driverId, text)
        );
      }
    });
  } catch (e) {
    console.error(`[driver-sessions] Failed to start connection for ${sessionId}:`, e.message);
    sessionData.reconnecting = false;
  }
}

/**
 * Remove a driver session
 */
async function removeDriverSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  try {
    if (session.sock) {
      await session.sock.logout();
    }
  } catch {}

  activeSessions.delete(sessionId);

  // Clean up auth files
  const authDir = path.join(DRIVER_AUTHS_DIR, sessionId);
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}

  await syncSessionToConvex(sessionId, "logged_out", null, null);
  return true;
}

/**
 * Get session info for a specific session
 */
function getSessionInfo(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  return {
    sessionId,
    driverId: session.driverId,
    phone: session.phone,
    connected: session.connected,
    qr: session.qr,
    name: session.name,
  };
}

/**
 * List all active sessions
 */
function listSessions() {
  const result = [];
  for (const [sessionId, session] of activeSessions) {
    result.push({
      sessionId,
      driverId: session.driverId,
      phone: session.phone,
      connected: session.connected,
      hasQR: !!session.qr,
      name: session.name,
    });
  }
  return result;
}

/**
 * Get the socket for a driver's session (for sending notifications)
 */
function getDriverSocket(driverId) {
  for (const [, session] of activeSessions) {
    if (session.driverId === driverId && session.connected && session.sock) {
      return { sock: session.sock, phone: session.phone };
    }
  }
  return null;
}

/**
 * Restore sessions from Convex on startup
 */
async function restoreSessions() {
  if (!convexClient) return;

  try {
    const sessions = await convexClient.query("driverSessions:listAll");
    for (const s of sessions) {
      if (s.status === "logged_out") continue;
      if (activeSessions.has(s.sessionId)) continue;

      const authDir = path.join(DRIVER_AUTHS_DIR, s.sessionId);
      if (!fs.existsSync(authDir)) continue;

      console.log(`[driver-sessions] Restoring session ${s.sessionId}...`);
      await createDriverSession(s.sessionId, s.driverId, null, null);
    }
  } catch (e) {
    console.error("[driver-sessions] Failed to restore sessions:", e.message);
  }
}

module.exports = {
  setConvexClient,
  createDriverSession,
  removeDriverSession,
  getSessionInfo,
  listSessions,
  getDriverSocket,
  restoreSessions,
  activeSessions,
};
