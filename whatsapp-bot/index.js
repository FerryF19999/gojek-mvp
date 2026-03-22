const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const API_BASE = process.env.NEMU_API_BASE || "https://gojek-mvp.vercel.app/api";
const AUTH_DIR = path.join(__dirname, "session");
const SESSIONS_DIR = path.join(__dirname, "sessions");
const LOGS_DIR = path.join(__dirname, "logs");
const LEGACY_STATES_FILE = path.join(__dirname, "states.json");
const RIDES_FILE = path.join(SESSIONS_DIR, "_rides.json");

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SPAM_LIMIT = 10;
const SPAM_WINDOW_MS = 60 * 1000;
const SPAM_BLOCK_MS = 60 * 1000;
const REPLY_DELAY_MS = 1500;
const PER_NUMBER_MIN_INTERVAL_MS = 2000;
const DRIVER_POLL_INTERVAL_MS = 30 * 1000;

const STATUS_MESSAGES = {
  assigned: "🏍️ Driver ditemukan! Driver menuju lokasi kamu.",
  driver_arriving: "📍 Driver hampir sampai!",
  picked_up: "🛣️ Perjalanan dimulai!",
  completed: "✅ Perjalanan selesai. Silakan bayar ya.",
};

const incomingQueues = new Map();
const sendRateState = new Map();
const spamState = new Map();
let globalSendQueue = Promise.resolve();

ensureDirs();
migrateLegacyState();

