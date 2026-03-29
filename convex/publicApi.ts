/**
 * Public API mutations/queries for AI agents.
 * No ops key required — auth via Bearer token or ride code.
 */
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { DRIVER_SUBSCRIPTION_PLAN, DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY } from "../lib/pricing";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const RATE_PER_KM: Record<string, number> = { motor: 2500, car: 4000 };
const MIN_PRICE = 10000;

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const nextRideCode = async (ctx: any) => {
  const rides = await ctx.db.query("rides").order("desc").take(1);
  const lastCode = rides[0]?.code ?? "RIDE-000000";
  const number = Number(lastCode.split("-")[1] ?? "0") + 1;
  return `RIDE-${String(number).padStart(6, "0")}`;
};

// ─── Driver self-subscribe ───

export const driverSelfSubscribe = mutation({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    const now = Date.now();

    // Already subscribed and not expired
    if (driver.subscriptionStatus === "active" && driver.subscribedUntil && driver.subscribedUntil > now) {
      return {
        ok: true,
        alreadySubscribed: true,
        subscription: {
          status: "active" as const,
          plan: driver.subscriptionPlan ?? "basic_monthly",
          expiresAt: new Date(driver.subscribedUntil).toISOString(),
        },
      };
    }

    const subscribedUntil = now + MONTH_MS;

    await ctx.db.patch(args.driverId, {
      subscriptionStatus: "active",
      subscribedUntil,
      subscriptionPlan: "basic_monthly",
      lastActiveAt: now,
    });

    return {
      ok: true,
      alreadySubscribed: false,
      subscription: {
        status: "active" as const,
        plan: "basic_monthly",
        expiresAt: new Date(subscribedUntil).toISOString(),
      },
    };
  },
});

// ─── Driver arrive at pickup ───

export const driverArriveAtPickup = mutation({
  args: { driverId: v.id("drivers"), rideCode: v.string() },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.rideCode))
      .unique();
    if (!ride) throw new Error("Ride not found");
    if (ride.assignedDriverId !== args.driverId) throw new Error("You are not assigned to this ride");

    // Idempotent: already at or past picked_up
    if (["picked_up", "completed"].includes(ride.status)) {
      return { ok: true, alreadyArrived: true, status: ride.status };
    }

    const allowedStatuses = ["assigned", "awaiting_driver_response", "driver_arriving"];
    if (!allowedStatuses.includes(ride.status)) {
      throw new Error(`Cannot arrive: ride status is '${ride.status}', expected one of: ${allowedStatuses.join(", ")}`);
    }

    const now = Date.now();
    await ctx.db.patch(ride._id, {
      status: "picked_up",
      driverResponseStatus: "accepted",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "picked_up", at: now, by: "driver", note: "Driver arrived at pickup" },
      ],
    });

    return { ok: true, alreadyArrived: false, status: "picked_up" };
  },
});

// ─── Driver complete ride ───

export const driverCompleteRide = mutation({
  args: { driverId: v.id("drivers"), rideCode: v.string() },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.rideCode))
      .unique();
    if (!ride) throw new Error("Ride not found");
    if (ride.assignedDriverId !== args.driverId) throw new Error("You are not assigned to this ride");

    // Idempotent: already completed
    if (ride.status === "completed") {
      return { ok: true, alreadyCompleted: true, status: "completed" };
    }

    // Allow complete from picked_up OR driver_arriving (flexible for AI agents)
    const allowedStatuses = ["picked_up", "driver_arriving"];
    if (!allowedStatuses.includes(ride.status)) {
      throw new Error(`Cannot complete: ride status is '${ride.status}', expected one of: ${allowedStatuses.join(", ")}`);
    }

    const now = Date.now();

    // Complete the ride
    await ctx.db.patch(ride._id, {
      status: "completed",
      agentStatus: "completed",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "completed", at: now, by: "driver", note: "Ride completed by driver" },
      ],
    });

    await ctx.scheduler.runAfter(0, (internal as any).pushNotifications.sendRideStatusPush, {
      rideCode: ride.code,
      status: "completed",
    });

    // Set driver back to online
    await ctx.db.patch(args.driverId, {
      availability: "online",
      lastActiveAt: now,
    });

    return { ok: true, alreadyCompleted: false, status: "completed" };
  },
});

