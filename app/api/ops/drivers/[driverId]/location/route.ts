import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  assertOpsAuth,
  getConvexClient,
  parseJsonBody,
  requireDriverId,
  safeError,
} from "@/lib/ops-api";

export async function POST(req: NextRequest, { params }: { params: { driverId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const driverId = requireDriverId(params.driverId ?? "");
    const body = parseJsonBody(await req.json());

    const lat = body.lat;
    const lng = body.lng;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat and lng are required as numbers" }, { status: 400 });
    }
    if (lat < -90 || lat > 90) {
      return NextResponse.json({ error: "lat must be between -90 and 90" }, { status: 400 });
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json({ error: "lng must be between -180 and 180" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.drivers.updateDriverLocation, { driverId, lat, lng });

    return NextResponse.json({ ok: true, driverId, lat, lng });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
