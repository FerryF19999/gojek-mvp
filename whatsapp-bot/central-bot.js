/**
 * Central WhatsApp bot (1 number) for passenger booking + admin
 * This is the main Nemu Ojek bot that passengers message to book rides
 */

const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

const {
  ensureDirs, normalizePhone, logLine, sendReply,
  checkSpam, enqueueIncoming, readSession, writeSession,
} = require("./utils");
const { handlePassenger, pollPassengerRideUpdates } = require("./passenger-handler");
const { fetchJson } = require("./api-client");

const AUTH_DIR = path.join(__dirname, "session");
const ADMIN_NUMBER = normalizePhone(process.env.ADMIN_NUMBER || "");
const POLL_INTERVAL_MS = 30 * 1000;

let currentQR = null;
let isConnected = false;
let connectedNumber = null;
let botSocket = null;
let convexClient = null;

function setConvexClient(client) {
  convexClient = client;
}

function getStatus() {
  return { connected: isConnected, hasQR: !!currentQR, qr: currentQR, number: connectedNumber };
}

function getSocket() {
  return botSocket;
}

async function pushQRToConvex(qr, connected, phoneNumber) {
  if (!convexClient) return;
  try {
    await convexClient.mutation("waBot:saveQR", {
      qr,
      connected,
      phoneNumber: phoneNumber || undefined,
    });
  } catch (e) {
    console.error("[central-bot] Failed to push QR to Convex:", e.message);
  }
}

// ─── Admin commands ───

async function handleAdminAuthToken(sock, jid, phone, msg) {
  if (!msg.startsWith("AUTH:")) return false;
  const token = msg.replace("AUTH:", "").trim();
  if (!token) {
    await sendReply(sock, jid, "❌ Token admin kosong.");
    return true;
  }
  if (!ADMIN_NUMBER || phone !== ADMIN_NUMBER) {
    await sendReply(sock, jid, "❌ Kamu tidak punya akses admin.");
    return true;
  }
  const API_BASE = process.env.NEMU_API_BASE || "https://gojek-mvp.vercel.app/api";
  const res = await fetch(`${API_BASE}/admin/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, phoneNumber: phone }),
  });
  if (res.ok) {
    await sendReply(sock, jid, "✅ Berhasil masuk sebagai admin! Cek browser kamu.");
    return true;
  }
  await sendReply(sock, jid, "❌ Token tidak valid atau sudah expired.");
  return true;
}

async function handleAdminCommand(sock, jid, msg) {
  const command = String(msg || "").trim().toLowerCase();

  if (!command || command === "help") {
    await sendReply(sock, jid,
      "🛠️ Admin commands:\n- status\n- drivers\n- rides\n- help"
    );
    return;
  }

  try {
    if (command === "status") {
      const data = await fetchJson("/admin/stats");
      await sendReply(sock, jid,
        `🟢 Driver online: ${data.driversOnline || 0}\n` +
        `🏍️ Ride aktif: ${data.activeRides || 0}\n` +
        `📊 Ride hari ini: ${data.ridesToday || 0}`
      );
      return;
    }

    if (command === "drivers") {
      const data = await fetchJson("/drivers?status=online");
      const drivers = data.drivers || [];
      if (!drivers.length) {
        await sendReply(sock, jid, "Tidak ada driver online saat ini.");
        return;
      }
      const lines = drivers.map((d, idx) => `${idx + 1}. ${d.name || "Driver"} - ${d.plate || "-"}`);
      await sendReply(sock, jid, `🟢 Driver online (${drivers.length}):\n${lines.join("\n")}`);
      return;
    }

    if (command === "rides") {
      const data = await fetchJson("/rides?status=active");
      const rides = data.rides || [];
      if (!rides.length) {
        await sendReply(sock, jid, "Tidak ada ride aktif saat ini.");
        return;
      }
      const lines = rides.map((r, idx) =>
        `${idx + 1}. ${r.code || r.rideCode} | ${r.status || "-"}`
      );
      await sendReply(sock, jid, `🏍️ Ride aktif (${rides.length}):\n${lines.join("\n")}`);
      return;
    }

    await sendReply(sock, jid, "Perintah admin tidak dikenal. Ketik *help*.");
  } catch {
    await sendReply(sock, jid, "Gagal ambil data admin. Coba lagi bentar.");
  }
}

// ─── Main message handler ───

async function handleMessage(sock, jid, text, locationMsg) {
  const phone = normalizePhone(jid.split("@")[0]);
  const msg = String(text || "").trim();

  if (!msg && !locationMsg) return;

  logLine("IN", phone, locationMsg ? `[LOCATION ${locationMsg.degreesLatitude},${locationMsg.degreesLongitude}]` : msg);

  // Admin auth token
  if (msg && await handleAdminAuthToken(sock, jid, phone, msg)) return;

  // Admin commands
  if (ADMIN_NUMBER && phone === ADMIN_NUMBER && msg) {
    await handleAdminCommand(sock, jid, msg);
    return;
  }

  // Spam check
  const spam = checkSpam(phone);
  if (spam.shouldWarn) {
    await sendReply(sock, jid, "Slow down ya 😅");
    return;
  }
  if (spam.blocked) return;

  // Passenger handling — all users on central bot are passengers
  const session = readSession(phone);
  if (!session.role) session.role = "passenger";
  if (session.state === "ASK_ROLE") session.state = "IDLE";

  await handlePassenger(sock, jid, phone, session, msg, locationMsg);
}

// ─── Start bot ───

async function startCentralBot() {
  ensureDirs(AUTH_DIR);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  botSocket = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr;
      isConnected = false;
      await pushQRToConvex(qr, false, null);
      console.log("\n[central-bot] Scan QR berikut dengan nomor WhatsApp bot utama:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isConnected = true;
      connectedNumber = sock.user?.id || null;
      currentQR = null;
      await pushQRToConvex(null, true, sock.user?.id || null);
      console.log("[central-bot] ✅ Central bot connected");

      // Start polling for ride updates
      setInterval(() => pollPassengerRideUpdates(), POLL_INTERVAL_MS);
    }

    if (connection === "close") {
      isConnected = false;
      connectedNumber = null;
      botSocket = null;
      await pushQRToConvex(null, false, null);
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[central-bot] ❌ Disconnected (code: ${code}, reconnect: ${shouldReconnect})`);
      if (shouldReconnect) setTimeout(() => startCentralBot(), 2000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const m of messages) {
      if (!m.message) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || m.key.fromMe) continue;

      // Extract text
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        "";

      // Extract location message
      let locationMsg = null;
      if (m.message.locationMessage) {
        locationMsg = m.message.locationMessage;
      } else if (m.message.liveLocationMessage) {
        locationMsg = m.message.liveLocationMessage;
      }

      if (!text && !locationMsg) continue;

      const phone = normalizePhone(jid.split("@")[0]);
      await enqueueIncoming(phone, () => handleMessage(sock, jid, text, locationMsg));
    }
  });

  return sock;
}

module.exports = {
  startCentralBot,
  setConvexClient,
  getStatus,
  getSocket,
};
