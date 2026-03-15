"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatCurrency, rideStatuses, statusBadgeVariant } from "./helpers";

export function RideList({
  rides,
  loading,
  statusFilter,
  search,
  onStatusFilter,
  onSearch,
  onSelect,
}: {
  rides: any[];
  loading: boolean;
  statusFilter: string;
  search: string;
  onStatusFilter: (v: string) => void;
  onSearch: (v: string) => void;
  onSelect: (rideId: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)}>
            <option value="">All status</option>
            {rideStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input placeholder="Search by code/customer" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>

        <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rides...</p>
          ) : rides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rides found.</p>
          ) : (
            rides.map((ride) => (
              <div key={ride._id} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-semibold">{ride.code}</p>
                  <Badge variant={statusBadgeVariant(ride.status)}>{ride.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {ride.customerName} • {formatCurrency(ride.price.amount)}
                </p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => onSelect(ride._id)}>
                  Open details
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