// ─── Public ride creation (no auth) ───

export const createPublicRide = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    pickup: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
    dropoff: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    paymentMethod: v.optional(v.union(v.literal("cash"), v.literal("ovo"), v.literal("gopay"), v.literal("dana"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const distanceKm = haversineKm(args.pickup.lat, args.pickup.lng, args.dropoff.lat, args.dropoff.lng);
    const rate = RATE_PER_KM[args.vehicleType] ?? 2500;
    const amount = Math.max(MIN_PRICE, Math.round(distanceKm * rate));
    const code = await nextRideCode(ctx);

    const rideId = await ctx.db.insert("rides", {
      code,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      agentStatus: "stopped",
      agentSpeed: "normal",
      agentJobIds: [],
      pickup: args.pickup,
      dropoff: args.dropoff,
      vehicleType: args.vehicleType,
      price: { amount, currency: "IDR" },
      status: "created",
      timeline: [
        { type: "created", at: now, by: "passenger-api", note: "Ride created via public API" },
      ],
      paymentStatus: "unpaid",
      paymentMethod: args.paymentMethod ?? "cash",
      createdAt: now,
      updatedAt: now,
    });

    // Don't auto-start ride agent — let the WhatsApp bot dispatch handle it
    // Bot dispatch: find driver → notify via Message Yourself → wait for "terima"
    await ctx.db.patch(rideId, {
      agentStatus: "stopped",
      status: "dispatching",
      updatedAt: now,
    });

    return { rideId, code, status: "created" as const, price: amount, paymentMethod: args.paymentMethod ?? "cash" };
  },
});

// ─── Public ride status (by code) ───

export const getPublicRideStatus = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!ride) return null;

    let driver: {
      name: string;
      vehicleType: string;
      lastLocation: { lat: number; lng: number; updatedAt: number };
    } | null = null;

    if (ride.assignedDriverId) {
      const driverDoc = await ctx.db.get(ride.assignedDriverId);
      if (driverDoc) {
        const userDoc = await ctx.db.get(driverDoc.userId);
        driver = {
          name: userDoc?.name ?? "Driver",
          vehicleType: driverDoc.vehicleType,
          lastLocation: driverDoc.lastLocation,
        };
      }
    }

    return {
      rideId: ride._id,
      code: ride.code,
      status: ride.status,
      customerName: ride.customerName,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      vehicleType: ride.vehicleType,
      price: ride.price,
      paymentStatus: ride.paymentStatus,
      paymentMethod: ride.paymentMethod,
      assignedDriverId: ride.assignedDriverId ?? null,
      driver,
      timeline: ride.timeline,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    };
  },
});

// ─── Public ride payment (demo) ───

export const payRideByCode = mutation({
  args: {
    code: v.string(),
    method: v.optional(v.union(v.literal("cash"), v.literal("ovo"), v.literal("gopay"), v.literal("dana"))),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!ride) throw new Error("Ride not found");

    if (ride.paymentStatus === "paid") {
      return { ok: true, alreadyPaid: true, status: ride.status, paymentStatus: "paid", paymentMethod: ride.paymentMethod };
    }

    if (ride.status !== "completed") {
      throw new Error("Payment can only be completed after ride status = completed");
    }

    const now = Date.now();
    const paymentMethod = args.method ?? ride.paymentMethod ?? "cash";

    await ctx.db.patch(ride._id, {
      paymentStatus: "paid",
      paymentMethod,
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "payment_received", at: now, by: "passenger-api", note: `Payment completed via ${paymentMethod.toUpperCase()} (post-ride)` },
      ],
    });

    // Also create/update payment record so ride agent sees it as paid
    const existingPayment = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("rideId"), ride._id))
      .first();
    if (existingPayment) {
      await ctx.db.patch(existingPayment._id, { status: "paid", updatedAt: now });
    } else {
      await ctx.db.insert("payments", {
        rideId: ride._id,
        amount: ride.price?.amount ?? 10000,
        status: "paid",
        provider: "demo",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ok: true, alreadyPaid: false, status: ride.status, paymentStatus: "paid", paymentMethod };
  },
});

