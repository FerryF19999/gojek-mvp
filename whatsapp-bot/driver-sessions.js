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
 * Save session state to disk for persistence across restarts
 */
function saveSessionState(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  const dir = path.join(DRIVER_AUTHS_DIR, sessionId);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "_session.json"), JSON.stringify({
      driverId: session.driverId,
      apiToken: session.apiToken,
      name: session.name,
      role: session.role,
      phone: session.phone,
      selfLid: session.selfLid,
      lidJid: session.lidJid,
      welcomed: true,
      savedAt: Date.now(),
    }, null, 2));
  } catch (e) {
    console.warn(`[driver-sessions] Failed to save session state for ${sessionId}:`, e.message);
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

  // Load existing session info if available
  const sessionFile = path.join(DRIVER_AUTHS_DIR, sessionId, "_session.json");
  let savedSession = null;
  try {
    if (fs.existsSync(sessionFile)) {
      savedSession = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    }
  } catch {}

  const sessionData = {
    sock: null,
    driverId: driverId || savedSession?.driverId,
    apiToken: apiToken || savedSession?.apiToken,
    name: name || savedSession?.name,
    role: role || savedSession?.role || "driver",
    phone: savedSession?.phone || null,
    selfLid: savedSession?.selfLid || null,
    lidJid: savedSession?.lidJid || null,
    qr: null,
    connected: false,
    reconnecting: false,
  };

  activeSessions.set(sessionId, sessionData);

  // Sync to Convex
  try { await syncSessionToConvex(sessionId, "qr_pending", null, null); } catch {}

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
        try { await syncSessionToConvex(sessionId, "qr_pending", null, qr); } catch {}
      }

      if (connection === "open") {
        sessionData.connected = true;
        sessionData.qr = null;
        sessionData.reconnecting = false;
        const phoneNumber = sock.user?.id?.split(":")[0] || sock.user?.id || null;
        sessionData.phone = phoneNumber;

        console.log(`[driver-sessions] ✅ ${sessionId} connected (${phoneNumber})`);
        try { await syncSessionToConvex(sessionId, "connected", phoneNumber, null); } catch {}
        saveSessionState(sessionId);

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
          const { setDriverState } = require("./driver-handler");
          setDriverState(sessionData.driverId, { apiToken: savedMeta.apiToken, name: savedMeta.name });
        }

        initDriverState(sessionData.driverId, sessionData.apiToken, sessionData.name);

        // Welcome is sent via @lid when selfLid is detected (in messages.upsert handler)
        // This ensures message appears in Message Yourself, not just phone@s.whatsapp.net
      }

      if (connection === "close") {
        sessionData.connected = false;
        sessionData.qr = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(`[driver-sessions] ❌ ${sessionId} disconnected (code: ${code}, reconnect: ${shouldReconnect})`);

        if (shouldReconnect && !sessionData.reconnecting) {
          sessionData.reconnecting = true;
          try { await syncSessionToConvex(sessionId, "disconnected", sessionData.phone, null); } catch {}
          setTimeout(() => startDriverConnection(sessionId, authDir, sessionData), 3000);
        } else {
          try { await syncSessionToConvex(sessionId, "logged_out", sessionData.phone, null); } catch {}
          activeSessions.delete(sessionId);
          // DON'T delete auth files — preserve for re-scan
          // Only delete if user explicitly removes session via API
          console.log(`[driver-sessions] ${sessionId} logged out. Auth files preserved in ${authDir}`);
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

        // Self-chat detection
        const isPhoneSelfChat = ownNumber && jid === `${normalizePhone(ownNumber)}@s.whatsapp.net`;
        const isLidSelfChat = sessionData.selfLid && jid === sessionData.selfLid;

        // Auto-detect self-LID: first text message from @lid with fromMe=true
        if (!sessionData.selfLid && jid.endsWith("@lid") && m.key.fromMe) {
          const txt = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
          if (txt) {
            // This is the user typing in Message Yourself — save this LID
            sessionData.selfLid = jid;
            sessionData.lidJid = jid;
            console.log(`[driver-sessions] Self-LID auto-detected: ${jid}`);
            saveSessionState(sessionId);

            // Send welcome message now (to the correct @lid JID)
            if (!sessionData._welcomeSentToLid) {
              sessionData._welcomeSentToLid = true;
              const isDriver = sessionData.role === "driver";
              const { getDriverState } = require("./driver-handler");
              const dState = getDriverState(sessionData.driverId);
              const isReg = !!dState.apiToken || !!sessionData.apiToken;
              let welcome;
              if (isDriver && isReg) {
                const nm = dState.name || sessionData.name || "";
                welcome = `🏍️ *Nemu Ojek*\n\nHalo${nm ? " " + nm : ""}! Bot driver kamu aktif ✅\n\nKetik *checkin* untuk mulai shift\nKetik *help* untuk semua perintah`;
              } else if (isDriver) {
                welcome = `🏍️ *Nemu Ojek*\n\nBot aktif ✅\nKetik *daftar* untuk registrasi driver.`;
              } else {
                welcome = `🛵 *Nemu Ojek* — Ojek tanpa komisi\n\nMau ke mana hari ini? Bilang aja:\n\n💬 *"dari [pickup] ke [tujuan]"*\nContoh: _dari Pasteur ke Gedung Sate_\n\nAtau share 📍 lokasi kamu lalu ketik tujuan.`;
              }
              sendBotReply(sock, jid, welcome).catch(() => {});
            }
            // Fall through to process this message
          }
        }

        const isSelfChat = isPhoneSelfChat || isLidSelfChat || (sessionData.selfLid && jid === sessionData.selfLid);

        // ONLY respond in self-chat — ignore all other chats
        if (!isSelfChat) continue;

        // Update lidJid
        if (jid.endsWith("@lid")) {
          sessionData.lidJid = jid;
        }

        // Skip bot's own replies to avoid echo loop
        if (sentMessageIds.has(m.key.id)) continue;

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
 * Send a message to a user's Message Yourself (self-chat)
 * Uses the saved LID jid from their session
 */
async function sendToSelf(sessionId, text) {
  const session = activeSessions.get(sessionId);
  if (!session?.sock || !session.connected) return false;

  const jid = session.lidJid || (session.phone ? `${session.phone}@s.whatsapp.net` : null);
  if (!jid) return false;

  try {
    const sent = await session.sock.sendMessage(jid, { text });
    if (sent?.key?.id) sentMessageIds.add(sent.key.id);
    return true;
  } catch (e) {
    console.warn(`[driver-sessions] sendToSelf failed for ${sessionId}:`, e.message);
    return false;
  }
}

/**
 * Send to a user's Message Yourself by phone number (find session first)
 */
async function sendToSelfByPhone(phone, text) {
  const normalized = normalizePhone(phone);
  for (const [sessionId, session] of activeSessions) {
    if (session.connected && session.phone && normalizePhone(session.phone) === normalized) {
      return await sendToSelf(sessionId, text);
    }
  }
  return false;
}

/**
 * Find session by phone number
 */
function findSessionByPhone(phone) {
  const normalized = normalizePhone(phone);
  for (const [sessionId, session] of activeSessions) {
    if (session.phone && normalizePhone(session.phone) === normalized) {
      return { sessionId, ...session };
    }
  }
  return null;
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
  sendToSelf,
  sendToSelfByPhone,
  findSessionByPhone,
};
