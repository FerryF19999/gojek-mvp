import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DRIVER_SUBSCRIPTION_PLAN, DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY } from "@/lib/pricing";
import { assertOpsAuth, getConvexClient, optionalNumber, parseJsonBody, safeError } from "@/lib/ops-api";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: { driverId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const driverId = params.driverId?.trim() as Id<"drivers">;
    if (!driverId) {
      return NextResponse.json({ error: "driverId is required" }, { status: 400 });
    }

    const body = parseJsonBody(await req.json());
    const plan = body.plan;
    if (typeof plan !== "string" || plan !== DRIVER_SUBSCRIPTION_PLAN) {
      return NextResponse.json({ error: `plan must be '${DRIVER_SUBSCRIPTION_PLAN}'` }, { status: 400 });
    }

    const months = optionalNumber(body, "months");
    const subscribedUntilInput = optionalNumber(body, "subscribedUntil");

    if (months === undefined && subscribedUntilInput === undefined) {
      return NextResponse.json({ error: "Either months or subscribedUntil is required" }, { status: 400 });
    }
    if (months !== undefined && months <= 0) {
      return NextResponse.json({ error: "months must be greater than 0" }, { status: 400 });
    }
    if (subscribedUntilInput !== undefined && subscribedUntilInput <= 0) {
      return NextResponse.json({ error: "subscribedUntil must be a positive unix ms timestamp" }, { status: 400 });
    }

    const now = Date.now();
    const subscribedUntil = months !== undefined ? now + months * MONTH_MS : (subscribedUntilInput as number);

    const convex = getConvexClient();
    const result = await convex.mutation(api.drivers.setDriverSubscription, {
      driverId,
      plan,
      subscribedUntil,
    });

    return NextResponse.json({
      ok: true,
      driverId,
      plan,
      priceMonthly: DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY,
      subscribedUntil,
      subscriptionStatus: result.subscriptionStatus,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
