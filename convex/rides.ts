import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const nextRideCode = async (ctx: any) => {
  const rides = await ctx.db.query("rides").order("desc").take(1);
  const lastCode = rides[0]?.code ?? "RIDE-000000";
  const number = Number(lastCode.split("-")[1] ?? "0") + 1;
  return `RIDE-${String(number).padStart(6, "0")}`;
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const createRide = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    pickup: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
      note: v.optional(v.string()),
    }),
    dropoff: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
      note: v.optional(v.string()),
    }),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const distanceKm = haversineKm(args.pickup.lat, args.pickup.lng, args.dropoff.lat, args.dropoff.lng);
    const amount = Math.max(10000, Math.round(distanceKm * 3500));
    const code = await nextRideCode(ctx);

    const rideId = await ctx.db.insert("rides", {
      code,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      agentStatus: "stopped",
      agentJobIds: [],
      pickup: args.pickup,
      dropoff: args.dropoff,
      vehicleType: args.vehicleType,
      price: { amount, currency: "IDR" },
      status: "dispatching",
      timeline: [
        { type: "created", at: now, by: args.createdBy },
        { type: "dispatching", at: now, by: args.createdBy, note: "Auto move to dispatching" },
      ],
      paymentStatus: "unpaid",
      createdAt: now,
      updatedAt: now,
    });

    return rideId;
  },
});

export const updateRideStatus = mutation({
  args: {
    rideId: v.id("rides"),
    status: v.union(
      v.literal("created"),
      v.literal("dispatching"),
      v.literal("assigned"),
      v.literal("driver_arriving"),
      v.literal("picked_up"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    note: v.optional(v.string()),
    by: v.string(),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");
    const now = Date.now();

    await ctx.db.patch(args.rideId, {
      status: args.status,
      updatedAt: now,
      timeline: [...ride.timeline, { type: args.status, at: now, by: args.by, note: args.note }],
    });

    return { ok: true };
  },
});

export const assignDriver = mutation({
  args: {
    rideId: v.id("rides"),
    driverId: v.id("drivers"),
    assignedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    const driver = await ctx.db.get(args.driverId);
    if (!ride || !driver) throw new Error("Ride or driver not found");
    if (driver.availability !== "online") throw new Error("Driver is not online");

    const now = Date.now();
    await ctx.db.patch(args.driverId, { availability: "busy", lastActiveAt: now });
    await ctx.db.patch(args.rideId, {
      assignedDriverId: args.driverId,
      status: "assigned",
      updatedAt: now,
      timeline: [...ride.timeline, { type: "assigned", at: now, by: args.assignedBy }],
    });

    await ctx.db.insert("agent_actions", {
      rideId: args.rideId,
      agentName: "dispatch_agent",
      actionType: "assign",
      input: JSON.stringify({ driverId: args.driverId }),
      output: JSON.stringify({ status: "assigned" }),
      approvedBy: args.assignedBy,
      createdAt: now,
    });

    return { ok: true };
  },
});

export const listRides = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rides = args.status
      ? await ctx.db
          .query("rides")
          .withIndex("by_status", (q) => q.eq("status", args.status as any))
          .collect()
      : await ctx.db.query("rides").collect();

    return rides.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getRide = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return null;
    const driver = ride.assignedDriverId ? await ctx.db.get(ride.assignedDriverId as Id<"drivers">) : null;
    const driverUser = driver ? await ctx.db.get(driver.userId) : null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_rideId", (q) => q.eq("rideId", args.rideId))
      .collect();

    return { ride, driver: driver ? { ...driver, userName: driverUser?.name } : null, payments };
  },
});
