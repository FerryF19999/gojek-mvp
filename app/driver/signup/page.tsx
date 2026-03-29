"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { launchCities, type LaunchCity } from "@/lib/launchCities";

type Step = "form" | "qr" | "connected";

export default function DriverSignupPage() {
  const [step, setStep] = useState<Step>("form");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [city, setCity] = useState<LaunchCity["id"]>("jakarta");

  // Poll QR from Convex (real-time)
  const sessionData = useQuery(
    api.driverSessions.getQR,
    sessionId ? { sessionId } : "skip"
  );

  // Watch for connection
  useEffect(() => {
    if (sessionData?.connected) {
      setStep("connected");
    }
  }, [sessionData?.connected]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const selectedCity = launchCities.find((c) => c.id === city) ?? launchCities[0];
      const sid = `driver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Call bot server to create session
      const botUrl = process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3001";
      const res = await fetch(`${botUrl}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          driverId: sid,
          name: fullName,
          registrationData: {
            fullName,
            phone,
            vehiclePlate,
            city: selectedCity.name,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal membuat sesi. Pastikan bot server berjalan.");
      }

      setSessionId(sid);
      setStep("qr");
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }, [fullName, phone, vehiclePlate, city]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏍️</div>
          <h1 className="text-2xl font-bold mb-2">Daftar Driver Nemu Ojek</h1>
          <p className="text-white/50 text-sm">
            Daftar, scan QR, langsung terima orderan via WhatsApp
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { label: "Data Diri", s: "form" },
            { label: "Scan QR", s: "qr" },
            { label: "Selesai", s: "connected" },
          ].map((item, i) => {
            const isActive = item.s === step;
            const isDone =
              (step === "qr" && i === 0) ||
              (step === "connected" && i < 2);
            return (
              <div key={item.s} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-0.5 ${isDone || isActive ? "bg-green-500" : "bg-white/10"}`} />}
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${isDone ? "bg-green-500 text-white" : isActive ? "bg-green-500/20 text-green-400 border border-green-500/40" : "bg-white/5 text-white/30"}`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs ${isActive || isDone ? "text-white" : "text-white/30"}`}>
                    {item.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Registration Form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <h2 className="font-semibold text-lg">Data Diri</h2>

              <div>
                <label className="block text-sm text-white/60 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="contoh: Ahmad Supriadi"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Nomor HP</label>
                <div className="flex gap-2">
                  <span className="flex items-center rounded-xl border border-white/10 bg-black/40 px-3 text-white/50 text-sm">+62</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="812-3456-7890"
                    required
                    className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Plat Nomor Kendaraan</label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="B 1234 XYZ"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Kota Operasional</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value as LaunchCity["id"])}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40"
                >
                  {launchCities.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0a0a0a]">{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !fullName || !phone || !vehiclePlate}
              className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold text-base disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Lanjut — Scan QR WhatsApp"}
            </Button>

            <p className="text-center text-white/30 text-xs">
              Dengan mendaftar, kamu setuju dengan syarat & ketentuan Nemu Ojek
            </p>
          </form>
        )}

        {/* Step 2: QR Code Display */}
        {step === "qr" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/[0.08] to-transparent p-6 text-center">
              <h2 className="font-semibold text-lg mb-2">Scan QR dengan WhatsApp</h2>
              <p className="text-white/50 text-sm mb-6">
                Buka WhatsApp &gt; Linked Devices &gt; Link a Device &gt; Scan QR di bawah ini
              </p>

              <div className="bg-white rounded-2xl p-4 mx-auto w-fit mb-4">
                {sessionData?.qrCode ? (
                  <QRCodeDisplay value={sessionData.qrCode} />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2" />
                      <p className="text-black/50 text-sm">Generating QR...</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-white/40 text-xs">
                QR akan auto-refresh. Pastikan HP kamu terkoneksi internet.
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
              <h3 className="text-sm font-medium mb-2">Cara scan:</h3>
              <ol className="text-white/50 text-sm space-y-1 list-decimal list-inside">
                <li>Buka WhatsApp di HP kamu</li>
                <li>Tap menu (&hellip;) &gt; <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Arahkan kamera ke QR di atas</li>
              </ol>
            </div>
          </div>
        )}

        {/* Step 3: Connected */}
        {step === "connected" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/[0.08] to-transparent p-8 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold mb-2">WhatsApp Terhubung!</h2>
              <p className="text-white/50 mb-6">
                Bot Nemu Ojek sudah aktif di nomor kamu.
                <br />Cek WhatsApp untuk pesan welcome dari bot.
              </p>

              <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-left space-y-2">
                <p className="text-sm text-white/70">Perintah yang bisa kamu pakai:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-mono text-green-400">checkin</span>
                    <span className="text-white/40 ml-1">mulai shift</span>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-mono text-green-400">checkout</span>
                    <span className="text-white/40 ml-1">selesai shift</span>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-mono text-green-400">saldo</span>
                    <span className="text-white/40 ml-1">penghasilan</span>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-mono text-green-400">status</span>
                    <span className="text-white/40 ml-1">cek status</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-white/30 text-xs">
              Ketik <strong>checkin</strong> di WhatsApp untuk mulai terima orderan!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function QRCodeDisplay({ value }: { value: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(value, {
        width: 256,
        margin: 0,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setImgSrc);
    }).catch(() => setImgSrc(null));
  }, [value]);

  if (imgSrc) {
    return <img src={imgSrc} alt="QR Code" className="w-64 h-64" />;
  }

  return (
    <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded">
      <p className="text-gray-500 text-xs text-center px-4 break-all">{value.slice(0, 50)}...</p>
    </div>
  );
}
