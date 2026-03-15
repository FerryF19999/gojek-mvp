import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "";
const client = new ConvexHttpClient(convexUrl.replace(/\/$/, ""));

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  try {
    const driver = await client.query(api.drivers.getDriverByApiToken, { apiToken: token });
    if (!driver) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const rides = await client.query(api.drivers.getDriverRides, { driverId: driver._id });
    return NextResponse.json({ success: true, rides });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
