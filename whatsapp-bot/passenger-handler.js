/**
 * Smart Passenger Bot — Natural conversation with fuzzy intent detection
 * NOT an LLM — uses pattern matching + templates for fast, natural responses
 */

const {
  formatIdr, haversineKm, pseudoCoord,
  readSession, writeSession, readRidesIndex, writeRidesIndex,
  removeRideFromIndex, sendReply, now,
} = require("./utils");

const {
  createRideAPI, getRideStatus, submitRideRating,
  geocodeAddress, reverseGeocode,
} = require("./api-client");

// ─── Response Templates (randomized for natural feel) ───

const T = {
  greet: [
    "Halo! 👋 Mau kemana nih hari ini?",
    "Hai! Siap antar kamu. Mau ke mana?",
    "Hey! 🏍️ Mau pesan ojek Nemu? Share lokasi atau bilang mau ke mana!",
  ],
  askPickup: [
    "📍 Share lokasi kamu ya, atau ketik alamat jemput.",
    "Mau dijemput dari mana? Bisa share lokasi langsung 📍",
  ],
  gotLocation: (area) => [
    `📍 Oke, kamu di ${area}. Mau ke mana nih?`,
    `📍 Got it — ${area}! Tujuannya ke mana?`,
    `📍 ${area} ya. Mau ke mana?`,
  ],
  askDest: [
    "Mau ke mana? Ketik aja nama tempatnya 😊",
    "Tujuannya kemana nih?",
  ],
  priceCard: (dest, km, amount, eta) => [
    `🏍️ *Ride ke ${dest}*\nNemu Ojek *Rp ${formatIdr(amount)}*\n📏 ${km} km  ⏱ ~${eta} min\n\nMau book? Bilang aja *gas* atau *book it* ✅`,
    `🏍️ *${dest}*\n💰 *Rp ${formatIdr(amount)}* • ${km} km • ~${eta} menit\n\nKetik *gas* untuk konfirmasi!`,
  ],
  priceCheck: (dest, amount, km) => [
    `Ke ${dest} sekitar *Rp ${formatIdr(amount)}* (${km} km). Mau langsung book? 😊`,
    `Estimasi ke ${dest}: *Rp ${formatIdr(amount)}* untuk ${km} km. Gas?`,
  ],
  confirmAsk: [
    "Ketik *gas* atau *yes* untuk book, *tidak* untuk ganti tujuan.",
    "Jadi book? Bilang *gas* ya! Atau *tidak* kalau mau ganti.",
  ],
  rideCreated: (code, url) => [
    `✅ Ride *${code}* dibuat!\n🔍 Lagi cariin driver terdekat...\n📍 Track: ${url}`,
    `✅ *${code}* — mencari driver... 🔍\nTrack live: ${url}`,
  ],
  driverFound: (name, plate, url) => [
    `✅ Driver ditemukan!\n🏍️ *${name}* — ${plate}\n📍 Track: ${url}\n\nDriver menuju ke kamu...`,
    `🏍️ *${name}* (${plate}) siap jemput kamu!\nTrack live: ${url}`,
  ],
  arriving: "📍 Driver hampir sampai di lokasi kamu!",
  pickedUp: "🛣️ Perjalanan dimulai! Enjoy the ride 🏍️",
  completed: (driverName) => [
    `🎉 Perjalanan selesai! Kasih bintang buat *${driverName}*? (1-5)`,
    `✅ Sampai tujuan! Rating driver *${driverName}*? Ketik 1-5 ⭐`,
  ],
  rated: (n) => `Makasih ratingnya! ${"⭐".repeat(n)}\n\nMau pesan lagi? Bilang aja atau share lokasi 📍`,
  rideActive: (code, url) => `Ride kamu masih jalan nih. Kode: *${code}*\n📍 Track: ${url}`,
  priceExplain: "Harga Nemu Ojek udah flat — gak ada komisi, semua masuk ke driver langsung. 😊 Jadi mau lanjut?",
  cantCancel: "Untuk saat ini ride yang sudah dikonfirmasi belum bisa dibatalkan. Tunggu driver ya 🙏",
  dontUnderstand: [
    "Hmm, gak nangkep nih 😅 Mau pesan ojek? Share lokasi atau bilang mau ke mana!",
    "Maaf belum ngerti 🙏 Kalau mau pesan ojek, ketik tujuan kamu ya!",
    "Hehe apa tuh? 😄 Kalau mau ojek, share lokasi atau ketik tempat tujuan!",
  ],
};

