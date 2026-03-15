import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { DRIVER_SUBSCRIPTION_PLAN, DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY } from "../lib/pricing";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const normalizePhone = (input: string) => input.replace(/\s+/g, "").trim();
const dummyOtp = () => "123456";

export const submitDriverApplication = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    city: v.string(),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    vehicleBrand: v.string(),
    vehicleModel: v.string(),
    vehiclePlate: v.string(),
    licenseNumber: v.string(),
    emergencyContactName: v.string(),
    emergencyContactPhone: v.string(),
    referralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const phone = normalizePhone(args.phone);
    const otpCode = dummyOtp();

    const appId = await ctx.db.insert("driverApplications", {
      fullName: args.fullName.trim(),
      phone,
      email: args.email?.trim() || undefined,
      city: args.city.trim(),
      vehicleType: args.vehicleType,
      vehicleBrand: args.vehicleBrand.trim(),
      vehicleModel: args.vehicleModel.trim(),
      vehiclePlate: args.vehiclePlate.trim().toUpperCase(),
      licenseNumber: args.licenseNumber.trim().toUpperCase(),
      emergencyContactName: args.emergencyContactName.trim(),
      emergencyContactPhone: normalizePhone(args.emergencyContactPhone),
      referralCode: args.referralCode?.trim() || undefined,
      otpCode,
      otpSentAt: now,
      status: "otp_pending",
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      applicationId: appId,
      otpHint: otpCode,
      message: "OTP dummy terkirim. Gunakan kode 123456 untuk verifikasi.",
    };
  },
});

export const verifyDriverApplicationOtp = mutation({
  args: {
    applicationId: v.id("driverApplications"),
    otpCode: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status !== "otp_pending") {
      return { ok: true, alreadyVerified: true, driverId: app.driverId, status: app.status };
    }

    const code = args.otpCode.trim();
    if (code !== app.otpCode) throw new Error("OTP tidak valid");

    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", app.phone))
      .first();

    const userId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        role: "driver",
        name: app.fullName,
        phone: app.phone,
        email: app.email,
        status: "active",
        createdAt: now,
      }));

    const existingDriver = await ctx.db
      .query("drivers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const driverId =
      existingDriver?._id ??
      (await ctx.db.insert("drivers", {
        userId,
        vehicleType: app.vehicleType,
        availability: "offline",
        subscriptionStatus: "inactive",
        subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
        rating: 5,
        lastLocation: { lat: -6.2, lng: 106.816666, updatedAt: now },
        lastActiveAt: now,
      }));

    await ctx.db.patch(args.applicationId, {
      otpVerifiedAt: now,
      status: "pending_payment",
      userId,
      driverId,
      notes: `Driver menunggu pembayaran langganan Rp${DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY.toLocaleString("id-ID")}/bulan.`,
      updatedAt: now,
    });

    return {
      ok: true,
      status: "pending_payment",
      driverId,
      userId,
      needsSubscriptionPayment: true,
      subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
      subscriptionPrice: DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY,
    };
  },
});

export const activateDriverSubscriptionDemo = mutation({
  args: {
    applicationId: v.id("driverApplications"),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (!app.driverId) throw new Error("Driver belum dibuat. Verifikasi OTP dulu.");

    const now = Date.now();
    const subscribedUntil = now + MONTH_MS;

    await ctx.db.patch(app.driverId, {
      subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
      subscriptionStatus: "active",
      subscribedUntil,
      lastActiveAt: now,
    });

    await ctx.db.patch(args.applicationId, {
      status: "active",
      notes: "Pembayaran langganan demo berhasil.",
      updatedAt: now,
    });

    return {
      ok: true,
      driverId: app.driverId,
      status: "active",
      subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
      subscribedUntil,
    };
  },
});

/** Public API: verify OTP and generate apiToken for the driver */
export const verifyDriverApplicationOtpWithToken = mutation({
  args: {
    applicationId: v.id("driverApplications"),
    otpCode: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status !== "otp_pending") {
      // Already verified — return existing driver info
      if (app.driverId) {
        const driver = await ctx.db.get(app.driverId);
        return { ok: true, alreadyVerified: true, driverId: app.driverId, driverToken: driver?.apiToken ?? null, status: app.status };
      }
      return { ok: true, alreadyVerified: true, driverId: app.driverId, driverToken: null, status: app.status };
    }

    const code = args.otpCode.trim();
    if (code !== app.otpCode) throw new Error("OTP tidak valid");

    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", app.phone))
      .first();

    const userId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        role: "driver",
        name: app.fullName,
        phone: app.phone,
        email: app.email,
        status: "active",
        createdAt: now,
      }));

    const existingDriver = await ctx.db
      .query("drivers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    // Generate a random API token
    const apiToken = crypto.randomUUID();

    const driverId =
      existingDriver?._id ??
      (await ctx.db.insert("drivers", {
        userId,
        vehicleType: app.vehicleType,
        availability: "offline",
        subscriptionStatus: "inactive",
        subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
        rating: 5,
        apiToken,
        lastLocation: { lat: -6.2, lng: 106.816666, updatedAt: now },
        lastActiveAt: now,
      }));

    // If driver already existed, set the apiToken
    if (existingDriver) {
      await ctx.db.patch(driverId, { apiToken, lastActiveAt: now });
    }

    await ctx.db.patch(args.applicationId, {
      otpVerifiedAt: now,
      status: "pending_payment",
      userId,
      driverId,
      notes: `Driver menunggu pembayaran langganan Rp${DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY.toLocaleString("id-ID")}/bulan.`,
      updatedAt: now,
    });

    return {
      ok: true,
      status: "pending_payment",
      driverId,
      driverToken: apiToken,
    };
  },
});

export const getDriverApplication = query({
  args: { applicationId: v.id("driverApplications") },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.applicationId);
    if (!app) return null;

    const driver = app.driverId ? await ctx.db.get(app.driverId) : null;
    const user = app.userId ? await ctx.db.get(app.userId) : null;

    return {
      application: app,
      driver,
      user,
      subscriptionPrice: DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY,
      subscriptionPlan: DRIVER_SUBSCRIPTION_PLAN,
    };
  },
});
