/**
 * Telegram Bridge — Main message handler
 *
 * Receives messages from Telegram webhook, processes through state machine,
 * calls NEMU API, and sends response via Telegram Bot API.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { matchIntent, extractVehicleType, extractPaymentMethod } from "./intent-matcher";
import { getTransition } from "./state-machine";
import type { DriverTelegramState, DriverState, RegistrationStep } from "./state-machine";
import { templates } from "./message-templates";
import { getAIFallback } from "./ai-fallback";
import { sendMessage, sendMessageWithButtons, sendMessageWithKeyboard, sendMessageRemoveKeyboard } from "./bot";
import type { TelegramMessage } from "./bot";

const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, "");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

function getConvex() {
  return new ConvexHttpClient(CONVEX_URL);
}

export interface IncomingTelegramMessage {
  chatId: number;
  text: string;
  from?: { id: number; firstName: string; lastName?: string; username?: string };
  hasPhoto?: boolean;
  hasLocation?: boolean;
  location?: { lat: number; lng: number };
  messageId?: number;
  callbackData?: string;
}

/**
 * Main message handler — process an incoming Telegram message
 */
export async function handleDriverMessage(msg: IncomingTelegramMessage): Promise<void> {
  const convex = getConvex();
  const chatId = msg.chatId;
  const chatIdStr = String(chatId);

  const reply = async (text: string) => {
    await sendMessage(chatId, text);
  };

  try {
    // 1. Get or create driver state (using chatId as key)
    let state = await convex.query((api as any).telegramState.getByChatId, { chatId: chatIdStr });

    if (!state) {
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "unknown",
        lastMessageAt: Date.now(),
      });
      state = await convex.query((api as any).telegramState.getByChatId, { chatId: chatIdStr });
    }

    if (!state) {
      await reply(templates.genericError());
      return;
    }

    // Update last message timestamp
    await convex.mutation((api as any).telegramState.updateLastMessage, {
      chatId: chatIdStr,
      lastMessageAt: Date.now(),
    });

    // Use callback data if present (from inline buttons), otherwise use text
    const inputText = msg.callbackData || msg.text;

    // 2. Handle registration flow separately
    if (state.state === "registering") {
      const regResponse = await handleRegistration(convex, state, { ...msg, text: inputText });
      if (regResponse) {
        await reply(regResponse);
        return;
      }
    }

    // 3. Match intent
    const intent = matchIntent(inputText);

    // 4. Check state machine for valid transition
    const transition = getTransition(state as unknown as DriverTelegramState, intent);

    if (transition) {
      // Update state
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: transition.newState,
        registrationStep: transition.registrationStep || undefined,
        currentRideCode: transition.currentRideCode || state.currentRideCode || undefined,
        tempData: transition.tempData || state.tempData || undefined,
        lastMessageAt: Date.now(),
      });

      // Execute action
      const actionResponse = await executeAction(convex, state, transition.action || "", msg);
      if (actionResponse) {
        await reply(actionResponse);
      }
    } else if (intent === "TIDAK_DIKENAL") {
      // 5. AI fallback for unrecognized messages
      const aiResponse = await getAIFallback(inputText, state as unknown as DriverTelegramState);
      await reply(aiResponse.reply);
    } else {
      // Intent recognized but no valid transition for current state
      await reply(templates.invalidState(getStateHint(state.state as DriverState)));
    }
  } catch (error) {
    console.error("[TG Bridge] Error handling message:", error);
    await reply(templates.genericError());
  }
}

/**
 * Handle registration flow
 */
