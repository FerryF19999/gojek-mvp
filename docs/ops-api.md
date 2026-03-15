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

Optional input:
- Query: `?force=1` (also accepts `true`/`yes`)
- JSON body: `{ "force": true }`

Notes:
- Seeding remains idempotent (`seeded` is `false` when no new drivers are inserted)
- Even when `seeded=false`, demo drivers are patched to be eligible (`availability=online`, active subscription, `subscribedUntil` in future)
- Use `force` when you want to explicitly ensure a healthy demo pool before dispatch tests

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

### 5) List drivers

`GET /api/ops/drivers`

Response fields per driver:
- `id`, `name`
- `vehicleType`
- `availability`
- `subscriptionPlan`, `subscriptionStatus`, `subscribedUntil`, `isSubscribed`
- `lastLocation`

### 6) Set driver availability

`POST /api/ops/drivers/{driverId}/availability`

Body:

```json
{ "availability": "online" }
```

Allowed values: `online | offline | busy`

### 7) Start ride agent

`POST /api/ops/rides/{rideId}/agent/start`

Body (optional):

```json
{ "speed": "fast" }
```

Allowed speed: `slow | normal | fast`

Prepaid behavior:
- Ride agent enforces prepaid-first dispatch.
- If no payment exists, it auto-generates demo QRIS and moves ride to `awaiting_payment`.
- If payment exists but is not paid, ride stays in `awaiting_payment` and agent retries.
- Dispatch/assignment/movement only continue after payment status is `paid`.  

### 8) Generate QRIS demo

`POST /api/ops/rides/{rideId}/payment/qris`

### 9) Mark paid demo

`POST /api/ops/rides/{rideId}/payment/paid`

Notes:
- Returns `404` when ride is not found.
- Returns `400` when no payment exists yet for the ride (`Generate QRIS first`).

### 10) Ride detail

`GET /api/ops/rides/{rideId}`

Returns `{ ok: true, ride, actions, payments }`.

Notes:
- Returns `404` when ride is not found.
- If Convex deployment is stale (missing required function), response includes a clear deploy hint instead of a generic error.

### 11) Set driver subscription

`POST /api/ops/drivers/{driverId}/subscription`

Body:

```json
{
  "plan": "monthly_19k",
  "months": 1
}
```

or

```json
{
  "plan": "monthly_19k",
  "subscribedUntil": 1773570000000
}
```

Rules:
- `plan` must be `monthly_19k` (Rp 19,000/month display price)
- Provide at least one of `months` or `subscribedUntil`
- If `months` is provided, API computes `subscribedUntil = now + months*30days`
- `months` must be `> 0`
- `subscribedUntil` must be positive unix ms timestamp

### 12) Activate driver signup subscription (ops-only demo)

`POST /api/ops/driver-signups/{applicationId}/activate`

Notes:
- Marks a verified driver signup as paid for demo purposes.
- Internally activates subscription with:
  - `subscriptionStatus=active`
  - `subscriptionPlan=monthly_19k`
  - `subscribedUntil=now+30days`
- Returns `400` if driver record doesn't exist yet (OTP must be verified first).

### 13) Register driver (programmatic)

`POST /api/ops/drivers/register`

Body:

```json
{
  "fullName": "Budi Santoso",
  "phone": "081234567890",
  "email": "budi@example.com",
  "city": "Jakarta",
  "vehicleType": "motor",
  "vehicleBrand": "Honda",
  "vehicleModel": "Vario 150",
  "vehiclePlate": "B1234CD",
  "licenseNumber": "SIM-123456",
  "emergencyContactName": "Siti",
  "emergencyContactPhone": "081298765432",
  "referralCode": "REF123",
  "lastLocation": { "lat": -6.2, "lng": 106.816 },
  "notificationWebhook": "https://example.com/webhook"
}
```

Required fields: `fullName`, `phone`, `city`, `vehicleType`, `vehicleBrand`, `vehicleModel`, `vehiclePlate`, `licenseNumber`, `emergencyContactName`, `emergencyContactPhone`

Optional: `email`, `referralCode`, `lastLocation`, `notificationWebhook`

Notes:
- Creates user + driver record directly (skips OTP)
- Driver starts with `subscriptionStatus: inactive`
- `vehicleType` must be `motor` or `car`
- Returns `{ ok, driverId, userId, ... }`

### 14) Update driver location

`POST /api/ops/drivers/{driverId}/location`

Body:

```json
{ "lat": -6.2, "lng": 106.816 }
```

