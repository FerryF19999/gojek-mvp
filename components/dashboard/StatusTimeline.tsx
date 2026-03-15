"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatusTimeline({ timeline }: { timeline: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No timeline yet.</p> : null}
          {timeline.map((t, i) => (
            <div key={i} className="rounded-md border-l-2 border-primary pl-3 text-sm">
              <p className="font-medium">{t.type}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(t.at).toLocaleString()} • by {t.by}
              </p>
              {t.note ? <p className="text-xs text-muted-foreground">{t.note}</p> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
