/**
 * WhatsApp Bridge — Main message handler
 * 
 * Receives messages from Baileys webhook, processes through state machine,
 * calls NEMU API, and returns response messages.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { matchIntent, extractVehicleType, extractPaymentMethod, Intent } from "./intent-matcher";
import { getTransition, getNextRegistrationStep, DriverWhatsappState, DriverState, RegistrationStep } from "./state-machine";
import { templates } from "./message-templates";
import { getAIFallback } from "./ai-fallback";

const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, "");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

function getConvex() {
  return new ConvexHttpClient(CONVEX_URL);
}

export interface IncomingMessage {
  phone: string;
  text: string;
  hasImage?: boolean;
  hasLocation?: boolean;
  location?: { lat: number; lng: number };
  messageId?: string;
  timestamp?: number;
}

export interface OutgoingMessage {
  phone: string;
  text: string;
}

/**
 * Main message handler — process an incoming WhatsApp message
 */
export async function handleMessage(msg: IncomingMessage): Promise<OutgoingMessage[]> {
  const convex = getConvex();
  const phone = normalizePhone(msg.phone);
  const responses: OutgoingMessage[] = [];

  const reply = (text: string) => {
    responses.push({ phone, text });
  };

  try {
    // 1. Get or create driver WhatsApp state
    let state = await convex.query(api.whatsappState.getByPhone, { phone });

    if (!state) {
      // New user — create state
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "unknown",
        lastMessageAt: Date.now(),
      });
      state = await convex.query(api.whatsappState.getByPhone, { phone });
    }

    if (!state) {
      reply(templates.genericError());
      return responses;
    }

    // Update last message timestamp
    await convex.mutation(api.whatsappState.updateLastMessage, {
      phone,
      lastMessageAt: Date.now(),
    });

    // 2. Handle registration flow separately
    if (state.state === "registering") {
      const regResponse = await handleRegistration(convex, state, msg);
      if (regResponse) {
        reply(regResponse);
        return responses;
      }
    }

    // 3. Match intent
    const intent = matchIntent(msg.text);

    // 4. Check state machine for valid transition
    const transition = getTransition(state as DriverWhatsappState, intent);

    if (transition) {
      // Update state
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: transition.newState,
        registrationStep: transition.registrationStep || undefined,
        currentRideCode: transition.currentRideCode || state.currentRideCode || undefined,
        tempData: transition.tempData || state.tempData || undefined,
        lastMessageAt: Date.now(),
      });

      // Execute action
      const actionResponse = await executeAction(convex, state, transition.action || "", msg);
      if (actionResponse) {
        reply(actionResponse);
      }
    } else if (intent === "TIDAK_DIKENAL") {
      // 5. AI fallback for unrecognized messages
      const aiResponse = await getAIFallback(msg.text, state as DriverWhatsappState);
      reply(aiResponse.reply);
    } else {
      // Intent recognized but no valid transition for current state
      reply(templates.invalidState(getStateHint(state.state as DriverState)));
    }
  } catch (error) {
    console.error("[Bridge] Error handling message:", error);
    reply(templates.genericError());
  }

  return responses;
}

/**
 * Handle registration flow
 */