function ensureDirs() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  if (!fs.existsSync(RIDES_FILE)) fs.writeFileSync(RIDES_FILE, JSON.stringify({}, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now() {
  return Date.now();
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function isStartIntent(text) {
  const t = (text || "").toLowerCase();
  return ["halo", "hai", "pesan", "ojek", "ride", "mulai", "start"].some((k) => t.includes(k));
}

function isAffirmative(text) {
  return ["ya", "y", "yes", "ok", "oke"].includes((text || "").toLowerCase());
}

function isNegative(text) {
  return ["tidak", "gak", "ga", "no", "n"].includes((text || "").toLowerCase());
}

function parsePayment(text) {
  const t = (text || "").toLowerCase().trim();
  if (t === "1" || t.includes("cash")) return "cash";
  if (t === "2" || t.includes("ovo")) return "ovo";
  if (t === "3" || t.includes("gopay")) return "gopay";
  if (t === "4" || t.includes("dana")) return "dana";
  return null;
}

function pseudoCoord(seed, base, spread) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return base + ((hash % 1000) / 1000 - 0.5) * spread;
}

function getSessionFile(phone) {
  return path.join(SESSIONS_DIR, `${phone}.json`);
}

function readSession(phone) {
  const file = getSessionFile(phone);
  if (!fs.existsSync(file)) {
    return {
      role: null,
      state: "ASK_ROLE",
      data: {},
      lastActive: now(),
      rideCode: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    const session = {
      role: parsed.role || null,
      state: parsed.state || "ASK_ROLE",
      data: parsed.data || {},
      lastActive: parsed.lastActive || now(),
      rideCode: parsed.rideCode || null,
    };

    if (now() - session.lastActive > SESSION_TIMEOUT_MS) {
      session.state = session.role ? "IDLE" : "ASK_ROLE";
      session.data = {};
      session.rideCode = null;
    }

    return session;
  } catch {
    return {
      role: null,
      state: "ASK_ROLE",
      data: {},
      lastActive: now(),
      rideCode: null,
    };
  }
}

function writeSession(phone, session) {
  session.lastActive = now();
  fs.writeFileSync(getSessionFile(phone), JSON.stringify(session, null, 2));
}

function readRidesIndex() {
  try {
    return JSON.parse(fs.readFileSync(RIDES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeRidesIndex(data) {
  fs.writeFileSync(RIDES_FILE, JSON.stringify(data, null, 2));
}

function migrateLegacyState() {
  if (!fs.existsSync(LEGACY_STATES_FILE)) return;

  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_STATES_FILE, "utf-8"));
    const users = legacy.users || {};
    const rides = legacy.rides || {};

    Object.entries(users).forEach(([phone, u]) => {
      const session = {
        role: "passenger",
        state: u.stage || "IDLE",
        data: {
          name: u.name,
          pickup: u.pickup,
          destination: u.destination,
          payment: u.payment,
        },
        lastActive: now(),
        rideCode: u.rideCode || null,
      };
      writeSession(phone, session);
    });

    const rideIndex = {};
    Object.entries(rides).forEach(([rideCode, rec]) => {
      rideIndex[rideCode] = {
        phone: rec.phone,
        lastStatus: rec.lastStatus || "created",
      };
    });
    writeRidesIndex(rideIndex);

    fs.renameSync(LEGACY_STATES_FILE, `${LEGACY_STATES_FILE}.migrated-${Date.now()}`);
  } catch (e) {
    console.warn("[migrate] failed", e.message);
  }
}

function dailyLogFile() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return path.join(LOGS_DIR, `${y}-${m}-${day}.log`);
}

function logLine(direction, phone, text) {
  const line = `${new Date().toISOString()} [${direction}] ${phone} :: ${String(text || "").replace(/\n/g, " ")}\n`;
  fs.appendFileSync(dailyLogFile(), line);
}

async function enqueueIncoming(phone, fn) {
  const prev = incomingQueues.get(phone) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn).catch((e) => console.warn("[incoming]", phone, e.message));
  incomingQueues.set(phone, next);
  await next;
}

async function sendReply(sock, jid, text) {
  const phone = normalizePhone(jid.split("@")[0]);
  globalSendQueue = globalSendQueue
    .catch(() => {})
    .then(async () => {
      const rate = sendRateState.get(phone) || { lastSentAt: 0 };
      const waitForRate = Math.max(0, PER_NUMBER_MIN_INTERVAL_MS - (now() - rate.lastSentAt));
      const waitMs = Math.max(REPLY_DELAY_MS, waitForRate);
      if (waitMs > 0) await sleep(waitMs);

      await sock.sendMessage(jid, { text });
      rate.lastSentAt = now();
      sendRateState.set(phone, rate);
      logLine("OUT", phone, text);
    });

  await globalSendQueue;
}

function checkSpam(phone) {
  const t = now();
  const rec = spamState.get(phone) || { timestamps: [], blockedUntil: 0 };

  if (rec.blockedUntil > t) {
    spamState.set(phone, rec);
    return { blocked: true, shouldWarn: false };
  }

  rec.timestamps = rec.timestamps.filter((ts) => t - ts <= SPAM_WINDOW_MS);
  rec.timestamps.push(t);

  if (rec.timestamps.length > SPAM_LIMIT) {
    rec.blockedUntil = t + SPAM_BLOCK_MS;
    spamState.set(phone, rec);
    return { blocked: true, shouldWarn: true };
  }

  spamState.set(phone, rec);
  return { blocked: false, shouldWarn: false };
}

async function createRide(session, phone) {
  const pickupLat = pseudoCoord(`${phone}:${session.data.pickup}:lat`, -6.2, 0.08);
  const pickupLng = pseudoCoord(`${phone}:${session.data.pickup}:lng`, 106.816, 0.08);
  const dropoffLat = pseudoCoord(`${phone}:${session.data.destination}:lat`, -6.22, 0.08);
  const dropoffLng = pseudoCoord(`${phone}:${session.data.destination}:lng`, 106.84, 0.08);

  const payload = {
    customerName: session.data.name,
    customerPhone: phone,
    pickup: { address: session.data.pickup, lat: pickupLat, lng: pickupLng },
    dropoff: { address: session.data.destination, lat: dropoffLat, lng: dropoffLng },
    vehicleType: "motor",
    paymentMethod: session.data.payment,
  };

  const res = await fetch(`${API_BASE}/rides/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Create ride failed (${res.status})`);
  return res.json();
}

async function getRideStatus(rideCode) {
  const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(rideCode)}`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

async function registerDriver(phone, fullName, plate, city) {
  const payload = {
    fullName,
    phone: `+${phone}`,
    vehicleType: "motor",
    vehicleBrand: "Honda",
    vehicleModel: "Beat",
    vehiclePlate: plate,
    licenseNumber: `SIM-${phone.slice(-6)}`,
    city,
  };

  const res = await fetch(`${API_BASE}/drivers/register/direct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Driver register failed (${res.status})`);
  return res.json();
}

async function setDriverAvailability(token, availability) {
  const res = await fetch(`${API_BASE}/drivers/me/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ availability }),
  });

  if (!res.ok) throw new Error(`Set availability failed (${res.status})`);
  return res.json();
}

