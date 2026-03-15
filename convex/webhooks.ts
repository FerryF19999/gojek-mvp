import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const isProcessed = query({
  args: { provider: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("webhook_events")
      .withIndex("by_provider_event", (q) => q.eq("provider", args.provider).eq("eventId", args.eventId))
      .first();
    return !!row;
  },
});

export const markProcessed = internalMutation({
  args: { provider: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhook_events", { provider: args.provider, eventId: args.eventId, createdAt: Date.now() });
    return { ok: true };
  },
});
