import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, requireDriverApplicationId, safeError } from "@/lib/ops-api";

export async function POST(req: NextRequest, { params }: { params: { applicationId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const applicationId = requireDriverApplicationId(params.applicationId || "");
    const convex = getConvexClient();
    const out = await convex.mutation(api.driverSignup.activateDriverSubscriptionDemo, { applicationId });

    return NextResponse.json({
      ok: true,
      applicationId,
      driverId: out.driverId,
      status: out.status,
      subscriptionPlan: out.subscriptionPlan,
      subscribedUntil: out.subscribedUntil,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
