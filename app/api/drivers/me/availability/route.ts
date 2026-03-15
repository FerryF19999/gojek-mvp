import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, parseJsonBody, safeError, DriverApiError } from "@/lib/driver-api";

const ALLOWED = ["online", "offline"] as const;

export async function POST(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);
    const body = parseJsonBody(await req.json());

    const availability = body.availability;
    if (typeof availability !== "string" || !ALLOWED.includes(availability as any)) {
      throw new DriverApiError(400, `availability must be one of: ${ALLOWED.join(", ")}`);
    }

    const convex = getConvexClient();
    await convex.mutation(api.drivers.setDriverAvailability, {
      driverId: driver._id,
      availability: availability as "online" | "offline",
    });

    return NextResponse.json({ ok: true, availability });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
