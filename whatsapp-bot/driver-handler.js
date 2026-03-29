/**
 * Smart Driver Bot — Natural conversation with fuzzy intent detection
 * Runs on each driver's personal WhatsApp bot
 */

const { formatIdr, sendReply } = require("./utils");
const { setDriverAvailability, getDriverEarnings, driverRespondRide } = require("./api-client");

// ─── Response Templates ───

const T = {
  welcome: "🏍️ Selamat datang di Nemu Ojek!\nKetik *checkin* untuk mulai shift.",
  checkedIn: (earnings, token) => {
    const extras = [];
    if (earnings) {
      extras.push(`Kemarin: Rp ${formatIdr(earnings.earningsToday || 0)} dari ${earnings.totalRides || 0} trip.`);
      if (earnings.avgRating) extras.push(`⭐ Rating: ${Number(earnings.avgRating).toFixed(1)}`);
    }
    const base = "✅ Kamu sekarang *online*! Siap terima orderan 🏍️";
    const appUrl = process.env.NEMU_APP_URL || "https://gojek-mvp.vercel.app";
    const gpsLink = token ? `\n\n📍 *Aktifkan GPS:*\n${appUrl}/driver-gps?token=${token}\n_(buka link ini di browser HP supaya lokasi kamu terupdate otomatis)_` : "";
    return `${base}${extras.length ? "\n" + extras.join(" ") : ""}${gpsLink}`;
  },
  alreadyOnline: [
    "Kamu udah online kok! Tunggu orderan aja 🏍️",
    "Udah online! Santai, nanti orderan masuk sendiri 😊",
  ],
  checkedOut: [
    "👋 Kamu sekarang *offline*. Istirahat dulu ya!",
    "👋 Offline! Sampai jumpa di shift berikutnya 😊",
    "👋 Selesai shift! Makasih udah ngebut hari ini 💪",
  ],
  alreadyOffline: "Kamu udah offline. Ketik *checkin* kalau mau mulai shift.",
  cantCheckoutOnRide: "Selesaikan orderan/respon dulu ya sebelum checkout 🙏",
  earnings: (data) =>
    `💰 *Penghasilan Hari Ini*\n\n` +
    `Pendapatan: Rp ${formatIdr(data.earningsToday || 0)}\n` +
    `Total ride: ${data.totalRides || 0}\n` +
    `⭐ Rating: ${Number(data.avgRating || 0).toFixed(1)}`,
  newRide: (pickup, dropoff, amount, distance) =>
    `🆕 *Ada orderan!*\n\n` +
    `📍 Jemput: ${pickup}${distance ? ` (${distance} km)` : ""}\n` +
    `🏁 Tujuan: ${dropoff}\n` +
    `💰 Rp ${formatIdr(amount)}\n\n` +
    `Mau ambil? Ketik *terima* atau *tolak*`,
  accepted: (code) => [
    `✅ Orderan *${code}* diterima! Gas jemput penumpang 🏍️💨`,
    `✅ *${code}* — diterima! Segera ke lokasi jemput ya.`,
  ],
  declined: [
    "❌ Orderan ditolak. Nanti ada yang lain 👌",
    "❌ Ditolak. Tetap online, orderan lain segera masuk!",
  ],
  askResponse: "Ada orderan masuk! Ketik *terima* atau *tolak*.",
  status: (s, code) => {
    const labels = {
      checked_in: "🟢 Online — siap terima orderan",
      checked_out: "🔴 Offline",
      waiting_ride: "🟡 Ada orderan masuk — respon dulu!",
      on_ride: `🔵 Sedang antar penumpang (${code || ""})`,
    };
    return `📊 *Status:* ${labels[s] || s}`;
  },
  help:
    "🏍️ *Nemu Ojek Driver*\n\n" +
    "📋 Perintah:\n" +
    "• *checkin* / *masuk* / *gas* — mulai shift\n" +
    "• *checkout* / *keluar* / *selesai* — akhiri shift\n" +
    "• *saldo* / *penghasilan* — cek pendapatan\n" +
    "• *status* — cek status kamu\n" +
    "• *terima* — ambil orderan\n" +
    "• *tolak* — skip orderan\n" +
    "• *help* — bantuan",
  greetOnline: [
    "Hai! 👋 Kamu lagi online. Ada yang bisa dibantu? Ketik *help* buat list perintah.",
    "Hey! 🏍️ Kamu online dan siap terima orderan!",
  ],
  greetOffline: [
    "Hai! 👋 Mau mulai shift? Ketik *checkin* atau *gas*!",
    "Hey! 🏍️ Mau ngebut hari ini? Bilang *gas* buat mulai!",
  ],
  dontUnderstand: [
    "Hmm? Ketik *help* buat lihat perintah yang tersedia ya 😊",
    "Gak ngerti nih 😅 Coba ketik *help*!",
  ],
};

