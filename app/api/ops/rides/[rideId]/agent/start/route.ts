import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, optionalEnum, parseJsonBody, requireRideId, safeError } from "@/lib/ops-api";

export async function POST(req: NextRequest, { params }: { params: { rideId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const body = parseJsonBody(await req.json().catch(() => ({})));
    const speed = optionalEnum(body, "speed", ["slow", "normal", "fast"] as const);

    const convex = getConvexClient();
    const rideId = requireRideId(params.rideId);
    const result = await convex.mutation(api.rideAgent.startRideAgent, { rideId, speed });

    return NextResponse.json(result);
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