Notes:
- `lat` must be between `-90` and `90`
- `lng` must be between `-180` and `180`
- Updates driver's `lastLocation` and `lastActiveAt`

### 15) Notify driver (webhook)

`POST /api/ops/drivers/{driverId}/notify`

Body:

```json
{
  "rideId": "<ride_id>",
  "rideCode": "RIDE-000013",
  "pickup": "Mall A",
  "dropoff": "Bandara B",
  "estimatedFare": 25000,
  "vehicleType": "motor"
}
```

Notes:
- POSTs to `DRIVER_NOTIFICATION_WEBHOOK` env var with ride details + accept/decline URLs
- If webhook not configured, returns `200` with `note: "notification skipped"`
- Payload includes `acceptUrl` and `declineUrl` pointing to `/api/ops/rides/{rideId}/driver-response`

### 16) Driver response to ride assignment

`POST /api/ops/rides/{rideId}/driver-response`

Body:

```json
{ "action": "accept" }
```

or

```json
{ "action": "decline" }
```

Also accepts `?action=accept` or `?action=decline` as query param.

Notes:
- `accept` → confirms assignment, ride moves to `assigned`
- `decline` → releases driver, ride goes back to `dispatching` for re-assignment
- Used by webhook consumers (e.g. WhatsApp bot) to relay driver decisions

### Ride agent driver notification flow

When the ride agent assigns a driver:
1. Sets `driverResponseStatus: pending` and `driverResponseDeadline` (30s)
2. Ride status changes to `awaiting_driver_response`
3. Agent polls every 3s for driver response
4. On `accept` → proceeds to `driver_arriving`
5. On `decline` → re-dispatches to next eligible driver
6. On timeout (30s) → auto-confirms for demo, proceeds to `driver_arriving`
7. Dashboard shows "⏳ Waiting for driver response..." during this phase

---

## cURL Examples

```bash
export BASE_URL="https://your-app.vercel.app"
export OPS_KEY="your-secret-ops-key"

curl -sS "$BASE_URL/api/ops/health" \
  -H "x-ops-key: $OPS_KEY"

curl -sS -X POST "$BASE_URL/api/ops/seed" \
  -H "x-ops-key: $OPS_KEY"

curl -sS -X POST "$BASE_URL/api/ops/seed?force=1" \
  -H "x-ops-key: $OPS_KEY"

curl -sS "$BASE_URL/api/ops/drivers" \
  -H "x-ops-key: $OPS_KEY"

DRIVER_ID="<driver_id>"
curl -sS -X POST "$BASE_URL/api/ops/drivers/$DRIVER_ID/availability" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"availability":"online"}'

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

DRIVER_ID="<driver_id>"
curl -sS -X POST "$BASE_URL/api/ops/drivers/$DRIVER_ID/subscription" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"plan":"monthly_19k","months":1}'

APPLICATION_ID="<driver_application_id>"
curl -sS -X POST "$BASE_URL/api/ops/driver-signups/$APPLICATION_ID/activate" \
  -H "x-ops-key: $OPS_KEY"

# Register a new driver (programmatic)
curl -sS -X POST "$BASE_URL/api/ops/drivers/register" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{
    "fullName":"Budi Santoso",
    "phone":"081234567890",
    "city":"Jakarta",
    "vehicleType":"motor",
    "vehicleBrand":"Honda",
    "vehicleModel":"Vario 150",
    "vehiclePlate":"B1234CD",
    "licenseNumber":"SIM-123456",
    "emergencyContactName":"Siti",
    "emergencyContactPhone":"081298765432"
  }'

# Update driver GPS location
DRIVER_ID="<driver_id>"
curl -sS -X POST "$BASE_URL/api/ops/drivers/$DRIVER_ID/location" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"lat":-6.2,"lng":106.816}'

# Notify driver about ride assignment
curl -sS -X POST "$BASE_URL/api/ops/drivers/$DRIVER_ID/notify" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{
    "rideId":"<ride_id>",
    "rideCode":"RIDE-000013",
    "pickup":"Mall A",
    "dropoff":"Bandara B",
    "estimatedFare":25000,
    "vehicleType":"motor"
  }'

# Driver accepts ride
curl -sS -X POST "$BASE_URL/api/ops/rides/$RIDE_ID/driver-response" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"action":"accept"}'

# Driver declines ride
curl -sS -X POST "$BASE_URL/api/ops/rides/$RIDE_ID/driver-response" \
  -H "x-ops-key: $OPS_KEY" \
  -H "content-type: application/json" \
  -d '{"action":"decline"}'
```

