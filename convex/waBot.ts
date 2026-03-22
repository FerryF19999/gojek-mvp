import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Simpan QR string dari bot
export const saveQR = mutation({
  args: {
    qr: v.union(v.string(), v.null()),
    connected: v.boolean(),
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Hapus record lama dulu
    const existing = await ctx.db.query("waBotStatus").first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("waBotStatus", {
      qr: args.qr,
      connected: args.connected,
      phoneNumber: args.phoneNumber,
      updatedAt: Date.now(),
    });
  },
});

// Baca status QR
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.db.query("waBotStatus").first();
    if (!status) return { qr: null, connected: false, phoneNumber: null };
    return {
      qr: status.qr,
      connected: status.connected,
      phoneNumber: status.phoneNumber,
    };
  },
});
