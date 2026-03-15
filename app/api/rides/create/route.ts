import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

const VEHICLE_TYPES = ["motor", "car"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    const { customerName, customerPhone, pickup, dropoff, vehicleType } = body;

    if (!customerName || typeof customerName !== "string") {
      return NextResponse.json({ error: "customerName is required" }, { status: 400 });
    }
    if (!customerPhone || typeof customerPhone !== "string") {
      return NextResponse.json({ error: "customerPhone is required" }, { status: 400 });
    }
    if (!pickup || typeof pickup.address !== "string" || typeof pickup.lat !== "number" || typeof pickup.lng !== "number") {
      return NextResponse.json({ error: "pickup must include address (string), lat (number), lng (number)" }, { status: 400 });
    }
    if (!dropoff || typeof dropoff.address !== "string" || typeof dropoff.lat !== "number" || typeof dropoff.lng !== "number") {
      return NextResponse.json({ error: "dropoff must include address (string), lat (number), lng (number)" }, { status: 400 });
    }
    if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType)) {
      return NextResponse.json({ error: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}` }, { status: 400 });
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.publicApi.createPublicRide, {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
      dropoff: { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng },
      vehicleType,
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://gojek-mvp.vercel.app";
    return NextResponse.json({
      success: true,
      ride: {
        code: result.code,
        rideId: result.rideId,
        status: result.status,
        price: result.price,
        trackingUrl: `${baseUrl}/track/${result.code}`,
        payUrl: `${baseUrl}/api/rides/${result.code}/pay`,
        statusUrl: `${baseUrl}/api/rides/${result.code}/status`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
