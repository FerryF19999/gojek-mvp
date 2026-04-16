/**
 * Telegram Webhook Setup — Register/remove webhook with Telegram Bot API
 * Also sets the bot's command menu, description, and branding.
 *
 * POST /api/telegram/setup — Register webhook + commands
 * DELETE /api/telegram/setup — Remove webhook
 * GET /api/telegram/setup — Check bot info
 */

import { NextRequest, NextResponse } from "next/server";
import {
  setWebhook,
  deleteWebhook,
  getMe,
  setBotCommands,
  setBotDescription,
  setBotShortDescription,
} from "@/lib/telegram/bot";

const OPS_API_KEY = process.env.OPS_API_KEY || "";

function checkAuth(req: NextRequest): boolean {
  if (!OPS_API_KEY) return true;
  const key = req.headers.get("x-ops-key") || req.headers.get("authorization");
  return key === OPS_API_KEY || key === `Bearer ${OPS_API_KEY}`;
}

// NEMU RIDE branded commands shown in Telegram's "/" menu
const NEMU_COMMANDS = [
  { command: "start", description: "🏠 Menu utama NEMU RIDE" },
  { command: "pesan", description: "🛵 Pesan ojek" },
  { command: "daftar", description: "🏍️ Daftar jadi driver" },
  { command: "mulai", description: "🟢 Driver: mulai terima order" },
  { command: "stop", description: "🔴 Driver: offline" },
  { command: "gaji", description: "💰 Cek penghasilan driver" },
  { command: "status", description: "📊 Cek status ride/driver" },
  { command: "batal", description: "❌ Batal pesan ride" },
  { command: "help", description: "❓ Bantuan" },
];

const BOT_DESCRIPTION = `NEMU RIDE 🏍️

Ride-hailing tanpa komisi — 100% penghasilan buat driver.

✅ Pesan ojek kapan aja
✅ Daftar jadi driver gratis
✅ Bayar cash, OVO, GoPay, atau DANA
✅ Live tracking real-time

Ketik /start buat mulai.`;

const BOT_SHORT_DESCRIPTION = `Ride-hailing tanpa komisi. Pesan ojek atau jadi driver langsung dari Telegram.`;

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl =
      body.url ||
      process.env.NEXT_PUBLIC_APP_URL ||
      `https://${req.headers.get("host")}`;

    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;

    const results: Record<string, any> = {};

    // 1. Set webhook
    results.webhook = await setWebhook(webhookUrl, secret);

    // 2. Set commands menu
    try {
      results.commands = await setBotCommands(NEMU_COMMANDS);
    } catch (e: any) {
      results.commandsError = e.message;
    }

    // 3. Set description (shown when opening bot profile)
    try {
      results.description = await setBotDescription(BOT_DESCRIPTION);
    } catch (e: any) {
      results.descriptionError = e.message;
    }

    // 4. Set short description (shown in bot header)
    try {
      results.shortDescription = await setBotShortDescription(BOT_SHORT_DESCRIPTION);
    } catch (e: any) {
      results.shortDescriptionError = e.message;
    }

    return NextResponse.json({
      ok: true,
      webhookUrl,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to setup bot" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await deleteWebhook();
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete webhook" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await getMe();
    return NextResponse.json({
      ok: true,
      bot: me,
      botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || me.username,
      deepLinks: {
        driver: `https://t.me/${me.username}?start=driver`,
        passenger: `https://t.me/${me.username}?start=passenger`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to get bot info" },
      { status: 500 },
    );
  }
}
