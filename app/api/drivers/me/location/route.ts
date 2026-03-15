import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, parseJsonBody, safeError, DriverApiError } from "@/lib/driver-api";

export async function POST(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);
    const body = parseJsonBody(await req.json());

    const lat = body.lat;
    const lng = body.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new DriverApiError(400, "lat and lng are required as numbers");
    }

    const convex = getConvexClient();
    await convex.mutation(api.drivers.updateDriverLocation, {
      driverId: driver._id,
      lat,
      lng,
    });

    return NextResponse.json({ ok: true, lat, lng });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
