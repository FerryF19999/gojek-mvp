/**
 * Telegram Passenger Bot — NEMU RIDE branded booking flow
 *
 * Flow:
 *   ask_name → ask_pickup → ask_dropoff → ask_payment → ride_created
 *
 * Supports location sharing for pickup (via request_location button).
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  sendMessage,
  sendMessageWithButtons,
  sendMessageWithKeyboard,
  sendMessageRemoveKeyboard,
} from "./bot";

const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, "");

function getConvex() {
  return new ConvexHttpClient(CONVEX_URL);
}

function shouldStartFlow(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("pesan") ||
    t.includes("ride") ||
    t.includes("ojek") ||
    t.includes("order") ||
    t === "/pesan"
  );
}

function pseudoCoord(seed: string, base: number, spread: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return base + ((hash % 1000) / 1000 - 0.5) * spread;
}

interface PassengerMessageExtras {
  hasLocation?: boolean;
  location?: { lat: number; lng: number };
}

/**
 * Reset passenger flow — clear state
 */
export async function resetPassengerFlow(chatId: number): Promise<void> {
  const convex = getConvex();
  const chatIdStr = String(chatId);
  try {
    await convex.mutation((api as any).passengerTelegram.upsert, {
      chatId: chatIdStr,
      state: "ask_name",
      tempData: {},
      currentRideCode: undefined,
    });
  } catch {}
}

/**
 * Handle a passenger message.
 * Returns { handled: true } if the passenger flow took the message.
 */
