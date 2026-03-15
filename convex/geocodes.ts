import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByQuery = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.query.trim().toLowerCase();
    if (!normalized) return null;

    const cached = await ctx.db
      .query("geocodes")
      .withIndex("by_query", (q) => q.eq("query", normalized))
      .order("desc")
      .first();

    return cached ?? null;
  },
});

export const put = mutation({
  args: {
    query: v.string(),
    lat: v.number(),
    lng: v.number(),
    displayName: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.query.trim().toLowerCase();
    const now = Date.now();

    const existing = await ctx.db
      .query("geocodes")
      .withIndex("by_query", (q) => q.eq("query", normalized))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lat: args.lat,
        lng: args.lng,
        displayName: args.displayName,
        provider: args.provider,
        createdAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("geocodes", {
      query: normalized,
      lat: args.lat,
      lng: args.lng,
      displayName: args.displayName,
      provider: args.provider,
      createdAt: now,
    });
  },
});
