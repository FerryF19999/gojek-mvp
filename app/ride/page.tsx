"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";

const RideMap = dynamic(() => import("@/components/ride/RideMap"), { ssr: false });

type RideStep = "pickup" | "destination" | "confirm" | "searching" | "matched" | "riding" | "completed";

interface Location {
  address: string;
  lat: number;
  lng: number;
}

interface RideData {
  code: string;
  status: string;
  price: { amount: number };
  pickup: Location;
  dropoff: Location;
  driver?: {
    name: string;
    plate?: string;
    vehiclePlate?: string;
    phone?: string;
  };
}

function formatIdr(amount: number) {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(amount)));
}

export default function RidePage() {
  const [step, setStep] = useState<RideStep>("pickup");
  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [price, setPrice] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [ride, setRide] = useState<RideData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          // Reverse geocode
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
              { headers: { "User-Agent": "NemuOjek/1.0" } }
            );
            const data = await res.json();
            const parts = [];
            if (data.address?.road) parts.push(data.address.road);
            if (data.address?.suburb) parts.push(data.address.suburb);
            if (data.address?.city || data.address?.town) parts.push(data.address.city || data.address.town);
            const address = parts.length ? parts.join(", ") : "Lokasi Kamu";
            setPickup({ address, lat, lng });
          } catch {
            setPickup({ address: "Lokasi Kamu", lat, lng });
          }
        },
        () => {
          // Default Jakarta
          setPickup({ address: "Jakarta", lat: -6.2088, lng: 106.8456 });
        }
      );
    }
  }, []);

  // Search destination
  const searchDestination = useCallback(async (query: string) => {
    if (query.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + " Indonesia")}&limit=5`,
        { headers: { "User-Agent": "NemuOjek/1.0" } }
      );
      const data = await res.json();
      setSuggestions(data.map((d: any) => ({
        address: d.display_name.split(",").slice(0, 3).join(",").trim(),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        full: d.display_name,
      })));
    } catch { setSuggestions([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchDestination(destQuery), 400);
    return () => clearTimeout(timer);
  }, [destQuery, searchDestination]);

  // Calculate price
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const selectDestination = useCallback((dest: Location) => {
    setDestination(dest);
    setDestQuery(dest.address);
    setSuggestions([]);
    if (pickup) {
      const km = haversineKm(pickup.lat, pickup.lng, dest.lat, dest.lng);
      const amount = Math.max(10000, Math.round(km * 3500));
      setDistanceKm(km);
      setPrice(amount);
      setStep("confirm");
    }
  }, [pickup]);

  // Create ride
  const createRide = useCallback(async () => {
    if (!pickup || !destination) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/rides/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || "Passenger",
          customerPhone: customerPhone || "000",
          pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
          dropoff: { address: destination.address, lat: destination.lat, lng: destination.lng },
          vehicleType: "motor",
          paymentMethod: "cash",
        }),
      });

      if (!res.ok) throw new Error("Gagal membuat ride");
      const data = await res.json();
      const rideCode = data.code || data.rideCode || data.ride?.code;

      setRide({
        code: rideCode,
        status: "created",
        price: { amount: price },
        pickup,
        dropoff: destination,
      });
      setStep("searching");

      // Send WhatsApp notification to passenger
      if (customerPhone && customerPhone !== "000") {
        const botUrl = process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3001";
        const botKey = process.env.NEXT_PUBLIC_BOT_API_KEY || "";
        const trackUrl = `${window.location.origin}/track/${rideCode}`;
        fetch(`${botUrl}/send-message?key=${botKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: customerPhone,
            message:
              `✅ Ride *${rideCode}* dibuat!\n\n` +
              `📍 Jemput: ${pickup.address}\n` +
              `🏁 Tujuan: ${destination.address}\n` +
              `💰 Rp ${formatIdr(price)}\n\n` +
              `🔍 Lagi cariin driver...\n` +
              `📍 Track: ${trackUrl}`,
          }),
        }).catch(() => {}); // Fire and forget
      }

      // Start polling for ride status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/rides/${rideCode}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          const r = statusData.ride || statusData;
          setRide((prev) => prev ? { ...prev, status: r.status, driver: r.driver } : prev);

          if (["assigned", "driver_arriving"].includes(r.status)) setStep("matched");
          if (r.status === "picked_up") setStep("riding");
          if (r.status === "completed") {
            setStep("completed");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {}
      }, 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pickup, destination, customerName, customerPhone, price]);

  // Cleanup polling
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const resetRide = () => {
    setStep("pickup");
    setDestination(null);
    setDestQuery("");
    setRide(null);
    setPrice(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md relative" style={{ minHeight: "100vh" }}>
        {/* Map */}
        <div className="h-[45vh] relative">
          <RideMap pickup={pickup} destination={destination} />
          {/* Back button */}
          {step !== "pickup" && step !== "completed" && (
            <button
              onClick={resetRide}
              className="absolute top-4 left-4 z-[1000] bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg text-black"
            >
              &larr;
            </button>
          )}
        </div>

        {/* Bottom Sheet */}
        <div className="bg-[#0a0a0a] rounded-t-3xl -mt-6 relative z-10 p-6 min-h-[55vh]">
          {/* Step: Pickup */}
          {step === "pickup" && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Pesan Ojek</h2>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <label className="text-xs text-white/40 uppercase tracking-wider">Jemput dari</label>
                <p className="text-white font-medium mt-1">
                  {pickup ? `📍 ${pickup.address}` : "Mendeteksi lokasi..."}
                </p>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Nama</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nama kamu"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">No. HP</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="081234567890"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
                />
              </div>

              <Button
                onClick={() => setStep("destination")}
                disabled={!pickup}
                className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold"
              >
                Mau ke mana?
              </Button>
            </div>
          )}

          {/* Step: Destination */}
          {step === "destination" && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Tujuan</h2>
              <input
                value={destQuery}
                onChange={(e) => setDestQuery(e.target.value)}
                placeholder="Ketik tujuan... (Blok M, Senayan, Kuningan)"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-green-500/40 placeholder:text-white/20"
              />
              {suggestions.length > 0 && (
                <div className="space-y-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => selectDestination(s)}
                      className="w-full text-left rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-3 transition"
                    >
                      <p className="text-sm font-medium text-white">{s.address}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && destination && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-green-400 mt-0.5">📍</span>
                  <div>
                    <p className="text-xs text-white/40">Jemput</p>
                    <p className="text-sm font-medium">{pickup?.address}</p>
                  </div>
                </div>
                <div className="border-l-2 border-dashed border-white/10 ml-2 h-3" />
                <div className="flex items-start gap-3">
                  <span className="text-red-400 mt-0.5">🏁</span>
                  <div>
                    <p className="text-xs text-white/40">Tujuan</p>
                    <p className="text-sm font-medium">{destination.address}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/40">Nemu Ojek</p>
                    <p className="text-2xl font-bold text-green-400">Rp {formatIdr(price)}</p>
                  </div>
                  <div className="text-right text-sm text-white/50">
                    <p>📏 {distanceKm.toFixed(1)} km</p>
                    <p>⏱ ~{Math.round(distanceKm * 3)} min</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">{error}</div>
              )}

              <Button
                onClick={createRide}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold text-base"
              >
                {loading ? "Memproses..." : `Konfirmasi Ride — Rp ${formatIdr(price)}`}
              </Button>
            </div>
          )}

          {/* Step: Searching */}
          {step === "searching" && ride && (
            <div className="space-y-4 text-center py-8">
              <div className="animate-spin w-12 h-12 border-3 border-green-500 border-t-transparent rounded-full mx-auto" />
              <h2 className="text-xl font-bold">Mencari Driver...</h2>
              <p className="text-white/50">Ride: {ride.code}</p>
              <p className="text-white/40 text-sm">Sedang mencarikan driver terdekat untuk kamu</p>
            </div>
          )}

          {/* Step: Matched */}
          {step === "matched" && ride && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl mb-2">🏍️</div>
                <h2 className="text-xl font-bold">Driver Ditemukan!</h2>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-2xl">
                    🧑
                  </div>
                  <div>
                    <p className="font-semibold">{ride.driver?.name || "Driver"}</p>
                    <p className="text-sm text-white/50">{ride.driver?.plate || ride.driver?.vehiclePlate || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-center">
                <p className="text-green-400 font-medium">
                  {ride.status === "driver_arriving" ? "📍 Driver sedang menuju ke kamu..." : "✅ Driver dalam perjalanan"}
                </p>
              </div>

              <p className="text-center text-white/40 text-sm">Ride: {ride.code}</p>
            </div>
          )}

          {/* Step: Riding */}
          {step === "riding" && ride && (
            <div className="space-y-4 text-center py-6">
              <div className="text-4xl">🛣️</div>
              <h2 className="text-xl font-bold">Perjalanan Dimulai!</h2>
              <p className="text-white/50">
                {ride.pickup.address} &rarr; {ride.dropoff.address}
              </p>
              <p className="text-white/40 text-sm">Ride: {ride.code}</p>
            </div>
          )}

          {/* Step: Completed */}
          {step === "completed" && ride && (
            <div className="space-y-4 text-center py-6">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-bold">Perjalanan Selesai!</h2>
              <p className="text-white/50">Terima kasih sudah pakai Nemu Ojek</p>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-sm text-white/40">Total</p>
                <p className="text-2xl font-bold text-green-400">Rp {formatIdr(ride.price.amount)}</p>
              </div>

              <Button
                onClick={resetRide}
                className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold"
              >
                Pesan Lagi
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
