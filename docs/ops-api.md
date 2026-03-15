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
  "pickupLat": -6.914744,
  "pickupLng": 107.60981,
  "dropoffLat": -6.208763,
  "dropoffLng": 106.845599,
  "vehicleType": "car",
  "fare": 25000
}
```

Notes:
- Optional fields:
  - `pickupLat`, `pickupLng` (defaults: `-6.2`, `106.816666`)
  - `dropoffLat`, `dropoffLng` (defaults: `-6.21`, `106.82`)
  - `vehicleType`: `"motor" | "car"` (default: `"motor"`)
  - `fare` (IDR) overrides computed ride fare and is persisted to `ride.price.amount`
- Validation:
  - Latitude must be `-90..90`
  - Longitude must be `-180..180`
  - `fare` must be `> 0`

### 4) Geocode address (cached)

`POST /api/ops/geocode`

Body:

```json
{ "query": "Dago, Bandung" }
```

Response:

```json
{
  "ok": true,
  "query": "Dago, Bandung",
  "lat": -6.8892,
  "lng": 107.6133,
  "displayName": "Dago, Coblong, Bandung, Jawa Barat, Indonesia",
  "provider": "openstreetmap-nominatim"
}
```

Notes:
- Validates `query` as non-empty string (`400` when missing/empty)
- Uses OpenStreetMap Nominatim as provider
- Caches results in Convex `geocodes` table (keyed by normalized query)
- On provider failure/no result, returns `502`

### 5) Start ride agent

`POST /api/ops/rides/{rideId}/agent/start`

Body (optional):

```json
{ "speed": "fast" }
```

Allowed speed: `slow | normal | fast`

### 6) Generate QRIS demo

`POST /api/ops/rides/{rideId}/payment/qris`

### 7) Mark paid demo

`POST /api/ops/rides/{rideId}/payment/paid`

### 8) Ride detail

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

curl -sS -X POST "$BASE_URL/api/ops/geocode" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"Dago, Bandung"}'

CREATE_RES=$(curl -sS -X POST "$BASE_URL/api/ops/rides" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{
    "customerName":"Alice",
    "customerPhone":"08123456789",
    "pickup":"Mall A",
    "dropoff":"Bandara B",
    "pickupLat":-6.914744,
    "pickupLng":107.60981,
    "dropoffLat":-6.208763,
    "dropoffLng":106.845599,
    "vehicleType":"car",
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
