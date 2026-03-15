"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AGENT_LABELS: Record<string, string> = {
  dispatch_agent: "Dispatch Agent",
  ride_agent: "Driver/Ride Agent",
  support_agent: "Rider/Support Agent",
  payment_agent: "Payment Agent",
};

const statusVariant = (status: string): "secondary" | "success" | "warning" | "danger" => {
  if (status === "FAILED") return "danger";
  if (status === "DONE") return "success";
  if (status === "RUNNING") return "warning";
  return "secondary";
};

const formatOutput = (value?: string | null, maxLength = 140) => {
  if (!value) return "-";
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
};

export function AgentCards({ cards, paymentStatus }: { cards: any[]; paymentStatus?: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewAll, setViewAll] = useState<Record<string, boolean>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Cards</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => {
          const key = String(card.agentName);
          const isExpanded = !!expanded[key];
          const isViewAll = !!viewAll[key];
          const visibleActions = isViewAll ? card.actions : card.actions.slice(0, 3);

          const showPrepaidHint = key === "ride_agent" && paymentStatus !== "paid";

          return (
            <div key={key} className="rounded-lg border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">{AGENT_LABELS[key] || key}</p>
                <Badge variant={statusVariant(card.status)}>{card.status}</Badge>
              </div>

              <p className="text-xs text-muted-foreground">Last action: {card.lastActionType || "-"}</p>
              <p className="text-xs text-muted-foreground">
                Updated: {card.lastUpdatedAt ? new Date(card.lastUpdatedAt).toLocaleString() : "-"}
              </p>
              {showPrepaidHint ? (
                <p className="mt-1 text-xs text-amber-700">Waiting for payment (prepaid required)</p>
              ) : null}

              <div className="mt-2 rounded-md bg-muted/40 p-2">
                <p className="mb-1 text-xs font-medium">Latest output</p>
                <p className="text-xs text-muted-foreground">{isExpanded ? card.lastOutput || "-" : formatOutput(card.lastOutput)}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 px-2 text-xs"
                  onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  {isExpanded ? "Collapse output" : "Expand output"}
                </Button>
              </div>

              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Recent actions</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewAll((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    {isViewAll ? "View less" : "View all"}
                  </Button>
                </div>

                {visibleActions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No actions yet.</p>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-auto pr-1">
                    {visibleActions.map((action: any) => (
                      <div key={action._id} className="rounded border-l-2 border-primary/60 pl-2">
                        <p className="text-xs font-medium">{action.actionType}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground">{formatOutput(action.output, 90)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
