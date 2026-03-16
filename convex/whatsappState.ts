/**
 * Convex functions for WhatsApp driver state management
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Queries ───

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

export const getByDriverId = query({
  args: { driverId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("driverWhatsappState").collect();
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("driverWhatsappState")
      .filter((q) => q.eq(q.field("state"), "online"))
      .collect();
  },
});

// ─── Mutations ───

export const upsert = mutation({
  args: {
    phone: v.string(),
    driverId: v.optional(v.string()),
    apiToken: v.optional(v.string()),
    state: v.optional(v.string()),
    registrationStep: v.optional(v.string()),
    currentRideCode: v.optional(v.string()),
    tempData: v.optional(v.any()),
    lastMessageAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    const now = args.lastMessageAt || Date.now();

    if (existing) {
      // Update only provided fields
      const patch: Record<string, any> = { lastMessageAt: now };
      if (args.state !== undefined) patch.state = args.state;
      if (args.driverId !== undefined) patch.driverId = args.driverId;
      if (args.apiToken !== undefined) patch.apiToken = args.apiToken;
      if (args.registrationStep !== undefined) patch.registrationStep = args.registrationStep;
      if (args.currentRideCode !== undefined) patch.currentRideCode = args.currentRideCode;
      if (args.tempData !== undefined) patch.tempData = args.tempData;

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      // Create new
      return await ctx.db.insert("driverWhatsappState", {
        phone: args.phone,
        driverId: args.driverId,
        apiToken: args.apiToken,
        state: args.state || "unknown",
        registrationStep: args.registrationStep,
        currentRideCode: args.currentRideCode,
        tempData: args.tempData,
        lastMessageAt: now,
      });
    }
  },
});

export const updateLastMessage = mutation({
  args: {
    phone: v.string(),
    lastMessageAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastMessageAt: args.lastMessageAt });
    }
  },
});

export const updateState = mutation({
  args: {
    phone: v.string(),
    state: v.string(),
    currentRideCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (existing) {
      const patch: Record<string, any> = {
        state: args.state,
        lastMessageAt: Date.now(),
      };
      if (args.currentRideCode !== undefined) {
        patch.currentRideCode = args.currentRideCode;
      }
      await ctx.db.patch(existing._id, patch);
    }
  },
});

export const deleteByPhone = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappState")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});
