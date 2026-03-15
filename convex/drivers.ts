import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { isDriverSubscribed } from "./subscription";

export const registerDriver = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    notificationWebhook: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      role: "driver",
      name: args.fullName,
      phone: args.phone,
      email: args.email,
      status: "active",
      createdAt: now,
    });

    const driverId = await ctx.db.insert("drivers", {
      userId,
      vehicleType: args.vehicleType,
      availability: "offline",
      subscriptionStatus: "inactive",
      rating: 5.0,
      notificationWebhook: args.notificationWebhook,
      lastLocation: {
        lat: args.lat ?? -6.2,
        lng: args.lng ?? 106.816666,
        updatedAt: now,
      },
      lastActiveAt: now,
    });

    return { driverId, userId };
  },
});

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
      subscriptionStatus: "inactive",
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

export const setDriverSubscription = mutation({
  args: {
    driverId: v.id("drivers"),
    plan: v.string(),
    subscribedUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    const now = Date.now();
    const status = args.subscribedUntil > now ? "active" : "inactive";

    await ctx.db.patch(args.driverId, {
      subscriptionPlan: args.plan,
      subscribedUntil: args.subscribedUntil,
      subscriptionStatus: status,
      lastActiveAt: now,
    });

    return { ok: true, subscriptionStatus: status };
  },
});

export const getDriver = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.driverId);
  },
});

export const getDriverByApiToken = query({
  args: { apiToken: v.string() },
  handler: async (ctx, args) => {
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_apiToken", (q) => q.eq("apiToken", args.apiToken))
      .first();
    if (!driver) return null;
    const user = await ctx.db.get(driver.userId);
    return { ...driver, userName: user?.name ?? "Unknown", userPhone: user?.phone ?? null, userEmail: user?.email ?? null };
  },
});

export const setDriverWebhook = mutation({
  args: { driverId: v.id("drivers"), url: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, { notificationWebhook: args.url, lastActiveAt: Date.now() });
    return { ok: true };
  },
});

export const setDriverApiToken = mutation({
  args: { driverId: v.id("drivers"), apiToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, { apiToken: args.apiToken, lastActiveAt: Date.now() });
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

    const now = Date.now();
    const hydrated = await Promise.all(
      drivers.map(async (d) => {
        const user = await ctx.db.get(d.userId);
        const subscribed = isDriverSubscribed(d, now);
        const badge = d.subscribedUntil == null ? "Not set" : subscribed ? "Subscribed" : "Expired";
        return {
          ...d,
          userName: user?.name ?? "Unknown",
          phone: user?.phone ?? null,
          isSubscribed: subscribed,
          subscriptionBadge: badge,
        };
      }),
    );

    return hydrated.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  },
});

/** List rides assigned to a driver (by driverId) */
export const getDriverRides = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    const rides = await ctx.db
      .query("rides")
      .filter((q) => q.eq(q.field("assignedDriverId"), args.driverId))
      .order("desc")
      .take(20);
    return rides.map((r) => ({
      _id: r._id,
      code: r.code,
      status: r.status,
      vehicleType: r.vehicleType,
      customerName: r.customerName,
      pickup: r.pickup,
      dropoff: r.dropoff,
      price: r.price,
      createdAt: r._creationTime,
    }));
  },
});