async function handleRegistration(
  convex: ConvexHttpClient,
  state: any,
  msg: IncomingMessage,
): Promise<string | null> {
  const phone = normalizePhone(msg.phone);
  const step = state.registrationStep as RegistrationStep;
  const tempData = (state.tempData || {}) as Record<string, any>;
  const text = msg.text.trim();

  // Allow HELP to break out of registration
  const intent = matchIntent(text);
  if (intent === "BANTUAN") {
    return templates.help();
  }

  switch (step) {
    case "name": {
      if (text.length < 2) return "Nama terlalu pendek nih. Ketik nama lengkap kamu ya:";
      tempData.name = text;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "vehicle_type",
        tempData,
        lastMessageAt: Date.now(),
      });
      // Capitalize first letter of each word
      const displayName = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      return templates.askVehicleType(displayName);
    }

    case "vehicle_type": {
      const vType = extractVehicleType(text);
      if (!vType) return "Motor atau mobil nih? Ketik MOTOR atau MOBIL ya:";
      tempData.vehicleType = vType;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "vehicle_brand",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askVehicleBrand();
    }

    case "vehicle_brand": {
      if (text.length < 2) return "Ketik merk & tipe kendaraan kamu ya.\nContoh: Honda Beat, Toyota Avanza";
      tempData.vehicleBrand = text;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "plate",
        tempData,
        lastMessageAt: Date.now(),
      });
      // Capitalize brand name
      const displayBrand = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      return templates.askPlate(displayBrand);
    }

    case "plate": {
      if (text.length < 3) return "Nomor plat terlalu pendek. Contoh: B 6234 KJT";
      tempData.plate = text.toUpperCase();
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "ktp",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askKtp();
    }

    case "ktp": {
      // Accept both image and text (for demo purposes we accept anything)
      if (!msg.hasImage && text.length < 2) {
        return "Kirim foto KTP kamu ya 📸\nKalau gak bisa foto, ketik nomor KTP aja.";
      }
      tempData.ktpReceived = true;
      tempData.ktpData = msg.hasImage ? "image_received" : text;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "sim",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askSim();
    }

    case "sim": {
      if (!msg.hasImage && text.length < 2) {
        return "Kirim foto SIM kamu ya 📸\nKalau gak bisa foto, ketik nomor SIM aja.";
      }
      tempData.simReceived = true;
      tempData.simData = msg.hasImage ? "image_received" : text;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "payment_method",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askPaymentMethod();
    }

    case "payment_method": {
      const payment = extractPaymentMethod(text);
      if (!payment) return "Pilih metode bayar ya:\n\n1. OVO\n2. GoPay\n3. Dana\n4. Transfer bank";
      tempData.paymentMethod = payment.method;
      tempData.paymentDisplay = payment.display;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "payment_number",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askPaymentNumber(payment.display);
    }

    case "payment_number": {
      if (text.length < 8) return "Nomor harus minimal 8 digit ya. Coba ketik lagi:";
      tempData.paymentNumber = text;
      await convex.mutation(api.whatsappState.upsert, {
        phone,
        state: "registering",
        registrationStep: "confirm",
        tempData,
        lastMessageAt: Date.now(),
      });
      const displayName = (tempData.name || "").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      const displayBrand = (tempData.vehicleBrand || "").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      return templates.confirmRegistration({
        name: displayName,
        vehicle: displayBrand,
        plate: tempData.plate || "",
        paymentMethod: tempData.paymentDisplay || "",
        paymentNumber: tempData.paymentNumber,
      });
    }

    case "confirm": {
      const confirmIntent = matchIntent(text);
      if (confirmIntent === "TOLAK" || text.toLowerCase() === "batal") {
        // Cancel registration
        await convex.mutation(api.whatsappState.upsert, {
          phone,
          state: "unknown",
          lastMessageAt: Date.now(),
        });
        return "Oke, pendaftaran dibatalin. Ketik DAFTAR kalau mau coba lagi ya! 👋";
      }

      // Accept OKE, OK, YA, BENER, etc.
      const ok = ["oke", "ok", "ya", "yes", "bener", "betul", "setuju", "konfirmasi", "confirm", "gas"].includes(text.toLowerCase().trim());
      if (!ok) return "Ketik OKE kalau data udah bener, atau BATAL kalau mau ulang.";

      // Register with NEMU API
      try {
        const result = await registerWithApi(convex, phone, tempData);
        if (result.ok) {
          await convex.mutation(api.whatsappState.upsert, {
            phone,
            state: "idle",
            driverId: result.driverId,
            apiToken: result.apiToken,
            lastMessageAt: Date.now(),
          });
          const displayName = (tempData.name || "Driver").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          return templates.registrationSuccess(displayName);
        } else {
          return templates.registrationFailed(result.error || "Unknown error");
        }
      } catch (error: any) {
        console.error("[Bridge] Registration error:", error);
        return templates.registrationFailed(error.message || "Terjadi kesalahan");
      }
    }

    default:
      return null;
  }
}

