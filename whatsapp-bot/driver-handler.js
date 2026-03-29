/**
 * Driver message handler for per-driver WhatsApp bot sessions
 * Each driver's personal bot handles check-in/checkout and ride notifications
 */

const {
  isAffirmative, isNegative, formatIdr,
  sendReply, now,
} = require("./utils");

const {
  setDriverAvailability, getDriverEarnings, getDriverRides,
  driverRespondRide, getDriverProfile,
} = require("./api-client");

/**
 * Per-driver in-memory state (keyed by driverId)
 * Stores current state, pending rides, etc.
 */
const driverStates = new Map();

function getDriverState(driverId) {
  if (!driverStates.has(driverId)) {
    driverStates.set(driverId, {
      status: "checked_out", // checked_in | checked_out | waiting_ride | on_ride
      apiToken: null,
      pendingRideCode: null,
      currentRideCode: null,
      name: null,
    });
  }
  return driverStates.get(driverId);
}

function setDriverState(driverId, patch) {
  const state = getDriverState(driverId);
  Object.assign(state, patch);
  driverStates.set(driverId, state);
}

/**
 * Initialize driver state when bot connects
 */
function initDriverState(driverId, apiToken, name) {
  setDriverState(driverId, {
    apiToken,
    name,
    status: "checked_out",
    pendingRideCode: null,
    currentRideCode: null,
  });
}

/**
 * Handle incoming message from a driver on their personal bot
 */
