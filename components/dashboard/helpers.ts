export const rideStatuses = [
  "created",
  "dispatching",
  "assigned",
  "driver_arriving",
  "picked_up",
  "completed",
  "cancelled",
  "expired",
] as const;

export function statusBadgeVariant(status: string): "default" | "secondary" | "success" | "warning" | "danger" {
  if (["completed"].includes(status)) return "success";
  if (["cancelled", "expired"].includes(status)) return "danger";
  if (["driver_arriving", "picked_up", "assigned"].includes(status)) return "warning";
  if (["dispatching"].includes(status)) return "secondary";
  return "default";
}

export const formatCurrency = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;
