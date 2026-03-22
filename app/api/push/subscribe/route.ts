import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rideCode = String(body?.rideCode || "").trim();
    const subscription = body?.subscription;

    if (!rideCode) return NextResponse.json({ error: "rideCode is required" }, { status: 400 });
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "subscription is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation((api as any).pushSubscriptions.upsert, {
      rideCode,
      endpoint: subscription.endpoint,
      subscription,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
