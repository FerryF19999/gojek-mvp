"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── Custom DivIcon creators ───────────────────────────────────────
function createEmojiIcon(emoji: string, bg: string, pulse = false): L.DivIcon {
  const pulseRing = pulse
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:3px solid ${bg};animation:pulse-ring 1.5s ease-out infinite;opacity:0"></div>`
    : "";
  return L.divIcon({
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      ${pulseRing}
      <div style="background:${bg};border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);position:relative;z-index:1">${emoji}</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
    className: "",
  });
}

const pickupIcon = createEmojiIcon("📍", "#22c55e");
const dropoffIcon = createEmojiIcon("🏁", "#ef4444");
const motorIcon = createEmojiIcon("🏍️", "#3b82f6", true);
const carIcon = createEmojiIcon("🚗", "#3b82f6", true);

// ─── Haversine ─────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ─── Types ─────────────────────────────────────────────────────────
interface RideData {
  _id: string;
  code: string;
  status: string;
  customerName: string;
  pickup: { address: string; lat: number; lng: number; note?: string };
  dropoff: { address: string; lat: number; lng: number; note?: string };
  vehicleType: string;
  price: { amount: number; currency: string };
  driver: {
    name: string;
    vehicleType: string;
    lastLocation: { lat: number; lng: number; updatedAt: number };
  } | null;
}

