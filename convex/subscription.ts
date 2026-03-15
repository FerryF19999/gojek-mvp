export const DRIVER_SUBSCRIPTION_PLAN_MONTHLY_19K = "monthly_19k" as const;

export const isDriverSubscribed = (
  driver: { subscribedUntil?: number | null; subscriptionStatus?: "active" | "inactive" | null },
  now: number,
) => {
  if (typeof driver.subscribedUntil === "number") {
    return driver.subscribedUntil > now;
  }
  return driver.subscriptionStatus === "active";
};
