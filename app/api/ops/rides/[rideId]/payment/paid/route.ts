import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, requireRideId, safeError } from "@/lib/ops-api";

export async function POST(req: NextRequest, { params }: { params: { rideId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const convex = getConvexClient();
    const rideId = requireRideId(params.rideId);

    const rideOps = await convex.query(api.rides.getRideOps, { rideId });
    if (!rideOps) {
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    }

    if (!rideOps.payments.length) {
      return NextResponse.json(
        { error: "No payment found for this ride. Generate QRIS first." },
        { status: 400 },
      );
    }

    const result = await convex.mutation(api.payments.markPaidDemo, { rideId });

    return NextResponse.json(result);
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
