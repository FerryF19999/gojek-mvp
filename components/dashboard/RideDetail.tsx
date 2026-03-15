"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeVariant } from "./helpers";

export function RideDetail({
  ride,
  driverName,
  onSetStatus,
  onStartAgent,
  onStopAgent,
}: {
  ride: any;
  driverName: string;
  onSetStatus: (status: "driver_arriving" | "picked_up" | "completed") => void;
  onStartAgent: () => void;
  onStopAgent: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ride Detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{ride.code}</p>
          <Badge variant={statusBadgeVariant(ride.status)}>{ride.status}</Badge>
          <Badge variant={ride.agentStatus === "running" ? "success" : ride.agentStatus === "completed" ? "default" : "secondary"}>
            Agent: {ride.agentStatus}
          </Badge>
        </div>
        <p className="text-muted-foreground">Customer: {ride.customerName}</p>
        <p className="text-muted-foreground">Driver: {driverName || "-"}</p>
        <p className="text-muted-foreground">Pickup: {ride.pickup.address}</p>
        <p className="text-muted-foreground">Dropoff: {ride.dropoff.address}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <Button onClick={onStartAgent} disabled={ride.agentStatus === "running"}>Run ride agent</Button>
          <Button variant="outline" onClick={onStopAgent} disabled={ride.agentStatus !== "running"}>Stop</Button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Button variant="outline" onClick={() => onSetStatus("driver_arriving")}>Driver arriving</Button>
          <Button variant="outline" onClick={() => onSetStatus("picked_up")}>Picked up</Button>
          <Button onClick={() => onSetStatus("completed")}>Completed</Button>
        </div>
      </CardContent>
    </Card>
  );
}
