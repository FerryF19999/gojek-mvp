/**
 * Standalone Baileys WhatsApp Server
 * 
 * Run with: npx tsx scripts/baileys-server.ts
 * 
 * This process:
 * 1. Connects to WhatsApp via QR code scan
 * 2. Forwards incoming messages to the webhook endpoint
 * 3. Exposes HTTP server for sending messages
 * 
 * Environment variables:
 *   WEBHOOK_URL       — URL to forward messages to (default: http://localhost:3000/api/whatsapp/webhook)
 *   WEBHOOK_SECRET    — Secret for webhook auth
 *   PORT              — HTTP server port (default: 3001)
 *   AUTH_DIR           — Baileys auth directory (default: .baileys-auth)
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import pino from "pino";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const PORT = parseInt(process.env.PORT || "3001");
const AUTH_DIR = process.env.AUTH_DIR || join(process.cwd(), ".baileys-auth");

const logger = pino({ level: "warn" });

let sock: ReturnType<typeof makeWASocket> | null = null;
let isConnected = false;

async function connectWhatsApp() {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[Baileys] Using version: ${version.join(".")}`);

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true,
    generateHighQualityLinkPreview: false,
    getMessage: async () => proto.Message.fromObject({}),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[Baileys] =====================");
      console.log("[Baileys] SCAN QR CODE ABOVE ☝️");
      console.log("[Baileys] =====================\n");
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[Baileys] Disconnected (${statusCode}). Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 5000);
      } else {
        console.log("[Baileys] Logged out. Delete .baileys-auth and restart.");
        process.exit(1);
      }
    }

    if (connection === "open") {
      isConnected = true;
      console.log("[Baileys] ✅ Connected to WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      const phone = msg.key.remoteJid?.replace("@s.whatsapp.net", "") || "";
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      const hasImage = !!msg.message?.imageMessage;
      const hasLocation = !!msg.message?.locationMessage;

      const payload = {
        phone,
        text,
        hasImage,
        hasLocation,
        location: hasLocation
          ? {
              lat: msg.message?.locationMessage?.degreesLatitude,
              lng: msg.message?.locationMessage?.degreesLongitude,
            }
          : undefined,
        messageId: msg.key.id,
        timestamp: msg.messageTimestamp,
      };

      console.log(`[Baileys] 📩 From ${phone}: "${text}"`);

      // Forward to webhook
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (WEBHOOK_SECRET) headers["x-webhook-secret"] = WEBHOOK_SECRET;

        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          // Send replies back via WhatsApp
          if (data.replies && Array.isArray(data.replies)) {
            for (const reply of data.replies) {
              if (reply.phone && reply.text) {
                const jid = formatJid(reply.phone);
                console.log(`[Baileys] 📤 To ${reply.phone}: "${reply.text.substring(0, 50)}..."`);
                await sock!.sendMessage(jid, { text: reply.text });
              }
            }
          }
        } else {
          console.error(`[Baileys] Webhook error: ${res.status}`);
        }
      } catch (err) {
        console.error("[Baileys] Webhook call failed:", err);
      }
    }
  });
}

// HTTP server for external send requests
function startHttpServer() {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ connected: isConnected }));
      return;
    }

    if (req.method === "POST" && req.url === "/send") {
      if (!sock || !isConnected) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not connected to WhatsApp" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { phone, text } = JSON.parse(body);
          if (!phone || !text) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "phone and text required" }));
            return;
          }

          const jid = formatJid(phone);
          await sock!.sendMessage(jid, { text });
          console.log(`[HTTP] 📤 Sent to ${phone}`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(`[HTTP] Send server running on port ${PORT}`);
    console.log(`[HTTP] POST /send { phone, text } — send a message`);
    console.log(`[HTTP] GET /status — check connection status`);
  });
}

function formatJid(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (!cleaned.includes("@")) cleaned += "@s.whatsapp.net";
  return cleaned;
}

// Main
console.log("=================================");
console.log("  NEMU Ojek — WhatsApp Bridge");
console.log("=================================");
console.log(`  Webhook: ${WEBHOOK_URL}`);
console.log(`  HTTP Port: ${PORT}`);
console.log(`  Auth Dir: ${AUTH_DIR}`);
console.log("=================================\n");

startHttpServer();
connectWhatsApp().catch(console.error);
