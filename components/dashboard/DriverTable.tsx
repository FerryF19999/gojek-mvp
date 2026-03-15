"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

export function DriverTable({
  drivers,
  loading,
  onAvailability,
  onMove,
  onSeed,
}: {
  drivers: any[];
  loading: boolean;
  onAvailability: (driverId: any, availability: "online" | "offline" | "busy") => void;
  onMove: (driverId: any, lat: number, lng: number) => void;
  onSeed: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Driver Pool</CardTitle>
        <Button size="sm" onClick={onSeed}>Seed demo</Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-[380px] space-y-3 overflow-auto pr-1">
          {loading ? <p className="text-sm text-muted-foreground">Loading drivers...</p> : null}
          {!loading && drivers.length === 0 ? <p className="text-sm text-muted-foreground">No drivers yet.</p> : null}
          {drivers.map((d) => (
            <div key={d._id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">{d.userName}</p>
                <Badge variant={d.availability === "online" ? "success" : d.availability === "busy" ? "warning" : "secondary"}>
                  {d.availability}
                </Badge>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {d.vehicleType} • {d.lastLocation.lat.toFixed(4)}, {d.lastLocation.lng.toFixed(4)}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <Select
                  value={d.availability}
                  onChange={(e) => onAvailability(d._id, e.target.value as "online" | "offline" | "busy")}
                >
                  <option value="online">online</option>
                  <option value="offline">offline</option>
                  <option value="busy">busy</option>
                </Select>
                <Button variant="outline" onClick={() => onMove(d._id, d.lastLocation.lat + 0.001, d.lastLocation.lng + 0.001)}>
                  Mock move
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
