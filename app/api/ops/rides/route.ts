import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, optionalNumber, parseJsonBody, requireString, safeError } from "@/lib/ops-api";

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const body = parseJsonBody(await req.json());
    const customerName = requireString(body, "customerName");
    const customerPhone = requireString(body, "customerPhone");
    const pickupAddress = requireString(body, "pickup");
    const dropoffAddress = requireString(body, "dropoff");
    const fare = optionalNumber(body, "fare");

    const convex = getConvexClient();
    const rideId = await convex.mutation(api.rides.createRide, {
      customerName,
      customerPhone,
      pickup: {
        address: pickupAddress,
        lat: -6.2,
        lng: 106.816666,
      },
      dropoff: {
        address: dropoffAddress,
        lat: -6.21,
        lng: 106.82,
      },
      vehicleType: "motor",
      createdBy: "ops-api",
    });

    const ride = await convex.query(api.rides.getRide, { rideId });
    const baseAmount = ride?.ride?.price?.amount;

    return NextResponse.json({
      ok: true,
      rideId,
      code: ride?.ride?.code,
      fare: fare ?? baseAmount,
      note: fare !== undefined ? "Custom fare accepted in request but not persisted in MVP schema" : undefined,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
