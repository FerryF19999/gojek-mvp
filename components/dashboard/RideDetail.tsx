"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { statusBadgeVariant } from "./helpers";

type AgentSpeed = "slow" | "normal" | "fast";

export function RideDetail({
  ride,
  driverName,
  agentSpeed,
  onSpeedChange,
  onSetStatus,
  onStartAgent,
  onStopAgent,
}: {
  ride: any;
  driverName: string;
  agentSpeed: AgentSpeed;
  onSpeedChange: (speed: AgentSpeed) => void;
  onSetStatus: (status: "driver_arriving" | "picked_up" | "completed") => void;
  onStartAgent: () => void;
  onStopAgent: () => void;
}) {
  const isAgentRunning = ride.agentStatus === "running";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ride Detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{ride.code}</p>
          <Badge variant={statusBadgeVariant(ride.status)}>{ride.status}</Badge>
          <Badge variant={isAgentRunning ? "success" : ride.agentStatus === "completed" ? "default" : "secondary"}>
            Agent: {ride.agentStatus}
          </Badge>
          <Badge variant="secondary">Speed: {ride.agentSpeed || agentSpeed}</Badge>
        </div>
        <p className="text-muted-foreground">Customer: {ride.customerName}</p>
        <p className="text-muted-foreground">Driver: {driverName || "-"}</p>
        <p className="text-muted-foreground">Pickup: {ride.pickup.address}</p>
        <p className="text-muted-foreground">Dropoff: {ride.dropoff.address}</p>

        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr] md:items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Agent speed</p>
            <Select value={agentSpeed} onChange={(e) => onSpeedChange(e.target.value as AgentSpeed)}>
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </Select>
          </div>
          <Button onClick={onStartAgent} disabled={isAgentRunning}>Run ride agent</Button>
          <Button variant="outline" onClick={onStopAgent} disabled={!isAgentRunning}>Stop</Button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <Button variant="outline" onClick={() => onSetStatus("driver_arriving")} disabled={isAgentRunning} title={isAgentRunning ? "Agent is running" : undefined}>Driver arriving</Button>
          <Button variant="outline" onClick={() => onSetStatus("picked_up")} disabled={isAgentRunning} title={isAgentRunning ? "Agent is running" : undefined}>Picked up</Button>
          <Button onClick={() => onSetStatus("completed")} disabled={isAgentRunning} title={isAgentRunning ? "Agent is running" : undefined}>Completed</Button>
        </div>
        {isAgentRunning ? <p className="text-xs text-muted-foreground">Agent is running</p> : null}
      </CardContent>
    </Card>
  );
}
