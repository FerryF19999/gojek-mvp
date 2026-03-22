import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    rideCode: v.string(),
    endpoint: v.string(),
    subscription: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ridePushSubscriptions")
      .withIndex("by_rideCode_endpoint", (q) => q.eq("rideCode", args.rideCode).eq("endpoint", args.endpoint))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { subscription: args.subscription, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("ridePushSubscriptions", {
      rideCode: args.rideCode,
      endpoint: args.endpoint,
      subscription: args.subscription,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByRideCode = query({
  args: { rideCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ridePushSubscriptions")
      .withIndex("by_rideCode", (q) => q.eq("rideCode", args.rideCode))
      .collect();
  },
});

export const remove = mutation({
  args: { rideCode: v.string(), endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ridePushSubscriptions")
      .withIndex("by_rideCode_endpoint", (q) => q.eq("rideCode", args.rideCode).eq("endpoint", args.endpoint))
      .unique();

    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
