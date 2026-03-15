import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  getConvexClient,
  requireRideId,
  safeError,
} from "@/lib/ops-api";

const ACTIONS = ["accept", "decline"] as const;

/**
 * POST /api/ops/rides/{rideId}/driver-response
 * GET  /api/ops/rides/{rideId}/driver-response?action=accept|decline
 *
 * No auth required — called via accept/decline URL sent to driver.
 * Body (optional): { "action": "accept" | "decline" }
 * Query param:     ?action=accept|decline
 */
export async function POST(req: NextRequest, { params }: { params: { rideId: string } }) {
  try {
    const rideId = requireRideId(params.rideId ?? "");

    // Accept action from body or query param
    let action: string | null = null;
    try {
      const body = await req.json();
      action = typeof body.action === "string" ? body.action : null;
    } catch {
      // no body — check query param
    }
    if (!action) {
      action = req.nextUrl.searchParams.get("action");
    }

    if (!action || !ACTIONS.includes(action as any)) {
      return NextResponse.json(
        { error: `action is required and must be one of: ${ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.rides.setDriverResponse, {
      rideId,
      action: action as "accept" | "decline",
    });

    return NextResponse.json({ rideId, ...result });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}

// GET handler — drivers may click the accept/decline link in a browser
export async function GET(req: NextRequest, { params }: { params: { rideId: string } }) {
  try {
    const rideId = requireRideId(params.rideId ?? "");
    const action = req.nextUrl.searchParams.get("action");

    if (!action || !ACTIONS.includes(action as any)) {
      return new NextResponse(
        `<html><body><p>Invalid action. Use ?action=accept or ?action=decline.</p></body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } },
      );
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.rides.setDriverResponse, {
      rideId,
      action: action as "accept" | "decline",
    });

    const emoji = action === "accept" ? "✅" : "❌";
    const label = action === "accept" ? "Accepted" : "Declined";
    const msg =
      action === "accept"
        ? "You have accepted the ride. Please proceed to the pickup location."
        : "You have declined the ride. Another driver will be assigned.";

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;text-align:center;">
        <h2>${emoji} Ride ${label}</h2>
        <p>${msg}</p>
        <p style="color:#888;font-size:0.875rem;">Ride ID: ${rideId}</p>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  } catch (error) {
    const parsed = safeError(error);
    return new NextResponse(
      `<html><body><p>Error: ${parsed.body?.error ?? "Unknown error"}</p></body></html>`,
      { status: parsed.status, headers: { "Content-Type": "text/html" } },
    );
  }
}
