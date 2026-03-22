import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ rideCode: string }> },
) {
  try {
    const { rideCode } = await params;
    const convex = getConvexClient();
    const ride = await convex.query(api.rides.getRideByCode, { code: rideCode });

    if (!ride) {
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ride });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
