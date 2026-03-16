/**
 * NEMU Ojek WhatsApp Bridge
 * 
 * Architecture (2 modes):
 * 
 * === Mode 1: Single Bot (legacy) ===
 *   Baileys (baileys-server.ts) → webhook → bridge.ts → state-machine → NEMU API → reply
 *   - 1 NEMU WhatsApp number, all drivers chat to it
 * 
 * === Mode 2: Per-Driver Bot (new) ===
 *   Baileys Multi (baileys-multi-server.ts) → webhook → bridge.ts → state-machine → NEMU API → self-chat reply
 *   - Each driver has their own bot inside their own WhatsApp
 *   - Driver pairs via QR code at /driver/register
 *   - Bot lives in driver's WhatsApp (like WhatsApp Web)
 *   - Messages sent to driver's self-chat (Notes to Self)
 * 
 * Files:
 *   - baileys-client.ts        — Single Baileys connection wrapper (legacy)
 *   - session-manager.ts       — Multi-session Baileys manager (1 per driver)
 *   - bridge.ts                — Main message handler (routes to state machine + API)
 *   - state-machine.ts         — Driver state transitions
 *   - intent-matcher.ts        — Keyword-based intent detection (90% of messages)
 *   - ai-fallback.ts           — MiniMax M2 for unrecognized messages (10%)
 *   - message-templates.ts     — All Indonesian response templates
 * 
 * How to run:
 *   Mode 1 (Single Bot):
 *     1. Start Next.js: npm run dev
 *     2. Start Baileys: npm run wa:server
 *     3. Scan QR code with WhatsApp
 * 
 *   Mode 2 (Per-Driver Bot):
 *     1. Start Next.js: npm run dev
 *     2. Start Multi-Session: npm run wa:multi
 *     3. Drivers register at /driver/register → scan QR
 * 
 * State flow:
 *   unknown → [DAFTAR / web register] → registering/idle
 *   idle → [MULAI] → online → [order] → offered → [YA] → picking_up
 *   picking_up → [SAMPE] → at_pickup → [JALAN] → on_ride → [DONE] → online
 */

export { handleMessage, handleRideOffer } from "./bridge";
export type { IncomingMessage, OutgoingMessage } from "./bridge";
export { matchIntent } from "./intent-matcher";
export type { Intent } from "./intent-matcher";
export { getTransition } from "./state-machine";
export type { DriverState, DriverWhatsappState } from "./state-machine";
export { templates } from "./message-templates";
export { SessionManager, getSessionManager } from "./session-manager";
export type { SessionInfo, IncomingDriverMessage } from "./session-manager";
