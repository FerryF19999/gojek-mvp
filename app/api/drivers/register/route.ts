import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient, parseJsonBody, requireString, safeError, DriverApiError } from "@/lib/driver-api";

const VEHICLE_TYPES = ["motor", "car"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = parseJsonBody(await req.json());

    const fullName = requireString(body, "fullName");
    const phone = requireString(body, "phone");
    const email = typeof body.email === "string" ? body.email.trim() || undefined : undefined;
    const city = requireString(body, "city");

    const vehicleType = body.vehicleType;
    if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType as any)) {
      return NextResponse.json(
        { error: `vehicleType is required and must be one of: ${VEHICLE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const vehicleBrand = requireString(body, "vehicleBrand");
    const vehicleModel = requireString(body, "vehicleModel");
    const vehiclePlate = requireString(body, "vehiclePlate");
    const licenseNumber = requireString(body, "licenseNumber");
    const emergencyContactName = requireString(body, "emergencyContactName");
    const emergencyContactPhone = requireString(body, "emergencyContactPhone");
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim() || undefined : undefined;

    const convex = getConvexClient();
    const result = await convex.mutation(api.driverSignup.submitDriverApplication, {
      fullName,
      phone,
      email,
      city,
      vehicleType: vehicleType as "motor" | "car",
      vehicleBrand,
      vehicleModel,
      vehiclePlate,
      licenseNumber,
      emergencyContactName,
      emergencyContactPhone,
      referralCode,
    });

    return NextResponse.json({
      ok: true,
      applicationId: result.applicationId,
      otpCode: result.otpHint,
      message: "Application submitted. Verify OTP to get your driver token.",
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
