import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { isDriverSubscribed } from "./subscription";

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
    priceOverride: v.optional(v.number()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const distanceKm = haversineKm(args.pickup.lat, args.pickup.lng, args.dropoff.lat, args.dropoff.lng);
    const computedAmount = Math.max(10000, Math.round(distanceKm * 3500));
    const amount = args.priceOverride ?? computedAmount;
    if (amount <= 0) {
      throw new Error("priceOverride must be greater than 0");
    }
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
      status: "awaiting_payment",
      timeline: [
        { type: "created", at: now, by: args.createdBy },
        {
          type: "awaiting_payment",
          at: now,
          by: args.createdBy,
          note: "Prepaid required before dispatch. Generate QRIS and mark payment paid to continue.",
        },
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
      v.literal("awaiting_payment"),
      v.literal("dispatching"),
      v.literal("assigned"),
      v.literal("driver_arriving"),
      v.literal("picked_up"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("awaiting_driver_response"),
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
    if (!isDriverSubscribed(driver, Date.now())) throw new Error("Driver subscription is inactive");

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

    return { ride, driver: driver ? { ...driver, userName: driverUser?.name, userPhone: driverUser?.phone } : null, payments };
  },
});

export const setDriverResponse = mutation({
  args: {
    rideId: v.id("rides"),
    action: v.union(v.literal("accept"), v.literal("decline")),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    const now = Date.now();

    if (args.action === "accept") {
      await ctx.db.patch(args.rideId, {
        driverResponseStatus: "accepted",
        status: "assigned",
        updatedAt: now,
        timeline: [
          ...ride.timeline,
          { type: "driver_accepted", at: now, by: "driver", note: "Driver accepted ride assignment" },
        ],
      });

      await ctx.db.insert("agent_actions", {
        rideId: args.rideId,
        agentName: "ride_agent",
        actionType: "driver_response",
        input: JSON.stringify({ action: "accept" }),
        output: JSON.stringify({ status: "accepted" }),
        approvedBy: "driver",
        createdAt: now,
      });

      return { ok: true, status: "accepted" };
    }

    // decline — free driver, track as declined so agent skips them
    const declinedDriverId = ride.assignedDriverId;
    if (declinedDriverId) {
      await ctx.db.patch(declinedDriverId, { availability: "online", lastActiveAt: now });
    }

    const existingDeclined = ride.declinedDriverIds ?? [];
    const newDeclined = declinedDriverId ? [...existingDeclined, declinedDriverId] : existingDeclined;

    await ctx.db.patch(args.rideId, {
      driverResponseStatus: "declined",
      assignedDriverId: undefined,
      declinedDriverIds: newDeclined,
      status: "dispatching",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "driver_declined", at: now, by: "driver", note: "Driver declined ride — re-dispatching" },
      ],
    });

    await ctx.db.insert("agent_actions", {
      rideId: args.rideId,
      agentName: "ride_agent",
      actionType: "driver_response",
      input: JSON.stringify({ action: "decline", declinedDriverId }),
      output: JSON.stringify({ status: "declined", note: "Re-dispatching to next available driver" }),
      approvedBy: "driver",
      createdAt: now,
    });

    return { ok: true, status: "declined" };
  },
});

export const getRideOps = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return null;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_rideId", (q) => q.eq("rideId", args.rideId))
      .collect();

    const actions = await ctx.db
      .query("agent_actions")
      .withIndex("by_rideId", (q) => q.eq("rideId", args.rideId))
      .collect();

    return {
      ride,
      payments: payments.sort((a, b) => b.createdAt - a.createdAt),
      actions: actions.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});
