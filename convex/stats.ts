import { query } from "./_generated/server";

export const getLandingStats = query({
  args: {},
  handler: async (ctx) => {
    const allDrivers = await ctx.db.query("drivers").collect();
    const driversOnline = allDrivers.filter((d) => d.availability === "online").length;

    const allRides = await ctx.db.query("rides").collect();
    const ridesCompleted = allRides.filter((r) => r.status === "completed").length;

    // Get recent activity (last 10 completed or assigned rides)
    const recentRides = allRides
      .filter((r) => ["completed", "assigned", "picked_up", "created"].includes(r.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);

    const recentActivity = await Promise.all(
      recentRides.map(async (ride) => {
        let driverName = "Driver";
        if (ride.assignedDriverId) {
          const driver = await ctx.db.get(ride.assignedDriverId);
          if (driver) {
            const user = await ctx.db.get(driver.userId);
            if (user) driverName = user.name;
          }
        }
        return {
          code: ride.code,
          status: ride.status,
          customerName: ride.customerName,
          driverName,
          pickup: ride.pickup.address,
          dropoff: ride.dropoff.address,
          updatedAt: ride.updatedAt,
        };
      }),
    );

    return {
      driversOnline,
      totalDrivers: allDrivers.length,
      ridesCompleted,
      totalRides: allRides.length,
      recentActivity,
    };
  },
});
