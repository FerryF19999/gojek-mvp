import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalize = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

export const join = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();

    if (!name) throw new Error("Name is required");
    if (!email || !email.includes("@")) throw new Error("Valid email is required");

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      return { ok: true, id: existing._id, alreadyJoined: true };
    }

    const id = await ctx.db.insert("waitlist", {
      name,
      email,
      company: normalize(args.company),
      role: normalize(args.role),
      note: normalize(args.note),
      createdAt: Date.now(),
    });

    return { ok: true, id, alreadyJoined: false };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("waitlist").collect();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
});