async function handleDriverMessage(sock, jid, driverId, msg) {
  const text = (msg || "").toLowerCase().trim();
  const state = getDriverState(driverId);

  if (!state.apiToken) {
    await sendReply(sock, jid,
      "⚠️ Bot belum terhubung dengan akun driver.\n" +
      "Hubungi admin Nemu Ojek untuk bantuan."
    );
    return;
  }

  // ─── Global commands ───
  if (["help", "bantuan", "menu"].includes(text)) {
    await sendReply(sock, jid,
      "🏍️ *Nemu Ojek Driver Bot*\n\n" +
      "📋 *Perintah:*\n" +
      "• *checkin* / *masuk* — Mulai shift, terima orderan\n" +
      "• *checkout* / *keluar* — Selesai shift\n" +
      "• *status* — Cek status kamu\n" +
      "• *saldo* / *penghasilan* — Lihat penghasilan hari ini\n" +
      "• *terima* — Terima orderan\n" +
      "• *tolak* — Tolak orderan"
    );
    return;
  }

  if (["saldo", "penghasilan", "earning", "earnings"].includes(text)) {
    try {
      const data = await getDriverEarnings(state.apiToken);
      await sendReply(sock, jid,
        `💰 *Penghasilan Hari Ini*\n\n` +
        `Pendapatan: Rp ${formatIdr(data.earningsToday || 0)}\n` +
        `Total ride: ${data.totalRides || 0}\n` +
        `⭐ Rating: ${Number(data.avgRating || 0).toFixed(1)}`
      );
    } catch {
      await sendReply(sock, jid, "Gagal ambil data penghasilan. Coba lagi nanti ya.");
    }
    return;
  }

  if (["status", "info"].includes(text)) {
    const statusLabel = {
      checked_in: "🟢 Online — siap terima orderan",
      checked_out: "🔴 Offline",
      waiting_ride: "🟡 Ada orderan masuk",
      on_ride: "🔵 Sedang antar penumpang",
    };
    await sendReply(sock, jid,
      `📊 *Status Driver*\n\n` +
      `${statusLabel[state.status] || state.status}\n` +
      (state.currentRideCode ? `Ride: ${state.currentRideCode}` : "")
    );
    return;
  }

  // ─── CHECK IN ───
  if (["checkin", "masuk", "online", "mulai"].includes(text)) {
    if (state.status === "checked_in") {
      await sendReply(sock, jid, "Kamu sudah online! Tunggu orderan ya 🏍️");
      return;
    }
    if (state.status === "on_ride" || state.status === "waiting_ride") {
      await sendReply(sock, jid, "Selesaikan orderan dulu ya sebelum check-in ulang.");
      return;
    }

    try {
      await setDriverAvailability(state.apiToken, "online");
      setDriverState(driverId, { status: "checked_in" });
      await sendReply(sock, jid,
        "✅ Kamu sekarang *online*! Siap terima orderan.\n\n" +
        "Ketik *checkout* kalau mau selesai shift."
      );
    } catch (e) {
      console.error("[driver] checkin failed:", e.message);
      await sendReply(sock, jid, "Gagal check-in. Coba lagi bentar ya.");
    }
    return;
  }

  // ─── CHECK OUT ───
  if (["checkout", "keluar", "offline", "selesai"].includes(text)) {
    if (state.status === "on_ride" || state.status === "waiting_ride") {
      await sendReply(sock, jid, "Selesaikan orderan/respon dulu ya sebelum checkout.");
      return;
    }

    try {
      await setDriverAvailability(state.apiToken, "offline");
      setDriverState(driverId, {
        status: "checked_out",
        pendingRideCode: null,
      });
      await sendReply(sock, jid,
        "👋 Kamu sekarang *offline*. Sampai jumpa!\n\n" +
        "Ketik *checkin* kalau mau online lagi."
      );
    } catch (e) {
      console.error("[driver] checkout failed:", e.message);
      await sendReply(sock, jid, "Gagal checkout. Coba lagi ya.");
    }
    return;
  }

  // ─── WAITING FOR RIDE RESPONSE ───
  if (state.status === "waiting_ride" && state.pendingRideCode) {
    if (isAffirmative(text) || text === "terima" || text === "accept") {
      try {
        await driverRespondRide(state.apiToken, state.pendingRideCode, "accept");
        const rideCode = state.pendingRideCode;
        setDriverState(driverId, {
          status: "on_ride",
          currentRideCode: rideCode,
          pendingRideCode: null,
        });
        await sendReply(sock, jid,
          `✅ Orderan *${rideCode}* diterima!\n\n` +
          `Segera jemput penumpang 🏍️💨`
        );
      } catch (e) {
        console.error("[driver] accept failed:", e.message);
        await sendReply(sock, jid, "Gagal terima orderan. Coba lagi.");
      }
      return;
    }

    if (isNegative(text) || text === "tolak" || text === "decline") {
      try {
        await driverRespondRide(state.apiToken, state.pendingRideCode, "decline");
        setDriverState(driverId, {
          status: "checked_in",
          pendingRideCode: null,
        });
        await sendReply(sock, jid,
          "❌ Orderan ditolak. Nanti ada orderan lain.\n\n" +
          "Tetap *online* ya, ketik *checkout* kalau mau selesai shift."
        );
      } catch (e) {
        console.error("[driver] decline failed:", e.message);
        await sendReply(sock, jid, "Gagal tolak orderan. Coba lagi.");
      }
      return;
    }

    await sendReply(sock, jid,
      "Ada orderan masuk! Ketik *terima* atau *tolak*."
    );
    return;
  }

  // ─── DEFAULT ───
  if (state.status === "checked_in") {
    await sendReply(sock, jid,
      "Kamu sedang *online*. Tunggu orderan masuk ya 🏍️\n\n" +
      "Ketik *checkout* untuk selesai shift, atau *saldo* untuk cek penghasilan."
    );
    return;
  }

  if (state.status === "on_ride") {
    await sendReply(sock, jid,
      `Kamu sedang mengantar penumpang. Ride: *${state.currentRideCode}*`
    );
    return;
  }

  // checked_out
  await sendReply(sock, jid,
    "Kamu sedang *offline*.\n\nKetik *checkin* untuk mulai shift dan terima orderan."
  );
}

/**
 * Send ride notification to a driver's personal bot
 */
async function notifyDriverNewRide(sock, jid, driverId, ride) {
  const state = getDriverState(driverId);
  if (state.status !== "checked_in") return false;

  const rideCode = ride.code || ride.rideCode;
  const pickup = ride.pickup?.address || "-";
  const dropoff = ride.dropoff?.address || "-";
  const amount = ride.price?.amount || 0;

  setDriverState(driverId, {
    status: "waiting_ride",
    pendingRideCode: rideCode,
  });

  await sendReply(sock, jid,
    `🆕 *Ada orderan baru!*\n\n` +
    `📍 Jemput: ${pickup}\n` +
    `🏁 Tujuan: ${dropoff}\n` +
    `💰 Rp ${formatIdr(amount)}\n\n` +
    `Ketik *terima* atau *tolak*`
  );

  return true;
}

/**
 * Mark a ride as completed for a driver
 */
function markDriverRideCompleted(driverId) {
  const state = getDriverState(driverId);
  if (state.status === "on_ride") {
    setDriverState(driverId, {
      status: "checked_in",
      currentRideCode: null,
    });
  }
}

module.exports = {
  handleDriverMessage,
  notifyDriverNewRide,
  markDriverRideCompleted,
  initDriverState,
  getDriverState,
  setDriverState,
  driverStates,
};
