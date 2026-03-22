"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export default function WhatsAppBookingQR() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const number = process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER || process.env.WHATSAPP_BOT_NUMBER || "6281234567890";

  const waLink = useMemo(() => {
    const message = encodeURIComponent("Halo, saya mau pesan ride");
    return `https://wa.me/${number}?text=${message}`;
  }, [number]);

  useEffect(() => {
    QRCode.toDataURL(waLink, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [waLink]);

  return (
    <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.06] p-5">
      <p className="text-sm text-green-300 font-semibold">Pesan via WhatsApp Bot</p>
      <p className="text-xs text-white/60 mt-1">Scan QR → WhatsApp kebuka → bot tanya detail ride → auto create booking.</p>
      <div className="mt-3 flex items-center gap-4">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="WhatsApp Booking QR" className="w-28 h-28 rounded-lg bg-white p-1" />
        ) : (
          <div className="w-28 h-28 rounded-lg bg-white/10 animate-pulse" />
        )}
        <div className="text-xs text-white/70 break-all">
          <p className="mb-1">Link:</p>
          <a href={waLink} target="_blank" rel="noreferrer" className="text-green-300 underline">
            {waLink}
          </a>
        </div>
      </div>
    </div>
  );
}