function pick(arr) {
  return Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr;
}

// ─── Per-driver State ───

const driverStates = new Map();

function getState(driverId) {
  if (!driverStates.has(driverId)) {
    driverStates.set(driverId, {
      status: "checked_out",
      apiToken: null,
      pendingRideCode: null,
      currentRideCode: null,
      name: null,
    });
  }
  return driverStates.get(driverId);
}

function setState(driverId, patch) {
  const s = getState(driverId);
  Object.assign(s, patch);
}

function initDriverState(driverId, apiToken, name) {
  const existing = driverStates.get(driverId);
  // Don't overwrite registration data if mid-registration
  if (existing && existing.regStep) return;
  setState(driverId, { apiToken, name, status: "checked_out", pendingRideCode: null, currentRideCode: null });
}

// ─── Fuzzy Intent ───

function detectDriverIntent(text, state) {
  const t = (text || "").toLowerCase().trim();

  // Check in
  if (/\b(checkin|check in|masuk|online|mulai|gas|gass+|ready|siap|start|aktif|on)\b/.test(t)) {
    if (state.status === "waiting_ride") return { intent: "confirm_ride" }; // "gas" while waiting = accept
    return { intent: "checkin" };
  }
  // Check out
  if (/\b(checkout|check out|keluar|offline|selesai|stop|off|pulang|udahan|done)\b/.test(t)) return { intent: "checkout" };
  // Accept ride
  if (/\b(terima|accept|ambil|iya|ya|y|ok|oke|yoi|mau|sikat|hajar|gw ambil)\b/.test(t)) {
    if (state.status === "waiting_ride") return { intent: "accept" };
    if (state.status === "checked_out") return { intent: "checkin" }; // "iya" when offline = probably wants to checkin
    return { intent: "confirm_generic" };
  }
  // Decline ride
  if (/\b(tolak|decline|skip|nggak|gak|ga|tidak|no|n|lewat|pass|nope|ogah)\b/.test(t)) {
    if (state.status === "waiting_ride") return { intent: "decline" };
    return { intent: "decline_generic" };
  }
  // Earnings
  if (/\b(saldo|penghasilan|earning|income|gaji|duit|uang|pendapatan|berapa|cuan)\b/.test(t)) return { intent: "earnings" };
  // Status
  if (/\b(status|info|stat|posisi)\b/.test(t)) return { intent: "status" };
  // Help
  if (/\b(help|bantuan|bantu|cara|gimana|menu|command|perintah)\b/.test(t)) return { intent: "help" };
  // Greeting
  if (/\b(halo|hai|hi|hello|pagi|siang|sore|malam|p|hey|assalamualaikum|bos|bang|kak)\b/.test(t)) return { intent: "greet" };

  return { intent: "unknown" };
}

// ─── Main Handler ───

