import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createDriver = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      role: "driver",
      name: args.name,
      phone: args.phone,
      status: "active",
      createdAt: now,
    });

    const driverId = await ctx.db.insert("drivers", {
      userId,
      vehicleType: args.vehicleType,
      availability: "offline",
      rating: 4.8,
      lastLocation: { lat: args.lat, lng: args.lng, updatedAt: now },
      lastActiveAt: now,
    });

    return driverId;
  },
});

export const setDriverAvailability = mutation({
  args: {
    driverId: v.id("drivers"),
    availability: v.union(v.literal("online"), v.literal("offline"), v.literal("busy")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, { availability: args.availability, lastActiveAt: Date.now() });
    return { ok: true };
  },
});

export const updateDriverLocation = mutation({
  args: { driverId: v.id("drivers"), lat: v.number(), lng: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, {
      lastLocation: { lat: args.lat, lng: args.lng, updatedAt: Date.now() },
      lastActiveAt: Date.now(),
    });
    return { ok: true };
  },
});

export const listDrivers = query({
  args: { availability: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const drivers = args.availability
      ? await ctx.db
          .query("drivers")
          .withIndex("by_availability", (q) => q.eq("availability", args.availability as any))
          .collect()
      : await ctx.db.query("drivers").collect();

    const hydrated = await Promise.all(
      drivers.map(async (d) => {
        const user = await ctx.db.get(d.userId);
        return { ...d, userName: user?.name ?? "Unknown" };
      }),
    );

    return hydrated.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  },
});
