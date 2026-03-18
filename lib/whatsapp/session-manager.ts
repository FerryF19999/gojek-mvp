/**
 * Multi-Session Baileys Manager — 1 Bot Per Driver
 * 
 * Manages multiple Baileys sessions (one per driver).
 * Each driver's WhatsApp is paired via QR code, and the bot lives
 * INSIDE the driver's own WhatsApp (like WhatsApp Web).
 * 
 * Architecture:
 *   Driver scans QR → Baileys session created → Bot sends/receives in driver's WA
 *   Messages from contacts → forwarded to webhook for processing
 *   Bot replies → sent as the driver's own WhatsApp messages (self-chat or to contacts)
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import pino from "pino";
import { EventEmitter } from "events";

const logger = pino({ level: "warn" });

export interface SessionInfo {
  sessionId: string;
  driverId?: string;
  phone?: string;
  status: "qr_pending" | "connecting" | "connected" | "disconnected" | "logged_out";
  qrCode?: string;
  lastConnectedAt?: number;
  createdAt: number;
  error?: string;
}

export interface SessionEvents {
  "qr": (sessionId: string, qr: string) => void;
  "connected": (sessionId: string, phone: string) => void;
  "disconnected": (sessionId: string, reason: string) => void;
  "message": (sessionId: string, message: IncomingDriverMessage) => void;
  "logged_out": (sessionId: string) => void;
}

export interface IncomingDriverMessage {
  sessionId: string;
  driverPhone: string;
  fromPhone: string;
  fromMe: boolean;
  text: string;
  hasImage: boolean;
  hasLocation: boolean;
  location?: { lat: number; lng: number };
  messageId?: string;
  timestamp?: number;
  /** True if this is a message in the driver's self-chat (Notes to Self) */
  isSelfChat: boolean;
}

const BASE_AUTH_DIR = process.env.SESSIONS_DIR || join(process.cwd(), ".baileys-sessions");
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "50");

