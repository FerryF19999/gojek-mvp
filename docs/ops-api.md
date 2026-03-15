# Ops API (Private)

Private HTTP API for deterministic AI-agent operations.

Base path: `/api/ops/*`

## Auth

All endpoints require:

- Header: `x-ops-key: <OPS_API_KEY>`

If missing/mismatch, API returns `401 {"error":"Unauthorized"}`.

## Environment Variables

- `OPS_API_KEY` (required)
- `CONVEX_URL` (recommended; server-side Convex deployment URL)
- `NEXT_PUBLIC_CONVEX_URL` (fallback if `CONVEX_URL` not set)

## Endpoints

### 1) Health

`GET /api/ops/health`

Response:

```json
{
  "ok": true,
  "ts": "2026-03-15T14:00:00.000Z",
  "version": "0.1.0",
  "convexUrl": "https://xxx.convex.cloud",
  "buildSha": "abcdef1"
}
```

### 2) Seed drivers

`POST /api/ops/seed`

### 3) Create ride

`POST /api/ops/rides`

Body:

```json
{
  "customerName": "Alice",
  "customerPhone": "08123456789",
  "pickup": "Mall A",
  "dropoff": "Bandara B",
  "fare": 25000
}
```

Notes:
- `fare` is accepted for compatibility but not persisted in current MVP schema.
- Coordinates/vehicleType are mapped to MVP defaults.

### 4) Start ride agent

`POST /api/ops/rides/{rideId}/agent/start`

Body (optional):

```json
{ "speed": "fast" }
```

Allowed speed: `slow | normal | fast`

### 5) Generate QRIS demo

`POST /api/ops/rides/{rideId}/payment/qris`

### 6) Mark paid demo

`POST /api/ops/rides/{rideId}/payment/paid`

### 7) Ride detail

`GET /api/ops/rides/{rideId}`

Returns selected ride fields + timeline + agent actions + payments.

---

## cURL Examples

```bash
export BASE_URL="https://your-app.vercel.app"
export OPS_KEY="your-secret-ops-key"

curl -sS "$BASE_URL/api/ops/health" \
  -H "x-ops-key: $OPS_KEY"

curl -sS -X POST "$BASE_URL/api/ops/seed" \
  -H "x-ops-key: $OPS_KEY"

CREATE_RES=$(curl -sS -X POST "$BASE_URL/api/ops/rides" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{
    "customerName":"Alice",
    "customerPhone":"08123456789",
    "pickup":"Mall A",
    "dropoff":"Bandara B",
    "fare":25000
  }')

echo "$CREATE_RES"
RIDE_ID=$(echo "$CREATE_RES" | sed -n 's/.*"rideId":"\([^"]*\)".*/\1/p')

curl -sS -X POST "$BASE_URL/api/ops/rides/$RIDE_ID/agent/start" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"speed":"fast"}'

curl -sS -X POST "$BASE_URL/api/ops/rides/$RIDE_ID/payment/qris" \
  -H "x-ops-key: $OPS_KEY"

curl -sS -X POST "$BASE_URL/api/ops/rides/$RIDE_ID/payment/paid" \
  -H "x-ops-key: $OPS_KEY"

curl -sS "$BASE_URL/api/ops/rides/$RIDE_ID" \
  -H "x-ops-key: $OPS_KEY"
```
