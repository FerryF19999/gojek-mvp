import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createAdminSession = mutation({
  args: {
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("adminSessions", {
      token: args.token,
      status: "pending",
      createdAt: now,
      expiresAt: args.expiresAt,
    });

    return { token: args.token, status: "pending", createdAt: now, expiresAt: args.expiresAt };
  },
});

export const verifyAdminSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session) {
      return { status: "expired" as const };
    }

    if (session.status === "verified") {
      return { status: "verified" as const, phoneNumber: session.phoneNumber ?? null };
    }

    if (Date.now() > session.expiresAt) {
      return { status: "expired" as const };
    }

    return { status: "pending" as const };
  },
});

export const approveAdminSession = mutation({
  args: {
    token: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session) {
      return { ok: false, reason: "not_found" as const };
    }

    if (Date.now() > session.expiresAt) {
      if (session.status !== "expired") {
        await ctx.db.patch(session._id, { status: "expired" });
      }
      return { ok: false, reason: "expired" as const };
    }

    await ctx.db.patch(session._id, {
      status: "verified",
      phoneNumber: args.phoneNumber,
    });

    return { ok: true };
  },
});

export const expireAdminSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session) return { ok: false };
    if (session.status === "verified" || session.status === "expired") {
      return { ok: true };
    }

    await ctx.db.patch(session._id, { status: "expired" });
    return { ok: true };
  },
});
