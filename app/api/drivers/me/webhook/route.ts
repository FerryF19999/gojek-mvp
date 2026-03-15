import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authenticateDriver, getConvexClient, parseJsonBody, requireString, safeError } from "@/lib/driver-api";

export async function POST(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);
    const body = parseJsonBody(await req.json());
    const url = requireString(body, "url");

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.drivers.setDriverWebhook, {
      driverId: driver._id,
      url,
    });

    return NextResponse.json({ ok: true, notificationWebhook: url });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