function pick(arr) {
  return Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr;
}

// ─── Fuzzy Intent Detection ───

function detectIntent(text, session) {
  const t = (text || "").toLowerCase().trim();
  if (!t) return { intent: "empty" };

  // Rating (1-5)
  const ratingMatch = t.match(/^(\d)\s*(bintang|stars?)?$/);
  if (ratingMatch) {
    const n = parseInt(ratingMatch[1]);
    if (n >= 1 && n <= 5) return { intent: "rate", rating: n };
  }
  // "makasih 5", "thanks 4 bintang"
  const ratingInText = t.match(/(\d)\s*(bintang|stars?)/);
  if (ratingInText) {
    const n = parseInt(ratingInText[1]);
    if (n >= 1 && n <= 5) return { intent: "rate", rating: n };
  }

  // Cancel
  if (/\b(cancel|batal|gajadi|ga jadi|gak jadi|jangan|stop|udahan|nggak jadi|batalin)\b/.test(t)) return { intent: "cancel" };

  // Track / where driver
  if (/\b(track|lacak|dimana driver|driver dimana|posisi driver|eta)\b/.test(t)) return { intent: "track" };

  // Price check: "berapa ke X", "harga ke X", "estimasi ke X"
  const priceMatch = t.match(/(?:berapa|harga|estimasi|ongkos|biaya|tarif)\s*(?:ke|sampai|menuju)?\s*(.+)/);
  if (priceMatch) return { intent: "price_check", destination: priceMatch[1].trim() };

  // Full route: "dari X ke Y", "dari X menuju Y", "pickup X tujuan Y"
  const routeMatch = t.match(/(?:dari|pickup|jemput di|jemput)\s+(.+?)\s+(?:ke|menuju|tujuan|sampai)\s+(.+)/);
  if (routeMatch) {
    const pickup = routeMatch[1].replace(/\b(dong|ya|yah)\b/g, "").trim();
    const dest = routeMatch[2].replace(/\b(dong|ya|yah)\b/g, "").trim();
    if (pickup.length >= 2 && dest.length >= 2) {
      return { intent: "full_route", pickup, destination: dest };
    }
  }

  // Book with destination: "gas ke X", "pesan ke X", "ojek ke X", "ke X dong", "tujuan X"
  const bookMatch = t.match(/(?:gas|gass+|pesan|ojek|book|antar|anter|mau ke|ke|tujuan|menuju|arah)\s+(.{2,})/);
  if (bookMatch) {
    const dest = bookMatch[1].replace(/\b(dong|donk|ya|yah|yuk|aja|deh)\b/g, "").trim();
    if (dest.length >= 2) return { intent: "book_direct", destination: dest };
  }

  // Affirmative / confirm
  if (/^(ya|y|yes|oke|ok|iya|yoi|gas+|siap|book|book it|lanjut|jadi|confirm|setuju|deal|mantap|let'?s go|cusss?|yuk|gass?kan)\b/.test(t)) {
    return { intent: "confirm" };
  }

  // Negative
  if (/^(tidak|gak|ga|no|n|nope|gajadi|batal|nggak|enggak|jangan|cancel)\b/.test(t)) {
    return { intent: "decline" };
  }

  // Greeting / start
  if (/\b(halo|hai|hi|hello|hey|pagi|siang|sore|malam|p|helo|assalamualaikum|bang|kak|min)\b/.test(t)) {
    return { intent: "greet" };
  }

  // Want to order
  if (/\b(pesan|pesen|order|ojek|ride|mau|pengen|butuh|cariin|cari|booking)\b/.test(t)) {
    return { intent: "want_ride" };
  }

  // Price question
  if (/\b(harga|mahal|murah|tarif|ongkos|biaya|berapa|diskon|promo)\b/.test(t)) {
    return { intent: "price_question" };
  }

  // Help
  if (/\b(help|bantuan|bantu|cara|gimana|bagaimana|how)\b/.test(t)) {
    return { intent: "help" };
  }

  // If in confirm state and text looks like a place name, treat as destination change
  if (session?.state === "CONFIRM" && t.length > 2 && !t.includes("?")) {
    return { intent: "change_dest", destination: t };
  }

  // If waiting for destination and text is not a command, treat as destination
  if (session?.state === "ASK_DESTINATION" && t.length >= 2) {
    return { intent: "destination", destination: t };
  }

  // If IDLE and text looks like a place name (3+ chars, not a command/keyword), treat as destination
  const KEYWORDS = /^(ojek|pesan|pesen|order|ride|mau|pengen|butuh|cari|booking|halo|hai|hi|hello|hey|help|bantuan|batal|cancel|status|ya|tidak|ok|oke|gas)$/i;
  if ((!session?.state || session?.state === "IDLE") && t.length >= 3 && !t.includes("?") && !/^\d+$/.test(t) && !KEYWORDS.test(t)) {
    return { intent: "book_direct", destination: t };
  }

  return { intent: "unknown" };
}

// ─── Main Handler ───

const RATING_TIMEOUT_MS = 5 * 60 * 1000;
const APP_URL = process.env.NEMU_APP_URL || "https://gojek-mvp.vercel.app";

async function handlePassenger(sock, jid, phone, session, msg, locationMsg) {
  // ─── Location message → instant pickup ───
  if (locationMsg) {
    const lat = locationMsg.degreesLatitude;
    const lng = locationMsg.degreesLongitude;
    let area = "lokasi kamu";
    try {
      const geo = await reverseGeocode(lat, lng);
      if (geo) area = geo;
    } catch {}

    session.role = "passenger";
    session.state = "ASK_DESTINATION";
    session.data = {
      ...session.data,
      name: session.data?.name || phone,
      pickup: area,
      pickupLat: lat,
      pickupLng: lng,
    };
    writeSession(phone, session);
    await sendReply(sock, jid, pick(T.gotLocation(area)));
    return;
  }

  // Ensure role
  if (!session.role) session.role = "passenger";
  if (session.state === "ASK_ROLE") session.state = "IDLE";

  const intent = detectIntent(msg, session);

  // ─── RATING state (highest priority) ───
  if (session.state === "RATING") {
    const meta = session.data?.ratingMeta || {};
    if (meta.expiresAt && now() > meta.expiresAt) {
      removeRideFromIndex(meta.rideCode);
      session.state = "IDLE"; session.rideCode = null; session.data = { name: session.data?.name };
      writeSession(phone, session);
      return;
    }
    if (intent.intent === "rate" || (Number(msg) >= 1 && Number(msg) <= 5)) {
      const rating = intent.rating || Number(msg);
      try { await submitRideRating(meta.rideCode || session.rideCode, rating); } catch {}
      removeRideFromIndex(meta.rideCode);
      session.state = "IDLE"; session.rideCode = null; session.data = { name: session.data?.name };
      writeSession(phone, session);
      await sendReply(sock, jid, T.rated(rating));
      return;
    }
    await sendReply(sock, jid, "Ketik angka 1-5 untuk rating driver ya ⭐");
    return;
  }

  // ─── BOOKED state ───
  if (session.state === "BOOKED") {
    if (intent.intent === "cancel") {
      // Cancel ride and clear session
      const rideCode = session.rideCode;
      removeRideFromIndex(rideCode);
      session.state = "IDLE";
      session.rideCode = null;
      session.data = { name: session.data?.name };
      writeSession(phone, session);
      await sendReply(sock, jid, `❌ Ride *${rideCode}* dibatalkan.\n\nMau pesan lagi? Ketik tujuan kamu.`);
      return;
    }
    if (intent.intent === "track") {
      const url = `${APP_URL}/track/${session.rideCode}`;
      await sendReply(sock, jid, pick(T.rideActive(session.rideCode, url)));
      return;
    }
    // Check if ride is actually still active
    try {
      const data = await getRideStatus(session.rideCode);
      const status = (data.ride || data).status;
      if (["cancelled", "completed", "expired"].includes(status)) {
        removeRideFromIndex(session.rideCode);
        session.state = "IDLE";
        session.rideCode = null;
        session.data = { name: session.data?.name };
        writeSession(phone, session);
        await sendReply(sock, jid, `Ride sebelumnya sudah selesai. Mau pesan lagi? Ketik tujuan kamu! 🏍️`);
        return;
      }
    } catch {}
    const url = `${APP_URL}/track/${session.rideCode}`;
    await sendReply(sock, jid, pick(T.rideActive(session.rideCode, url)));
    return;
  }

  // ─── CONFIRM state ───
  if (session.state === "CONFIRM") {
    if (intent.intent === "confirm") {
      return await bookRide(sock, jid, phone, session);
    }
    if (intent.intent === "cancel") {
      session.state = "IDLE";
      session.data = { name: session.data?.name };
      writeSession(phone, session);
      await sendReply(sock, jid, "❌ Dibatalkan. Mau pesan lagi? Ketik tujuan kamu.");
      return;
    }
    if (intent.intent === "decline") {
      session.state = "ASK_DESTINATION";
      writeSession(phone, session);
      await sendReply(sock, jid, "Oke, mau ganti tujuan? Ketik tempat baru.");
      return;
    }
    if (intent.intent === "change_dest" || intent.intent === "book_direct") {
      return await processDestination(sock, jid, phone, session, intent.destination);
    }
    if (intent.intent === "price_question") {
      await sendReply(sock, jid, T.priceExplain);
      return;
    }
    await sendReply(sock, jid, pick(T.confirmAsk));
    return;
  }

  // ─── ASK_DESTINATION state ───
  if (session.state === "ASK_DESTINATION") {
    if (intent.intent === "destination" || intent.intent === "book_direct") {
      return await processDestination(sock, jid, phone, session, intent.destination || msg);
    }
    if (intent.intent === "price_check") {
      return await processDestination(sock, jid, phone, session, intent.destination, true);
    }
    // Treat any text as destination
    if (msg.length >= 2 && intent.intent !== "greet" && intent.intent !== "help") {
      return await processDestination(sock, jid, phone, session, msg);
    }
    await sendReply(sock, jid, pick(T.askDest));
    return;
  }

  // ─── ASK_PICKUP state ───
  if (session.state === "ASK_PICKUP") {
    session.data.pickup = msg;
    try {
      const geo = await geocodeAddress(msg);
      if (geo) {
        session.data.pickupLat = geo.lat;
        session.data.pickupLng = geo.lng;
        session.data.pickup = geo.displayName.split(",").slice(0, 2).join(",").trim();
      }
    } catch {}

    // If there's a pending destination (from "gas ke X" before pickup was set), continue to it
    if (session.data.pendingDestination) {
      const dest = session.data.pendingDestination;
      delete session.data.pendingDestination;
      session.state = "ASK_DESTINATION";
      writeSession(phone, session);
      return await processDestination(sock, jid, phone, session, dest);
    }

    session.state = "ASK_DESTINATION";
    writeSession(phone, session);
    await sendReply(sock, jid, pick(T.askDest));
    return;
  }

  // ─── ASK_NAME state ───
  if (session.state === "ASK_NAME") {
    session.data.name = msg;
    session.state = "ASK_PICKUP";
    writeSession(phone, session);
    await sendReply(sock, jid, `Oke ${msg}! ${pick(T.askPickup)}`);
    return;
  }

  // ─── IDLE / default — smart routing ───

  // Full route: "dari pasteur ke gedung sate"
  if (intent.intent === "full_route") {
    session.data = { ...session.data, name: session.data?.name || phone };
    // Geocode pickup
    try {
      const geo = await geocodeAddress(intent.pickup);
      if (geo) {
        session.data.pickup = geo.displayName.split(",").slice(0, 2).join(",").trim();
        session.data.pickupLat = geo.lat;
        session.data.pickupLng = geo.lng;
      } else {
        session.data.pickup = intent.pickup;
      }
    } catch {
      session.data.pickup = intent.pickup;
    }
    session.state = "ASK_DESTINATION";
    writeSession(phone, session);
    return await processDestination(sock, jid, phone, session, intent.destination);
  }

  // Direct book: "gas ke blok m"
  if (intent.intent === "book_direct") {
    session.data = { ...session.data, name: session.data?.name || phone };
    // If no pickup location yet, save destination and ask for pickup first
    if (!session.data.pickupLat) {
      session.data.pendingDestination = intent.destination;
      session.state = "ASK_PICKUP";
      writeSession(phone, session);
      await sendReply(sock, jid,
        `Oke, mau ke *${intent.destination}*! 📍\n\n` +
        `Kamu sekarang di mana? Share *lokasi* kamu atau ketik alamat jemput.\n` +
        `(contoh: Dago, Pasteur, Jl. Merdeka)`
      );
      return;
    }
    session.state = "ASK_DESTINATION";
    writeSession(phone, session);
    return await processDestination(sock, jid, phone, session, intent.destination);
  }

  // Price check: "berapa ke senayan"
  if (intent.intent === "price_check") {
    session.state = "ASK_DESTINATION";
    session.data = { ...session.data, name: session.data?.name || phone };
    if (!session.data.pickupLat) {
      session.data.pickup = "Jakarta"; session.data.pickupLat = -6.2088; session.data.pickupLng = 106.8456;
    }
    writeSession(phone, session);
    return await processDestination(sock, jid, phone, session, intent.destination, true);
  }

  // Want to ride
  if (intent.intent === "want_ride" || intent.intent === "greet") {
    session.role = "passenger";
    if (session.data?.name && session.data?.pickupLat) {
      session.state = "ASK_DESTINATION";
      writeSession(phone, session);
      await sendReply(sock, jid, pick(T.greet));
    } else {
      session.state = "IDLE";
      session.data = session.data || {};
      writeSession(phone, session);
      await sendReply(sock, jid, pick(T.greet));
    }
    return;
  }

  if (intent.intent === "help") {
    await sendReply(sock, jid,
      "🏍️ *Nemu Ojek — Cara Pesan:*\n\n" +
      "1. 📍 *Share lokasi* kamu\n" +
      "2. Ketik *tujuan* (contoh: Blok M)\n" +
      "3. Bilang *gas* untuk konfirmasi\n\n" +
      "Atau langsung ketik: *gas ke [tujuan]*"
    );
    return;
  }

  // Default
  await sendReply(sock, jid, pick(T.dontUnderstand));
}

// ─── Process Destination ───

async function processDestination(sock, jid, phone, session, destText, priceCheckOnly = false) {
  let destName = destText;
  let destLat, destLng;

  try {
    // Pass pickup coords as context for better geocoding (search near pickup area)
    const geo = await geocodeAddress(destText, session.data.pickupLat, session.data.pickupLng);
    if (geo) {
      destLat = geo.lat;
      destLng = geo.lng;
      destName = geo.displayName.split(",").slice(0, 2).join(",").trim();
    }
  } catch {}

  // Calculate price
  const pickupLat = session.data.pickupLat || -6.2088;
  const pickupLng = session.data.pickupLng || 106.8456;
  const dLat = destLat || pseudoCoord(`${phone}:${destText}:lat`, -6.22, 0.08);
  const dLng = destLng || pseudoCoord(`${phone}:${destText}:lng`, 106.84, 0.08);

  const km = haversineKm(pickupLat, pickupLng, dLat, dLng);
  const amount = Math.max(10000, Math.round(km * 3500));
  const eta = Math.max(3, Math.round(km * 3));

  if (priceCheckOnly) {
    await sendReply(sock, jid, pick(T.priceCheck(destName, amount, km.toFixed(1))));
    return;
  }

  session.data.destination = destName;
  session.data.dropoffLat = dLat;
  session.data.dropoffLng = dLng;
  session.data.estimatedFare = amount;
  session.data.estimatedKm = km;
  session.data.payment = "cash";
  session.state = "CONFIRM";
  writeSession(phone, session);

  await sendReply(sock, jid, pick(T.priceCard(destName, km.toFixed(1), amount, eta)));
}

// ─── Book Ride ───

async function bookRide(sock, jid, phone, session) {
  try {
    const pickupLat = session.data.pickupLat || pseudoCoord(`${phone}:${session.data.pickup}:lat`, -6.2, 0.08);
    const pickupLng = session.data.pickupLng || pseudoCoord(`${phone}:${session.data.pickup}:lng`, 106.816, 0.08);
    const dropoffLat = session.data.dropoffLat || pseudoCoord(`${phone}:${session.data.destination}:lat`, -6.22, 0.08);
    const dropoffLng = session.data.dropoffLng || pseudoCoord(`${phone}:${session.data.destination}:lng`, 106.84, 0.08);

    const created = await createRideAPI({
      customerName: session.data.name || phone,
      customerPhone: phone,
      pickup: { address: session.data.pickup || "Pickup", lat: pickupLat, lng: pickupLng },
      dropoff: { address: session.data.destination, lat: dropoffLat, lng: dropoffLng },
      vehicleType: "motor",
      paymentMethod: "cash",
    });

    const rideCode = created.code || created.rideCode || created?.ride?.code;
    session.state = "BOOKED";
    session.rideCode = rideCode;
    writeSession(phone, session);

    const rides = readRidesIndex();
    rides[rideCode] = { phone, lastStatus: "created", assignedNotified: false, ratingAsked: false };
    writeRidesIndex(rides);

    const url = `${APP_URL}/track/${rideCode}`;
    await sendReply(sock, jid, pick(T.rideCreated(rideCode, url)));
  } catch (e) {
    console.error("[passenger] create ride failed:", e.message);
    await sendReply(sock, jid, "Maaf, ride gagal dibuat. Coba lagi bentar ya 🙏");
  }
}

// ─── Polling ───

async function pollPassengerRideUpdates() {
  const { sendToSelfByPhone } = require("./driver-sessions");
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

      const url = `${APP_URL}/track/${rideCode}`;

      // Auto-clear cancelled/expired rides
      if (["cancelled", "expired"].includes(status)) {
        const session = readSession(rec.phone);
        if (session.rideCode === rideCode) {
          session.state = "IDLE";
          session.rideCode = null;
          session.data = { name: session.data?.name };
          writeSession(rec.phone, session);
        }
        delete rides[rideCode];
        continue;
      }

      if (status === "assigned" && !rec.assignedNotified) {
        const name = ride.driver?.name || "Driver";
        const plate = ride.driver?.plate || ride.driver?.vehiclePlate || "-";
        await sendToSelfByPhone(rec.phone, pick(T.driverFound(name, plate, url)));
        rec.assignedNotified = true;
      }

      if (status !== rec.lastStatus) {
        rec.lastStatus = status;
        if (status === "driver_arriving") await sendToSelfByPhone(rec.phone, T.arriving);
        if (status === "picked_up") await sendToSelfByPhone(rec.phone, T.pickedUp);
      }

      if (status === "completed" && !rec.ratingAsked) {
        rec.ratingAsked = true;
        const session = readSession(rec.phone);
        const driverName = ride.driver?.name || "Driver";
        session.state = "RATING";
        session.rideCode = rideCode;
        session.data = {
          name: session.data?.name,
          ratingMeta: { rideCode, driverName, expiresAt: now() + RATING_TIMEOUT_MS },
        };
        writeSession(rec.phone, session);
        await sendToSelfByPhone(rec.phone, pick(T.completed(driverName)));
      }

      if (rec.ratingAsked) {
        const session = readSession(rec.phone);
        if (session?.state !== "RATING" || (session?.data?.ratingMeta?.expiresAt && now() > session.data.ratingMeta.expiresAt)) {
          if (session?.state === "RATING") {
            session.state = "IDLE"; session.rideCode = null; session.data = { name: session.data?.name };
            writeSession(rec.phone, session);
          }
          delete rides[rideCode];
          continue;
        }
      }

      rides[rideCode] = rec;
    } catch (e) {
      console.warn("[poll-passenger]", rideCode, e.message);
    }
  }

  writeRidesIndex(rides);
}

module.exports = { handlePassenger, pollPassengerRideUpdates };
