import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token")?.trim();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const session = await convex.query((api as any).adminSessions.verifyAdminSession, { token });

    if (session.status === "expired") {
      await convex.mutation((api as any).adminSessions.expireAdminSession, { token });
    }

    return NextResponse.json({ status: session.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
