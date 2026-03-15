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
    const providerRef = `xnd_qr_${Date.now()}`;
    const qrPayload = `GOJEK-MVP|ride:${String(args.rideId)}|payment:${providerRef}|code:${ride.code}`;

    // Stubbed QRIS response for dev/demo.
    const stub = {
      id: providerRef,
      qr_string: qrPayload,
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

    await ctx.db.insert("agent_actions", {
      rideId: args.rideId,
      agentName: "ride_agent",
      actionType: "generate_qris_demo",
      input: JSON.stringify({ provider: "xendit", rideId: args.rideId }),
      output: JSON.stringify({ providerRef: stub.id, payload: stub.qr_string }),
      approvedBy: "operator-dashboard",
      createdAt: Date.now(),
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

export const markPaidDemo = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_rideId", (q) => q.eq("rideId", args.rideId))
      .collect();

    const latest = payment.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latest) throw new Error("No payment found. Generate QRIS first.");
    if (latest.status === "paid") return { ok: true, alreadyPaid: true, paymentId: latest._id };

    const now = Date.now();
    await ctx.db.patch(latest._id, {
      status: "paid",
      rawWebhookPayload: JSON.stringify({ demo: true, source: "manual_mark_paid" }),
      updatedAt: now,
    });
    await ctx.db.patch(args.rideId, { paymentStatus: "paid", updatedAt: now });

    await ctx.db.insert("agent_actions", {
      rideId: args.rideId,
      agentName: "support_agent",
      actionType: "mark_paid_demo",
      input: JSON.stringify({ paymentId: latest._id, providerRef: latest.providerRef }),
      output: JSON.stringify({ status: "paid" }),
      approvedBy: "operator-dashboard",
      createdAt: now,
    });

    return { ok: true, paymentId: latest._id };
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
