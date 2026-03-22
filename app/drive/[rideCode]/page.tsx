"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";

const DriverMap = dynamic(() => import("./DriverMap"), { ssr: false });

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount);
}

type RideStatus = "created" | "awaiting_payment" | "dispatching" | "assigned" | "driver_arriving" | "picked_up" | "completed" | "cancelled" | "expired" | "awaiting_driver_response";
type Lang = "id" | "en";

export default function DriverViewPage() {
  const [lang, setLang] = useState<Lang>("id");
  const params = useParams();
  const rideCode = params.rideCode as string;

  const ride = useQuery(api.driverView.getRideForDriver, { code: rideCode });
  const acceptRide = useMutation(api.driverView.driverAcceptRide);
  const arrivedAtPickup = useMutation(api.driverView.driverArrivedAtPickup);
  const completeRide = useMutation(api.driverView.driverCompleteRide);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickupQrDataUrl, setPickupQrDataUrl] = useState<string | null>(null);

  const handleAction = useCallback(async (action: () => Promise<unknown>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : lang === "id" ? "Terjadi kesalahan" : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  const status = ride?.status as RideStatus | undefined;

  const navInfo = useMemo(() => {
    if (!ride) return null;
    const driverLoc = ride.driver?.lastLocation;
    if (status === "assigned" || status === "awaiting_driver_response" || status === "driver_arriving") {
      const dist = driverLoc
        ? haversineKm(driverLoc.lat, driverLoc.lng, ride.pickup.lat, ride.pickup.lng).toFixed(1)
        : "—";
      return { label: "Menuju titik jemput", distance: dist };
    }
    if (status === "picked_up") {
      const fromLat = driverLoc?.lat ?? ride.pickup.lat;
      const fromLng = driverLoc?.lng ?? ride.pickup.lng;
      const dist = haversineKm(fromLat, fromLng, ride.dropoff.lat, ride.dropoff.lng).toFixed(1);
      return { label: "Menuju tujuan", distance: dist };
    }
    return null;
  }, [ride, status]);

  useEffect(() => {
    if (!ride) return;
    const shouldShowQr = status === "assigned" || status === "awaiting_driver_response" || status === "driver_arriving";
    if (!shouldShowQr) {
      setPickupQrDataUrl(null);
      return;
    }

    const payload = JSON.stringify({
      t: "pickup_verify",
      rideCode: ride.code,
      customer: ride.customerName,
      pickup: ride.pickup.address,
      driver: ride.driver?.driverName ?? null,
      status,
    });

    QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then(setPickupQrDataUrl)
      .catch(() => setPickupQrDataUrl(null));
  }, [ride, status]);

  if (ride === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mx-auto mb-4" />
          <p>Memuat data ride...</p>
        </div>
      </div>
    );
  }

  if (ride === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-2xl mb-2">❌</p>
          <p className="text-lg font-bold">Ride tidak ditemukan</p>
          <p className="text-gray-400 mt-1">Kode: {rideCode}</p>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    created: "Dibuat",
    awaiting_payment: "Menunggu Pembayaran",
    dispatching: "Mencari Driver",
    assigned: "Driver Ditugaskan",
    awaiting_driver_response: "Menunggu Respon Driver",
    driver_arriving: "Driver Menuju Jemput",
    picked_up: "Dalam Perjalanan",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    expired: "Kedaluwarsa",
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-900">
      <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-3 top-3 z-[2000] rounded-full border border-white/10 bg-black/60 text-white px-3 py-1 text-xs">{lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}</button>
      {/* Map */}
      <DriverMap
        pickup={ride.pickup}
        dropoff={ride.dropoff}
        driverLocation={ride.driver?.lastLocation ?? null}
        status={status ?? "created"}
        vehicleType={ride.vehicleType}
      />

      {/* Navigation Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-black/80 backdrop-blur-sm text-white px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-mono">{ride.code}</span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-white/20">
              {statusLabels[ride.status] ?? ride.status}
            </span>
          </div>
          <div className="text-sm font-medium">
            {ride.vehicleType === "motor" ? "🏍️" : "🚗"}
          </div>
        </div>
        {navInfo && (
          <p className="text-sm mt-1 text-green-400">
            📍 {navInfo.label} — <span className="font-bold">{navInfo.distance} km</span>
          </p>
        )}
      </div>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] safe-bottom">
        {/* Info Card */}
        <div className="bg-black/80 backdrop-blur-sm text-white px-4 py-3 border-t border-white/10">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Penumpang</span>
              <span className="font-medium">{ride.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Jemput</span>
              <span className="font-medium text-right max-w-[60%] truncate">{ride.pickup.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tujuan</span>
              <span className="font-medium text-right max-w-[60%] truncate">{ride.dropoff.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tarif</span>
              <span className="font-bold text-green-400">Rp {formatCurrency(ride.price.amount)}</span>
            </div>
            {pickupQrDataUrl && (
              <div className="pt-2 border-t border-white/10 mt-2">
                <p className="text-xs text-gray-400 mb-2">Tunjukkan QR ini ke penumpang untuk verifikasi pickup</p>
                <div className="bg-white inline-block p-2 rounded-lg">
                  <img src={pickupQrDataUrl} alt="QR verifikasi pickup" className="w-24 h-24" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="bg-black/90 px-4 py-4">
          {error && (
            <p className="text-red-400 text-sm text-center mb-2">{error}</p>
          )}

          {(status === "assigned" || status === "awaiting_driver_response") && (
            <button
              onClick={() => handleAction(() => acceptRide({ rideId: ride._id }))}
              disabled={loading}
              className="w-full py-4 rounded-xl text-lg font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white disabled:opacity-50 transition-colors"
              style={{ minHeight: 60 }}
            >
              {loading ? "Memproses..." : "🟢 TERIMA"}
            </button>
          )}

          {status === "driver_arriving" && (
            <button
              onClick={() => handleAction(() => arrivedAtPickup({ rideId: ride._id }))}
              disabled={loading}
              className="w-full py-4 rounded-xl text-lg font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-50 transition-colors"
              style={{ minHeight: 60 }}
            >
              {loading ? "Memproses..." : "🔵 SUDAH SAMPAI"}
            </button>
          )}

          {status === "picked_up" && (
            <button
              onClick={() => handleAction(() => completeRide({ rideId: ride._id }))}
              disabled={loading}
              className="w-full py-4 rounded-xl text-lg font-bold bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black disabled:opacity-50 transition-colors"
              style={{ minHeight: 60 }}
            >
              {loading ? "Memproses..." : "🟡 SELESAI"}
            </button>
          )}

          {status === "completed" && (
            <div
              className="w-full py-4 rounded-xl text-lg font-bold bg-gray-700 text-white text-center"
              style={{ minHeight: 60 }}
            >
              ✅ Perjalanan Selesai
            </div>
          )}

          {status && !["assigned", "awaiting_driver_response", "driver_arriving", "picked_up", "completed"].includes(status) && (
            <div
              className="w-full py-4 rounded-xl text-lg font-bold bg-gray-700 text-gray-400 text-center"
              style={{ minHeight: 60 }}
            >
              {statusLabels[status] ?? status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
