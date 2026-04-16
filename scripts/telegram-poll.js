/**
 * Telegram Polling — Development helper
 *
 * Pulls updates from Telegram getUpdates and forwards them to local webhook.
 * No ngrok/deploy needed — great for local development.
 *
 * Usage:
 *   1. Start Next.js: npm run dev
 *   2. Start Convex: npx convex dev
 *   3. In another terminal: node scripts/telegram-poll.js
 *
 * The bot will use long-polling instead of webhook. This script does NOT
 * register a webhook — it coexists with webhook mode by pulling updates
 * directly. If you had a webhook registered, this will clear it first.
 */

const fs = require("fs");
const path = require("path");

// Load .env.local manually (Node doesn't auto-load it)
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not found in .env.local");
  process.exit(1);
}

const LOCAL_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WEBHOOK_PATH = "/api/telegram/webhook";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

const API = `https://api.telegram.org/bot${TOKEN}`;

let offset = 0;
let stopped = false;

async function clearWebhook() {
  try {
    const res = await fetch(`${API}/deleteWebhook?drop_pending_updates=false`);
    const data = await res.json();
    console.log("🧹 Webhook cleared:", data.description || "ok");
  } catch (e) {
    console.warn("⚠️  Failed to clear webhook:", e.message);
  }
}

async function getMe() {
  try {
    const res = await fetch(`${API}/getMe`);
    const data = await res.json();
    if (data.ok) {
      console.log(`🤖 Bot: @${data.result.username} (${data.result.first_name})`);
      console.log(`🔗 Deep link: https://t.me/${data.result.username}`);
    }
  } catch {}
}

async function forwardToWebhook(update) {
  const url = `${LOCAL_URL}${WEBHOOK_PATH}`;
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["x-telegram-bot-api-secret-token"] = SECRET;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(update),
    });

    const summary = update.message
      ? `msg "${(update.message.text || "[non-text]").slice(0, 40)}" from ${update.message.from?.first_name || "?"}`
      : update.callback_query
      ? `callback "${update.callback_query.data}" from ${update.callback_query.from.first_name || "?"}`
      : `update_id ${update.update_id}`;

    if (!res.ok) {
      console.log(`❌ [${res.status}] ${summary}`);
    } else {
      console.log(`✅ [${res.status}] ${summary}`);
    }
  } catch (e) {
    console.error(`❌ Forward failed: ${e.message}`);
    console.error(`   Make sure Next.js is running at ${LOCAL_URL}`);
  }
}

async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=25`, {
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();

    if (!data.ok) {
      console.error("❌ Telegram API error:", data.description);
      await new Promise((r) => setTimeout(r, 3000));
      return;
    }

    for (const update of data.result) {
      offset = update.update_id + 1;
      await forwardToWebhook(update);
    }
  } catch (e) {
    if (e.name !== "TimeoutError" && e.name !== "AbortError") {
      console.error("⚠️  Poll error:", e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log("🚀 NEMU RIDE Telegram Polling Mode");
  console.log(`📍 Forwarding to: ${LOCAL_URL}${WEBHOOK_PATH}`);
  console.log("   (Press Ctrl+C to stop)\n");

  await getMe();
  await clearWebhook();

  console.log("\n⏳ Waiting for messages...\n");

  while (!stopped) {
    await poll();
  }
}

process.on("SIGINT", () => {
  console.log("\n👋 Stopping polling...");
  stopped = true;
  process.exit(0);
});

main();
