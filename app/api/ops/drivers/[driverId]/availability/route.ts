import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  assertOpsAuth,
  getConvexClient,
  optionalEnum,
  parseJsonBody,
  requireDriverId,
  safeError,
} from "@/lib/ops-api";

const AVAILABILITY_VALUES = ["online", "offline", "busy"] as const;

export async function POST(req: NextRequest, { params }: { params: { driverId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const driverId = requireDriverId(params.driverId ?? "");
    const body = parseJsonBody(await req.json());

    const availability = optionalEnum(body, "availability", AVAILABILITY_VALUES);
    if (!availability) {
      return NextResponse.json(
        { error: `availability is required and must be one of: ${AVAILABILITY_VALUES.join(", ")}` },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    await convex.mutation(api.drivers.setDriverAvailability, { driverId, availability });

    return NextResponse.json({ ok: true, driverId, availability });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
