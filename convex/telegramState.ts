/**
 * Convex functions for Telegram driver state management
 * Uses chatId (Telegram user ID) as the primary key instead of phone number
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Queries ───

export const getByChatId = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
  },
});

export const getByDriverId = query({
  args: { driverId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverTelegramState")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("driverTelegramState").collect();
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("driverTelegramState")
      .filter((q) => q.eq(q.field("state"), "online"))
      .collect();
  },
});

// ─── Mutations ───

export const upsert = mutation({
  args: {
    chatId: v.string(),
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
      .query("driverTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    const now = args.lastMessageAt || Date.now();

    if (existing) {
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
      return await ctx.db.insert("driverTelegramState", {
        chatId: args.chatId,
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
    chatId: v.string(),
    lastMessageAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastMessageAt: args.lastMessageAt });
    }
  },
});

export const updateState = mutation({
  args: {
    chatId: v.string(),
    state: v.string(),
    currentRideCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
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

export const deleteByChatId = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});
