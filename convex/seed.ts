import { mutation } from "./_generated/server";

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("drivers").take(1);
    if (existing.length > 0) return { seeded: false };

    const now = Date.now();
    const drivers = [
      { name: "Budi", phone: "0811111111", lat: -6.2, lng: 106.816666 },
      { name: "Siti", phone: "0822222222", lat: -6.205, lng: 106.82 },
      { name: "Agus", phone: "0833333333", lat: -6.19, lng: 106.81 },
      { name: "Rina", phone: "0844444444", lat: -6.25, lng: 106.79 },
    ];

    for (const d of drivers) {
      const userId = await ctx.db.insert("users", {
        role: "driver",
        name: d.name,
        phone: d.phone,
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("drivers", {
        userId,
        vehicleType: "motor",
        availability: "online",
        subscriptionStatus: "active",
        subscribedUntil: now + 30 * 24 * 60 * 60 * 1000,
        subscriptionPlan: "monthly_19k",
        rating: 4.7,
        lastLocation: { lat: d.lat, lng: d.lng, updatedAt: now },
        lastActiveAt: now,
      });
    }

    return { seeded: true };
  },
});
