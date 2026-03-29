"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

export default function RidePage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = useCallback(async () => {
    if (!phone || phone.length < 8) { setError("Nomor WA nggak valid"); return; }
    setLoading(true); setError("");
    try {
      const sessionId = `passenger-${phone}-${Date.now()}`;
      const res = await fetch(`/api/bot/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, driverId: sessionId, name: phone, role: "passenger" }),
      });
      if (!res.ok) throw new Error("Server belum siap. Coba lagi.");
      window.location.href = `/connect/${sessionId}?role=passenger`;
    } catch (e: any) {
      setError(e.message || "Gagal. Coba lagi.");
    } finally { setLoading(false); }
  }, [phone]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🛵</div>
          <h1 className="text-3xl font-bold mb-2">Pesan Ojek</h1>
          <p className="text-white/50">
            Masukin nomor WA, scan QR, langsung pesan ojek di WhatsApp.
            <br />Bilang aja mau ke mana — bot urus semuanya.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 space-y-5">
          <div>
            <label className="block text-sm text-white/60 mb-2">Nomor WhatsApp</label>
            <div className="flex gap-2">
              <span className="flex items-center rounded-xl border border-white/10 bg-black/40 px-3 text-white/50 text-sm">+62</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="812-3456-7890"
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">{error}</div>
          )}

          <Button
            onClick={handleConnect}
            disabled={loading || !phone || phone.length < 8}
            className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold text-base disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Hubungkan WhatsApp"}
          </Button>
        </div>

        <div className="mt-8 rounded-xl bg-white/[0.02] border border-white/5 p-5">
          <h3 className="text-sm font-medium mb-3">Cara kerjanya:</h3>
          <ol className="text-white/50 text-sm space-y-2 list-decimal list-inside">
            <li>Masukin nomor WA kamu di atas</li>
            <li>Scan QR code yang muncul di WhatsApp (Linked Devices)</li>
            <li>Bot aktif — ketik <b>gas ke [tujuan]</b> untuk pesan ojek</li>
          </ol>
        </div>

        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/5 p-5">
          <h3 className="text-sm font-medium mb-3">💰 Harga</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-black/30 p-3 text-center">
              <div className="text-xl mb-1">🏍️</div>
              <div className="font-semibold">Motor</div>
              <div className="text-green-400 text-xs">Rp 3.500/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
            <div className="rounded-lg bg-black/30 p-3 text-center">
              <div className="text-xl mb-1">🚗</div>
              <div className="font-semibold">Mobil</div>
              <div className="text-green-400 text-xs">Rp 4.000/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-white/20 text-xs">
          Nemu Ojek — Ojek tanpa komisi
        </p>
      </div>
    </div>
  );
}
