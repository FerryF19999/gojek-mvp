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
      console.log(`[driver-sessions] ${sessionId} connection.update: ${connection || "none"} qr=${!!qr}`);
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

        // Load saved driver data from local file (persists across restarts)
        const metaFile = path.join(DRIVER_AUTHS_DIR, sessionId, "_meta.json");
        let savedMeta = null;
        try {
          if (fs.existsSync(metaFile)) {
            savedMeta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
            console.log(`[driver-sessions] Loaded saved meta for ${sessionId}: ${savedMeta.name || "?"}`);
          }
        } catch {}

        if (savedMeta?.apiToken) {
          sessionData.apiToken = savedMeta.apiToken;
          sessionData.name = savedMeta.name;
          const { setState } = require("./driver-handler");
          setState(sessionData.driverId, { apiToken: savedMeta.apiToken, name: savedMeta.name });
        }

        initDriverState(sessionData.driverId, sessionData.apiToken, sessionData.name);

        // Send welcome message
        console.log(`[driver-sessions] Sending welcome to ${phoneNumber} (role=${sessionData.role}, welcomed=${sessionData._welcomed})`);
        if (phoneNumber && !sessionData._welcomed) {
          sessionData._welcomed = true;
          const jid = `${phoneNumber}@s.whatsapp.net`;
          const isDriver = sessionData.role === "driver";
          const { getDriverState } = require("./driver-handler");
          const driverState = getDriverState(sessionData.driverId);
          const isRegistered = !!driverState.apiToken || !!savedMeta?.apiToken;

          let welcomeText;
          if (isDriver && isRegistered) {
            welcomeText =
              `🏍️ *Nemu Ojek — Driver*\n\n` +
              `Selamat datang kembali${driverState.name ? ", " + driverState.name : ""}! ✅\n\n` +
              `📋 *Perintah:*\n` +
              `• *checkin* — Mulai shift\n` +
              `• *checkout* — Selesai shift\n` +
              `• *saldo* — Cek penghasilan\n` +
              `• *terima* / *tolak* — Respon orderan\n\n` +
              `Ketik *checkin* untuk mulai!`;
          } else if (isDriver) {
            welcomeText =
              `🏍️ *Nemu Ojek — Daftar Driver*\n\n` +
              `Bot aktif ✅\n\n` +
              `Kamu belum terdaftar sebagai driver.\n` +
              `Ketik *daftar* untuk mulai registrasi.`;
          } else {
            welcomeText =
              `🛵 *Halo! Selamat datang di Nemu Ojek* 👋\n\n` +
              `Aku bot yang bantu kamu pesan ojek. Gampang banget:\n\n` +
              `📍 *Cara pesan:*\n` +
              `1. Ketik nama tujuan kamu\n` +
              `   Contoh: *Gedung Sate*, *Mall PVJ*, *RS Borromeus*\n\n` +
              `2. Atau langsung ketik:\n` +
              `   *gas ke Blok M*\n` +
              `   *tujuan Dago*\n` +
              `   *ke Pasteur*\n\n` +
              `3. Atau *share lokasi* tujuan kamu 📍\n\n` +
              `Aku akan cariin driver terdekat dan kasih estimasi harga. Yuk coba!`;
          }
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
    // Listen for ALL events to catch location
    sock.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        if (u.update?.message?.liveLocationMessage || u.update?.message?.locationMessage) {
          const loc = u.update.message.liveLocationMessage || u.update.message.locationMessage;
          console.log(`[LOC-UPDATE] ${sessionId} | lat=${loc.degreesLatitude} | lng=${loc.degreesLongitude}`);
          if (loc.degreesLatitude && loc.degreesLongitude && sessionData.apiToken) {
            const { updateDriverLocation } = require("./api-client");
            updateDriverLocation(sessionData.apiToken, loc.degreesLatitude, loc.degreesLongitude)
              .catch((e) => console.warn(`[driver-gps] update failed:`, e.message));
          }
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // Log ALL messages before any filtering
      for (const m of messages) {
        const jid = m.key.remoteJid || "none";
        const txt = m.message?.conversation || m.message?.extendedTextMessage?.text || "[no-text]";
        const hasLoc = !!(m.message?.locationMessage || m.message?.liveLocationMessage);
        const msgTypes = m.message ? Object.keys(m.message).join(",") : "none";
        console.log(`[RAW-MSG] ${sessionId} | type=${type} | jid=${jid} | fromMe=${m.key.fromMe} | hasLoc=${hasLoc} | msgTypes=${msgTypes} | text=${txt.slice(0,30)}`);
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

        // Detect live location sharing → update GPS + confirm
        if (m.message.locationMessage || m.message.liveLocationMessage) {
          const loc = m.message.liveLocationMessage || m.message.locationMessage;
          const isLive = !!m.message.liveLocationMessage;
          if (loc.degreesLatitude && loc.degreesLongitude) {
            if (sessionData.apiToken) {
              const { updateDriverLocation } = require("./api-client");
              updateDriverLocation(sessionData.apiToken, loc.degreesLatitude, loc.degreesLongitude)
                .then(() => {
                  // Only confirm first time or for static location
                  if (!sessionData._gpsConfirmed || !isLive) {
                    sessionData._gpsConfirmed = true;
                    const msg = isLive
                      ? `📍 *GPS connected!* Lokasi kamu terupdate otomatis.\n\nLat: ${loc.degreesLatitude.toFixed(4)}, Lng: ${loc.degreesLongitude.toFixed(4)}`
                      : `📍 Lokasi diupdate: ${loc.degreesLatitude.toFixed(4)}, ${loc.degreesLongitude.toFixed(4)}`;
                    sendBotReply(sock, jid, msg).catch(() => {});
                  }
                })
                .catch((e) => console.warn(`[driver-gps] ${sessionId} location update failed:`, e.message));
            } else {
              sendBotReply(sock, jid, "📍 Lokasi diterima, tapi kamu belum terdaftar. Ketik *daftar* dulu ya.").catch(() => {});
            }
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
  // Restore from local auth directories (no Convex dependency)
  try {
    const dirs = fs.readdirSync(DRIVER_AUTHS_DIR).filter((d) => {
      const authPath = path.join(DRIVER_AUTHS_DIR, d);
      return fs.statSync(authPath).isDirectory() && fs.readdirSync(authPath).length > 0;
    });

    for (const sessionId of dirs) {
      if (activeSessions.has(sessionId)) continue;
      console.log(`[driver-sessions] Restoring session ${sessionId} from local auth...`);
      // Detect role from sessionId prefix
      const role = sessionId.startsWith("passenger-") ? "passenger" : "driver";
      await createDriverSession(sessionId, sessionId, null, null, role);
    }

    console.log(`[driver-sessions] Restored ${dirs.length} sessions from local auth`);
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
