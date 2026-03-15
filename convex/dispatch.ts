import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const dispatchSuggestions = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    const candidates = await ctx.db
      .query("drivers")
      .withIndex("by_availability", (q) => q.eq("availability", "online"))
      .collect();

    const ranked = candidates
      .filter((d) => d.vehicleType === ride.vehicleType)
      .map((d) => {
        const distanceKm = haversineKm(ride.pickup.lat, ride.pickup.lng, d.lastLocation.lat, d.lastLocation.lng);
        const recentPenalty = Math.max(0, 120 - (Date.now() - d.lastActiveAt) / 1000) / 10;
        const ratingBoost = (d.rating ?? 4.5) * 3;
        const score = 100 - distanceKm * 8 - recentPenalty + ratingBoost;

        return {
          driverId: d._id,
          distanceKm: Number(distanceKm.toFixed(2)),
          score: Number(score.toFixed(2)),
          reasoning: `Distance ${distanceKm.toFixed(2)}km, rating ${d.rating ?? 4.5}, active recently`,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return ranked;
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