async function getDriverRides(token) {
  const res = await fetch(`${API_BASE}/drivers/me/rides`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Get driver rides failed (${res.status})`);
  const data = await res.json();
  return data.rides || data.data || data.items || [];
}

async function driverRespondRide(token, rideCode, action) {
  const endpoint = action === "accept" ? "accept" : "decline";
  const res = await fetch(`${API_BASE}/drivers/me/rides/${encodeURIComponent(rideCode)}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`${endpoint} ride failed (${res.status})`);
  return res.json();
}

async function handlePassenger(sock, jid, phone, session, msg) {
  if (session.state === "IDLE") {
    if (!isStartIntent(msg)) {
      await sendReply(sock, jid, "Ketik *pesan* kalau mau order ojek ya 👌");
      return;
    }
    session.state = "ASK_NAME";
    writeSession(phone, session);
    await sendReply(sock, jid, "Halo! 👋 Mau pesan ojek Nemu? Boleh tahu nama kamu?");
    return;
  }

  if (session.state === "ASK_NAME") {
    session.data.name = msg;
    session.state = "ASK_PICKUP";
    writeSession(phone, session);
    await sendReply(sock, jid, `Oke ${session.data.name}! Mau dijemput dari mana?`);
    return;
  }

  if (session.state === "ASK_PICKUP") {
    session.data.pickup = msg;
    session.state = "ASK_DESTINATION";
    writeSession(phone, session);
    await sendReply(sock, jid, "Mau ke mana tujuannya?");
    return;
  }

  if (session.state === "ASK_DESTINATION") {
    session.data.destination = msg;
    session.state = "ASK_PAYMENT";
    writeSession(phone, session);
    await sendReply(sock, jid, "Mau bayar pakai apa?\n1. Cash\n2. OVO\n3. GoPay\n4. DANA");
    return;
  }

  if (session.state === "ASK_PAYMENT") {
    const payment = parsePayment(msg);
    if (!payment) {
      await sendReply(sock, jid, "Pilih metode pembayaran ya:\n1. Cash\n2. OVO\n3. GoPay\n4. DANA");
      return;
    }

    session.data.payment = payment;
    session.state = "CONFIRM";
    writeSession(phone, session);
    await sendReply(
      sock,
      jid,
      `Oke konfirmasi dulu ya:\n📍 Jemput: ${session.data.pickup}\n🏁 Tujuan: ${session.data.destination}\n💳 Bayar: ${payment.toUpperCase()}\n\nBetul? (ya/tidak)`
    );
    return;
  }

  if (session.state === "CONFIRM") {
    if (isNegative(msg)) {
      session.state = "ASK_PICKUP";
      writeSession(phone, session);
      await sendReply(sock, jid, "Oke, kita ulang dari pickup ya. Mau dijemput dari mana?");
      return;
    }

    if (!isAffirmative(msg)) {
      await sendReply(sock, jid, "Balas 'ya' kalau detailnya sudah benar, atau 'tidak' untuk ubah.");
      return;
    }

    try {
      const created = await createRide(session, phone);
      const rideCode = created.code || created.rideCode || created?.ride?.code;

      session.state = "BOOKED";
      session.rideCode = rideCode;
      writeSession(phone, session);

      const rides = readRidesIndex();
      rides[rideCode] = { phone, lastStatus: "created" };
      writeRidesIndex(rides);

      await sendReply(
        sock,
        jid,
        `✅ Ride dibuat! Kode: ${rideCode}. Gw lagi cariin driver...\nTrack: https://gojek-mvp.vercel.app/track/${rideCode}`
      );
    } catch {
      await sendReply(sock, jid, "Maaf, ride gagal dibuat. Coba lagi bentar ya 🙏");
    }
    return;
  }

  if (session.state === "BOOKED") {
    await sendReply(sock, jid, `Ride kamu masih jalan ya. Kode: ${session.rideCode}`);
  }
}