export async function handlePassengerMessage(
  chatId: number,
  text: string,
  firstName?: string,
  extras?: PassengerMessageExtras,
): Promise<{ handled: boolean }> {
  const convex = getConvex();
  const chatIdStr = String(chatId);

  const reply = async (msg: string, opts?: { removeKeyboard?: boolean }) => {
    if (opts?.removeKeyboard) {
      await sendMessageRemoveKeyboard(chatId, msg);
    } else {
      await sendMessage(chatId, msg);
    }
  };

  const current = await convex.query((api as any).passengerTelegram.getByChatId, { chatId: chatIdStr });

  // If no active flow AND no trigger word → skip to driver flow
  if (!current && !shouldStartFlow(text)) {
    return { handled: false };
  }

  const state = current?.state || "ask_name";
  const temp = (current?.tempData || {}) as Record<string, any>;

  // ─── Entry: start fresh flow ───
  if (!current) {
    await convex.mutation((api as any).passengerTelegram.upsert, {
      chatId: chatIdStr,
      state: "ask_name",
      tempData: {},
    });

    // Pre-fill name if Telegram provided it
    if (firstName) {
      temp.name = firstName;
      await convex.mutation((api as any).passengerTelegram.upsert, {
        chatId: chatIdStr,
        state: "ask_pickup",
        tempData: temp,
      });
      await sendMessageWithKeyboard(
        chatId,
        `🛵 Halo ${firstName}! Mau dijemput dari mana?\n\nKetik alamat, atau share lokasi kamu 👇`,
        [[{ text: "📍 Share Lokasi Sekarang", request_location: true }]],
      );
      return { handled: true };
    }

    await reply("🛵 Halo! Mau pesan ojek? Boleh tahu nama kamu?");
    return { handled: true };
  }

  // ─── State: ask_name ───
  if (state === "ask_name") {
    if (text.length < 2) {
      await reply("Nama terlalu pendek nih. Ketik nama kamu ya:");
      return { handled: true };
    }
    temp.name = text;
    await convex.mutation((api as any).passengerTelegram.upsert, {
      chatId: chatIdStr,
      state: "ask_pickup",
      tempData: temp,
    });

    await sendMessageWithKeyboard(
      chatId,
      `Oke ${temp.name} 👋\nMau dijemput dari mana?\n\nKetik alamat, atau share lokasi kamu 👇`,
      [[{ text: "📍 Share Lokasi Sekarang", request_location: true }]],
    );
    return { handled: true };
  }

  // ─── State: ask_pickup ───
  if (state === "ask_pickup") {
    // Handle shared location
    if (extras?.hasLocation && extras.location) {
      temp.pickupLat = extras.location.lat;
      temp.pickupLng = extras.location.lng;
      temp.pickupAddress = `Lokasi kamu (${extras.location.lat.toFixed(5)}, ${extras.location.lng.toFixed(5)})`;
      await convex.mutation((api as any).passengerTelegram.upsert, {
        chatId: chatIdStr,
        state: "ask_dropoff",
        tempData: temp,
      });
      await sendMessageRemoveKeyboard(
        chatId,
        `📍 Lokasi jemput dicatat!\n\nMau ke mana tujuannya? Ketik alamatnya:`,
      );
      return { handled: true };
    }

    if (text.length < 3) {
      await reply("Alamat jemputnya kurang jelas. Coba ketik lebih lengkap ya:");
      return { handled: true };
    }

    temp.pickupAddress = text;
    await convex.mutation((api as any).passengerTelegram.upsert, {
      chatId: chatIdStr,
      state: "ask_dropoff",
      tempData: temp,
    });
    await reply(`📍 Jemput: ${text}\n\nMau ke mana tujuannya?`, { removeKeyboard: true });
    return { handled: true };
  }

  // ─── State: ask_dropoff ───
  if (state === "ask_dropoff") {
    if (text.length < 3) {
      await reply("Tujuannya kurang jelas. Coba ketik lebih lengkap ya:");
      return { handled: true };
    }

    temp.dropoffAddress = text;
    await convex.mutation((api as any).passengerTelegram.upsert, {
      chatId: chatIdStr,
      state: "ask_payment",
      tempData: temp,
    });

    await sendMessageWithButtons(
      chatId,
      `📍 Tujuan: ${text}\n\nBayar pakai apa?`,
      [
        [
          { text: "💵 Cash", callback_data: "pay:cash" },
          { text: "🟣 OVO", callback_data: "pay:ovo" },
        ],
        [
          { text: "🟢 GoPay", callback_data: "pay:gopay" },
          { text: "🔵 DANA", callback_data: "pay:dana" },
        ],
      ],
    );
    return { handled: true };
  }

  // ─── State: ask_payment ───
  if (state === "ask_payment") {
    const lower = text.toLowerCase();
    const paymentMethod = lower.includes("ovo")
      ? "ovo"
      : lower.includes("gopay")
      ? "gopay"
      : lower.includes("dana")
      ? "dana"
      : "cash";

    // Use real coords if shared, otherwise pseudo
    const pickupLat = temp.pickupLat ?? pseudoCoord(`${chatIdStr}:${temp.pickupAddress}:lat`, -6.2, 0.08);
    const pickupLng = temp.pickupLng ?? pseudoCoord(`${chatIdStr}:${temp.pickupAddress}:lng`, 106.816, 0.08);
    const dropoffLat = pseudoCoord(`${chatIdStr}:${temp.dropoffAddress}:lat`, -6.22, 0.08);
    const dropoffLng = pseudoCoord(`${chatIdStr}:${temp.dropoffAddress}:lng`, 106.84, 0.08);

    try {
      const created = await convex.mutation((api as any).publicApi.createPublicRide, {
        customerName: temp.name || firstName || "Penumpang TG",
        customerPhone: `tg_${chatIdStr}`,
        pickup: { address: temp.pickupAddress || "Pickup via Telegram", lat: pickupLat, lng: pickupLng },
        dropoff: { address: temp.dropoffAddress || "Dropoff via Telegram", lat: dropoffLat, lng: dropoffLng },
        vehicleType: "motor",
        paymentMethod: paymentMethod as "cash" | "ovo" | "gopay" | "dana",
      });

      await convex.mutation((api as any).passengerTelegram.upsert, {
        chatId: chatIdStr,
        state: "ride_created",
        currentRideCode: created.code,
        tempData: { ...temp, paymentMethod },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gojek-mvp.vercel.app";
      const paymentDisplay = {
        cash: "💵 Cash",
        ovo: "🟣 OVO",
        gopay: "🟢 GoPay",
        dana: "🔵 DANA",
      }[paymentMethod];

      await sendMessage(
        chatId,
        `✅ Ride kamu udah dibuat!

🎫 ${created.code}
👤 ${temp.name}
📍 Dari: ${temp.pickupAddress}
🏁 Ke: ${temp.dropoffAddress}
💳 ${paymentDisplay}

🔎 Lagi cariin driver terdekat...

🗺️ Track live:
${appUrl}/track/${created.code}`,
      );
    } catch (e: any) {
      console.error("[TG Passenger] createRide error:", e);
      await sendMessage(chatId, `❌ Maaf, ada error pas bikin ride:\n${e.message || e}\n\nCoba /pesan lagi ya.`);
    }
    return { handled: true };
  }

  // ─── State: ride_created ───
  if (state === "ride_created" && current.currentRideCode) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gojek-mvp.vercel.app";
    await sendMessage(
      chatId,
      `📊 Ride ${current.currentRideCode} masih aktif.\n\n🗺️ Track: ${appUrl}/track/${current.currentRideCode}\n\nKetik /batal kalau mau cancel, atau /pesan buat ride baru.`,
    );
    return { handled: true };
  }

  await reply("Ketik /pesan buat mulai order ya.");
  return { handled: true };
}
