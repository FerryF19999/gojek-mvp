import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rideCode: string }> },
) {
  try {
    const { rideCode } = await params;
    const convex = getConvexClient();

    const result = await convex.mutation(api.publicApi.payRideByCode, { code: rideCode });

    return NextResponse.json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      status: result.status,
      paymentStatus: result.paymentStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
