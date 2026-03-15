"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SuggestionCards({
  suggestions,
  loading,
  onAssign,
}: {
  suggestions: any[];
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
        {!loading && suggestions.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions yet.</p> : null}
        {suggestions.map((s) => (
          <div key={s.driverId} className="rounded-md border p-3">
            <p className="font-medium">Score {s.score}</p>
            <p className="mb-2 text-xs text-muted-foreground">{s.reasoning}</p>
            <Button size="sm" onClick={() => onAssign(s.driverId)}>
              Assign
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
