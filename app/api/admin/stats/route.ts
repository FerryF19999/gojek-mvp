import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

export async function GET() {
  try {
    const convex = getConvexClient();
    const stats = await convex.query(api.stats.getAdminStats, {});
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
