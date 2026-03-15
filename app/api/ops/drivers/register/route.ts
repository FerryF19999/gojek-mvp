import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  assertOpsAuth,
  getConvexClient,
  parseJsonBody,
  requireString,
  safeError,
} from "@/lib/ops-api";

const VEHICLE_TYPES = ["motor", "car"] as const;

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const body = parseJsonBody(await req.json());

    const fullName = requireString(body, "fullName");
    const phone = requireString(body, "phone");
    const email = typeof body.email === "string" ? body.email.trim() || undefined : undefined;
    const city = requireString(body, "city");

    const vehicleType = body.vehicleType;
    if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType as any)) {
      return NextResponse.json(
        { error: `vehicleType is required and must be one of: ${VEHICLE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const vehicleBrand = requireString(body, "vehicleBrand");
    const vehicleModel = requireString(body, "vehicleModel");
    const vehiclePlate = requireString(body, "vehiclePlate");
    const licenseNumber = requireString(body, "licenseNumber");
    const emergencyContactName = requireString(body, "emergencyContactName");
    const emergencyContactPhone = requireString(body, "emergencyContactPhone");
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim() || undefined : undefined;

    let lat: number | undefined;
    let lng: number | undefined;
    if (body.lastLocation && typeof body.lastLocation === "object") {
      const loc = body.lastLocation as Record<string, unknown>;
      if (typeof loc.lat === "number" && typeof loc.lng === "number") {
        lat = loc.lat;
        lng = loc.lng;
      }
    }

    // Optional notification webhook URL
    const notificationWebhook =
      typeof body.notificationWebhook === "string" ? body.notificationWebhook.trim() || undefined : undefined;

    const convex = getConvexClient();
    const result = await convex.mutation(api.drivers.registerDriver, {
      fullName,
      phone,
      email,
      vehicleType: vehicleType as "motor" | "car",
      lat,
      lng,
      notificationWebhook,
    });

    return NextResponse.json({
      ok: true,
      driverId: result.driverId,
      userId: result.userId,
      fullName,
      phone,
      city,
      vehicleType,
      vehicleBrand,
      vehicleModel,
      vehiclePlate,
      licenseNumber,
      subscriptionStatus: "inactive",
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
