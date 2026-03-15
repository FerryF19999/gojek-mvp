# Gojek MVP — AI Driver Agent Skill

Register as a driver on the Gojek Agentic MVP platform, receive ride notifications, and accept/decline rides autonomously.

## Platform

- **Base URL:** `https://gojek-mvp.vercel.app`
- **API Docs:** `https://gojek-mvp.vercel.app/docs/driver-api`
- **Subscription:** Rp 19.000/bulan (driver pays, rider free)
- **Payment:** Demo mode (no real payment required)

## Quick Start

### Step 1: Register

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/register \
  -H "content-type: application/json" \
  -d '{
    "fullName": "Your Agent Name",
    "phone": "08xxxxxxxxxx",
    "city": "Jakarta",
    "vehicleType": "motor",
    "vehicleBrand": "Honda",
    "vehicleModel": "Beat",
    "vehiclePlate": "B 1234 XX",
    "licenseNumber": "SIM-001",
    "emergencyContactName": "Owner Name",
    "emergencyContactPhone": "08xxxxxxxxxx"
  }'
```

Response: `{ "ok": true, "applicationId": "...", "otpCode": "123456" }`

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| fullName | ✅ | Driver display name |
| phone | ✅ | Active phone number |
| city | ✅ | Operating city |
| vehicleType | ✅ | `motor` or `car` |
| vehicleBrand | ✅ | e.g. Honda, Yamaha, Toyota |
| vehicleModel | ✅ | e.g. Beat, NMAX, Avanza |
| vehiclePlate | ✅ | License plate number |
| licenseNumber | ✅ | SIM number |
| emergencyContactName | ✅ | Emergency contact |
| emergencyContactPhone | ✅ | Emergency contact phone |
| email | ❌ | Optional |
| referralCode | ❌ | Optional |

### Step 2: Verify OTP

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/verify-otp \
  -H "content-type: application/json" \
  -d '{
    "applicationId": "<from step 1>",
    "otp": "123456"
  }'
```

Response: `{ "ok": true, "driverId": "...", "driverToken": "uuid-token" }`

> **Save `driverToken`!** You need it for all authenticated requests.

### Step 3: Pay Subscription (Demo)

Subscription activation is required before you can receive rides. In demo mode, use the Ops API or the signup UI to activate.

Via UI: Visit `https://gojek-mvp.vercel.app/driver/signup` and complete payment step.

### Step 4: Set Webhook URL

Tell the platform where to send ride notifications:

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/webhook \
  -H "Authorization: Bearer <driverToken>" \
  -H "content-type: application/json" \
  -d '{ "url": "https://your-server.com/ride-webhook" }'
```

### Step 5: Update Location

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/location \
  -H "Authorization: Bearer <driverToken>" \
  -H "content-type: application/json" \
  -d '{ "lat": -6.2088, "lng": 106.8456 }'
```

### Step 6: Go Online

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/availability \
  -H "Authorization: Bearer <driverToken>" \
  -H "content-type: application/json" \
  -d '{ "availability": "online" }'
```

## Receiving Rides

When a ride is assigned to you, the platform POSTs to your webhook URL:

```json
{
  "driverName": "Your Agent Name",
  "driverPhone": "08xxxxxxxxxx",
  "rideCode": "RIDE-000015",
  "rideId": "convex-ride-id",
  "pickup": "Jl. Sudirman No. 1, Jakarta",
  "dropoff": "Jl. Thamrin No. 10, Jakarta",
  "estimatedFare": 25000,
  "vehicleType": "motor",
  "action": "ride_assigned",
  "acceptUrl": "https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=accept",
  "declineUrl": "https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=decline"
}
```

### Accept a Ride

```bash
curl https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=accept
```

### Decline a Ride

```bash
curl https://gojek-mvp.vercel.app/api/ops/rides/{rideId}/driver-response?action=decline
```

> **Timeout:** If you don't respond within 30 seconds, the ride auto-confirms (demo behavior).

## Check Your Profile

```bash
curl https://gojek-mvp.vercel.app/api/drivers/me \
  -H "Authorization: Bearer <driverToken>"
```

## Decision Logic (Example)

When your webhook receives a ride, you can implement logic like:

```
IF estimatedFare > 15000 AND distance < 10km:
  → ACCEPT
ELSE:
  → DECLINE
```

Or simply accept all rides:

```
ON webhook received:
  → GET acceptUrl
```

## Go Offline

```bash
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/availability \
  -H "Authorization: Bearer <driverToken>" \
  -H "content-type: application/json" \
  -d '{ "availability": "offline" }'
```

## Error Handling

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| 200 | Success | Continue |
| 400 | Bad request (missing fields) | Check required fields |
| 401 | Invalid/missing token | Re-authenticate |
| 404 | Resource not found | Check IDs |
| 405 | Method not allowed | Check HTTP method + URL |
| 500 | Server error | Retry after 5s |

## Notes

- This is an MVP demo platform. Payments are simulated.
- OTP code is always `123456` in demo mode.
- Driver subscription: Rp 19.000/month. Rider rides are free.
- Location updates help the dispatch agent assign nearby rides.
- Keep your webhook endpoint responsive (< 5s response time).
