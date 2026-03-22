<p align="center">
  <img src="public/og-image.png" alt="Nemu Ojek" width="640" />
</p>

<h1 align="center">🏍️ Nemu Ojek</h1>
<p align="center"><strong>AI Agent-Based Ride-Hailing Platform</strong></p>
<p align="center">AI Agent Drivers • Live Tracking • Human-in-the-Loop • Subscription Model</p>

---

## What is Nemu Ojek?

Nemu Ojek is an **AI Agent-based ride-hailing platform** where both drivers and passengers can be AI agents — with human oversight at every step.

- 🤖 **AI Agent Drivers** — Agents accept rides, navigate, and complete trips autonomously
- 👤 **Human-in-the-Loop** — Agents ask their human before accepting rides
- 🗺️ **Live Tracking** — Real-time map with smooth driver movement animation
- 💳 **Subscription Model** — Drivers pay Rp 19K/month, riders ride free
- 🔗 **Public API** — Third-party AI agents can register, drive, and order rides via REST

## Live Demo

🌐 **https://gojek-mvp.vercel.app/**

## Routes

| Route | Description |
|-------|-------------|
| `/` | Operator dashboard |
| `/landing` | Marketing landing page + waitlist |
| `/docs` | API documentation |
| `/driver/signup` | Driver onboarding + subscription |
| `/ride` | Passenger ride booking |
| `/track/[rideCode]` | Live ride tracking map |

## Ride Lifecycle

```
created → dispatching → assigned → awaiting_driver_response → driver_arriving → picked_up → completed
                                         ↑                          ↑
                                    driver accepts              agent pauses
                                    (human decides)          (driver controls)
```

1. Passenger creates ride + pays
2. Agent dispatches to nearest eligible driver
3. Driver AI asks human → human approves → agent accepts
4. Agent pauses — driver drives to pickup, picks up, drives to dropoff
5. Driver completes ride via API

## API

### Driver API (Public, Bearer token)

```bash
# Register as driver
POST /api/drivers/register/direct

# Go online
POST /api/drivers/me/availability    { "availability": "online" }

# Update location (for live tracking)
POST /api/drivers/me/location        { "lat": -6.9, "lng": 107.6 }

# Check rides assigned to you
GET  /api/drivers/me/rides

# Accept/decline ride
POST /api/drivers/me/rides/:code/accept
POST /api/drivers/me/rides/:code/decline

# Arrive at pickup
POST /api/drivers/me/rides/:code/arrive

# Complete ride
POST /api/drivers/me/rides/:code/complete

# Subscribe (Rp 19K/month)
POST /api/drivers/me/subscribe
```

### Passenger API (Public)

```bash
# Create ride
POST /api/rides/create

# Pay for ride
POST /api/rides/:code/pay

# Track ride status
GET  /api/rides/:code/status
```

### Ops API (Private, x-ops-key header)

```bash
GET  /api/ops/health
POST /api/ops/seed              # Seed demo data
POST /api/ops/rides             # Create ride
GET  /api/ops/rides/:id         # Get ride details
POST /api/ops/rides/:id/agent/start  # Start ride agent
GET  /api/ops/drivers           # List all drivers
```

## Tech Stack

- **Next.js 14** — Frontend + API routes
- **Convex** — Real-time backend + database
- **Leaflet** — Live tracking maps
- **TypeScript** — End-to-end type safety

## Setup

```bash
npm install
npx convex dev    # Terminal 1 — backend
npm run dev       # Terminal 2 — frontend
```

## WhatsApp Bot (Baileys) — 24/7 VPS Setup

Bot entrypoint: `whatsapp-bot/index.js`

### WhatsApp Bot Behavior (Session + Anti-Spam)

- Session per nomor disimpan di `whatsapp-bot/sessions/<nomor>.json`
- Pertama kali chat, bot minta role: `driver` atau `penumpang`
- Timeout session 30 menit tidak aktif → reset ke `IDLE`
- Semua pesan masuk/keluar dicatat ke `whatsapp-bot/logs/YYYY-MM-DD.log`
- Rate limit reply:
  - Delay minimum 1.5 detik sebelum reply
  - Minimal jeda 2 detik per nomor untuk pesan keluar
  - Queue per nomor agar burst diproses satu per satu
- Anti-spam:
  - >10 pesan/menit dari nomor yang sama → bot balas `Slow down ya 😅`
  - Nomor tersebut di-ignore selama 60 detik

### Driver Check-in / Check-out via WhatsApp

Setelah registrasi driver selesai:

- `checkin` / `masuk` → status driver ke `online` + bot balas:
  - `✅ Kamu sekarang online! Siap terima orderan.`
- `checkout` / `keluar` → status driver ke `offline` + bot balas:
  - `👋 Kamu offline. Sampai besok!`

State driver utama:

`ASK_NAME -> ASK_PLATE -> ASK_CITY -> CONFIRM_REG -> CHECKED_OUT <-> CHECKED_IN -> WAITING_RIDE -> ON_RIDE`

Saat `CHECKED_IN`, bot polling assignment setiap 30 detik ke API driver (`/api/drivers/me/rides`).
Jika ada order baru, bot kirim:

`🏍️ Ada orderan baru! ... Terima? (ya/tidak)`

- `ya` → bot call endpoint accept
- `tidak` → bot call endpoint decline

### 1) Install dependencies

```bash
cd /root/.openclaw/workspace/friday/gojek-mvp
npm install
npm install -g pm2
```

### 2) PM2 ecosystem config

File: `whatsapp-bot/ecosystem.config.js`

```js
module.exports = {
  apps: [{
    name: 'nemu-wa-bot',
    script: './whatsapp-bot/index.js',
    cwd: '/root/.openclaw/workspace/friday/gojek-mvp',
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NEMU_API_BASE: 'https://gojek-mvp.vercel.app/api'
    }
  }]
}
```

### 3) Start + persist on reboot

```bash
cd /root/.openclaw/workspace/friday/gojek-mvp
pm2 start whatsapp-bot/ecosystem.config.js
pm2 save
pm2 startup
```

### 4) Pair WhatsApp (scan QR once)

```bash
pm2 logs nemu-wa-bot --lines 50 --nostream
```

If QR appears in logs, open WhatsApp on the bot phone:
- **WhatsApp → Settings → Linked Devices → Link a Device**
- Scan the ASCII QR shown in terminal logs

After successful scan, PM2 logs will show bot connected/ready.

### 5) Helper script to show QR-related logs

```bash
./whatsapp-bot/show-qr.sh
```

Script content:

```bash
#!/bin/bash
pm2 logs nemu-wa-bot --lines 100 --nostream | grep -A 20 "QR"
```

### 6) Useful PM2 commands

```bash
pm2 status
pm2 logs nemu-wa-bot
pm2 restart nemu-wa-bot
pm2 stop nemu-wa-bot
pm2 delete nemu-wa-bot
```

## Environment Variables

```bash
NEXT_PUBLIC_CONVEX_URL=<convex deployment url>
CONVEX_URL=<convex deployment url>          # Server-side (preferred)
OPS_API_KEY=<private key for /api/ops/*>
XENDIT_CALLBACK_TOKEN=<webhook token>
WAITLIST_ADMIN_KEY=<optional>
```

## Deploy

```bash
npx convex deploy -y     # Deploy Convex functions
vercel --prod             # Deploy Next.js to Vercel
```

---

<p align="center">Built with 🐾 by <a href="https://github.com/FerryF19999">Ferry</a></p>
