# Gojek Agentic MVP (Convex + Next.js)

Runnable MVP for an operator-driven ride dispatch and payment flow.

## Implemented Scope

- Convex backend schema + functions
- Next.js operator dashboard (single page)
- Ride creation (pickup/dropoff/customer)
- Driver pool management (availability + mock location updates)
- Ranked top-3 dispatch suggestions + manual assign
- Ride lifecycle updates (`assigned -> driver_arriving -> picked_up -> completed`)
- QRIS payment stub via **Xendit** (chosen provider)
- Dev webhook handler with token check + idempotency
- Support agent action templates + audit log

## Tech

- Next.js 14
- Convex
- TypeScript

## Setup

```bash
cd gojek-agentic-mvp
npm install
npx convex dev
```

Keep `convex dev` running in one terminal (it generates `convex/_generated/*`).

In another terminal:

```bash
npm run dev
```

Open: `http://localhost:3000`

## Environment Variables

Create `.env.local` in `gojek-agentic-mvp/`:

```bash
NEXT_PUBLIC_CONVEX_URL=<your convex dev deployment url>
# Optional for server-side ops API (preferred over NEXT_PUBLIC_CONVEX_URL):
CONVEX_URL=<your convex deployment url>
XENDIT_CALLBACK_TOKEN=<dev-shared-token>
OPS_API_KEY=<private key for /api/ops/*>
```

For local demo webhook simulation, call Convex HTTP endpoint:

`POST https://<your-convex-deployment>.convex.site/webhooks/xendit`

Headers:

- `x-callback-token: <XENDIT_CALLBACK_TOKEN>`

Body sample:

```json
{
  "id": "xnd_qr_123456",
  "status": "PAID"
}
```

## Main Files

- `convex/schema.ts`
- `convex/rides.ts`
- `convex/drivers.ts`
- `convex/dispatch.ts`
- `convex/payments.ts`
- `convex/http.ts`
- `convex/webhooks.ts`
- `convex/agentActions.ts`
- `convex/seed.ts`
- `app/page.tsx`
- `components/convex-client-provider.tsx`

## Notes

- MVP uses web operator dashboard only (no mobile apps).
- Payment integration is a **stubbed Xendit QRIS flow** for dev/demo speed.
- Dispatch ranking uses Haversine distance + simple scoring.
- Private deterministic Ops API docs: `docs/ops-api.md`.
