import { NextRequest, NextResponse } from "next/server";
import { assertOpsAuth, getConvexUrl, safeError } from "@/lib/ops-api";

export async function GET(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      version: process.env.npm_package_version,
      convexUrl: getConvexUrl(),
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