/**
 * Multi-Session Baileys Manager
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, {
    socket: WASocket | null;
    info: SessionInfo;
    saveCreds: () => Promise<void>;
    reconnectTimer?: ReturnType<typeof setTimeout>;
    reconnectAttempts: number;
  }> = new Map();

  constructor() {
    super();
    if (!existsSync(BASE_AUTH_DIR)) {
      mkdirSync(BASE_AUTH_DIR, { recursive: true });
    }
  }

  /**
   * Get all sessions info
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s.info }));
  }

  /**
   * Get a specific session
   */
  getSession(sessionId: string): SessionInfo | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.info } : null;
  }

  /**
   * Get session by driver ID
   */
  getSessionByDriverId(driverId: string): SessionInfo | null {
    for (const session of this.sessions.values()) {
      if (session.info.driverId === driverId) return { ...session.info };
    }
    return null;
  }

  /**
   * Get session by phone number
   */
  getSessionByPhone(phone: string): SessionInfo | null {
    const normalized = normalizePhone(phone);
    for (const session of this.sessions.values()) {
      if (session.info.phone === normalized) return { ...session.info };
    }
    return null;
  }

  /**
   * Create a new session for a driver
   */
  async createSession(sessionId: string, driverId?: string): Promise<SessionInfo> {
    // Check max sessions
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum sessions (${MAX_SESSIONS}) reached`);
    }

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      if (existing.info.status === "connected") {
        return existing.info;
      }
      // Reconnect if disconnected
      await this.connectSession(sessionId);
      return this.sessions.get(sessionId)!.info;
    }

    const authDir = join(BASE_AUTH_DIR, sessionId);
    if (!existsSync(authDir)) {
      mkdirSync(authDir, { recursive: true });
    }

    const info: SessionInfo = {
      sessionId,
      driverId,
      status: "qr_pending",
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, {
      socket: null,
      info,
      saveCreds: async () => {},
      reconnectAttempts: 0,
    });

    // Start connection
    await this.connectSession(sessionId);

    return this.sessions.get(sessionId)!.info;
  }

  /**
   * Connect/reconnect a session
   */
  private async connectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const authDir = join(BASE_AUTH_DIR, sessionId);
    if (!existsSync(authDir)) {
      mkdirSync(authDir, { recursive: true });
    }

    session.info.status = "connecting";

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      session.saveCreds = saveCreds;

      const sock = makeWASocket({
        version,
        logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false, // We handle QR ourselves
        generateHighQualityLinkPreview: false,
        getMessage: async () => proto.Message.fromObject({}),
      });

      session.socket = sock;

      // Save credentials
      sock.ev.on("creds.update", saveCreds);

      // Connection updates
      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          session.info.status = "qr_pending";
          session.info.qrCode = qr;
          console.log(`[SessionManager] QR generated for session ${sessionId}`);
          this.emit("qr", sessionId, qr);
        }

        if (connection === "close") {
          session.socket = null;
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[SessionManager] Session ${sessionId} disconnected (${statusCode}). Reconnect: ${shouldReconnect}`);

          if (shouldReconnect) {
            session.info.status = "disconnected";
            session.info.error = `Disconnected (code ${statusCode})`;
            this.emit("disconnected", sessionId, `Code ${statusCode}`);

            // Auto-reconnect with backoff
            if (session.reconnectAttempts < 5) {
              session.reconnectAttempts++;
              const delay = 5000 * session.reconnectAttempts;
              console.log(`[SessionManager] Reconnecting ${sessionId} in ${delay}ms (attempt ${session.reconnectAttempts})`);
              session.reconnectTimer = setTimeout(() => {
                this.connectSession(sessionId).catch(console.error);
              }, delay);
            }
          } else {
            session.info.status = "logged_out";
            session.info.error = "Logged out from WhatsApp";
            console.log(`[SessionManager] Session ${sessionId} logged out`);
            this.emit("logged_out", sessionId);
          }
        }

        if (connection === "open") {
          session.info.status = "connected";
          session.info.qrCode = undefined;
          session.info.error = undefined;
          session.info.lastConnectedAt = Date.now();
          session.reconnectAttempts = 0;

          // Extract phone number from socket
          const me = sock.user;
          if (me?.id) {
            session.info.phone = me.id.split(":")[0].split("@")[0];
            console.log(`[SessionManager] Session ${sessionId} connected as ${session.info.phone}`);
          }

          this.emit("connected", sessionId, session.info.phone || "unknown");
        }
      });

      // Track connection time — only process messages AFTER this timestamp
      const connectedAt = Math.floor(Date.now() / 1000);

      // Handle incoming messages
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          // Skip status broadcasts
          if (msg.key.remoteJid === "status@broadcast") continue;
          // Skip group messages for now
          if (msg.key.remoteJid?.endsWith("@g.us")) continue;

          // Only skip very old messages (more than 30 seconds before connection)
          const msgTimestamp = typeof msg.messageTimestamp === "number" 
            ? msg.messageTimestamp 
            : typeof msg.messageTimestamp === "object" && msg.messageTimestamp 
              ? Number(msg.messageTimestamp) 
              : 0;
          if (msgTimestamp > 0 && msgTimestamp < connectedAt - 30) {
            console.log(`[SessionManager] ⏭️ Skipping old message (ts: ${msgTimestamp}, connectedAt: ${connectedAt}, diff: ${connectedAt - msgTimestamp}s)`);
            continue;
          }

          const remoteJid = msg.key.remoteJid || "";
          const fromPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "") || "";
          const driverPhone = session.info.phone || "";
          // Self-chat: either phone match OR fromMe with LID format (WA uses @lid for self-chat now)
          const isLidFormat = remoteJid.endsWith("@lid");
          const isSelfChat = fromPhone === driverPhone || (msg.key.fromMe && isLidFormat);
          const fromMe = msg.key.fromMe || false;

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";
          const hasImage = !!msg.message?.imageMessage;
          const hasLocation = !!msg.message?.locationMessage;

          // We care about messages FROM the driver (self-chat or fromMe)
          // AND messages from customers TO the driver
          const driverMessage: IncomingDriverMessage = {
            sessionId,
            driverPhone,
            fromPhone,
            fromMe: fromMe || false,
            text,
            hasImage,
            hasLocation,
            location: hasLocation
              ? {
                  lat: msg.message?.locationMessage?.degreesLatitude || 0,
                  lng: msg.message?.locationMessage?.degreesLongitude || 0,
                }
              : undefined,
            messageId: msg.key.id || undefined,
            timestamp: typeof msg.messageTimestamp === "number" ? msg.messageTimestamp : undefined,
            isSelfChat: isSelfChat ?? false,
          };

          console.log(`[SessionManager] 📨 RAW msg: from=${fromPhone} driver=${driverPhone} fromMe=${fromMe} isSelfChat=${isSelfChat} text="${(text||'').substring(0,50)}" ts=${msgTimestamp}`);

          // Process fromMe messages (driver typing commands) — anti-loop handled by botSentMessages
          // Also process incoming from others (!fromMe) if it's self-chat or direct message
          if (fromMe) {
            console.log(`[SessionManager] 📩 Driver ${driverPhone} command: "${text}" (selfChat=${isSelfChat})`);
            this.emit("message", sessionId, driverMessage);
          } else if (!fromMe && isSelfChat) {
            // Bot's reply appearing in self-chat — skip to avoid loop
            continue;
          } else if (!fromMe) {
            console.log(`[SessionManager] 📩 Incoming to driver ${driverPhone} from ${fromPhone}: "${text}"`);
            this.emit("message", sessionId, driverMessage);

            // Forward to webhook
            this.forwardToWebhook(sessionId, driverMessage).catch(console.error);
          }
        }
      });

    } catch (error) {
      console.error(`[SessionManager] Failed to connect session ${sessionId}:`, error);
      session.info.status = "disconnected";
      session.info.error = String(error);
    }
  }

  /**
   * Forward driver message to webhook for processing
   */
  private async forwardToWebhook(sessionId: string, msg: IncomingDriverMessage): Promise<void> {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (webhookSecret) headers["x-webhook-secret"] = webhookSecret;

      const payload = {
        // Include sessionId so webhook knows which driver session this is from
        sessionId,
        phone: msg.driverPhone,
        text: msg.text,
        hasImage: msg.hasImage,
        hasLocation: msg.hasLocation,
        location: msg.location,
        messageId: msg.messageId,
        timestamp: msg.timestamp,
        // New fields for per-driver bot
        isDriverBot: true,
        driverPhone: msg.driverPhone,
        fromMe: msg.fromMe,
        isSelfChat: msg.isSelfChat,
      };

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        // Send replies back via the driver's own WhatsApp
        if (data.replies && Array.isArray(data.replies)) {
          for (const reply of data.replies) {
            if (reply.text) {
              // Send as self-chat (Notes to Self) — the driver sees it in their own WA
              await this.sendToDriver(sessionId, reply.text);
            }
          }
        }
      } else {
        console.error(`[SessionManager] Webhook error for ${sessionId}: ${res.status}`);
      }
    } catch (err) {
      console.error(`[SessionManager] Webhook call failed for ${sessionId}:`, err);
    }
  }

  /**
   * Send a message to the driver's own WhatsApp (self-chat / Notes to Self)
   */
  async sendToDriver(sessionId: string, text: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket || session.info.status !== "connected") {
      console.warn(`[SessionManager] Cannot send to ${sessionId}: not connected`);
      return null;
    }

    const driverPhone = session.info.phone;
    if (!driverPhone) {
      console.warn(`[SessionManager] Cannot send to ${sessionId}: no phone number`);
      return null;
    }

    try {
      // Send to driver's own number (self-chat)
      const jid = `${driverPhone}@s.whatsapp.net`;
      const sentMsg = await session.socket.sendMessage(jid, { text });
      console.log(`[SessionManager] 📤 Sent to driver ${driverPhone}: "${text.substring(0, 50)}..." (msgId: ${sentMsg?.key?.id})`);
      return sentMsg;
    } catch (error) {
      console.error(`[SessionManager] Failed to send to ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Send message to any number from the driver's WhatsApp
   */
  async sendMessage(sessionId: string, phone: string, text: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket || session.info.status !== "connected") {
      return null;
    }

    try {
      const jid = formatJid(phone);
      const sentMsg = await session.socket.sendMessage(jid, { text });
      console.log(`[SessionManager] 📤 Sent to ${phone}: "${text.substring(0, 50)}..." (msgId: ${sentMsg?.key?.id})`);
      return sentMsg;
    } catch (error) {
      console.error(`[SessionManager] sendMessage failed for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Send message to driver by driverId (looks up session)
   */
  async sendToDriverById(driverId: string, text: string): Promise<boolean> {
    for (const [sessionId, session] of this.sessions) {
      if (session.info.driverId === driverId) {
        return this.sendToDriver(sessionId, text);
      }
    }
    console.warn(`[SessionManager] No session found for driver ${driverId}`);
    return false;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clear reconnect timer
      if (session.reconnectTimer) clearTimeout(session.reconnectTimer);

      // Logout if connected
      if (session.socket) {
        try {
          await session.socket.logout();
        } catch (e) {
          // Ignore logout errors
        }
      }

      this.sessions.delete(sessionId);
    }

    // Remove auth directory
    const authDir = join(BASE_AUTH_DIR, sessionId);
    if (existsSync(authDir)) {
      rmSync(authDir, { recursive: true, force: true });
    }

    console.log(`[SessionManager] Session ${sessionId} deleted`);
  }

  /**
   * Restore all sessions from disk on startup
   */
  async restoreAllSessions(): Promise<void> {
    if (!existsSync(BASE_AUTH_DIR)) return;

    const dirs = readdirSync(BASE_AUTH_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    console.log(`[SessionManager] Restoring ${dirs.length} sessions...`);

    for (const sessionId of dirs) {
      try {
        await this.createSession(sessionId);
        console.log(`[SessionManager] Restored session: ${sessionId}`);
      } catch (error) {
        console.error(`[SessionManager] Failed to restore ${sessionId}:`, error);
      }
    }
  }

  /**
   * Get stats
   */
  getStats() {
    const sessions = this.getAllSessions();
    return {
      total: sessions.length,
      connected: sessions.filter(s => s.status === "connected").length,
      disconnected: sessions.filter(s => s.status === "disconnected").length,
      qrPending: sessions.filter(s => s.status === "qr_pending").length,
      maxSessions: MAX_SESSIONS,
    };
  }

  /**
   * Shutdown all sessions gracefully
   */
  async shutdown(): Promise<void> {
    console.log("[SessionManager] Shutting down all sessions...");
    for (const [sessionId, session] of this.sessions) {
      if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
      if (session.socket) {
        try {
          session.socket.end(undefined);
        } catch (e) {}
      }
    }
    this.sessions.clear();
  }
}

// ─── Helpers ───

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "").replace(/@s\.whatsapp\.net/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  return cleaned;
}

function formatJid(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (!cleaned.includes("@")) cleaned += "@s.whatsapp.net";
  return cleaned;
}

// ─── Singleton ───

let _manager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!_manager) {
    _manager = new SessionManager();
  }
  return _manager;
}
