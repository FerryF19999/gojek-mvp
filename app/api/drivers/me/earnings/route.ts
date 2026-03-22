import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, safeError } from "@/lib/driver-api";

export async function GET(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);
    const convex = getConvexClient();

    const stats = await convex.query(api.drivers.getDriverEarnings, { driverId: driver._id });
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
