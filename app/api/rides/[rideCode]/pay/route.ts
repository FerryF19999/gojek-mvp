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
    const body = await req.json().catch(() => ({}));

    const result = await convex.mutation(api.publicApi.payRideByCode, {
      code: rideCode,
      method: body?.method,
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://gojek-mvp.vercel.app";
    return NextResponse.json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      status: result.status,
      paymentStatus: result.paymentStatus,
      paymentMethod: result.paymentMethod,
      trackingUrl: `${baseUrl}/track/${rideCode}`,
      statusUrl: `${baseUrl}/api/rides/${rideCode}/status`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
