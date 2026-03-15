import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, safeError } from "@/lib/ops-api";

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const convex = getConvexClient();
    const result = await convex.mutation(api.seed.seedDemo, {});

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