async function handleDriver(sock, jid, phone, session, msg) {
  const text = msg.toLowerCase();

  if (session.state === "IDLE") {
    session.state = "ASK_NAME";
    writeSession(phone, session);
    await sendReply(sock, jid, "Siap, daftar driver dulu ya. Nama lengkap kamu siapa?");
    return;
  }

  if (session.state === "ASK_NAME") {
    session.data.name = msg;
    session.state = "ASK_PLATE";
    writeSession(phone, session);
    await sendReply(sock, jid, "Nomor plat motor kamu apa? (contoh: B1234XYZ)");
    return;
  }

  if (session.state === "ASK_PLATE") {
    session.data.plate = msg.toUpperCase().replace(/\s+/g, "");
    session.state = "ASK_CITY";
    writeSession(phone, session);
    await sendReply(sock, jid, "Kota operasional kamu di mana?");
    return;
  }

  if (session.state === "ASK_CITY") {
    session.data.city = msg;
    session.state = "CONFIRM_REG";
    writeSession(phone, session);
    await sendReply(
      sock,
      jid,
      `Konfirmasi data driver:\n👤 Nama: ${session.data.name}\n🛵 Plat: ${session.data.plate}\n🏙️ Kota: ${session.data.city}\n\nBenar? (ya/tidak)`
    );
    return;
  }

  if (session.state === "CONFIRM_REG") {
    if (isNegative(text)) {
      session.state = "ASK_NAME";
      session.data = {};
      writeSession(phone, session);
      await sendReply(sock, jid, "Oke, kita ulang dari nama ya.");
      return;
    }

    if (!isAffirmative(text)) {
      await sendReply(sock, jid, "Balas 'ya' untuk lanjut daftar, atau 'tidak' untuk ulang.");
      return;
    }

    try {
      const data = await registerDriver(phone, session.data.name, session.data.plate, session.data.city);
      session.data.driverId = data?.driver?.driverId;
      session.data.driverToken = data?.driver?.apiToken;
      session.state = "CHECKED_OUT";
      writeSession(phone, session);
      await sendReply(sock, jid, "✅ Registrasi driver berhasil! Ketik *checkin* / *masuk* untuk mulai shift.");
    } catch {
      await sendReply(sock, jid, "Maaf, registrasi driver gagal. Coba lagi ya.");
    }
    return;
  }

  if (session.state === "REGISTERED") {
    session.state = "CHECKED_OUT";
    writeSession(phone, session);
  }

  if (session.state === "CHECKED_OUT" && ["checkin", "masuk"].includes(text)) {
    if (!session.data.driverToken) {
      await sendReply(sock, jid, "Token driver belum ada. Coba daftar ulang ya.");
      return;
    }

    try {
      await setDriverAvailability(session.data.driverToken, "online");
      session.state = "CHECKED_IN";
      writeSession(phone, session);
      await sendReply(sock, jid, "✅ Kamu sekarang online! Siap terima orderan.");
    } catch {
      await sendReply(sock, jid, "Gagal check-in. Coba lagi bentar ya.");
    }
    return;
  }

  if (session.state === "CHECKED_IN" && ["checkout", "keluar"].includes(text)) {
    try {
      await setDriverAvailability(session.data.driverToken, "offline");
      session.state = "CHECKED_OUT";
      delete session.data.pendingRideCode;
      writeSession(phone, session);
      await sendReply(sock, jid, "👋 Kamu offline. Sampai besok!");
    } catch {
      await sendReply(sock, jid, "Gagal check-out. Coba lagi ya.");
    }
    return;
  }

  if (session.state === "WAITING_RIDE" || session.state === "ON_RIDE") {
    if (["checkout", "keluar"].includes(text)) {
      await sendReply(sock, jid, "Selesaikan respon orderan/ride dulu ya sebelum checkout.");
      return;
    }
  }

  if (session.state === "WAITING_RIDE") {
    const rideCode = session.data.pendingRideCode;
    if (!rideCode) {
      session.state = "CHECKED_IN";
      writeSession(phone, session);
      return;
    }

    if (isAffirmative(text)) {
      try {
        await driverRespondRide(session.data.driverToken, rideCode, "accept");
        session.state = "ON_RIDE";
        session.rideCode = rideCode;
        delete session.data.pendingRideCode;
        writeSession(phone, session);
        await sendReply(sock, jid, `✅ Order ${rideCode} diterima. Gas jemput penumpang!`);
      } catch {
        await sendReply(sock, jid, "Gagal accept order. Coba lagi.");
      }
      return;
    }

    if (isNegative(text)) {
      try {
        await driverRespondRide(session.data.driverToken, rideCode, "decline");
        session.state = "CHECKED_IN";
        delete session.data.pendingRideCode;
        writeSession(phone, session);
        await sendReply(sock, jid, `👌 Order ${rideCode} ditolak. Nanti cari order lain.`);
      } catch {
        await sendReply(sock, jid, "Gagal reject order. Coba lagi.");
      }
      return;
    }

    await sendReply(sock, jid, "Balas *ya* untuk terima orderan, atau *tidak* untuk tolak.");
    return;
  }

  if (session.state === "CHECKED_IN") {
    await sendReply(sock, jid, "Kamu sedang online. Ketik *checkout* / *keluar* kalau mau selesai shift.");
    return;
  }

  if (session.state === "CHECKED_OUT") {
    await sendReply(sock, jid, "Kamu sedang offline. Ketik *checkin* / *masuk* untuk online.");
    return;
  }

  await sendReply(sock, jid, "Untuk driver: ketik *checkin* untuk online atau *checkout* untuk offline.");
}

