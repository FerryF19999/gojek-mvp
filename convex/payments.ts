import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const createPaymentQris = mutation({
  args: { rideId: v.id("rides"), provider: v.union(v.literal("xendit"), v.literal("midtrans")) },
  handler: async (ctx, args): Promise<any> => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    if (args.provider !== "xendit") throw new Error("MVP configured for Xendit only");

    const externalId = `ride_${ride.code}_${Date.now()}`;

    // Stubbed QRIS response for dev/demo.
    const stub = {
      id: `xnd_qr_${Date.now()}`,
      qr_string: `00020101021226660014ID.CO.QRIS.WWW0118936009153265309015ID10253734512380203URE5204549953033605802ID5912GOJEK MVP OPS6007JAKARTA61051234562070703A016304B2AA`,
      checkout_url: `https://checkout.xendit.co/web/${externalId}`,
      status: "PENDING",
    };

    await ctx.runMutation(internal.payments.upsertPaymentInternal, {
      rideId: args.rideId,
      providerRef: stub.id,
      amount: ride.price.amount,
      checkoutUrl: stub.checkout_url,
      qrString: stub.qr_string,
    });

    return { provider: "xendit", ...stub };
  },
});


export const upsertPaymentInternal = internalMutation({
  args: {
    rideId: v.id("rides"),
    providerRef: v.string(),
    amount: v.number(),
    checkoutUrl: v.optional(v.string()),
    qrString: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_providerRef", (q) => q.eq("providerRef", args.providerRef))
      .first();
    const now = Date.now();
    if (existing) return existing._id;

    const paymentId = await ctx.db.insert("payments", {
      rideId: args.rideId,
      provider: "xendit",
      providerRef: args.providerRef,
      checkoutUrl: args.checkoutUrl,
      qrString: args.qrString,
      status: "pending",
      amount: args.amount,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.rideId, { paymentStatus: "pending", updatedAt: now });
    return paymentId;
  },
});

export const markPaidInternal = internalMutation({
  args: { providerRef: v.string(), payload: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_providerRef", (q) => q.eq("providerRef", args.providerRef))
      .first();
    if (!payment) return { ok: false };

    const now = Date.now();
    await ctx.db.patch(payment._id, { status: "paid", rawWebhookPayload: args.payload, updatedAt: now });
    await ctx.db.patch(payment.rideId, { paymentStatus: "paid", updatedAt: now });
    return { ok: true };
  },
});
