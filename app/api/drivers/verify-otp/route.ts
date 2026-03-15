import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getConvexClient, parseJsonBody, requireString, safeError } from "@/lib/driver-api";

export async function POST(req: NextRequest) {
  try {
    const body = parseJsonBody(await req.json());

    const applicationId = requireString(body, "applicationId") as Id<"driverApplications">;
    const otp = requireString(body, "otp");

    const convex = getConvexClient();
    const result = await convex.mutation(api.driverSignup.verifyDriverApplicationOtpWithToken, {
      applicationId,
      otpCode: otp,
    });

    return NextResponse.json({
      ok: true,
      driverId: result.driverId,
      driverToken: result.driverToken,
      status: result.status,
      ...(result.alreadyVerified ? { alreadyVerified: true } : {}),
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