async function handleMessage(sock, jid, text) {
  const phone = normalizePhone(jid.split("@")[0]);
  const msg = String(text || "").trim();
  if (!msg) return;

  logLine("IN", phone, msg);

  const spam = checkSpam(phone);
  if (spam.shouldWarn) {
    await sendReply(sock, jid, "Slow down ya 😅");
    return;
  }
  if (spam.blocked) return;

  const session = readSession(phone);

  if (!session.role || session.state === "ASK_ROLE") {
    const lower = msg.toLowerCase();
    if (lower === "driver") {
      session.role = "driver";
      session.state = "ASK_NAME";
      session.data = {};
      writeSession(phone, session);
      await sendReply(sock, jid, "Mantap! Kamu daftar sebagai *Driver*. Nama lengkap kamu siapa?");
      return;
    }

    if (lower === "penumpang") {
      session.role = "passenger";
      session.state = "ASK_NAME";
      session.data = {};
      writeSession(phone, session);
      await sendReply(sock, jid, "Siap, kamu sebagai *Penumpang*. Boleh tahu nama kamu?");
      return;
    }

    session.state = "ASK_ROLE";
    writeSession(phone, session);
    await sendReply(
      sock,
      jid,
      "Halo! Kamu mau daftar sebagai *Driver* atau mau *Pesan Ojek*? (ketik `driver` atau `penumpang`)"
    );
    return;
  }

  if (session.role === "passenger") {
    await handlePassenger(sock, jid, phone, session, msg);
    return;
  }

  if (session.role === "driver") {
    await handleDriver(sock, jid, phone, session, msg);
  }
}