---

## Driver Notification & Response Flow

### Overview

When the ride agent assigns a driver, it automatically:
1. Sends a webhook notification to `DRIVER_NOTIFICATION_WEBHOOK` (env var on Convex)
2. Sets `driverResponseStatus = "pending"` with a 30-second deadline
3. Polls the ride record every 3 seconds for driver response
4. On `accepted`: proceeds to `driver_arriving`
5. On `declined`: marks driver as declined, retries with next eligible driver
6. On `timeout` (30s, no response): auto-accepts and proceeds (demo mode)

---

### `POST /api/ops/drivers/{driverId}/notify`

Manually trigger a driver notification webhook for a specific ride.
No direct auth needed to receive the webhook — the sender uses `DRIVER_NOTIFICATION_WEBHOOK`.

**Request**

```http
POST /api/ops/drivers/{driverId}/notify
x-ops-key: <OPS_KEY>
Content-Type: application/json

{
  "rideId": "<convex_ride_id>",
  "rideCode": "RIDE-000013",
  "pickup": "Bandung",
  "dropoff": "Jakarta",
  "estimatedFare": 150000,
  "vehicleType": "motor"
}
```

**Response**

```json
{
  "ok": true,
  "driverId": "<driverId>",
  "webhookStatus": 200,
  "payload": {
    "driverName": "Yuri AI",
    "driverPhone": "081234567890",
    "rideCode": "RIDE-000013",
    "pickup": "Bandung",
    "dropoff": "Jakarta",
    "estimatedFare": 150000,
    "vehicleType": "motor",
    "action": "ride_assigned",
    "acceptUrl": "https://gojek-mvp.vercel.app/api/ops/rides/<rideId>/driver-response?action=accept",
    "declineUrl": "https://gojek-mvp.vercel.app/api/ops/rides/<rideId>/driver-response?action=decline"
  }
}
```

---

### `POST /api/ops/rides/{rideId}/driver-response`

Driver accepts or declines a ride. Also accessible via GET for browser link clicks.
**No auth required** — this endpoint is called from the accept/decline URL sent to the driver.

**Via POST (programmatic)**

```http
POST /api/ops/rides/{rideId}/driver-response
Content-Type: application/json

{ "action": "accept" }
```

or with query param:

```http
POST /api/ops/rides/{rideId}/driver-response?action=decline
```

**Via GET (browser / WhatsApp link click)**

```
GET /api/ops/rides/{rideId}/driver-response?action=accept
GET /api/ops/rides/{rideId}/driver-response?action=decline
```

Returns a simple HTML confirmation page.

**Response (POST)**

```json
{ "rideId": "<rideId>", "ok": true, "status": "accepted" }
```

**Effect**

| Action    | Effect |
|-----------|--------|
| `accept`  | Sets `driverResponseStatus = "accepted"`, status back to `assigned`. Ride agent proceeds to `driver_arriving`. |
| `decline` | Frees driver (availability → `online`), adds to `declinedDriverIds`, status → `dispatching`. Agent retries with next driver. |

---

### Webhook Payload Schema

The `DRIVER_NOTIFICATION_WEBHOOK` receives a POST with `Content-Type: application/json`:

```json
{
  "driverName": "string",
  "driverPhone": "string",
  "rideCode": "string",
  "pickup": "string",
  "dropoff": "string",
  "estimatedFare": 150000,
  "vehicleType": "motor|car",
  "action": "ride_assigned",
  "acceptUrl": "https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=accept",
  "declineUrl": "https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=decline"
}
```

The webhook receiver is responsible for delivering the message via WhatsApp, SMS, etc.

---

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `DRIVER_NOTIFICATION_WEBHOOK` | Convex + Next.js | URL to POST driver notification payload |
| `NEXT_PUBLIC_APP_URL` | Convex + Next.js | Base URL for accept/decline links (default: `https://gojek-mvp.vercel.app`) |

---

### Schema Changes (Convex — deploy needed)

New fields added:

**`rides` table:**
- `declinedDriverIds?: Id<"drivers">[]` — drivers that declined this ride
- `driverResponseStatus?: "pending" | "accepted" | "declined" | "timeout"` — current response state
- `driverResponseDeadline?: number` — Unix ms deadline for driver response
- `status` now includes `"awaiting_driver_response"`

**`drivers` table:**
- `notificationWebhook?: string` — optional custom webhook URL per driver

