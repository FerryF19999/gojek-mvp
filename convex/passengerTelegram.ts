/**
 * Convex functions for Telegram passenger state management
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByChatId = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("passengerTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
  },
});

export const getByRideCode = query({
  args: { rideCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("passengerTelegramState")
      .withIndex("by_rideCode", (q) => q.eq("currentRideCode", args.rideCode))
      .first();
  },
});

export const upsert = mutation({
  args: {
    chatId: v.string(),
    state: v.string(),
    currentRideCode: v.optional(v.string()),
    tempData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("passengerTelegramState")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
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

    return await ctx.db.insert("passengerTelegramState", {
      chatId: args.chatId,
      state: args.state,
      currentRideCode: args.currentRideCode,
      tempData: args.tempData,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});