/**
 * Register driver with NEMU API via Convex
 */
async function registerWithApi(
  convex: ConvexHttpClient,
  phone: string,
  tempData: Record<string, any>,
): Promise<{ ok: boolean; driverId?: string; apiToken?: string; error?: string }> {
  try {
    const result = await convex.mutation(api.publicApi.registerDriverDirect, {
      fullName: tempData.name || "Driver",
      phone,
      vehicleType: tempData.vehicleType || "motor",
      vehicleBrand: tempData.vehicleBrand || "Unknown",
      vehicleModel: tempData.vehicleBrand || "Unknown", // Use brand as model
      vehiclePlate: tempData.plate || "UNKNOWN",
      licenseNumber: tempData.simData || "N/A",
      city: "Indonesia",
    });

    if (result.ok) {
      // Auto-subscribe (demo)
      if (result.driverId && result.apiToken) {
        try {
          await convex.mutation(api.publicApi.driverSelfSubscribe, {
            driverId: result.driverId as any,
          });
        } catch (e) {
          console.warn("[Bridge] Auto-subscribe failed:", e);
        }
      }

      return {
        ok: true,
        driverId: String(result.driverId),
        apiToken: result.apiToken || undefined,
      };
    }

    return { ok: false, error: "Pendaftaran gagal" };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

/**
 * Execute a state machine action
 */
async function executeAction(
  convex: ConvexHttpClient,
  state: any,
  action: string,
  msg: IncomingMessage,
): Promise<string | null> {
  const phone = normalizePhone(msg.phone);

  switch (action) {
    case "NEED_REGISTRATION":
      return templates.needRegistration();

    case "ALREADY_REGISTERED":
      return templates.alreadyRegistered();

    case "SHOW_HELP":
      return templates.help();

    case "GO_ONLINE": {
      if (!state.apiToken || !state.driverId) {
        return templates.needRegistration();
      }
      try {
        // Call NEMU API to set availability
        const baseUrl = APP_URL;
        const res = await fetch(`${baseUrl}/api/drivers/me/availability`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
          body: JSON.stringify({ availability: "online" }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          console.error("[Bridge] Go online failed:", err);
          return templates.genericError();
        }

        // Generate GPS sharing URL
        const gpsUrl = `${baseUrl}/driver-gps?token=${state.apiToken}`;
        const displayName = "Pak/Bu Driver";

        // Try to get driver name
        try {
          const driver = await convex.query(api.drivers.getDriverByApiToken, { apiToken: state.apiToken });
          if (driver?.userName) {
            return templates.goOnlineNeedGps(driver.userName, gpsUrl);
          }
        } catch (e) {}

        return templates.goOnlineNeedGps(displayName, gpsUrl);
      } catch (error) {
        console.error("[Bridge] Go online error:", error);
        return templates.genericError();
      }
    }

    case "GO_OFFLINE": {
      if (!state.apiToken) return templates.needRegistration();
      try {
        const baseUrl = APP_URL;
        await fetch(`${baseUrl}/api/drivers/me/availability`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
          body: JSON.stringify({ availability: "offline" }),
        });

        return templates.goOfflineSimple();
      } catch (error) {
        console.error("[Bridge] Go offline error:", error);
        return templates.genericError();
      }
    }

    case "ALREADY_ONLINE":
      return templates.alreadyOnline();

    case "ACCEPT_RIDE": {
      if (!state.apiToken || !state.currentRideCode) return templates.notOnRide();
      try {
        const baseUrl = APP_URL;
        const res = await fetch(`${baseUrl}/api/drivers/me/rides/${state.currentRideCode}/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown" }));
          console.error("[Bridge] Accept ride failed:", err);
          return templates.genericError();
        }

        // Get ride details for response
        try {
          const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
          if (ride) {
            const mapsUrl = `https://maps.google.com/?q=${ride.pickup.lat},${ride.pickup.lng}`;
            return templates.orderAccepted({
              customerName: ride.customerName,
              address: ride.pickup.address,
              mapsUrl,
            });
          }
        } catch (e) {}

        return templates.orderAccepted({
          customerName: "Penumpang",
          address: "Lihat di peta",
        });
      } catch (error) {
        console.error("[Bridge] Accept ride error:", error);
        return templates.genericError();
      }
    }

    case "DECLINE_RIDE": {
      if (!state.apiToken || !state.currentRideCode) return templates.notOnRide();
      try {
        const baseUrl = APP_URL;
        await fetch(`${baseUrl}/api/drivers/me/rides/${state.currentRideCode}/decline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
        });

        // Clear current ride code
        await convex.mutation(api.whatsappState.upsert, {
          phone,
          state: "online",
          currentRideCode: undefined,
          lastMessageAt: Date.now(),
        });

        return templates.orderDeclined();
      } catch (error) {
        console.error("[Bridge] Decline ride error:", error);
        return templates.genericError();
      }
    }

    case "ARRIVE_PICKUP": {
      if (!state.apiToken || !state.currentRideCode) return templates.notOnRide();
      try {
        const baseUrl = APP_URL;
        const res = await fetch(`${baseUrl}/api/drivers/me/rides/${state.currentRideCode}/arrive`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
        });

        if (!res.ok) {
          return templates.genericError();
        }

        // Get customer name
        try {
          const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
          if (ride) return templates.arrivedAtPickup(ride.customerName);
        } catch (e) {}

        return templates.arrivedAtPickup("Penumpang");
      } catch (error) {
        console.error("[Bridge] Arrive pickup error:", error);
        return templates.genericError();
      }
    }

    case "START_RIDE": {
      if (!state.currentRideCode) return templates.notOnRide();
      try {
        const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
        if (ride) {
          const mapsUrl = `https://maps.google.com/?q=${ride.dropoff.lat},${ride.dropoff.lng}`;
          return templates.rideStarted({
            address: ride.dropoff.address,
            mapsUrl,
          });
        }
        return templates.rideStarted({ address: "Tujuan" });
      } catch (error) {
        return templates.rideStarted({ address: "Tujuan" });
      }
    }

    case "COMPLETE_RIDE": {
      if (!state.apiToken || !state.currentRideCode) return templates.notOnRide();
      try {
        const baseUrl = APP_URL;
        const res = await fetch(`${baseUrl}/api/drivers/me/rides/${state.currentRideCode}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.apiToken}`,
          },
        });

        if (!res.ok) {
          return templates.genericError();
        }

        // Get ride price for response
        let price = 0;
        try {
          const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
          price = ride?.price?.amount || 0;
        } catch (e) {}

        // Get today's stats
        let todayOrders = 1;
        let todayEarnings = price;
        try {
          if (state.driverId) {
            const rides = await convex.query(api.drivers.getDriverRides, { driverId: state.driverId as any });
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStart = today.getTime();
            const completedToday = (rides || []).filter(
              (r: any) => r.status === "completed" && r.createdAt >= todayStart
            );
            todayOrders = completedToday.length;
            todayEarnings = completedToday.reduce((sum: number, r: any) => sum + (r.price?.amount || 0), 0);
          }
        } catch (e) {}

        // Clear current ride
        await convex.mutation(api.whatsappState.upsert, {
          phone,
          state: "online",
          currentRideCode: undefined,
          lastMessageAt: Date.now(),
        });

        return templates.rideCompleted({
          price,
          todayOrders,
          todayEarnings,
        });
      } catch (error) {
        console.error("[Bridge] Complete ride error:", error);
        return templates.genericError();
      }
    }

    case "SHOW_EARNINGS": {
      if (!state.driverId) return templates.needRegistration();
      try {
        const rides = await convex.query(api.drivers.getDriverRides, { driverId: state.driverId as any });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();
        const completedToday = (rides || []).filter(
          (r: any) => r.status === "completed" && r.createdAt >= todayStart
        );
        const todayOrders = completedToday.length;
        const todayEarnings = completedToday.reduce((sum: number, r: any) => sum + (r.price?.amount || 0), 0);

        return templates.earningsSimple(todayOrders, todayEarnings);
      } catch (error) {
        return templates.earningsSimple(0, 0);
      }
    }

    case "WITHDRAW":
      return templates.withdrawNoBalance();

    case "WAITING_RESPONSE":
      return `Mau ambil order ini? Balas YA atau GAK`;

    default:
      return null;
  }
}

