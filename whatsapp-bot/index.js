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
const ADMIN_NUMBER = normalizePhone(process.env.ADMIN_NUMBER || "");
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
const RATING_TIMEOUT_MS = 5 * 60 * 1000;

const STATUS_MESSAGES = {
  driver_arriving: "📍 Driver hampir sampai!",
  picked_up: "🛣️ Perjalanan dimulai!",
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

function formatIdr(amount) {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(amount || 0)));
}

function estimateDistanceKm(pickup, destination) {
  const p = String(pickup || "").toLowerCase();
  const d = String(destination || "").toLowerCase();
  if (!p || !d) return 3;
  if (p === d) return 2;

  const areas = [
    "jakarta", "depok", "bogor", "bekasi", "tangerang", "bandung", "surabaya", "medan", "semarang", "yogyakarta", "bali",
  ];
  const pArea = areas.find((a) => p.includes(a));
  const dArea = areas.find((a) => d.includes(a));

  if (pArea && dArea && pArea !== dArea) return 10;

  const pickupWords = new Set(p.split(/[^a-z0-9]+/).filter(Boolean));
  const destinationWords = new Set(d.split(/[^a-z0-9]+/).filter(Boolean));
  const overlap = [...pickupWords].filter((w) => destinationWords.has(w)).length;

  if (overlap >= 2) return 3;
  if (overlap === 1) return 5;
  return 7;
}

