# Per-Driver Bot Architecture — 1 Bot Per Driver

## Overview

Instead of 1 NEMU WhatsApp number that all drivers chat to, each driver gets their OWN bot inside their OWN WhatsApp (like how OpenClaw works — bot lives inside the user's WhatsApp).

## How It Works

```
Driver → visits /driver/register → sees QR code
  → scans QR with WhatsApp (like pairing WhatsApp Web)
  → Baileys session created for that driver
  → fills registration form (name, vehicle, plate, city)
  → registered! Bot is now live in driver's WhatsApp

Driver → types "MULAI" in self-chat → goes online
  → order comes in → bot sends notification to self-chat
  → driver replies "YA" → accepts order
  → full ride flow via self-chat messages
```

## Files Created/Modified

### New Files
| File | Description |
|------|-------------|
| `lib/whatsapp/session-manager.ts` | Multi-session Baileys manager (1 per driver) |
| `scripts/baileys-multi-server.ts` | HTTP + WebSocket server for multi-session management |
| `convex/driverSessions.ts` | Convex CRUD for driver WhatsApp sessions |
| `app/driver/register/page.tsx` | QR pairing + registration form |
| `app/driver/dashboard/page.tsx` | Driver dashboard (status, orders, earnings) |
| `app/api/whatsapp/sessions/route.ts` | Session list/create API proxy |
| `app/api/whatsapp/sessions/[sessionId]/route.ts` | Session info/delete API proxy |
| `app/api/whatsapp/sessions/[sessionId]/qr/route.ts` | Session QR code API proxy |

### Modified Files
| File | Changes |
|------|---------|
| `convex/schema.ts` | Added `driverWhatsappSessions` table |
| `lib/whatsapp/index.ts` | Exports new SessionManager + types |
| `lib/whatsapp/bridge.ts` | `handleRideOffer` now supports per-driver bot delivery |
| `app/api/whatsapp/webhook/route.ts` | Handles per-driver bot messages + session sync |
| `app/api/whatsapp/send/route.ts` | Supports multi-session sending |
| `package.json` | Added `wa:multi` script, `ws` dependency |

## Running

### Start Multi-Session Server
```bash
# Start the multi-session Baileys server (port 3002)
npm run wa:multi

# Start Next.js
npm run dev
```

### Environment Variables
```env
# Multi-session Baileys server URL (for Next.js to call)
BAILEYS_MULTI_URL=http://localhost:3002
NEXT_PUBLIC_BAILEYS_MULTI_URL=http://localhost:3002

# Where to store Baileys auth data (1 folder per session)
SESSIONS_DIR=.baileys-sessions

# Max concurrent driver sessions
MAX_SESSIONS=50

# Webhook URL (Baileys → Next.js)
WEBHOOK_URL=http://localhost:3000/api/whatsapp/webhook
```

## API Endpoints (Baileys Multi-Server, port 3002)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Server stats (connected/disconnected/total) |
| GET | `/sessions` | List all sessions |
| POST | `/sessions/create` | Create new session `{ sessionId, driverId? }` |
| GET | `/sessions/:id` | Get session info |
| GET | `/sessions/:id/qr` | Get QR code (base64 PNG data URL) |
| POST | `/sessions/:id/send` | Send to driver's self-chat `{ text }` |
| POST | `/sessions/:id/send-to` | Send to any number `{ phone, text }` |
| POST | `/sessions/:id/notify` | Send order notification `{ text }` |
| DELETE | `/sessions/:id` | Delete session + auth data |
| WS | `/ws` | Real-time events (qr, connected, disconnected, message) |

## WebSocket Events

Connect to `ws://localhost:3002/ws` for real-time updates:

```json
{ "event": "init", "data": { "stats": {...}, "sessions": [...] } }
{ "event": "qr", "data": { "sessionId": "...", "qr": "data:image/png;base64,..." } }
{ "event": "connected", "data": { "sessionId": "...", "phone": "628xxx" } }
{ "event": "disconnected", "data": { "sessionId": "...", "reason": "..." } }
{ "event": "message", "data": { "sessionId": "...", "text": "MULAI", "fromMe": true } }
```

## Convex Schema (driverWhatsappSessions)

```typescript
driverWhatsappSessions: defineTable({
  sessionId: v.string(),         // Unique session identifier
  driverId: v.optional(v.string()),  // Linked driver ID (after registration)
  phone: v.optional(v.string()),     // Driver's phone number (detected after pairing)
  status: v.union("qr_pending", "connecting", "connected", "disconnected", "logged_out"),
  lastConnectedAt: v.optional(v.number()),
  registrationData: v.optional(v.object({...})),  // Form data during registration
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

## Session Lifecycle

```
CREATE → QR_PENDING → CONNECTING → CONNECTED → (normal operation)
                                        ↓
                                  DISCONNECTED → (auto-reconnect) → CONNECTED
                                        ↓
                                  LOGGED_OUT → (must re-pair)
```

## How Messages Flow (Per-Driver Bot)

```
1. Driver types "MULAI" in their WhatsApp
   ↓
2. Baileys session captures message (fromMe=true)
   ↓
3. SessionManager forwards to webhook (POST /api/whatsapp/webhook)
   ↓
4. Bridge processes through state machine
   ↓
5. Bridge returns reply
   ↓
6. SessionManager sends reply to driver's self-chat
   ↓
7. Driver sees "✅ Kamu ONLINE!" in their WhatsApp
```

## Backward Compatibility

The legacy single-bot architecture (`baileys-server.ts`) still works.
Both modes can run simultaneously — the webhook handler detects which
mode each message came from via the `isDriverBot` field.

## Capacity

- MVP target: 10-50 concurrent sessions
- Each session: ~5-10MB memory (Baileys + Signal Protocol state)
- Auth data persisted to disk (survives restarts)
- Auto-reconnect with exponential backoff (max 5 attempts)

## After Deploy (Convex)

Run `npx convex deploy` to push the new schema + functions to Convex.
This will generate the proper TypeScript types for `driverSessions`.