/**
 * Handle incoming ride offer notification (called from NEMU webhook)
 * 
 * Supports both modes:
 *   - Legacy (single bot): returns OutgoingMessage for the driver's phone
 *   - Per-driver bot: tries to send via Baileys multi-server to driver's self-chat
 */
export async function handleRideOffer(
  driverId: string,
  rideCode: string,
  rideDetails: {
    customerName: string;
    pickupAddress: string;
    dropoffAddress: string;
    price: number;
    pickupDistance?: string;
    dropoffDistance?: string;
  },
): Promise<OutgoingMessage | null> {
  const convex = getConvex();

  try {
    // Find driver's WhatsApp state by driverId
    const state = await convex.query(api.whatsappState.getByDriverId, { driverId });
    if (!state) {
      console.warn(`[Bridge] No WhatsApp state found for driver ${driverId}`);
      return null;
    }

    // Update state to offered
    await convex.mutation(api.whatsappState.upsert, {
      phone: state.phone,
      state: "offered",
      currentRideCode: rideCode,
      lastMessageAt: Date.now(),
    });

    // Build offer message
    const text = templates.newOrder({
      customerName: rideDetails.customerName,
      pickupAddress: rideDetails.pickupAddress,
      pickupDistance: rideDetails.pickupDistance || "~",
      dropoffAddress: rideDetails.dropoffAddress,
      dropoffDistance: rideDetails.dropoffDistance || "~",
      price: rideDetails.price,
      rideCode,
    });

    // Try per-driver bot mode first (send via multi-session server)
    const baileysMultiUrl = process.env.BAILEYS_MULTI_URL;
    if (baileysMultiUrl) {
      try {
        // Look up session by driverId
        const driverSessionsApi = (api as any).driverSessions;
        const session = await convex.query(driverSessionsApi.getByDriverId, { driverId });
        if (session && session.status === "connected") {
          const res = await fetch(`${baileysMultiUrl}/sessions/${session.sessionId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          if (res.ok) {
            console.log(`[Bridge] Ride offer sent via per-driver bot to ${session.sessionId}`);
            // Still return the message for legacy compatibility
            return { phone: state.phone, text };
          }
        }
      } catch (e) {
        console.warn("[Bridge] Per-driver bot send failed, falling back to legacy:", e);
      }
    }

    return { phone: state.phone, text };
  } catch (error) {
    console.error("[Bridge] Handle ride offer error:", error);
    return null;
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "").replace(/@s\.whatsapp\.net/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  return cleaned;
}

function getStateHint(state: DriverState): string {
  switch (state) {
    case "unknown": return "Ketik DAFTAR buat mendaftar dulu ya.";
    case "idle": return "Ketik MULAI buat online dulu.";
    case "online": return "Tunggu order masuk ya, atau ketik STOP buat istirahat.";
    case "offered": return "Balas YA atau GAK buat order yang ditawarin.";
    case "picking_up": return "Ketik SAMPE kalau udah di lokasi jemput.";
    case "at_pickup": return "Ketik JALAN kalau penumpang udah naik.";
    case "on_ride": return "Ketik DONE kalau udah nyampe tujuan.";
    default: return "Ketik HELP buat bantuan.";
  }
}
