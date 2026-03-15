import { mutation } from "./_generated/server";

type DemoDriver = {
  name: string;
  phone: string;
  lat: number;
  lng: number;
  vehicleType: "motor" | "car";
};

const DEMO_DRIVERS: DemoDriver[] = [
  { name: "Budi", phone: "0811111111", lat: -6.2, lng: 106.816666, vehicleType: "motor" },
  { name: "Siti", phone: "0822222222", lat: -6.205, lng: 106.82, vehicleType: "motor" },
  { name: "Agus", phone: "0833333333", lat: -6.19, lng: 106.81, vehicleType: "car" },
  { name: "Rina", phone: "0844444444", lat: -6.25, lng: 106.79, vehicleType: "car" },
];

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const activeUntil = now + 30 * 24 * 60 * 60 * 1000;

    const users = await ctx.db.query("users").collect();
    const drivers = await ctx.db.query("drivers").collect();

    const userByPhone = new Map(users.filter((u) => !!u.phone).map((u) => [u.phone as string, u]));
    const driverByUserId = new Map(drivers.map((d) => [String(d.userId), d]));

    let inserted = 0;
    let patched = 0;

    for (const demo of DEMO_DRIVERS) {
      let user = userByPhone.get(demo.phone);

      if (!user) {
        const userId = await ctx.db.insert("users", {
          role: "driver",
          name: demo.name,
          phone: demo.phone,
          status: "active",
          createdAt: now,
        });

        const createdUser = {
          _id: userId,
          role: "driver",
          name: demo.name,
          phone: demo.phone,
          status: "active",
          createdAt: now,
        } as any;

        user = createdUser;
        userByPhone.set(demo.phone, createdUser);
      } else if (user.status !== "active" || user.role !== "driver" || user.name !== demo.name) {
        await ctx.db.patch(user._id, {
          role: "driver",
          name: demo.name,
          status: "active",
        });
      }

      if (!user) continue;

      const existingDriver = driverByUserId.get(String(user._id));

      if (!existingDriver) {
        const driverId = await ctx.db.insert("drivers", {
          userId: user._id,
          vehicleType: demo.vehicleType,
          availability: "online",
          subscriptionStatus: "active",
          subscribedUntil: activeUntil,
          subscriptionPlan: "monthly_19k",
          rating: 4.7,
          lastLocation: { lat: demo.lat, lng: demo.lng, updatedAt: now },
          lastActiveAt: now,
        });
        driverByUserId.set(String(user._id), { _id: driverId } as any);
        inserted += 1;
      } else {
        await ctx.db.patch(existingDriver._id, {
          vehicleType: demo.vehicleType,
          availability: "online",
          subscriptionStatus: "active",
          subscribedUntil: activeUntil,
          subscriptionPlan: "monthly_19k",
          lastLocation: { lat: demo.lat, lng: demo.lng, updatedAt: now },
          lastActiveAt: now,
        });
        patched += 1;
      }
    }

    const refreshedDrivers = await ctx.db.query("drivers").collect();
    const eligibleNow = refreshedDrivers.filter(
      (d) => d.availability === "online" && (d.subscribedUntil ? d.subscribedUntil > now : d.subscriptionStatus === "active"),
    );

    const eligibleByType = {
      motor: eligibleNow.filter((d) => d.vehicleType === "motor").length,
      car: eligibleNow.filter((d) => d.vehicleType === "car").length,
    };

    return {
      seeded: inserted > 0,
      inserted,
      patched,
      eligibleByType,
      totalDrivers: refreshedDrivers.length,
    };
  },
});
