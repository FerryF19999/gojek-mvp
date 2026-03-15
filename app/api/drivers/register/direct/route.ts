import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

const VEHICLE_TYPES = ["motor", "car"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { fullName, phone, vehicleType, vehicleBrand, vehicleModel, vehiclePlate, licenseNumber, city } = body;

    // Validate required fields
    if (!fullName || typeof fullName !== "string") {
      return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }
    if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType)) {
      return NextResponse.json({ error: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!vehicleBrand || typeof vehicleBrand !== "string") {
      return NextResponse.json({ error: "vehicleBrand is required" }, { status: 400 });
    }
    if (!vehicleModel || typeof vehicleModel !== "string") {
      return NextResponse.json({ error: "vehicleModel is required" }, { status: 400 });
    }
    if (!vehiclePlate || typeof vehiclePlate !== "string") {
      return NextResponse.json({ error: "vehiclePlate is required" }, { status: 400 });
    }
    if (!licenseNumber || typeof licenseNumber !== "string") {
      return NextResponse.json({ error: "licenseNumber is required" }, { status: 400 });
    }
    if (!city || typeof city !== "string") {
      return NextResponse.json({ error: "city is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.publicApi.registerDriverDirect, {
      fullName,
      phone,
      vehicleType,
      vehicleBrand,
      vehicleModel,
      vehiclePlate,
      licenseNumber,
      city,
    });

    return NextResponse.json({
      success: true,
      driver: {
        driverId: result.driverId,
        apiToken: result.apiToken,
        status: result.status,
        alreadyExists: result.alreadyExists,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
