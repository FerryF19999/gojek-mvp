"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PaymentPanel({
  loading,
  paymentStatus,
  qrString,
  providerRef,
  onGenerate,
  onMarkPaidDemo,
}: {
  loading: boolean;
  paymentStatus: string;
  qrString?: string;
  providerRef?: string;
  onGenerate: () => void;
  onMarkPaidDemo: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    const renderQr = async () => {
      if (!qrString) {
        setQrDataUrl("");
        return;
      }
      try {
        const url = await QRCode.toDataURL(qrString, { width: 220, margin: 2 });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setQrDataUrl("");
      }
    };
    renderQr();
    return () => {
      active = false;
    };
  }, [qrString]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Status: {paymentStatus}</p>

        {providerRef ? <p className="text-xs text-muted-foreground">Payment ref: {providerRef}</p> : null}

        {qrDataUrl ? (
          <div className="space-y-2">
            <img src={qrDataUrl} alt="QRIS demo QR" className="h-44 w-44 rounded border bg-white p-2" />
            <p className="line-clamp-2 text-xs text-muted-foreground">Payload: {qrString}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Generate QRIS to render demo QR image.</p>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          <Button onClick={onGenerate} disabled={loading}>
            {loading ? "Generating..." : "Generate QRIS"}
          </Button>
          <Button variant="outline" onClick={onMarkPaidDemo} disabled={!providerRef || paymentStatus === "paid"}>
            {paymentStatus === "paid" ? "Paid" : "Mark as paid (demo)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
