import { NextRequest, NextResponse } from "next/server";
import { authenticateDriver, safeError } from "@/lib/driver-api";

export async function GET(req: NextRequest) {
  try {
    const driver = await authenticateDriver(req);

    return NextResponse.json({
      ok: true,
      driver: {
        id: driver._id,
        name: driver.userName,
        phone: driver.userPhone,
        email: driver.userEmail,
        vehicleType: driver.vehicleType,
        availability: driver.availability,
        subscriptionStatus: driver.subscriptionStatus,
        subscribedUntil: driver.subscribedUntil,
        subscriptionPlan: driver.subscriptionPlan,
        rating: driver.rating,
        lastLocation: driver.lastLocation,
        notificationWebhook: driver.notificationWebhook ?? null,
        lastActiveAt: driver.lastActiveAt,
      },
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
