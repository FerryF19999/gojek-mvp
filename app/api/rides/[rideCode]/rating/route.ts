import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { DriverApiError, getConvexClient, parseJsonBody, safeError } from "@/lib/driver-api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rideCode: string }> },
) {
  try {
    const { rideCode } = await params;
    const body = parseJsonBody(await req.json());
    const rating = Number(body.rating);

    if (!Number.isFinite(rating) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new DriverApiError(400, "rating must be integer 1-5");
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.rides.submitRideRating, { code: rideCode, rating });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
