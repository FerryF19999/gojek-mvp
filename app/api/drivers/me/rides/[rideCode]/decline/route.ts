import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, safeError } from "@/lib/driver-api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rideCode: string }> },
) {
  try {
    const driver = await authenticateDriver(req);
    const { rideCode } = await params;
    const convex = getConvexClient();

    const result = await convex.mutation(api.publicApi.driverRespondToRide, {
      driverId: driver._id,
      rideCode,
      response: "declined",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
