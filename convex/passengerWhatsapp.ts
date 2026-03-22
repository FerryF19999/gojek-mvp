import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("passengerWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

export const getByRideCode = query({
  args: { rideCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("passengerWhatsappState")
      .withIndex("by_rideCode", (q) => q.eq("currentRideCode", args.rideCode))
      .first();
  },
});

export const upsert = mutation({
  args: {
    phone: v.string(),
    state: v.string(),
    currentRideCode: v.optional(v.string()),
    tempData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("passengerWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        state: args.state,
        currentRideCode: args.currentRideCode,
        tempData: args.tempData,
        lastMessageAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("passengerWhatsappState", {
      phone: args.phone,
      state: args.state,
      currentRideCode: args.currentRideCode,
      tempData: args.tempData,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});
