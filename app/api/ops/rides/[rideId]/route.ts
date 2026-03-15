import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { assertOpsAuth, getConvexClient, requireRideId, safeError } from "@/lib/ops-api";

export async function GET(req: NextRequest, { params }: { params: { rideId: string } }) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const rideId = requireRideId(params.rideId);
    const convex = getConvexClient();
    const result = await convex.query(api.rides.getRideOps, { rideId });

    if (!result) {
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      ride: {
        rideId: result.ride._id,
        code: result.ride.code,
        status: result.ride.status,
        agentStatus: result.ride.agentStatus,
        paymentStatus: result.ride.paymentStatus,
        pickup: result.ride.pickup,
        dropoff: result.ride.dropoff,
        price: result.ride.price,
        timeline: result.ride.timeline,
        createdAt: result.ride.createdAt,
        updatedAt: result.ride.updatedAt,
      },
      actions: (result.actions ?? []).map((action) => ({
        id: action._id,
        agentName: action.agentName,
        actionType: action.actionType,
        input: action.input,
        output: action.output,
        approvedBy: action.approvedBy,
        createdAt: action.createdAt,
      })),
      payments: (result.payments ?? []).map((payment) => ({
        paymentId: payment._id,
        provider: payment.provider,
        providerRef: payment.providerRef,
        status: payment.status,
        amount: payment.amount,
        checkoutUrl: payment.checkoutUrl,
        qrString: payment.qrString,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