async function pollPassengerRideUpdates(sock) {
  const rides = readRidesIndex();
  const codes = Object.keys(rides);
  if (!codes.length) return;

  for (const rideCode of codes) {
    const rec = rides[rideCode];
    if (!rec?.phone) continue;

    try {
      const data = await getRideStatus(rideCode);
      const status = data.status || data?.ride?.status;
      if (!status || status === rec.lastStatus) continue;

      rec.lastStatus = status;
      rides[rideCode] = rec;

      const jid = `${rec.phone}@s.whatsapp.net`;
      const msg = STATUS_MESSAGES[status];
      if (msg) {
        await sendReply(sock, jid, `${msg}\nKode ride: ${rideCode}`);
      }

      if (status === "completed") {
        delete rides[rideCode];
        const session = readSession(rec.phone);
        session.state = "IDLE";
        session.rideCode = null;
        session.data = {};
        writeSession(rec.phone, session);
      }
    } catch (e) {
      console.warn("[poll-passenger] failed", rideCode, e.message);
    }
  }

  writeRidesIndex(rides);
}

function getAllSessions() {
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  return files.map((f) => {
    const phone = f.replace(/\.json$/, "");
    return { phone, session: readSession(phone) };
  });
}

async function pollDriverAssignments(sock) {
  const all = getAllSessions();
  for (const { phone, session } of all) {
    if (session.role !== "driver") continue;
    if (session.state !== "CHECKED_IN") continue;
    if (!session.data?.driverToken) continue;

    try {
      const rides = await getDriverRides(session.data.driverToken);
      const pending = rides.find((r) => {
        const status = String(r.status || "").toLowerCase();
        return ["assigned", "awaiting_driver_response", "driver_arriving"].includes(status);
      });

      if (!pending) continue;
      const rideCode = pending.code || pending.rideCode;
      if (!rideCode || session.data.pendingRideCode === rideCode || session.rideCode === rideCode) continue;

      session.state = "WAITING_RIDE";
      session.data.pendingRideCode = rideCode;
      writeSession(phone, session);

      const pickup = pending.pickup?.address || pending.pickupAddress || "-";
      const destination = pending.dropoff?.address || pending.dropoffAddress || pending.destination || "-";
      await sendReply(
        sock,
        `${phone}@s.whatsapp.net`,
        `🏍️ Ada orderan baru!\n📍 Jemput: ${pickup}\n🏁 Tujuan: ${destination}\n\nTerima? (ya/tidak)`
      );
    } catch (e) {
      console.warn("[poll-driver] failed", phone, e.message);
    }
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nScan QR berikut dengan nomor WhatsApp bot:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp bot connected");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("❌ Connection closed", code, "reconnect:", shouldReconnect);
      if (shouldReconnect) setTimeout(() => startBot(), 2000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const m of messages) {
      if (!m.message) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || m.key.fromMe) continue;

      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        "";

      if (!text) continue;
      const phone = normalizePhone(jid.split("@")[0]);
      await enqueueIncoming(phone, () => handleMessage(sock, jid, text));
    }
  });

  setInterval(() => pollPassengerRideUpdates(sock).catch((e) => console.warn("[poll-passenger] error", e.message)), 10000);
  setInterval(() => pollDriverAssignments(sock).catch((e) => console.warn("[poll-driver] error", e.message)), DRIVER_POLL_INTERVAL_MS);
}

startBot().catch((err) => {
  console.error("Fatal bot error:", err);
  process.exit(1);
});
