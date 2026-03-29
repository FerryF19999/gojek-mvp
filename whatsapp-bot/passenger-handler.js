/**
 * Passenger message handler for the central WhatsApp bot
 * Handles the full ride booking flow via WhatsApp
 */

const {
  isStartIntent, isAffirmative, isNegative, parsePayment,
  pseudoCoord, calculateFareEstimate, formatIdr, haversineKm,
  readSession, writeSession, readRidesIndex, writeRidesIndex,
  removeRideFromIndex, sendReply, now,
} = require("./utils");

const {
  createRideAPI, getRideStatus, submitRideRating,
  geocodeAddress, reverseGeocode,
} = require("./api-client");

const STATUS_MESSAGES = {
  driver_arriving: "📍 Driver sedang menuju ke lokasi kamu!",
  picked_up: "🛣️ Perjalanan dimulai!",
};

const RATING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Handle incoming message from a passenger on the central bot
 */
async function handlePassenger(sock, jid, phone, session, msg, locationMsg) {
  // If user shares a live/static location, start ride flow
  if (locationMsg) {
    const lat = locationMsg.degreesLatitude;
    const lng = locationMsg.degreesLongitude;

    // Reverse geocode to get readable address
    let areaName = "lokasi kamu";
    try {
      const geo = await reverseGeocode(lat, lng);
      if (geo) areaName = geo;
    } catch {}

    session.role = "passenger";
    session.state = "ASK_DESTINATION";
    session.data = {
      name: session.data?.name || phone,
      pickup: areaName,
      pickupLat: lat,
      pickupLng: lng,
    };
    writeSession(phone, session);

    await sendReply(sock, jid,
      `📍 Got your location — ${areaName}!\n\nMau ke mana? Ketik nama tempat tujuan (contoh: "Blok M", "Senayan", "Kuningan")`
    );
    return;
  }

  // ─── IDLE state ───
  if (session.state === "IDLE" || !session.state || session.state === "ASK_ROLE") {
    if (!isStartIntent(msg)) {
      await sendReply(sock, jid,
        "Halo! 👋 Mau pesan ojek Nemu?\n\n" +
        "📍 *Share lokasi kamu* untuk langsung pesan, atau ketik *pesan* untuk mulai."
      );
      return;
    }
    session.role = "passenger";
    session.state = "ASK_NAME";
    session.data = {};
    writeSession(phone, session);
    await sendReply(sock, jid, "Halo! 👋 Mau pesan ojek Nemu? Boleh tahu nama kamu?");
    return;
  }

  // ─── ASK_NAME ───
  if (session.state === "ASK_NAME") {
    session.data.name = msg;
    session.state = "ASK_PICKUP";
    writeSession(phone, session);
    await sendReply(sock, jid,
      `Oke ${session.data.name}! 📍 Share lokasi kamu lewat WhatsApp, atau ketik alamat jemput.`
    );
    return;
  }

  // ─── ASK_PICKUP ───
  if (session.state === "ASK_PICKUP") {
    session.data.pickup = msg;
    // Try geocode
    try {
      const geo = await geocodeAddress(msg);
      if (geo) {
        session.data.pickupLat = geo.lat;
        session.data.pickupLng = geo.lng;
      }
    } catch {}
    session.state = "ASK_DESTINATION";
    writeSession(phone, session);
    await sendReply(sock, jid, "Mau ke mana tujuannya? Ketik nama tempat.");
    return;
  }

  // ─── ASK_DESTINATION ───
  if (session.state === "ASK_DESTINATION") {
    session.data.destination = msg;

    // Try geocode destination
    try {
      const geo = await geocodeAddress(msg);
      if (geo) {
        session.data.dropoffLat = geo.lat;
        session.data.dropoffLng = geo.lng;
        session.data.destination = geo.displayName.split(",").slice(0, 2).join(",").trim();
      }
    } catch {}

    // Calculate price
    let distanceKm, amount;
    if (session.data.pickupLat && session.data.dropoffLat) {
      distanceKm = haversineKm(
        session.data.pickupLat, session.data.pickupLng,
        session.data.dropoffLat, session.data.dropoffLng
      );
      amount = Math.max(10000, Math.round(distanceKm * 3500));
    } else {
      const estimate = calculateFareEstimate(session.data.pickup, session.data.destination);
      distanceKm = estimate.km;
      amount = estimate.amount;
    }

    const estimatedMinutes = Math.round(distanceKm * 3);
    session.data.estimatedFare = amount;
    session.data.estimatedKm = distanceKm;
    session.data.payment = "cash"; // default to cash
    session.state = "CONFIRM";
    writeSession(phone, session);

    await sendReply(sock, jid,
      `🏍️ *Ride ke ${session.data.destination}*\n` +
      `Nemu Ojek *Rp ${formatIdr(amount)}*\n` +
      `📏 ${distanceKm.toFixed(1)} km  ⏱ ~${estimatedMinutes} min\n\n` +
      `✅ *Confirm Ride — Rp ${formatIdr(amount)}*\n\n` +
      `Ketik *yes* atau *book it* untuk konfirmasi 🏍️`
    );
    return;
  }

  // ─── CONFIRM ───
  if (session.state === "CONFIRM") {
    if (isNegative(msg)) {
      session.state = "ASK_DESTINATION";
      writeSession(phone, session);
      await sendReply(sock, jid, "Oke, mau ganti tujuan? Ketik tempat tujuan baru.");
      return;
    }

    if (!isAffirmative(msg)) {
      await sendReply(sock, jid,
        "Ketik *yes* untuk konfirmasi, atau *tidak* untuk ganti tujuan."
      );
      return;
    }

    try {
      // Build coordinates
      const pickupLat = session.data.pickupLat || pseudoCoord(`${phone}:${session.data.pickup}:lat`, -6.2, 0.08);
      const pickupLng = session.data.pickupLng || pseudoCoord(`${phone}:${session.data.pickup}:lng`, 106.816, 0.08);
      const dropoffLat = session.data.dropoffLat || pseudoCoord(`${phone}:${session.data.destination}:lat`, -6.22, 0.08);
      const dropoffLng = session.data.dropoffLng || pseudoCoord(`${phone}:${session.data.destination}:lng`, 106.84, 0.08);

      const created = await createRideAPI({
        customerName: session.data.name || phone,
        customerPhone: phone,
        pickup: { address: session.data.pickup, lat: pickupLat, lng: pickupLng },
        dropoff: { address: session.data.destination, lat: dropoffLat, lng: dropoffLng },
        vehicleType: "motor",
        paymentMethod: session.data.payment || "cash",
      });

      const rideCode = created.code || created.rideCode || created?.ride?.code;
      session.state = "BOOKED";
      session.rideCode = rideCode;
      writeSession(phone, session);

      const rides = readRidesIndex();
      rides[rideCode] = { phone, lastStatus: "created", assignedNotified: false, ratingAsked: false };
      writeRidesIndex(rides);

      const trackUrl = `${process.env.NEMU_APP_URL || "https://gojek-mvp.vercel.app"}/track/${rideCode}`;
      await sendReply(sock, jid,
        `✅ Ride dibuat! Kode: *${rideCode}*\n\n` +
        `Lagi cariin driver terdekat... 🔍\n` +
        `📍 Track live: ${trackUrl}`
      );
    } catch (e) {
      console.error("[passenger] create ride failed:", e.message);
      await sendReply(sock, jid, "Maaf, ride gagal dibuat. Coba lagi bentar ya 🙏");
    }
    return;
  }

  // ─── RATING ───
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
      await sendReply(sock, jid, `Makasih ratingnya! ${"⭐".repeat(rating)}\n\nMau pesan lagi? Ketik *pesan* atau share lokasi 📍`);
    } catch {
      await sendReply(sock, jid, "Maaf, gagal simpan rating. Nanti coba lagi ya.");
    }

    removeRideFromIndex(ratingMeta.rideCode || session.rideCode);
    session.state = "IDLE";
    session.rideCode = null;
    session.data = { name: session.data?.name };
    writeSession(phone, session);
    return;
  }

  // ─── BOOKED (ride in progress) ───
  if (session.state === "BOOKED") {
    if (msg.toLowerCase() === "batal" || msg.toLowerCase() === "cancel") {
      await sendReply(sock, jid, "Untuk saat ini ride tidak bisa dibatalkan setelah dikonfirmasi. Tunggu driver ya 🙏");
      return;
    }
    const trackUrl = `${process.env.NEMU_APP_URL || "https://gojek-mvp.vercel.app"}/track/${session.rideCode}`;
    await sendReply(sock, jid,
      `Ride kamu masih berjalan. Kode: *${session.rideCode}*\n📍 Track: ${trackUrl}`
    );
  }
}

