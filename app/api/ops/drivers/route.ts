import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, safeError } from "@/lib/ops-api";

export async function GET(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const convex = getConvexClient();
    const drivers = await convex.query(api.drivers.listDrivers, {});

    const data = drivers.map((driver) => ({
      id: driver._id,
      name: driver.userName,
      vehicleType: driver.vehicleType,
      availability: driver.availability,
      subscriptionPlan: driver.subscriptionPlan ?? null,
      subscriptionStatus: driver.subscriptionStatus,
      subscribedUntil: driver.subscribedUntil ?? null,
      isSubscribed: driver.isSubscribed,
      lastLocation: driver.lastLocation ?? null,
    }));

    return NextResponse.json({ ok: true, drivers: data });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
