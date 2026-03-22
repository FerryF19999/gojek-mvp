import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

type IncomingMessage = {
  phone: string;
  text: string;
};

const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, "");

function getConvex() {
  return new ConvexHttpClient(CONVEX_URL);
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "").replace(/@s\.whatsapp\.net/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  return cleaned;
}

function shouldStartFlow(text: string) {
  const t = text.toLowerCase();
  return t.includes("pesan") || t.includes("ride") || t.includes("ojek") || t.includes("halo");
}

function pseudoCoord(seed: string, base: number, spread: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return base + ((hash % 1000) / 1000 - 0.5) * spread;
}

export async function handlePassengerMessage(msg: IncomingMessage): Promise<{ handled: boolean; replies: string[] }> {
  const convex = getConvex();
  const phone = normalizePhone(msg.phone);
  const text = (msg.text || "").trim();

  const current = await convex.query((api as any).passengerWhatsapp.getByPhone, { phone });
  if (!current && !shouldStartFlow(text)) return { handled: false, replies: [] };

  const state = current?.state || "ask_name";
  const temp = (current?.tempData || {}) as Record<string, string>;
  const replies: string[] = [];

  if (!current) {
    await convex.mutation((api as any).passengerWhatsapp.upsert, { phone, state: "ask_name", tempData: {} });
    return { handled: true, replies: ["Halo! Mau pesan ojek? Boleh tahu nama kamu?"] };
  }

  if (state === "ask_name") {
    temp.name = text;
    await convex.mutation((api as any).passengerWhatsapp.upsert, { phone, state: "ask_pickup", tempData: temp });
    replies.push(`Oke ${temp.name}, mau dijemput dari mana?`);
    return { handled: true, replies };
  }

  if (state === "ask_pickup") {
    temp.pickupAddress = text;
    await convex.mutation((api as any).passengerWhatsapp.upsert, { phone, state: "ask_dropoff", tempData: temp });
    replies.push("Mau ke mana tujuannya?");
    return { handled: true, replies };
  }

  if (state === "ask_dropoff") {
    temp.dropoffAddress = text;
    await convex.mutation((api as any).passengerWhatsapp.upsert, { phone, state: "ask_payment", tempData: temp });
    replies.push("Mau bayar pakai apa? (Cash/OVO/GoPay/DANA)");
    return { handled: true, replies };
  }

  if (state === "ask_payment") {
    const lower = text.toLowerCase();
    const paymentMethod = lower.includes("ovo")
      ? "ovo"
      : lower.includes("gopay")
      ? "gopay"
      : lower.includes("dana")
      ? "dana"
      : "cash";

    const pickupLat = pseudoCoord(`${phone}:${temp.pickupAddress}:lat`, -6.2, 0.08);
    const pickupLng = pseudoCoord(`${phone}:${temp.pickupAddress}:lng`, 106.816, 0.08);
    const dropoffLat = pseudoCoord(`${phone}:${temp.dropoffAddress}:lat`, -6.22, 0.08);
    const dropoffLng = pseudoCoord(`${phone}:${temp.dropoffAddress}:lng`, 106.84, 0.08);

    const created = await convex.mutation((api as any).publicApi.createPublicRide, {
      customerName: temp.name || "Passenger WA",
      customerPhone: phone,
      pickup: { address: temp.pickupAddress || "Pickup via WhatsApp", lat: pickupLat, lng: pickupLng },
      dropoff: { address: temp.dropoffAddress || "Dropoff via WhatsApp", lat: dropoffLat, lng: dropoffLng },
      vehicleType: "motor",
      paymentMethod: paymentMethod as "cash" | "ovo" | "gopay" | "dana",
    });

    await convex.mutation((api as any).passengerWhatsapp.upsert, {
      phone,
      state: "ride_created",
      currentRideCode: created.code,
      tempData: { ...temp, paymentMethod },
    });

    replies.push(
      `Oke, gw cariin driver ya...\n\nRide: ${created.code}\nNama: ${temp.name}\nDari: ${temp.pickupAddress}\nKe: ${temp.dropoffAddress}\nBayar: ${paymentMethod.toUpperCase()}\n\nTrack: ${(process.env.NEXT_PUBLIC_APP_URL || "https://gojek-mvp.vercel.app")}/track/${created.code}`,
    );
    return { handled: true, replies };
  }

  if (state === "ride_created" && current.currentRideCode) {
    replies.push(`Ride kamu masih diproses ya. Cek status di /track/${current.currentRideCode}`);
    return { handled: true, replies };
  }

  return { handled: true, replies: ["Siap, ketik 'pesan ride' buat mulai order."] };
}
