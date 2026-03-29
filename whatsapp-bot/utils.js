const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(__dirname, "sessions");
const LOGS_DIR = path.join(__dirname, "logs");
const RIDES_FILE = path.join(SESSIONS_DIR, "_rides.json");

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SPAM_LIMIT = 10;
const SPAM_WINDOW_MS = 60 * 1000;
const SPAM_BLOCK_MS = 60 * 1000;
const REPLY_DELAY_MS = 1500;
const PER_NUMBER_MIN_INTERVAL_MS = 2000;

const sendRateState = new Map();
const spamState = new Map();
let globalSendQueue = Promise.resolve();

function ensureDirs(...dirs) {
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
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

function formatIdr(amount) {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(amount || 0)));
}

function isStartIntent(text) {
  const t = (text || "").toLowerCase();
  return ["halo", "hai", "pesan", "ojek", "ride", "mulai", "start"].some((k) => t.includes(k));
}

function isAffirmative(text) {
  return ["ya", "y", "yes", "ok", "oke", "book it", "terima", "gas", "siap"].includes(
    (text || "").toLowerCase().trim()
  );
}

function isNegative(text) {
  return ["tidak", "gak", "ga", "no", "n", "tolak", "batal"].includes(
    (text || "").toLowerCase().trim()
  );
}

function parsePayment(text) {
  const t = (text || "").toLowerCase().trim();
  if (t === "1" || t.includes("cash") || t.includes("tunai")) return "cash";
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

function estimateDistanceKm(pickup, destination) {
  const p = String(pickup || "").toLowerCase();
  const d = String(destination || "").toLowerCase();
  if (!p || !d) return 3;
  if (p === d) return 2;

  const areas = [
    "jakarta", "depok", "bogor", "bekasi", "tangerang", "bandung",
    "surabaya", "medan", "semarang", "yogyakarta", "bali",
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
  return { km, amount: baseFare + km * perKm };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ─── Session file I/O ───

function getSessionFile(phone) {
  return path.join(SESSIONS_DIR, `${phone}.json`);
}

function readSession(phone) {
  const file = getSessionFile(phone);
  if (!fs.existsSync(file)) {
    return { role: null, state: "ASK_ROLE", data: {}, lastActive: now(), rideCode: null };
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
    return { role: null, state: "ASK_ROLE", data: {}, lastActive: now(), rideCode: null };
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

// ─── Logging ───

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

// ─── Rate-limited send ───

async function sendReply(sock, jid, text) {
  const phone = normalizePhone(jid.split("@")[0]);
  globalSendQueue = globalSendQueue
    .catch(() => {})
    .then(async () => {
      const rate = sendRateState.get(phone) || { lastSentAt: 0 };
      const waitForRate = Math.max(0, PER_NUMBER_MIN_INTERVAL_MS - (now() - rate.lastSentAt));
      const waitMs = Math.max(REPLY_DELAY_MS, waitForRate);
      if (waitMs > 0) await sleep(waitMs);
      try {
        await sock.sendMessage(jid, { text });
        rate.lastSentAt = now();
        sendRateState.set(phone, rate);
        logLine("OUT", phone, text);
      } catch (e) {
        console.error(`[sendReply] Failed to send to ${phone}:`, e.message);
      }
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

// ─── Incoming queue ───

const incomingQueues = new Map();

async function enqueueIncoming(phone, fn) {
  const prev = incomingQueues.get(phone) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn).catch((e) => console.warn("[incoming]", phone, e.message));
  incomingQueues.set(phone, next);
  await next;
}

module.exports = {
  SESSIONS_DIR,
  LOGS_DIR,
  RIDES_FILE,
  SESSION_TIMEOUT_MS,
  ensureDirs,
  sleep,
  now,
  normalizePhone,
  formatIdr,
  isStartIntent,
  isAffirmative,
  isNegative,
  parsePayment,
  pseudoCoord,
  estimateDistanceKm,
  calculateFareEstimate,
  haversineKm,
  readSession,
  writeSession,
  readRidesIndex,
  writeRidesIndex,
  removeRideFromIndex,
  logLine,
  sendReply,
  checkSpam,
  enqueueIncoming,
};
