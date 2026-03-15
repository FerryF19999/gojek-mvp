"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PaymentPanel({
  loading,
  paymentStatus,
  onGenerate,
}: {
  loading: boolean;
  paymentStatus: string;
  onGenerate: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Status: {paymentStatus}</p>
        <Button onClick={onGenerate} disabled={loading}>
          {loading ? "Generating..." : "Generate QRIS (stub)"}
        </Button>
      </CardContent>
    </Card>
  );
}
