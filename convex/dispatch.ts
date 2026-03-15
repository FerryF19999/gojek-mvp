import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { isDriverSubscribed } from "./subscription";
import { haversineKm } from "./geo";

export const dispatchSuggestions = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    const candidates = await ctx.db
      .query("drivers")
      .withIndex("by_availability", (q) => q.eq("availability", "online"))
      .collect();

    const now = Date.now();
    const eligible = candidates.filter((d) => d.vehicleType === ride.vehicleType && isDriverSubscribed(d, now));

    if (eligible.length === 0) {
      return {
        suggestions: [],
        reason: "No subscribed online drivers available",
      };
    }

    // Resolve driver names from users table
    const driverUserIds = eligible.map((d) => d.userId);
    const users = await Promise.all(driverUserIds.map((uid) => ctx.db.get(uid)));
    const userNameMap = new Map(
      eligible.map((d, i) => [String(d._id), users[i]?.name ?? "Unknown"]),
    );

    const ranked = eligible
      .map((d) => {
        const distanceKm = haversineKm(ride.pickup.lat, ride.pickup.lng, d.lastLocation.lat, d.lastLocation.lng);
        const recentPenalty = Math.max(0, 120 - (Date.now() - d.lastActiveAt) / 1000) / 10;
        const ratingBoost = (d.rating ?? 4.5) * 3;
        const score = 100 - distanceKm * 8 - recentPenalty + ratingBoost;
        const driverName = userNameMap.get(String(d._id)) ?? "Unknown";

        return {
          driverId: d._id,
          driverName,
          distanceKm: Number(distanceKm.toFixed(2)),
          score: Number(score.toFixed(2)),
          reasoning: `${driverName} (${distanceKm.toFixed(1)} km) — rating ${d.rating ?? 4.5}`,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    return { suggestions: ranked, reason: null };
  },
});

export const logSupportAction = mutation({
  args: {
    rideId: v.id("rides"),
    scenario: v.union(v.literal("driver_late"), v.literal("customer_cancel"), v.literal("refund_request")),
    approvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const templates = {
      driver_late: "Apologize, share ETA, and offer cancel without fee.",
      customer_cancel: "Confirm cancellation reason and stop dispatch + void pending payment.",
      refund_request: "Collect reason and escalate refund approval to operator.",
    } as const;

    const now = Date.now();
    await ctx.db.insert("agent_actions", {
      rideId: args.rideId,
      agentName: "support_agent",
      actionType: "message",
      input: JSON.stringify({ scenario: args.scenario }),
      output: JSON.stringify({ suggestion: templates[args.scenario] }),
      approvedBy: args.approvedBy,
      createdAt: now,
    });

    return { suggestion: templates[args.scenario] };
  },
});
