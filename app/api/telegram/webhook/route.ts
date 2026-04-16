/**
 * Telegram Webhook — Receives updates from Telegram Bot API
 * POST /api/telegram/webhook
 *
 * Branded for NEMU RIDE — handles /start, role selection, driver & passenger flows.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleDriverMessage } from "@/lib/telegram/bridge";
import { handlePassengerMessage, resetPassengerFlow } from "@/lib/telegram/passenger-bot";
import { sendMessage, sendMessageWithButtons, answerCallbackQuery } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/bot";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

// ─── NEMU RIDE Branded Messages ───

const welcomeMessage = (firstName?: string) =>
  `🏍️ Selamat datang di NEMU RIDE${firstName ? `, ${firstName}` : ""}!

Ride-hailing tanpa komisi — 100% penghasilan buat driver.

Mau ngapain hari ini? Pilih di bawah 👇`;

const helpMessage = () =>
  `📖 Bantuan NEMU RIDE

Sebagai Penumpang:
/pesan — Pesan ojek
/status — Cek status ride kamu
/batal — Batal pesan ride

Sebagai Driver:
/daftar — Daftar jadi driver
/mulai — Online (siap terima order)
/stop — Offline (istirahat)
/gaji — Cek penghasilan

Umum:
/start — Kembali ke menu utama
/help — Bantuan ini

Atau tinggal ketik aja, bot bakal ngerti 😊`;

const mainMenuButtons = [
  [
    { text: "🏍️ Pesan Ojek", callback_data: "menu:passenger" },
    { text: "🛵 Jadi Driver", callback_data: "menu:driver" },
  ],
  [
    { text: "📊 Cek Status", callback_data: "menu:status" },
    { text: "❓ Bantuan", callback_data: "menu:help" },
  ],
];

async function sendWelcome(chatId: number, firstName?: string) {
  await sendMessageWithButtons(chatId, welcomeMessage(firstName), mainMenuButtons);
}

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    if (WEBHOOK_SECRET) {
      const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
      if (secretHeader !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update: TelegramUpdate = await req.json();

    // ─── Callback Queries (inline button presses) ───
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat.id;
      const data = cb.data;
      const fromFirstName = cb.from.first_name;

      if (!chatId || !data) {
        return NextResponse.json({ ok: true });
      }

      await answerCallbackQuery(cb.id);

      // Menu selection from /start
      if (data.startsWith("menu:")) {
        const action = data.split(":")[1];

        if (action === "passenger") {
          await resetPassengerFlow(chatId);
          await handlePassengerMessage(chatId, "pesan", fromFirstName);
          return NextResponse.json({ ok: true });
        }

        if (action === "driver") {
          await handleDriverMessage({
            chatId,
            text: "daftar",
            from: {
              id: cb.from.id,
              firstName: cb.from.first_name,
              lastName: cb.from.last_name,
              username: cb.from.username,
            },
          });
          return NextResponse.json({ ok: true });
        }

        if (action === "status") {
          await sendStatusMessage(chatId);
          return NextResponse.json({ ok: true });
        }

        if (action === "help") {
          await sendMessage(chatId, helpMessage());
          return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ ok: true });
      }

      // Ride accept/decline buttons (terima/tolak)
      if (data === "terima" || data === "tolak") {
        await handleDriverMessage({
          chatId,
          text: data,
          callbackData: data,
          from: {
            id: cb.from.id,
            firstName: cb.from.first_name,
            lastName: cb.from.last_name,
            username: cb.from.username,
          },
        });
        return NextResponse.json({ ok: true });
      }

      // Payment method selection (passenger flow)
      if (data.startsWith("pay:")) {
        const method = data.split(":")[1];
        await handlePassengerMessage(chatId, method, fromFirstName);
        return NextResponse.json({ ok: true });
      }

      // Vehicle type selection (driver registration)
      if (data.startsWith("vehicle:")) {
        const type = data.split(":")[1];
        await handleDriverMessage({
          chatId,
          text: type,
          callbackData: type,
          from: {
            id: cb.from.id,
            firstName: cb.from.first_name,
            lastName: cb.from.last_name,
            username: cb.from.username,
          },
        });
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: true });
    }

    // ─── Regular Messages ───
    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const from = message.from;
    const firstName = from?.first_name;

    console.log(`[TG Webhook] ${chatId} (${firstName || "?"}): "${text}"`);

    // ─── Commands ───
    if (text === "/start" || text === "/menu") {
      await sendWelcome(chatId, firstName);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/start ")) {
      const param = text.slice(7).trim();
      if (param === "driver") {
        await handleDriverMessage({
          chatId,
          text: "daftar",
          from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
        });
        return NextResponse.json({ ok: true });
      }
      if (param === "passenger") {
        await resetPassengerFlow(chatId);
        await handlePassengerMessage(chatId, "pesan", firstName);
        return NextResponse.json({ ok: true });
      }
      // Unknown start param — show welcome
      await sendWelcome(chatId, firstName);
      return NextResponse.json({ ok: true });
    }

    if (text === "/help") {
      await sendMessage(chatId, helpMessage());
      return NextResponse.json({ ok: true });
    }

    if (text === "/status") {
      await sendStatusMessage(chatId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/batal" || text === "/cancel") {
      await resetPassengerFlow(chatId);
      await sendMessage(chatId, "❌ Pesan dibatalin. Ketik /pesan kalau mau order lagi.");
      return NextResponse.json({ ok: true });
    }

    if (text === "/pesan") {
      await resetPassengerFlow(chatId);
      await handlePassengerMessage(chatId, "pesan", firstName);
      return NextResponse.json({ ok: true });
    }

    if (text === "/daftar") {
      await handleDriverMessage({
        chatId,
        text: "daftar",
        from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (text === "/mulai") {
      await handleDriverMessage({
        chatId,
        text: "mulai",
        from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (text === "/stop") {
      await handleDriverMessage({
        chatId,
        text: "stop",
        from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (text === "/gaji") {
      await handleDriverMessage({
        chatId,
        text: "gaji",
        from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
      });
      return NextResponse.json({ ok: true });
    }

    // ─── Route to passenger first, then driver ───
    const passengerResult = await handlePassengerMessage(chatId, text, firstName, {
      hasLocation: !!message.location,
      location: message.location ? { lat: message.location.latitude, lng: message.location.longitude } : undefined,
    });

    if (passengerResult.handled) {
      return NextResponse.json({ ok: true });
    }

    await handleDriverMessage({
      chatId,
      text,
      from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : undefined,
      hasPhoto: !!(message.photo && message.photo.length > 0),
      hasLocation: !!message.location,
      location: message.location ? { lat: message.location.latitude, lng: message.location.longitude } : undefined,
      messageId: message.message_id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TG Webhook] Error:", error);
    return NextResponse.json({ ok: true });
  }
}

// ─── Status helper ───

async function sendStatusMessage(chatId: number) {
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const convex = new ConvexHttpClient((process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, ""));
  const chatIdStr = String(chatId);

  try {
    // Check driver state
    const driverState = await convex.query((api as any).telegramState.getByChatId, { chatId: chatIdStr });
    if (driverState && driverState.state !== "unknown") {
      const stateLabels: Record<string, string> = {
        registering: "📝 Sedang mendaftar sebagai driver",
        idle: "💤 Driver (offline)",
        online: "🟢 Driver (online, nunggu order)",
        offered: "🔔 Ada order masuk — balas YA atau GAK",
        picking_up: "🏍️ Lagi menuju lokasi jemput",
        at_pickup: "📍 Sudah di lokasi jemput",
        on_ride: "🛣️ Lagi mengantar penumpang",
      };
      const label = stateLabels[driverState.state] || driverState.state;
      let msg = `📊 Status kamu:\n\n${label}`;
      if (driverState.currentRideCode) {
        msg += `\n\n🎫 Ride aktif: ${driverState.currentRideCode}`;
      }
      await sendMessage(chatId, msg);
      return;
    }

    // Check passenger state
    const passengerState = await convex.query((api as any).passengerTelegram.getByChatId, { chatId: chatIdStr });
    if (passengerState && passengerState.currentRideCode) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gojek-mvp.vercel.app";
      await sendMessage(
        chatId,
        `📊 Status ride kamu:\n\n🎫 ${passengerState.currentRideCode}\n🔗 Track: ${appUrl}/track/${passengerState.currentRideCode}`,
      );
      return;
    }

    // No active state
    await sendMessageWithButtons(
      chatId,
      "📊 Kamu belum ada aktivitas nih.\n\nMau mulai apa?",
      mainMenuButtons,
    );
  } catch (error) {
    console.error("[TG Webhook] Status error:", error);
    await sendMessage(chatId, "Maaf, lagi ada gangguan 😅 Coba lagi bentar ya.");
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "telegram-webhook",
    bot: "NEMU RIDE",
    timestamp: new Date().toISOString(),
  });
}