function calculateFareEstimate(pickup, destination) {
  const baseFare = 8000;
  const perKm = 2500;
  const km = estimateDistanceKm(pickup, destination);
  return {
    km,
    amount: baseFare + km * perKm,
  };
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

function removeRideFromIndex(rideCode) {
  if (!rideCode) return;
  const rides = readRidesIndex();
  if (!rides[rideCode]) return;
  delete rides[rideCode];
  writeRidesIndex(rides);
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

async function submitRideRating(rideCode, rating) {
  const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(rideCode)}/rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error(`Rating submit failed (${res.status})`);
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

async function getDriverEarnings(token) {
  const res = await fetch(`${API_BASE}/drivers/me/earnings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get earnings failed (${res.status})`);
  return res.json();
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

async function fetchJson(pathname) {
  const res = await fetch(`${API_BASE}${pathname}`);
  if (!res.ok) throw new Error(`API failed ${pathname} (${res.status})`);
  return res.json();
}

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

  const res = await fetch(`${API_BASE}/admin/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, phoneNumber: phone }),
  });

  if (res.ok) {
    await sendReply(sock, jid, "✅ Berhasil masuk sebagai admin! Silakan cek browser kamu.");
    return true;
  }

  await sendReply(sock, jid, "❌ Token tidak valid atau sudah expired.");
  return true;
}

async function handleAdminCommand(sock, jid, msg) {
  const command = String(msg || "").trim().toLowerCase();

  if (!command || command === "help") {
    await sendReply(
      sock,
      jid,
      "🛠️ Admin commands:\n- status\n- drivers\n- rides\n- help"
    );
    return;
  }

  try {
    if (command === "status") {
      const data = await fetchJson("/admin/stats");
      await sendReply(
        sock,
        jid,
        `🟢 Driver online: ${data.driversOnline || 0}\n🏍️ Ride aktif: ${data.activeRides || 0}\n📊 Ride hari ini: ${data.ridesToday || 0}`
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
      const lines = rides.map(
        (r, idx) =>
          `${idx + 1}. ${r.rideCode || r.code} | Penumpang: ${r.passengerName || "-"} | Driver: ${r.driverName || "-"} | ${r.status || "-"}`
      );
      await sendReply(sock, jid, `🏍️ Ride aktif (${rides.length}):\n${lines.join("\n")}`);
      return;
    }

    await sendReply(sock, jid, "Perintah admin tidak dikenal. Ketik *help*.");
  } catch {
    await sendReply(sock, jid, "Gagal ambil data admin. Coba lagi bentar.");
  }
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
    const estimate = calculateFareEstimate(session.data.pickup, session.data.destination);
    session.data.estimatedFare = estimate.amount;
    session.data.estimatedKm = estimate.km;
    session.state = "CONFIRM";
    writeSession(phone, session);
    await sendReply(
      sock,
      jid,
      `Oke konfirmasi dulu ya:\n📍 Jemput: ${session.data.pickup}\n🏁 Tujuan: ${session.data.destination}\n💳 Bayar: ${payment.toUpperCase()}\n💰 Estimasi: Rp ${formatIdr(estimate.amount)}\n\nBetul? (ya/tidak)`
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
      rides[rideCode] = { phone, lastStatus: "created", assignedNotified: false, ratingAsked: false };
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

  if (session.state === "RATING") {
    const rating = Number(String(msg || "").trim());
    const ratingMeta = session.data?.ratingMeta || {};

    if (ratingMeta.expiresAt && now() > ratingMeta.expiresAt) {
      removeRideFromIndex(ratingMeta.rideCode || session.rideCode);
      session.state = "IDLE";
      session.rideCode = null;
      session.data = {};
      writeSession(phone, session);
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      await sendReply(sock, jid, "Ketik angka 1-5 ya untuk kasih rating driver.");
      return;
    }

    try {
      await submitRideRating(ratingMeta.rideCode || session.rideCode, rating);
      await sendReply(sock, jid, `Makasih ratingnya! ${"⭐".repeat(rating)}`);
    } catch {
      await sendReply(sock, jid, "Maaf, gagal simpan rating. Nanti coba lagi ya.");
    }

    removeRideFromIndex(ratingMeta.rideCode || session.rideCode);
    session.state = "IDLE";
    session.rideCode = null;
    session.data = {};
    writeSession(phone, session);
    return;
  }

  if (session.state === "BOOKED") {
    await sendReply(sock, jid, `Ride kamu masih jalan ya. Kode: ${session.rideCode}`);
  }
}

async function handleDriver(sock, jid, phone, session, msg) {
  const text = msg.toLowerCase().trim();

  if (["saldo", "penghasilan"].includes(text)) {
    if (!session.data?.driverToken) {
      await sendReply(sock, jid, "Data driver belum siap. Daftar/check-in dulu ya.");
      return;
    }
    try {
      const data = await getDriverEarnings(session.data.driverToken);
      await sendReply(
        sock,
        jid,
        `💰 Penghasilan hari ini: Rp ${formatIdr(data.earningsToday || 0)}\n🏍️ Total ride: ${data.totalRides || 0}\n⭐ Rating: ${Number(data.avgRating || 0).toFixed(1)}`
      );
    } catch {
      await sendReply(sock, jid, "Gagal ambil data penghasilan. Coba lagi nanti ya.");
    }
    return;
  }

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

  if (await handleAdminAuthToken(sock, jid, phone, msg)) {
    return;
  }

  if (ADMIN_NUMBER && phone === ADMIN_NUMBER) {
    await handleAdminCommand(sock, jid, msg);
    return;
  }

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
      const ride = data.ride || data;
      const status = ride.status;
      if (!status) continue;

      const jid = `${rec.phone}@s.whatsapp.net`;

      if (status === "assigned" && !rec.assignedNotified) {
        const driverName = ride.driver?.name || "Driver";
        const driverPlate = ride.driver?.plate || ride.driver?.vehiclePlate || "-";
        await sendReply(
          sock,
          jid,
          `✅ Driver ditemukan!\n🏍️ ${driverName} - ${driverPlate}\n📍 Tracking live: https://gojek-mvp.vercel.app/track/${rideCode}\n\nDriver sedang menuju lokasi kamu...`
        );
        rec.assignedNotified = true;
      }

      if (status !== rec.lastStatus) {
        rec.lastStatus = status;
        const msg = STATUS_MESSAGES[status];
        if (msg) {
          await sendReply(sock, jid, `${msg}\nKode ride: ${rideCode}`);
        }
      }

      if (status === "completed") {
        const session = readSession(rec.phone);
        if (!rec.ratingAsked) {
          rec.ratingAsked = true;
          session.state = "RATING";
          session.rideCode = rideCode;
          session.data = {
            ratingMeta: {
              rideCode,
              driverName: ride.driver?.name || "Driver",
              expiresAt: now() + RATING_TIMEOUT_MS,
            },
          };
          writeSession(rec.phone, session);

          await sendReply(
            sock,
            jid,
            `Perjalanan selesai! Kasih bintang buat driver ${session.data.ratingMeta.driverName}? (ketik 1-5)`
          );
        }
      }

      if (rec.ratingAsked) {
        const session = readSession(rec.phone);
        const expiresAt = session?.data?.ratingMeta?.expiresAt;

        if (session?.state !== "RATING") {
          delete rides[rideCode];
        } else if (expiresAt && now() > expiresAt) {
          session.state = "IDLE";
          session.rideCode = null;
          session.data = {};
          writeSession(rec.phone, session);
          delete rides[rideCode];
        }
      }

      rides[rideCode] = rec;
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
