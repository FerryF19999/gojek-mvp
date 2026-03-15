import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, safeError } from "@/lib/ops-api";

function parseForce(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const forceFromQuery = parseForce(req.nextUrl.searchParams.get("force"));

    let forceFromBody = false;
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = (await req.json()) as { force?: unknown };
        forceFromBody = body.force === true;
      } catch {
        forceFromBody = false;
      }
    }

    const force = forceFromQuery || forceFromBody;

    const convex = getConvexClient();
    const result = await convex.mutation(api.seed.seedDemo, { force });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
