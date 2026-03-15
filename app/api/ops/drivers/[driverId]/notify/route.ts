import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  assertOpsAuth,
  getConvexClient,
  parseJsonBody,
  requireDriverId,
  safeError,
} from "@/lib/ops-api";

/**
 * POST /api/ops/drivers/{driverId}/notify
 *
 * Sends a ride assignment notification to a driver via the configured webhook
 * (DRIVER_NOTIFICATION_WEBHOOK env var). This is a generic HTTP POST — the
 * actual WhatsApp/SMS delivery is handled by the webhook receiver.
 *
 * Body:
 *   rideId        string  - Convex ride ID
 *   rideCode      string  - Human-readable code (RIDE-000013)
 *   pickup        string  - Pickup address
 *   dropoff       string  - Dropoff address
 *   estimatedFare number  - Estimated fare in IDR
 *   vehicleType   string  - "motor" | "car"
 */
export async function POST(req: NextRequest, { params }: { params: { driverId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const driverId = requireDriverId(params.driverId ?? "");
    const body = parseJsonBody(await req.json());

    const rideId = body.rideId as string | undefined;
    const rideCode = body.rideCode as string | undefined;
    const pickup = body.pickup as string | undefined;
    const dropoff = body.dropoff as string | undefined;
    const estimatedFare = body.estimatedFare as number | undefined;
    const vehicleType = body.vehicleType as string | undefined;

    if (!rideId || !rideCode || !pickup || !dropoff) {
      return NextResponse.json(
        { error: "rideId, rideCode, pickup, and dropoff are required" },
        { status: 400 },
      );
    }

    // Fetch driver details from Convex
    const convex = getConvexClient();
    const drivers = await convex.query(api.drivers.listDrivers, {});
    const driver = drivers.find((d: any) => d._id === driverId);

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const webhookUrl = process.env.DRIVER_NOTIFICATION_WEBHOOK;
    if (!webhookUrl) {
      return NextResponse.json(
        { ok: true, note: "DRIVER_NOTIFICATION_WEBHOOK not configured, notification skipped" },
        { status: 200 },
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://gojek-mvp.vercel.app";

    const payload = {
      driverName: (driver as any).userName ?? "Driver",
      driverPhone: (driver as any).phone ?? "",
      rideCode,
      pickup,
      dropoff,
      estimatedFare: estimatedFare ?? 0,
      vehicleType: vehicleType ?? "motor",
      action: "ride_assigned",
      acceptUrl: `${baseUrl}/api/ops/rides/${rideId}/driver-response?action=accept`,
      declineUrl: `${baseUrl}/api/ops/rides/${rideId}/driver-response?action=decline`,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Webhook returned ${res.status}`, detail: text },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, driverId, webhookStatus: res.status, payload });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
