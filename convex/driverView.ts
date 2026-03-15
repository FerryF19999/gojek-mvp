import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getRideForDriver = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const ride = await ctx.db
      .query("rides")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!ride) return null;

    let driver = null;
    let driverUser = null;
    if (ride.assignedDriverId) {
      driver = await ctx.db.get(ride.assignedDriverId);
      if (driver) {
        driverUser = await ctx.db.get(driver.userId);
      }
    }

    return {
      ...ride,
      driver: driver
        ? {
            _id: driver._id,
            vehicleType: driver.vehicleType,
            availability: driver.availability,
            lastLocation: driver.lastLocation,
            driverName: driverUser?.name ?? "Driver",
          }
        : null,
    };
  },
});

export const updateDriverLocation = mutation({
  args: {
    driverId: v.id("drivers"),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    await ctx.db.patch(args.driverId, {
      lastLocation: {
        lat: args.lat,
        lng: args.lng,
        updatedAt: Date.now(),
      },
    });

    return { ok: true };
  },
});

export const driverAcceptRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    const now = Date.now();
    await ctx.db.patch(args.rideId, {
      driverResponseStatus: "accepted",
      status: "driver_arriving",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "driver_accepted", at: now, by: "driver", note: "Driver accepted via driver view" },
        { type: "driver_arriving", at: now, by: "driver", note: "Driver heading to pickup" },
      ],
    });

    return { ok: true };
  },
});

export const driverArrivedAtPickup = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.status !== "driver_arriving") {
      throw new Error(`Cannot mark arrived — current status: ${ride.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.rideId, {
      status: "picked_up",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "arrived_at_pickup", at: now, by: "driver", note: "Driver arrived at pickup point" },
        { type: "picked_up", at: now, by: "driver", note: "Passenger picked up" },
      ],
    });

    return { ok: true };
  },
});

export const driverCompleteRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.status !== "picked_up") {
      throw new Error(`Cannot complete — current status: ${ride.status}`);
    }

    const now = Date.now();

    // Free up the driver
    if (ride.assignedDriverId) {
      await ctx.db.patch(ride.assignedDriverId, {
        availability: "online",
        lastActiveAt: now,
      });
    }

    await ctx.db.patch(args.rideId, {
      status: "completed",
      updatedAt: now,
      timeline: [
        ...ride.timeline,
        { type: "completed", at: now, by: "driver", note: "Ride completed by driver" },
      ],
    });

    return { ok: true };
  },
});