async function handleRegistration(
  convex: ConvexHttpClient,
  state: any,
  msg: IncomingTelegramMessage,
): Promise<string | null> {
  const chatIdStr = String(msg.chatId);
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
      // Store Telegram username if available
      if (msg.from?.username) tempData.telegramUsername = msg.from.username;
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "registering",
        registrationStep: "vehicle_type",
        tempData,
        lastMessageAt: Date.now(),
      });
      const displayName = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      // Use inline buttons for vehicle type
      await sendMessageWithButtons(
        msg.chatId,
        `Salam kenal ${displayName}! 👋\nPake motor atau mobil?`,
        [[
          { text: "🏍️ Motor", callback_data: "vehicle:motor" },
          { text: "🚗 Mobil", callback_data: "vehicle:mobil" },
        ]],
      );
      return null; // Already sent
    }

    case "vehicle_type": {
      const vType = extractVehicleType(text);
      if (!vType) {
        await sendMessageWithButtons(
          msg.chatId,
          "Pilih kendaraan kamu:",
          [[
            { text: "🏍️ Motor", callback_data: "vehicle:motor" },
            { text: "🚗 Mobil", callback_data: "vehicle:mobil" },
          ]],
        );
        return null;
      }
      tempData.vehicleType = vType;
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
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
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "registering",
        registrationStep: "plate",
        tempData,
        lastMessageAt: Date.now(),
      });
      const displayBrand = text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      return templates.askPlate(displayBrand);
    }

    case "plate": {
      if (text.length < 3) return "Nomor plat terlalu pendek. Contoh: B 6234 KJT";
      tempData.plate = text.toUpperCase();
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "registering",
        registrationStep: "ktp",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askKtp();
    }

    case "ktp": {
      if (!msg.hasPhoto && text.length < 2) {
        return "Kirim foto KTP kamu ya 📸\nKalau gak bisa foto, ketik nomor KTP aja.";
      }
      tempData.ktpReceived = true;
      tempData.ktpData = msg.hasPhoto ? "image_received" : text;
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "registering",
        registrationStep: "sim",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askSim();
    }

    case "sim": {
      if (!msg.hasPhoto && text.length < 2) {
        return "Kirim foto SIM kamu ya 📸\nKalau gak bisa foto, ketik nomor SIM aja.";
      }
      tempData.simReceived = true;
      tempData.simData = msg.hasPhoto ? "image_received" : text;
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
        state: "registering",
        registrationStep: "payment_method",
        tempData,
        lastMessageAt: Date.now(),
      });
      return templates.askPaymentMethod();
    }

    case "payment_method": {
      const payment = extractPaymentMethod(text);
      if (!payment) {
        await sendMessageWithButtons(
          msg.chatId,
          "Mau terima bayaran lewat mana?",
          [
            [
              { text: "🟣 OVO", callback_data: "1" },
              { text: "🟢 GoPay", callback_data: "2" },
            ],
            [
              { text: "🔵 DANA", callback_data: "3" },
              { text: "🏦 Transfer Bank", callback_data: "4" },
            ],
          ],
        );
        return null;
      }
      tempData.paymentMethod = payment.method;
      tempData.paymentDisplay = payment.display;
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
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
      await convex.mutation((api as any).telegramState.upsert, {
        chatId: chatIdStr,
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
        await convex.mutation((api as any).telegramState.upsert, {
          chatId: chatIdStr,
          state: "unknown",
          lastMessageAt: Date.now(),
        });
        return "Oke, pendaftaran dibatalin. Ketik DAFTAR kalau mau coba lagi ya!";
      }

      const ok = ["oke", "ok", "ya", "yes", "bener", "betul", "setuju", "konfirmasi", "confirm", "gas"].includes(text.toLowerCase().trim());
      if (!ok) return "Ketik OKE kalau data udah bener, atau BATAL kalau mau ulang.";

      try {
        const result = await registerWithApi(convex, chatIdStr, tempData);
        if (result.ok) {
          await convex.mutation((api as any).telegramState.upsert, {
            chatId: chatIdStr,
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
        console.error("[TG Bridge] Registration error:", error);
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
  chatId: string,
  tempData: Record<string, any>,
): Promise<{ ok: boolean; driverId?: string; apiToken?: string; error?: string }> {
  try {
    // Use chatId as phone placeholder since Telegram doesn't provide phone by default
    const phoneOrChatId = tempData.phone || `tg_${chatId}`;

    const result = await convex.mutation(api.publicApi.registerDriverDirect, {
      fullName: tempData.name || "Driver",
      phone: phoneOrChatId,
      vehicleType: tempData.vehicleType || "motor",
      vehicleBrand: tempData.vehicleBrand || "Unknown",
      vehicleModel: tempData.vehicleBrand || "Unknown",
      vehiclePlate: tempData.plate || "UNKNOWN",
      licenseNumber: tempData.simData || "N/A",
      city: "Indonesia",
    });

    if (result.ok) {
      if (result.driverId && result.apiToken) {
        try {
          await convex.mutation(api.publicApi.driverSelfSubscribe, {
            driverId: result.driverId as any,
          });
        } catch (e) {
          console.warn("[TG Bridge] Auto-subscribe failed:", e);
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
  msg: IncomingTelegramMessage,
): Promise<string | null> {
  const chatIdStr = String(msg.chatId);

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
          console.error("[TG Bridge] Go online failed:", await res.text());
          return templates.genericError();
        }

        const gpsUrl = `${baseUrl}/driver-gps?token=${state.apiToken}`;
        let displayName = "Pak/Bu Driver";
        try {
          const driver = await convex.query(api.drivers.getDriverByApiToken, { apiToken: state.apiToken });
          if (driver?.userName) displayName = driver.userName;
        } catch (e) {}

        return templates.goOnlineNeedGps(displayName, gpsUrl);
      } catch (error) {
        console.error("[TG Bridge] Go online error:", error);
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
        console.error("[TG Bridge] Go offline error:", error);
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
          console.error("[TG Bridge] Accept ride failed:", await res.text());
          return templates.genericError();
        }

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
        console.error("[TG Bridge] Accept ride error:", error);
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

        await convex.mutation((api as any).telegramState.upsert, {
          chatId: chatIdStr,
          state: "online",
          currentRideCode: undefined,
          lastMessageAt: Date.now(),
        });

        return templates.orderDeclined();
      } catch (error) {
        console.error("[TG Bridge] Decline ride error:", error);
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

        if (!res.ok) return templates.genericError();

        try {
          const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
          if (ride) return templates.arrivedAtPickup(ride.customerName);
        } catch (e) {}

        return templates.arrivedAtPickup("Penumpang");
      } catch (error) {
        console.error("[TG Bridge] Arrive pickup error:", error);
        return templates.genericError();
      }
    }

    case "START_RIDE": {
      if (!state.currentRideCode) return templates.notOnRide();
      try {
        const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
        if (ride) {
          const mapsUrl = `https://maps.google.com/?q=${ride.dropoff.lat},${ride.dropoff.lng}`;
          return templates.rideStarted({ address: ride.dropoff.address, mapsUrl });
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

        if (!res.ok) return templates.genericError();

        let price = 0;
        try {
          const ride = await convex.query(api.publicApi.getPublicRideStatus, { code: state.currentRideCode });
          price = ride?.price?.amount || 0;
        } catch (e) {}

        let todayOrders = 1;
        let todayEarnings = price;
        try {
          if (state.driverId) {
            const rides = await convex.query(api.drivers.getDriverRides, { driverId: state.driverId as any });
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStart = today.getTime();
            const completedToday = (rides || []).filter(
              (r: any) => r.status === "completed" && r.createdAt >= todayStart,
            );
            todayOrders = completedToday.length;
            todayEarnings = completedToday.reduce((sum: number, r: any) => sum + (r.price?.amount || 0), 0);
          }
        } catch (e) {}

        await convex.mutation((api as any).telegramState.upsert, {
          chatId: chatIdStr,
          state: "online",
          currentRideCode: undefined,
          lastMessageAt: Date.now(),
        });

        return templates.rideCompleted({ price, todayOrders, todayEarnings });
      } catch (error) {
        console.error("[TG Bridge] Complete ride error:", error);
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
          (r: any) => r.status === "completed" && r.createdAt >= todayStart,
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
      return "Mau ambil order ini? Balas YA atau GAK";

    default:
      return null;
  }
}

/**
 * Handle incoming ride offer — send notification to driver via Telegram
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
): Promise<boolean> {
  const convex = getConvex();

  try {
    const state = await convex.query((api as any).telegramState.getByDriverId, { driverId });
    if (!state) {
      console.warn(`[TG Bridge] No Telegram state found for driver ${driverId}`);
      return false;
    }

    // Update state to offered
    await convex.mutation((api as any).telegramState.upsert, {
      chatId: state.chatId,
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

    // Send with inline buttons for easy accept/decline
    await sendMessageWithButtons(Number(state.chatId), text, [
      [
        { text: "✅ Terima", callback_data: "terima" },
        { text: "❌ Tolak", callback_data: "tolak" },
      ],
    ]);

    return true;
  } catch (error) {
    console.error("[TG Bridge] Handle ride offer error:", error);
    return false;
  }
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
