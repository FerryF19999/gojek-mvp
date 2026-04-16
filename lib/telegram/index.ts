/**
 * NEMU RIDE Telegram Bot
 *
 * Architecture:
 *   Telegram Bot API → Webhook (POST /api/telegram/webhook)
 *   → bridge.ts (driver flow) or passenger-bot.ts (passenger flow)
 *   → state-machine → NEMU API → Telegram sendMessage
 *
 * Files:
 *   - bot.ts                — Telegram Bot API wrapper (sendMessage, setWebhook, etc.)
 *   - bridge.ts             — Main driver message handler (routes to state machine + API)
 *   - passenger-bot.ts      — Passenger booking flow
 *   - state-machine.ts      — Driver state transitions (reused from WhatsApp)
 *   - intent-matcher.ts     — Keyword-based intent detection (reused from WhatsApp)
 *   - ai-fallback.ts        — AI for unrecognized messages (reused from WhatsApp)
 *   - message-templates.ts  — All Indonesian response templates (reused from WhatsApp)
 *
 * How to run:
 *   1. Create bot via @BotFather, get TELEGRAM_BOT_TOKEN
 *   2. Start Next.js: npm run dev
 *   3. Set webhook: POST /api/telegram/setup
 *   4. Users chat to @YourBotUsername
 *
 * State flow (same as WhatsApp):
 *   unknown → [DAFTAR] → registering → idle
 *   idle → [MULAI] → online → [order] → offered → [YA] → picking_up
 *   picking_up → [SAMPE] → at_pickup → [JALAN] → on_ride → [DONE] → online
 */

export { handleDriverMessage, handleRideOffer } from "./bridge";
export type { IncomingTelegramMessage } from "./bridge";
export { handlePassengerMessage } from "./passenger-bot";
export { sendMessage, sendMessageWithButtons, setWebhook, getMe } from "./bot";
export type { TelegramUpdate, TelegramMessage, TelegramUser } from "./bot";
export { matchIntent } from "./intent-matcher";
export type { Intent } from "./intent-matcher";
export { getTransition } from "./state-machine";
export type { DriverTelegramState } from "./state-machine";
export { templates } from "./message-templates";