async function handleDriverMessage(sock, jid, driverId, msg) {
  const state = getState(driverId);
  const text = (msg || "").trim();

  // ─── REGISTRATION FLOW (no API token yet) ───
  if (!state.apiToken) {
    // Init registration on "daftar" or first message
    if (!state.regStep) {
      if (!/daftar|register|mulai|start|gas|ya|y|oke|ok/i.test(text) && state.regStep !== "ask_name") {
        await sendReply(sock, jid, "Kamu belum terdaftar. Ketik *daftar* untuk mulai registrasi driver.");
        return;
      }
      setState(driverId, { regStep: "ask_name" });
      await sendReply(sock, jid,
        "🏍️ *Daftar Driver Nemu Ojek*\n\n" +
        "Gw bantu daftarin ya. Pertama, *nama lengkap* kamu siapa?"
      );
      return;
    }

    if (state.regStep === "ask_name") {
      setState(driverId, { regName: text, regStep: "ask_plate" });
      await sendReply(sock, jid, `Oke ${text}! 🛵 *Nomor plat* motor kamu apa?\n(contoh: B1234XYZ)`);
      return;
    }

    if (state.regStep === "ask_plate") {
      setState(driverId, { regPlate: text.toUpperCase().replace(/\s+/g, ""), regStep: "ask_city" });
      await sendReply(sock, jid, "🏙️ *Kota operasional* kamu di mana?\n(contoh: Jakarta, Bandung, Surabaya)");
      return;
    }

    if (state.regStep === "ask_city") {
      setState(driverId, { regCity: text, regStep: "confirm" });
      await sendReply(sock, jid,
        `📋 *Konfirmasi data driver:*\n\n` +
        `👤 Nama: ${state.regName}\n` +
        `🛵 Plat: ${state.regPlate}\n` +
        `🏙️ Kota: ${text}\n\n` +
        `Betul? Ketik *ya* untuk daftar atau *tidak* untuk ulang.`
      );
      return;
    }

    if (state.regStep === "confirm") {
      if (/^(tidak|no|n|gak|ga|ulang|batal)/i.test(text)) {
        setState(driverId, { regStep: "ask_name", regName: null, regPlate: null, regCity: null });
        await sendReply(sock, jid, "Oke, ulang dari awal. *Nama lengkap* kamu siapa?");
        return;
      }

      if (/^(ya|y|yes|ok|oke|betul|benar|gas|siap|lanjut)/i.test(text)) {
        const regName = state.regName;
        const regPlate = state.regPlate;
        const regCity = state.regCity;
        try {
          const { registerDriver } = require("./api-client");
          const phone = driverId.replace(/^driver-/, "").replace(/-\d+$/, "");
          const data = await registerDriver(phone, regName, regPlate, regCity);
          const token = data?.driver?.apiToken || data?.apiToken;
          if (token) {
            setState(driverId, {
              apiToken: token,
              name: regName,
              regStep: null, regName: null, regPlate: null, regCity: null,
            });
            // Save to local file for persistence across restarts
            try {
              const path = require("path");
              const fs = require("fs");
              const metaDir = path.join(__dirname, "driver-auths", driverId);
              if (fs.existsSync(metaDir)) {
                fs.writeFileSync(path.join(metaDir, "_meta.json"), JSON.stringify({
                  apiToken: token, name: regName, plate: regPlate, city: regCity, phone,
                  registeredAt: Date.now(),
                }, null, 2));
              }
            } catch {}
            await sendReply(sock, jid,
              `✅ *Registrasi berhasil!*\n\n` +
              `Selamat datang, ${regName}! 🏍️\n` +
              `🛵 ${regPlate} — ${regCity}\n\n` +
              `Ketik *checkin* untuk mulai terima orderan.\n` +
              `Ketik *help* untuk lihat semua perintah.\n\n` +
              `💡 *Tip:* Share *live location* di chat ini supaya GPS kamu otomatis update ke sistem.`
            );
          } else {
            throw new Error("No token returned");
          }
        } catch (e) {
          console.error("[driver] registration failed:", e.message);
          await sendReply(sock, jid, "❌ Registrasi gagal. Coba lagi nanti ya.\n\nKetik apapun untuk ulang.");
          setState(driverId, { regStep: "ask_name" });
        }
        return;
      }

      await sendReply(sock, jid, "Ketik *ya* untuk lanjut daftar, atau *tidak* untuk ulang.");
      return;
    }
  }

  const intent = detectDriverIntent(msg, state);

  switch (intent.intent) {
    case "help":
      await sendReply(sock, jid, T.help);
      return;

    case "earnings":
      try {
        const data = await getDriverEarnings(state.apiToken);
        await sendReply(sock, jid, T.earnings(data));
      } catch { await sendReply(sock, jid, "Gagal ambil data. Coba lagi nanti ya."); }
      return;

    case "status":
      await sendReply(sock, jid, T.status(state.status, state.currentRideCode));
      return;

    case "checkin":
      if (state.status === "checked_in") { await sendReply(sock, jid, pick(T.alreadyOnline)); return; }
      if (state.status === "on_ride" || state.status === "waiting_ride") {
        await sendReply(sock, jid, "Selesaikan orderan dulu ya 🙏"); return;
      }
      if (!state.apiToken) {
        await sendReply(sock, jid, "⚠️ Akun driver belum terdaftar. Coba lagi atau hubungi admin."); return;
      }
      try {
        await setDriverAvailability(state.apiToken, "online");
        setState(driverId, { status: "checked_in" });
        let earnings = null;
        try { earnings = await getDriverEarnings(state.apiToken); } catch {}
        await sendReply(sock, jid, T.checkedIn(earnings, state.apiToken));
      } catch (e) {
        console.error("[driver] checkin failed:", e.message);
        await sendReply(sock, jid, "Gagal checkin. Coba lagi ya.");
      }
      return;

    case "checkout":
      if (state.status === "on_ride" || state.status === "waiting_ride") {
        await sendReply(sock, jid, T.cantCheckoutOnRide); return;
      }
      if (state.status === "checked_out") { await sendReply(sock, jid, T.alreadyOffline); return; }
      try {
        await setDriverAvailability(state.apiToken, "offline");
        setState(driverId, { status: "checked_out", pendingRideCode: null });
        await sendReply(sock, jid, pick(T.checkedOut));
      } catch (e) {
        console.error("[driver] checkout failed:", e.message);
        await sendReply(sock, jid, "Gagal checkout. Coba lagi ya.");
      }
      return;

    case "accept":
    case "confirm_ride":
      if (state.status !== "waiting_ride" || !state.pendingRideCode) {
        await sendReply(sock, jid, "Nggak ada orderan yang pending saat ini.");
        return;
      }
      try {
        await driverRespondRide(state.apiToken, state.pendingRideCode, "accept");
        const code = state.pendingRideCode;
        setState(driverId, { status: "on_ride", currentRideCode: code, pendingRideCode: null });
        await sendReply(sock, jid, pick(T.accepted(code)));
      } catch (e) {
        console.error("[driver] accept failed:", e.message);
        await sendReply(sock, jid, "Gagal terima orderan. Coba lagi.");
      }
      return;

    case "decline":
      if (state.status !== "waiting_ride" || !state.pendingRideCode) {
        await sendReply(sock, jid, "Nggak ada orderan yang pending saat ini.");
        return;
      }
      try {
        await driverRespondRide(state.apiToken, state.pendingRideCode, "decline");
        setState(driverId, { status: "checked_in", pendingRideCode: null });
        await sendReply(sock, jid, pick(T.declined));
      } catch (e) {
        console.error("[driver] decline failed:", e.message);
        await sendReply(sock, jid, "Gagal tolak orderan. Coba lagi.");
      }
      return;

    case "greet":
      if (state.status === "waiting_ride") { await sendReply(sock, jid, T.askResponse); return; }
      await sendReply(sock, jid, pick(state.status === "checked_in" ? T.greetOnline : T.greetOffline));
      return;

    case "confirm_generic":
      if (state.status === "checked_in") { await sendReply(sock, jid, pick(T.alreadyOnline)); return; }
      await sendReply(sock, jid, pick(T.greetOffline));
      return;

    default:
      if (state.status === "waiting_ride") { await sendReply(sock, jid, T.askResponse); return; }
      await sendReply(sock, jid, pick(T.dontUnderstand));
  }
}

// ─── Notification ───

async function notifyDriverNewRide(sock, jid, driverId, ride) {
  const state = getState(driverId);
  if (state.status !== "checked_in") return false;

  const code = ride.code || ride.rideCode;
  const pickup = ride.pickup?.address || "-";
  const dropoff = ride.dropoff?.address || "-";
  const amount = ride.price?.amount || 0;

  setState(driverId, { status: "waiting_ride", pendingRideCode: code });
  await sendReply(sock, jid, T.newRide(pickup, dropoff, amount));
  return true;
}

function markDriverRideCompleted(driverId) {
  const state = getState(driverId);
  if (state.status === "on_ride") setState(driverId, { status: "checked_in", currentRideCode: null });
}

module.exports = {
  handleDriverMessage,
  notifyDriverNewRide,
  markDriverRideCompleted,
  initDriverState,
  getDriverState: getState,
  setDriverState: setState,
  driverStates,
};
