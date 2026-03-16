/**
 * Baileys Client — WhatsApp connection wrapper with auto-reconnect
 * 
 * This is a singleton that manages the Baileys WebSocket connection.
 * It runs as a standalone process (not inside Next.js API routes).
 * 
 * For Next.js integration, messages are sent via the /api/whatsapp/send endpoint
 * and received via webhook callbacks.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  WAMessageContent,
  WAMessageKey,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import pino from "pino";

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || join(process.cwd(), ".baileys-auth");
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";

const logger = pino({ level: "warn" });

let sock: WASocket | null = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5000;

/**
 * Get or create the Baileys socket connection
 */
export async function getSocket(): Promise<WASocket> {
  if (sock) return sock;
  return connectSocket();
}

/**
 * Connect to WhatsApp via Baileys
 */
export async function connectSocket(): Promise<WASocket> {
  if (isConnecting) {
    // Wait for current connection attempt
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (sock && !isConnecting) {
          clearInterval(check);
          resolve(sock);
        }
      }, 500);
    });
  }

  isConnecting = true;

  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true,
    generateHighQualityLinkPreview: false,
    getMessage: async (key: WAMessageKey): Promise<WAMessageContent | undefined> => {
      return proto.Message.fromObject({});
    },
  });

  // Save credentials on update
  sock.ev.on("creds.update", saveCreds);

  // Handle connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[Baileys] QR Code generated — scan with WhatsApp");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[Baileys] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`
      );

      sock = null;

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * reconnectAttempts;
        console.log(`[Baileys] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => connectSocket(), delay);
      } else if (!shouldReconnect) {
        console.log("[Baileys] Logged out. Delete auth folder and rescan QR.");
      } else {
        console.error("[Baileys] Max reconnect attempts reached. Giving up.");
      }
    }

    if (connection === "open") {
      console.log("[Baileys] Connected to WhatsApp!");
      isConnecting = false;
      reconnectAttempts = 0;
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip messages from self
      if (msg.key.fromMe) continue;
      // Skip status/broadcast
      if (msg.key.remoteJid === "status@broadcast") continue;

      const phone = msg.key.remoteJid?.replace("@s.whatsapp.net", "") || "";
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || "";
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

      // Forward to webhook handler
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error(`[Baileys] Webhook error: ${res.status} ${await res.text()}`);
        }
      } catch (err) {
        console.error("[Baileys] Failed to forward message to webhook:", err);
      }
    }
  });

  isConnecting = false;
  return sock;
}

/**
 * Send a text message to a phone number
 */
export async function sendMessage(phone: string, text: string): Promise<void> {
  const socket = await getSocket();
  const jid = formatJid(phone);
  await socket.sendMessage(jid, { text });
}

/**
 * Send a message with a location
 */
export async function sendLocation(
  phone: string,
  lat: number,
  lng: number,
  name?: string,
): Promise<void> {
  const socket = await getSocket();
  const jid = formatJid(phone);
  await socket.sendMessage(jid, {
    location: {
      degreesLatitude: lat,
      degreesLongitude: lng,
      name: name || "Lokasi",
    },
  });
}

/**
 * Format phone number to WhatsApp JID
 */
function formatJid(phone: string): string {
  // Remove +, spaces, dashes
  let cleaned = phone.replace(/[\s\-\+]/g, "");
  // Convert 08xx to 628xx
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  // Add @s.whatsapp.net if not present
  if (!cleaned.includes("@")) {
    cleaned += "@s.whatsapp.net";
  }
  return cleaned;
}

/**
 * Normalize incoming phone to standard format (628xxx)
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+@s.whatsapp.net]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
  return sock !== null;
}

/**
 * Disconnect
 */
export async function disconnect(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
  }
}