// ─── Inject global CSS for pulse animation ─────────────────────────
function InjectCSS() {
  useEffect(() => {
    const id = "gojek-map-pulse-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes pulse-ring {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes confetti-fall {
        0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
      .confetti-piece {
        position: fixed;
        width: 10px;
        height: 10px;
        top: -10px;
        z-index: 9999;
        animation: confetti-fall 3s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

// ─── FitBounds (run once) ──────────────────────────────────────────
function FitBounds({ ride }: { ride: RideData }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current) return;
    const points: L.LatLngExpression[] = [
      [ride.pickup.lat, ride.pickup.lng],
      [ride.dropoff.lat, ride.dropoff.lng],
    ];
    if (ride.driver) {
      points.push([ride.driver.lastLocation.lat, ride.driver.lastLocation.lng]);
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
    fittedRef.current = true;
  }, [map, ride]);

  return null;
}

// ─── Smooth animated marker using useMap ───────────────────────────
function AnimatedMarker({
  position,
  icon,
  children,
}: {
  position: [number, number];
  icon: L.DivIcon;
  children?: React.ReactNode;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const animRef = useRef<number | null>(null);
  const prevPos = useRef<[number, number]>(position);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const [startLat, startLng] = [marker.getLatLng().lat, marker.getLatLng().lng];
    const [endLat, endLng] = position;

    if (Math.abs(startLat - endLat) < 0.000001 && Math.abs(startLng - endLng) < 0.000001) return;

    const duration = 1500; // ms
    const startTime = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = startLat + (endLat - startLat) * ease;
      const lng = startLng + (endLng - startLng) * ease;
      marker!.setLatLng([lat, lng]);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    }
    animRef.current = requestAnimationFrame(animate);
    prevPos.current = position;

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [position]);

  return (
    <Marker
      position={prevPos.current}
      icon={icon}
      ref={(r) => {
        markerRef.current = r as unknown as L.Marker | null;
      }}
    >
      {children}
    </Marker>
  );
}

// ─── Status helpers ────────────────────────────────────────────────
function getStatusColor(status: string): string {
  switch (status) {
    case "dispatching":
    case "awaiting_driver_response":
      return "bg-yellow-500/90";
    case "assigned":
    case "driver_arriving":
      return "bg-blue-500/90";
    case "picked_up":
      return "bg-green-500/90";
    case "completed":
      return "bg-green-600/90";
    case "cancelled":
    case "expired":
      return "bg-red-500/90";
    default:
      return "bg-gray-700/90";
  }
}

function formatRupiah(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

// ─── Confetti overlay ──────────────────────────────────────────────
function Confetti() {
  const [pieces, setPieces] = useState<{ id: number; left: number; color: string; delay: number }[]>([]);

  useEffect(() => {
    const colors = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#ec4899"];
    const p = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 2,
    }));
    setPieces(p);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export default function TrackingMap({ ride }: { ride: RideData }) {
  // Simulated driver position (client-side only)
  const [simPos, setSimPos] = useState<[number, number] | null>(null);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const completedRef = useRef(false);

  // Initialize simulated position from actual driver location
  useEffect(() => {
    if (ride.driver && !simPos) {
      setSimPos([ride.driver.lastLocation.lat, ride.driver.lastLocation.lng]);
    }
  }, [ride.driver, simPos]);

  // Client-side movement simulation
  useEffect(() => {
    if (simRef.current) clearInterval(simRef.current);

    const canSimulate =
      ride.driver &&
      (ride.status === "assigned" || ride.status === "driver_arriving" || ride.status === "picked_up");

    if (!canSimulate) return;

    const target =
      ride.status === "picked_up"
        ? { lat: ride.dropoff.lat, lng: ride.dropoff.lng }
        : { lat: ride.pickup.lat, lng: ride.pickup.lng };

    simRef.current = setInterval(() => {
      setSimPos((prev) => {
        if (!prev) return prev;
        const [lat, lng] = prev;
        const dLat = target.lat - lat;
        const dLng = target.lng - lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < 0.0005) return prev; // close enough
        // Dynamic step: faster for longer distances, min 0.0008, max 0.02
        const step = Math.max(0.0008, Math.min(0.02, dist * 0.05));
        const ratio = step / dist;
        return [lat + dLat * ratio, lng + dLng * ratio];
      });
    }, 2000);

    return () => {
      if (simRef.current) clearInterval(simRef.current);
    };
  }, [ride.status, ride.driver, ride.pickup, ride.dropoff]);

  // Confetti on completion
  useEffect(() => {
    if (ride.status === "completed" && !completedRef.current) {
      completedRef.current = true;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    }
  }, [ride.status]);

  const driverPos: [number, number] | null = useMemo(() => {
    if (simPos) return simPos;
    if (ride.driver) return [ride.driver.lastLocation.lat, ride.driver.lastLocation.lng];
    return null;
  }, [simPos, ride.driver]);

  // Distance & ETA calculations
  const { distanceKm, etaMin } = useMemo(() => {
    if (!driverPos) return { distanceKm: null, etaMin: null };

    const targetLat = ride.status === "picked_up" ? ride.dropoff.lat : ride.pickup.lat;
    const targetLng = ride.status === "picked_up" ? ride.dropoff.lng : ride.pickup.lng;
    const dist = haversineKm(driverPos[0], driverPos[1], targetLat, targetLng);
    const speed = ride.vehicleType === "motor" ? 30 : 25; // km/h
    const eta = Math.max(1, Math.round((dist / speed) * 60));
    return { distanceKm: dist, etaMin: eta };
  }, [driverPos, ride.status, ride.pickup, ride.dropoff, ride.vehicleType]);

  const driverIcon = ride.vehicleType === "motor" ? motorIcon : carIcon;
  const center: [number, number] = [ride.pickup.lat, ride.pickup.lng];

  // Route polylines
  const routeLines = useMemo(() => {
    const lines: { positions: [number, number][]; color: string; dash: string }[] = [];

    if (driverPos) {
      if (ride.status === "assigned" || ride.status === "driver_arriving" || ride.status === "dispatching" || ride.status === "awaiting_driver_response") {
        // Driver → Pickup (blue dashed)
        lines.push({
          positions: [driverPos, [ride.pickup.lat, ride.pickup.lng]],
          color: "#3b82f6",
          dash: "10 8",
        });
        // Pickup → Dropoff (gray dashed, preview)
        lines.push({
          positions: [[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]],
          color: "#6b7280",
          dash: "6 6",
        });
      } else if (ride.status === "picked_up") {
        // Current → Dropoff (green solid)
        lines.push({
          positions: [driverPos, [ride.dropoff.lat, ride.dropoff.lng]],
          color: "#22c55e",
          dash: "",
        });
      }
    }
    // If no driver yet, show pickup → dropoff preview
    if (!driverPos) {
      lines.push({
        positions: [[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]],
        color: "#6b7280",
        dash: "6 6",
      });
    }
    return lines;
  }, [driverPos, ride.status, ride.pickup, ride.dropoff]);

  // Status text
  const statusText = useMemo(() => {
    switch (ride.status) {
      case "created":
      case "awaiting_payment":
        return "Menunggu pembayaran...";
      case "dispatching":
      case "awaiting_driver_response":
        return "🔍 Mencari driver terdekat...";
      case "assigned":
      case "driver_arriving":
        return `🏍️ Driver ${ride.driver?.name ?? ""} menuju lokasi`;
      case "picked_up":
        return `🚀 Dalam perjalanan ke ${ride.dropoff.address}`;
      case "completed":
        return "✅ Perjalanan selesai!";
      case "cancelled":
        return "❌ Perjalanan dibatalkan";
      case "expired":
        return "⏰ Perjalanan expired";
      default:
        return ride.status;
    }
  }, [ride]);

  return (
    <div className="relative h-screen w-screen">
      <InjectCSS />
      {showConfetti && <Confetti />}

      {/* Map */}
      <MapContainer center={center} zoom={14} className="h-full w-full z-0" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route polylines */}
        {routeLines.map((line, i) => (
          <Polyline
            key={i}
            positions={line.positions}
            pathOptions={{
              color: line.color,
              weight: 4,
              opacity: 0.8,
              dashArray: line.dash || undefined,
            }}
          />
        ))}

        {/* Pickup marker */}
        <Marker position={[ride.pickup.lat, ride.pickup.lng]} icon={pickupIcon}>
          <Popup>📍 Pickup: {ride.pickup.address}</Popup>
        </Marker>

        {/* Dropoff marker */}
        <Marker position={[ride.dropoff.lat, ride.dropoff.lng]} icon={dropoffIcon}>
          <Popup>🏁 Dropoff: {ride.dropoff.address}</Popup>
        </Marker>

        {/* Driver marker (animated) */}
        {driverPos && (
          <AnimatedMarker position={driverPos} icon={driverIcon}>
            <Popup>
              {ride.vehicleType === "motor" ? "🏍️" : "🚗"} Driver: {ride.driver?.name}
              {distanceKm !== null && ` (${distanceKm.toFixed(1)} km)`}
            </Popup>
          </AnimatedMarker>
        )}

        <FitBounds ride={ride} />
      </MapContainer>

      {/* LIVE badge */}
      {driverPos && ride.status !== "completed" && ride.status !== "cancelled" && (
        <div className="absolute top-16 right-3 z-[1000]">
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-white text-xs font-semibold tracking-wider">LIVE</span>
          </div>
        </div>
      )}

      {/* Status bar - top overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3">
        <div className={`${getStatusColor(ride.status)} backdrop-blur-sm rounded-xl px-4 py-3 text-white shadow-lg`}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm opacity-80">{ride.code}</span>
            <span className="text-xs uppercase tracking-wider opacity-70">
              {ride.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-base font-semibold mt-1">{statusText}</p>
          {/* ETA & Distance */}
          {distanceKm !== null && etaMin !== null && ride.status !== "completed" && (
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-sm opacity-90">📏 {distanceKm.toFixed(1)} km lagi</span>
              <span className="text-sm opacity-90">⏱️ ~{etaMin} menit</span>
            </div>
          )}
        </div>
      </div>

      {/* Completion overlay */}
      {ride.status === "completed" && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="bg-green-600/90 backdrop-blur-sm rounded-2xl px-8 py-6 text-white text-center shadow-2xl">
            <div className="text-5xl mb-2">✅</div>
            <p className="text-xl font-bold">Perjalanan Selesai!</p>
            <p className="text-sm opacity-80 mt-1">Terima kasih telah menggunakan Ujek AI</p>
          </div>
        </div>
      )}

      {/* Info card - bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] p-3">
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl px-4 py-4 text-white shadow-lg space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">📍</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">Pickup</p>
              <p className="text-sm truncate">{ride.pickup.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">🏁</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">Dropoff</p>
              <p className="text-sm truncate">{ride.dropoff.address}</p>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-2 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Fare</p>
              <p className="text-lg font-bold text-green-400">{formatRupiah(ride.price.amount)}</p>
            </div>
            <div className="text-right">
              {ride.driver ? (
                <>
                  <p className="text-xs text-gray-400">Driver</p>
                  <p className="text-sm font-semibold">{ride.driver.name}</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {ride.driver.vehicleType === "motor" ? "🏍️ Motor" : "🚗 Mobil"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400">Vehicle</p>
                  <p className="text-sm capitalize">
                    {ride.vehicleType === "motor" ? "🏍️ Motor" : "🚗 Mobil"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
