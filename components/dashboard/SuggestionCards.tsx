"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SuggestionCards({
  suggestions,
  reason,
  loading,
  onAssign,
}: {
  suggestions: any[];
  reason?: string | null;
  loading: boolean;
  onAssign: (driverId: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Driver Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? <p className="text-sm text-muted-foreground">Calculating suggestions...</p> : null}
        {!loading && suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{reason || "No suggestions yet."}</p>
        ) : null}
        {suggestions.map((s, i) => (
          <div key={s.driverId} className="flex items-center justify-between rounded-md border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {i + 1}. {s.driverName ?? "Driver"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({s.distanceKm != null ? `${s.distanceKm} km` : "—"})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{s.reasoning}</p>
            </div>
            <Button size="sm" className="ml-3 shrink-0" onClick={() => onAssign(s.driverId)}>
              Assign
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