/**
 * Poll for passenger ride status updates and send notifications
 */
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

      // Notify when driver is assigned
      if (status === "assigned" && !rec.assignedNotified) {
        const driverName = ride.driver?.name || "Driver";
        const driverPlate = ride.driver?.plate || ride.driver?.vehiclePlate || "-";
        const trackUrl = `${process.env.NEMU_APP_URL || "https://gojek-mvp.vercel.app"}/track/${rideCode}`;
        await sendReply(sock, jid,
          `✅ Driver ditemukan!\n` +
          `🏍️ ${driverName} — ${driverPlate}\n` +
          `📍 Track live: ${trackUrl}\n\n` +
          `Driver sedang menuju lokasi kamu...`
        );
        rec.assignedNotified = true;
      }

      // Status change notifications
      if (status !== rec.lastStatus) {
        rec.lastStatus = status;
        const msg = STATUS_MESSAGES[status];
        if (msg) {
          await sendReply(sock, jid, `${msg}\nKode ride: ${rideCode}`);
        }
      }

      // Ask for rating when completed
      if (status === "completed" && !rec.ratingAsked) {
        rec.ratingAsked = true;
        const session = readSession(rec.phone);
        session.state = "RATING";
        session.rideCode = rideCode;
        session.data = {
          name: session.data?.name,
          ratingMeta: {
            rideCode,
            driverName: ride.driver?.name || "Driver",
            expiresAt: now() + RATING_TIMEOUT_MS,
          },
        };
        writeSession(rec.phone, session);
        await sendReply(sock, jid,
          `🎉 Perjalanan selesai!\n\nKasih bintang buat driver ${session.data.ratingMeta.driverName}? (ketik 1-5)`
        );
      }

      // Cleanup expired ratings
      if (rec.ratingAsked) {
        const session = readSession(rec.phone);
        const expiresAt = session?.data?.ratingMeta?.expiresAt;
        if (session?.state !== "RATING") {
          delete rides[rideCode];
          continue;
        } else if (expiresAt && now() > expiresAt) {
          session.state = "IDLE";
          session.rideCode = null;
          session.data = { name: session.data?.name };
          writeSession(rec.phone, session);
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
