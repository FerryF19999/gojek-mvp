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
const SESSION_DIR = path.join(__dirname, "session");
const STATES_FILE = path.join(__dirname, "states.json");

const STATUS_MESSAGES = {
  assigned: "🏍️ Driver ditemukan! Driver menuju lokasi kamu.",
  driver_arriving: "📍 Driver hampir sampai!",
  picked_up: "🛣️ Perjalanan dimulai!",
  completed: "✅ Perjalanan selesai. Silakan bayar ya.",
};

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(STATES_FILE)) fs.writeFileSync(STATES_FILE, JSON.stringify({ users: {}, rides: {} }, null, 2));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATES_FILE, "utf-8"));
  } catch {
    return { users: {}, rides: {} };
  }
}

function writeState(state) {
  fs.writeFileSync(STATES_FILE, JSON.stringify(state, null, 2));
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function isStartIntent(text) {
  const t = (text || "").toLowerCase();
  return ["halo", "hai", "pesan", "ojek", "ride"].some((k) => t.includes(k));
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

async function createRide(user, phone) {
  const pickupLat = pseudoCoord(`${phone}:${user.pickup}:lat`, -6.2, 0.08);
  const pickupLng = pseudoCoord(`${phone}:${user.pickup}:lng`, 106.816, 0.08);
  const dropoffLat = pseudoCoord(`${phone}:${user.destination}:lat`, -6.22, 0.08);
  const dropoffLng = pseudoCoord(`${phone}:${user.destination}:lng`, 106.84, 0.08);

  const payload = {
    customerName: user.name,
    customerPhone: phone,
    pickup: { address: user.pickup, lat: pickupLat, lng: pickupLng },
    dropoff: { address: user.destination, lat: dropoffLat, lng: dropoffLng },
    vehicleType: "motor",
    paymentMethod: user.payment,
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

async function handleMessage(sock, jid, text) {
  const phone = normalizePhone(jid.split("@")[0]);
  const state = readState();
  const user = state.users[phone] || { stage: "IDLE" };
  const msg = String(text || "").trim();

  if (user.stage === "IDLE") {
    if (!isStartIntent(msg)) return;
    state.users[phone] = { stage: "ASK_NAME" };
    writeState(state);
    await sock.sendMessage(jid, { text: "Halo! 👋 Mau pesan ojek Nemu? Boleh tahu nama kamu?" });
    return;
  }

  if (user.stage === "ASK_NAME") {
    user.name = msg;
    user.stage = "ASK_PICKUP";
    state.users[phone] = user;
    writeState(state);
    await sock.sendMessage(jid, { text: `Oke ${user.name}! Mau dijemput dari mana? (Kirim alamat atau share lokasi)` });
    return;
  }

  if (user.stage === "ASK_PICKUP") {
    user.pickup = msg;
    user.stage = "ASK_DESTINATION";
    state.users[phone] = user;
    writeState(state);
    await sock.sendMessage(jid, { text: "Mau ke mana tujuannya?" });
    return;
  }

  if (user.stage === "ASK_DESTINATION") {
    user.destination = msg;
    user.stage = "ASK_PAYMENT";
    state.users[phone] = user;
    writeState(state);
    await sock.sendMessage(jid, { text: "Mau bayar pakai apa?\n1. Cash\n2. OVO\n3. GoPay\n4. DANA" });
    return;
  }

  if (user.stage === "ASK_PAYMENT") {
    const payment = parsePayment(msg);
    if (!payment) {
      await sock.sendMessage(jid, { text: "Pilih metode pembayaran ya:\n1. Cash\n2. OVO\n3. GoPay\n4. DANA" });
      return;
    }

    user.payment = payment;
    user.stage = "CONFIRM";
    state.users[phone] = user;
    writeState(state);
    await sock.sendMessage(jid, {
      text: `Oke konfirmasi dulu ya:\n📍 Jemput: ${user.pickup}\n🏁 Tujuan: ${user.destination}\n💳 Bayar: ${payment.toUpperCase()}\n\nBetul? (ya/tidak)`,
    });
    return;
  }

  if (user.stage === "CONFIRM") {
    if (["tidak", "gak", "no", "n"].includes(msg.toLowerCase())) {
      state.users[phone] = { stage: "ASK_PICKUP", name: user.name };
      writeState(state);
      await sock.sendMessage(jid, { text: "Oke, kita ulang dari pickup ya. Mau dijemput dari mana?" });
      return;
    }

    if (!["ya", "y", "yes", "ok", "oke"].includes(msg.toLowerCase())) {
      await sock.sendMessage(jid, { text: "Balas 'ya' kalau detailnya sudah benar, atau 'tidak' untuk ubah." });
      return;
    }

    try {
      const created = await createRide(user, phone);
      const rideCode = created.code || created.rideCode;

      user.stage = "BOOKED";
      user.rideCode = rideCode;
      user.lastNotifiedStatus = "created";
      state.users[phone] = user;
      state.rides[rideCode] = { phone, lastStatus: "created" };
      writeState(state);

      await sock.sendMessage(jid, {
        text: `✅ Ride dibuat! Kode: ${rideCode}. Gw lagi cariin driver...\nTrack: https://gojek-mvp.vercel.app/track/${rideCode}`,
      });
    } catch (e) {
      await sock.sendMessage(jid, { text: "Maaf, ride gagal dibuat. Coba lagi bentar ya 🙏" });
    }
    return;
  }

  if (user.stage === "BOOKED") {
    await sock.sendMessage(jid, { text: `Ride kamu masih jalan ya. Kode: ${user.rideCode}` });
  }
}

async function pollRideUpdates(sock) {
  const state = readState();
  const rideCodes = Object.keys(state.rides || {});
  if (!rideCodes.length) return;

  for (const rideCode of rideCodes) {
    const rec = state.rides[rideCode];
    if (!rec?.phone) continue;

    try {
      const data = await getRideStatus(rideCode);
      const status = data.status;
      if (!status || status === rec.lastStatus) continue;

      rec.lastStatus = status;
      state.rides[rideCode] = rec;

      const jid = `${rec.phone}@s.whatsapp.net`;
      const msg = STATUS_MESSAGES[status];
      if (msg) {
        await sock.sendMessage(jid, { text: `${msg}\nKode ride: ${rideCode}` });
      }

      if (status === "completed") {
        delete state.rides[rideCode];
        if (state.users[rec.phone]) {
          state.users[rec.phone] = { stage: "IDLE" };
        }
      }
    } catch (e) {
      console.warn("[poll] failed", rideCode, e.message);
    }
  }

  writeState(state);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
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
      await handleMessage(sock, jid, text);
    }
  });

  setInterval(() => pollRideUpdates(sock).catch((e) => console.warn("[poll] error", e.message)), 10000);
}

startBot().catch((err) => {
  console.error("Fatal bot error:", err);
  process.exit(1);
});
