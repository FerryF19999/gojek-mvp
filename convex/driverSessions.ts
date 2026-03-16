/**
 * Convex functions for per-driver WhatsApp bot sessions
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Queries ───

export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const getByDriverId = query({
  args: { driverId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_driverId", (q) => q.eq("driverId", args.driverId))
      .first();
  },
});

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("driverWhatsappSessions").collect();
  },
});

export const listConnected = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_status", (q) => q.eq("status", "connected"))
      .collect();
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("driverWhatsappSessions").collect();
    return {
      total: all.length,
      connected: all.filter((s) => s.status === "connected").length,
      disconnected: all.filter((s) => s.status === "disconnected").length,
      qrPending: all.filter((s) => s.status === "qr_pending").length,
      loggedOut: all.filter((s) => s.status === "logged_out").length,
    };
  },
});

// ─── Mutations ───

export const upsert = mutation({
  args: {
    sessionId: v.string(),
    driverId: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("qr_pending"),
        v.literal("connecting"),
        v.literal("connected"),
        v.literal("disconnected"),
        v.literal("logged_out"),
      ),
    ),
    lastConnectedAt: v.optional(v.number()),
    registrationData: v.optional(v.object({
      fullName: v.optional(v.string()),
      vehicleType: v.optional(v.union(v.literal("motor"), v.literal("car"))),
      vehicleBrand: v.optional(v.string()),
      vehiclePlate: v.optional(v.string()),
      city: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, any> = { updatedAt: now };
      if (args.driverId !== undefined) patch.driverId = args.driverId;
      if (args.phone !== undefined) patch.phone = args.phone;
      if (args.status !== undefined) patch.status = args.status;
      if (args.lastConnectedAt !== undefined) patch.lastConnectedAt = args.lastConnectedAt;
      if (args.registrationData !== undefined) patch.registrationData = args.registrationData;

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      return await ctx.db.insert("driverWhatsappSessions", {
        sessionId: args.sessionId,
        driverId: args.driverId,
        phone: args.phone,
        status: args.status || "qr_pending",
        lastConnectedAt: args.lastConnectedAt,
        registrationData: args.registrationData,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const updateStatus = mutation({
  args: {
    sessionId: v.string(),
    status: v.union(
      v.literal("qr_pending"),
      v.literal("connecting"),
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("logged_out"),
    ),
    phone: v.optional(v.string()),
    lastConnectedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      const patch: Record<string, any> = {
        status: args.status,
        updatedAt: Date.now(),
      };
      if (args.phone !== undefined) patch.phone = args.phone;
      if (args.lastConnectedAt !== undefined) patch.lastConnectedAt = args.lastConnectedAt;

      await ctx.db.patch(existing._id, patch);
    }
  },
});

export const linkDriver = mutation({
  args: {
    sessionId: v.string(),
    driverId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        driverId: args.driverId,
        updatedAt: Date.now(),
      });
    }
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("driverWhatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});
