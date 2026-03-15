import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  OpsApiError,
  assertOpsAuth,
  getConvexClient,
  optionalEnum,
  optionalNumber,
  parseJsonBody,
  requireString,
  safeError,
} from "@/lib/ops-api";

const DEFAULT_PICKUP_LAT = -6.2;
const DEFAULT_PICKUP_LNG = 106.816666;
const DEFAULT_DROPOFF_LAT = -6.21;
const DEFAULT_DROPOFF_LNG = 106.82;

const assertLat = (value: number, field: string) => {
  if (value < -90 || value > 90) {
    throw new OpsApiError(400, `${field} must be between -90 and 90`);
  }
};

const assertLng = (value: number, field: string) => {
  if (value < -180 || value > 180) {
    throw new OpsApiError(400, `${field} must be between -180 and 180`);
  }
};

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const body = parseJsonBody(await req.json());
    const customerName = requireString(body, "customerName");
    const customerPhone = requireString(body, "customerPhone");
    const pickupAddress = requireString(body, "pickup");
    const dropoffAddress = requireString(body, "dropoff");

    const pickupLat = optionalNumber(body, "pickupLat") ?? DEFAULT_PICKUP_LAT;
    const pickupLng = optionalNumber(body, "pickupLng") ?? DEFAULT_PICKUP_LNG;
    const dropoffLat = optionalNumber(body, "dropoffLat") ?? DEFAULT_DROPOFF_LAT;
    const dropoffLng = optionalNumber(body, "dropoffLng") ?? DEFAULT_DROPOFF_LNG;
    const vehicleType = optionalEnum(body, "vehicleType", ["motor", "car"] as const) ?? "motor";
    const fare = optionalNumber(body, "fare");

    assertLat(pickupLat, "pickupLat");
    assertLng(pickupLng, "pickupLng");
    assertLat(dropoffLat, "dropoffLat");
    assertLng(dropoffLng, "dropoffLng");

    if (fare !== undefined && fare <= 0) {
      throw new OpsApiError(400, "fare must be greater than 0");
    }

    const convex = getConvexClient();
    const rideId = await convex.mutation(api.rides.createRide, {
      customerName,
      customerPhone,
      pickup: {
        address: pickupAddress,
        lat: pickupLat,
        lng: pickupLng,
      },
      dropoff: {
        address: dropoffAddress,
        lat: dropoffLat,
        lng: dropoffLng,
      },
      vehicleType,
      priceOverride: fare,
      createdBy: "ops-api",
    });

    const ride = await convex.query(api.rides.getRide, { rideId });

    return NextResponse.json({
      ok: true,
      rideId,
      code: ride?.ride?.code,
      fare: ride?.ride?.price?.amount,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
