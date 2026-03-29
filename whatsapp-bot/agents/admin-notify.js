/**
 * Admin Notification System
 * Sends alerts to ADMIN_NUMBER via the central WhatsApp bot
 * Rate-limited to prevent spam
 */

const { normalizePhone } = require("../utils");

const ADMIN_NUMBER = normalizePhone(process.env.ADMIN_NUMBER || "");
const RATE_LIMIT_MS = 5 * 60 * 1000; // Max 1 notif per error type per 5 min

// Track last notification time per error type
const lastNotified = new Map();

let centralBotSocket = null;

function setCentralSocket(sock) {
  centralBotSocket = sock;
}

/**
 * Send notification to admin
 * @param {"warning"|"error"|"recovery"} severity
 * @param {string} message
 * @param {string} errorType - deduplicate key (e.g., "llm_timeout", "convex_down")
 */
async function notifyAdmin(severity, message, errorType = "general") {
  if (!ADMIN_NUMBER || !centralBotSocket) {
    console.warn(`[admin-notify] Cannot notify: admin=${!!ADMIN_NUMBER} sock=${!!centralBotSocket}`);
    return false;
  }

  // Rate limit check
  const lastTime = lastNotified.get(errorType) || 0;
  if (Date.now() - lastTime < RATE_LIMIT_MS) {
    return false; // Already notified recently
  }

  const icons = { warning: "⚠️", error: "🔴", recovery: "✅" };
  const icon = icons[severity] || "ℹ️";
  const timestamp = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const fullMessage = `${icon} *Nemu Agent Alert*\n${timestamp}\n\n${message}`;

  try {
    const jid = `${ADMIN_NUMBER}@s.whatsapp.net`;
    await centralBotSocket.sendMessage(jid, { text: fullMessage });
    lastNotified.set(errorType, Date.now());
    console.log(`[admin-notify] Sent ${severity}: ${errorType}`);
    return true;
  } catch (e) {
    console.error(`[admin-notify] Failed to send:`, e.message);
    return false;
  }
}

// ─── Convenience methods ───

async function warn(message, errorType) {
  return notifyAdmin("warning", message, errorType || "warning");
}

async function error(message, errorType) {
  return notifyAdmin("error", message, errorType || "error");
}

async function recovery(message, errorType) {
  return notifyAdmin("recovery", message, errorType || "recovery");
}

module.exports = { setCentralSocket, notifyAdmin, warn, error, recovery };
