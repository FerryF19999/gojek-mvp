import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, safeError } from "@/lib/driver-api";

export async function POST(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);
    const convex = getConvexClient();

    const result = await convex.mutation(api.publicApi.driverSelfSubscribe, {
      driverId: driver._id,
    });

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
      alreadySubscribed: result.alreadySubscribed,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