// ─── Driver registration via API (no OTP) ───

export const registerDriverDirect = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    vehicleBrand: v.string(),
    vehicleModel: v.string(),
    vehiclePlate: v.string(),
    licenseNumber: v.string(),
    city: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const phone = args.phone.replace(/\s+/g, "").trim();

    // Check if phone already registered
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    if (existingUser) {
      // Check if there's already a driver for this user
      const existingDriver = await ctx.db
        .query("drivers")
        .withIndex("by_userId", (q) => q.eq("userId", existingUser._id))
        .first();
      if (existingDriver) {
        // Return existing driver info
        return {
          ok: true,
          alreadyExists: true,
          driverId: existingDriver._id,
          apiToken: existingDriver.apiToken ?? null,
          status: existingDriver.subscriptionStatus === "active" ? "active" : "pending_payment",
        };
      }
    }

    const userId = existingUser?._id ?? await ctx.db.insert("users", {
      role: "driver",
      name: args.fullName.trim(),
      phone,
      status: "active",
      createdAt: now,
    });

    const apiToken = crypto.randomUUID();

    const driverId = await ctx.db.insert("drivers", {
      userId,
      vehicleType: args.vehicleType,
      availability: "offline",
      subscriptionStatus: "inactive",
      subscriptionPlan: "basic_monthly",
      rating: 5,
      apiToken,
      lastLocation: { lat: -6.2, lng: 106.816666, updatedAt: now },
      lastActiveAt: now,
    });

    // Also create a driverApplication record for tracking
    await ctx.db.insert("driverApplications", {
      fullName: args.fullName.trim(),
      phone,
      city: args.city.trim(),
      vehicleType: args.vehicleType,
      vehicleBrand: args.vehicleBrand.trim(),
      vehicleModel: args.vehicleModel.trim(),
      vehiclePlate: args.vehiclePlate.trim().toUpperCase(),
      licenseNumber: args.licenseNumber.trim().toUpperCase(),
      emergencyContactName: "N/A",
      emergencyContactPhone: "N/A",
      otpCode: "API",
      otpSentAt: now,
      otpVerifiedAt: now,
      status: "pending_payment",
      userId,
      driverId,
      notes: "Registered via public API (no OTP)",
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      alreadyExists: false,
      driverId,
      apiToken,
      status: "pending_payment",
    };
  },
});

// ─── Driver accept/decline ride ───

export const driverRespondToRide = mutation({
  args: {
    driverId: v.id("drivers"),
    rideCode: v.string(),
    response: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.rideCode))
      .unique();
    if (!ride) throw new Error("Ride not found");

    // Verify this driver is the assigned driver
    if (!ride.assignedDriverId || String(ride.assignedDriverId) !== String(args.driverId)) {
      throw new Error("You are not the assigned driver for this ride");
    }

    if (ride.driverResponseStatus === "accepted") {
      return { alreadyResponded: true, response: "accepted" };
    }
    if (ride.driverResponseStatus === "declined") {
      return { alreadyResponded: true, response: "declined" };
    }

    const now = Date.now();

    if (args.response === "declined") {
      // Add to declined list, unassign, set driver back online
      const declinedIds = ride.declinedDriverIds ?? [];
      await ctx.db.patch(ride._id, {
        assignedDriverId: undefined,
        driverResponseStatus: "declined",
        declinedDriverIds: [...declinedIds, args.driverId],
        updatedAt: now,
      });
      await ctx.db.patch(args.driverId, { availability: "online", lastActiveAt: now });

      return { response: "declined", note: "Ride will be re-dispatched to another driver" };
    }

    // Accepted
    await ctx.db.patch(ride._id, {
      driverResponseStatus: "accepted",
      updatedAt: now,
    });

    return { response: "accepted", rideCode: args.rideCode };
  },
});
