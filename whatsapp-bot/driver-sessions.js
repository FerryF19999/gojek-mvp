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

const { ensureDirs, normalizePhone, logLine, checkSpam, enqueueIncoming, sleep } = require("./utils");
const { handleDriverMessage, initDriverState } = require("./driver-handler");

// Track bot's own sent message IDs to avoid processing them as user input
const sentMessageIds = new Set();

// Wrapper around sendReply that tracks sent message IDs
async function sendBotReply(sock, jid, text) {
  const sent = await sock.sendMessage(jid, { text });
  if (sent?.key?.id) sentMessageIds.add(sent.key.id);
  // Cleanup old IDs (keep last 500)
  if (sentMessageIds.size > 500) {
    const arr = [...sentMessageIds];
    arr.slice(0, 250).forEach((id) => sentMessageIds.delete(id));
  }
  return sent;
}

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
async function createDriverSession(sessionId, driverId, apiToken, name, role) {
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
    role: role || "driver",
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

        // Send welcome message to the user's own number (appears in "Message Yourself")
        if (phoneNumber) {
          const jid = `${phoneNumber}@s.whatsapp.net`;
          const isDriver = sessionData.role === "driver";
          const welcomeText = isDriver
            ? `🏍️ *Nemu Ojek — Driver*\n\n` +
              `Bot aktif ✅ Pesan dari bot muncul di chat ini.\n\n` +
              `📋 *Perintah:*\n` +
              `• *checkin* — Mulai shift\n` +
              `• *checkout* — Selesai shift\n` +
              `• *saldo* — Cek penghasilan\n` +
              `• *terima* / *tolak* — Respon orderan\n\n` +
              `Ketik *checkin* untuk mulai!`
            : `🛵 *Nemu Ojek*\n\n` +
              `Bot aktif ✅ Pesan dari bot muncul di chat ini.\n\n` +
              `📍 *Cara pesan ojek:*\n` +
              `• Ketik *gas ke [tujuan]* — langsung pesan\n` +
              `• Atau ketik *pesan* untuk mulai step-by-step\n\n` +
              `Contoh: *gas ke Blok M*`;
          try {
            await sendBotReply(sock, jid, welcomeText);
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
      // Log ALL messages before any filtering
      for (const m of messages) {
        const jid = m.key.remoteJid || "none";
        const txt = m.message?.conversation || m.message?.extendedTextMessage?.text || "[no-text]";
        console.log(`[RAW-MSG] ${sessionId} | type=${type} | jid=${jid} | fromMe=${m.key.fromMe} | participant=${m.key.participant || "none"} | hasMsg=${!!m.message} | text=${txt.slice(0,30)}`);
      }

      if (type !== "notify") return;

      for (const m of messages) {
        if (!m.message) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

        const ownNumber = sessionData.phone;
        const senderPhone = normalizePhone(jid.split("@")[0]);
        const isLidSelfChat = jid.endsWith("@lid") && m.key.fromMe;
        const isPhoneSelfChat = ownNumber && senderPhone === normalizePhone(ownNumber);
        const isSelfChat = isLidSelfChat || isPhoneSelfChat;

        // In self-chat (Message Yourself): process messages with fromMe=true (user typed)
        // Bot's own replies are tracked and skipped via sentMessageIds
        if (isSelfChat) {
          if (sentMessageIds.has(m.key.id)) continue; // Skip bot's own replies
        } else {
          // Regular chat from someone else — only process if not from bot
          if (m.key.fromMe) continue;
        }

        // Detect live location sharing → update GPS
        if (m.message.locationMessage || m.message.liveLocationMessage) {
          const loc = m.message.liveLocationMessage || m.message.locationMessage;
          if (loc.degreesLatitude && loc.degreesLongitude && sessionData.apiToken) {
            const { updateDriverLocation } = require("./api-client");
            updateDriverLocation(sessionData.apiToken, loc.degreesLatitude, loc.degreesLongitude)
              .catch((e) => console.warn(`[driver-gps] ${sessionId} location update failed:`, e.message));
          }
          continue;
        }

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          "";

        if (!text) continue;

        const spam = checkSpam(senderPhone);
        if (spam.blocked) continue;

        logLine(sessionData.role === "driver" ? "IN-DRIVER" : "IN-PASSENGER", senderPhone, text);

        // Wrap sock to track sent message IDs (for self-chat dedup)
        const trackedSock = new Proxy(sock, {
          get(target, prop) {
            if (prop === "sendMessage") {
              return async (...args) => {
                const result = await target.sendMessage(...args);
                if (result?.key?.id) sentMessageIds.add(result.key.id);
                return result;
              };
            }
            return target[prop];
          },
        });

        // Use LID jid for self-chat replies
        const replyJid = jid;

        if (sessionData.role === "passenger") {
          const { handlePassenger } = require("./passenger-handler");
          const { readSession } = require("./utils");
          const session = readSession(senderPhone);

          // Detect location in message
          let locationMsg = null;
          if (m.message.locationMessage) locationMsg = m.message.locationMessage;
          if (m.message.liveLocationMessage) locationMsg = m.message.liveLocationMessage;

          await enqueueIncoming(`passenger-${sessionId}`, () =>
            handlePassenger(trackedSock, replyJid, senderPhone, session, text, locationMsg)
          );
        } else {
          await enqueueIncoming(`driver-${sessionId}`, () =>
            handleDriverMessage(trackedSock, replyJid, sessionData.driverId, text)
          );
        }
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
