"use client";

import { useEffect, useRef, useMemo } from "react";
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
const passengerIcon = createEmojiIcon("👤", "#eab308");

// ─── Inject pulse CSS ──────────────────────────────────────────────
function InjectCSS() {
  useEffect(() => {
    const id = "gojek-driver-map-pulse-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes pulse-ring {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(2.2); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

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

// ─── Animated Marker ───────────────────────────────────────────────
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

    const duration = 1500;
    const startTime = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
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

// ─── FitBounds ─────────────────────────────────────────────────────
interface Props {
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  driverLocation: { lat: number; lng: number } | null;
  status: string;
  vehicleType?: string;
}

function FitBounds({ pickup, dropoff, driverLocation }: Omit<Props, "status" | "vehicleType">) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current) return;
    const points: L.LatLngExpression[] = [
      [pickup.lat, pickup.lng],
      [dropoff.lat, dropoff.lng],
    ];
    if (driverLocation) {
      points.push([driverLocation.lat, driverLocation.lng]);
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
    fittedRef.current = true;
  }, [map, pickup, dropoff, driverLocation]);

  return null;
}

// ─── Main Component ────────────────────────────────────────────────
export default function DriverMap({ pickup, dropoff, driverLocation, status, vehicleType = "motor" }: Props) {
  const driverIcon = vehicleType === "motor" ? motorIcon : carIcon;

  // Distance & ETA
  const navInfo = useMemo(() => {
    if (!driverLocation) return null;
    if (status === "assigned" || status === "awaiting_driver_response" || status === "driver_arriving") {
      const dist = haversineKm(driverLocation.lat, driverLocation.lng, pickup.lat, pickup.lng);
      const speed = vehicleType === "motor" ? 30 : 25;
      const eta = Math.max(1, Math.round((dist / speed) * 60));
      return { dist, eta, label: "Menuju titik jemput" };
    }
    if (status === "picked_up") {
      const dist = haversineKm(driverLocation.lat, driverLocation.lng, dropoff.lat, dropoff.lng);
      const speed = vehicleType === "motor" ? 30 : 25;
      const eta = Math.max(1, Math.round((dist / speed) * 60));
      return { dist, eta, label: "Menuju tujuan" };
    }
    return null;
  }, [driverLocation, status, pickup, dropoff, vehicleType]);

  // Route polylines
  const routeLines = useMemo(() => {
    const lines: { positions: [number, number][]; color: string; dash: string }[] = [];

    if (driverLocation) {
      if (status === "assigned" || status === "driver_arriving" || status === "awaiting_driver_response") {
        // Driver → Pickup (blue dashed)
        lines.push({
          positions: [[driverLocation.lat, driverLocation.lng], [pickup.lat, pickup.lng]],
          color: "#3b82f6",
          dash: "10 8",
        });
        // Pickup → Dropoff (gray dashed, preview)
        lines.push({
          positions: [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]],
          color: "#6b7280",
          dash: "6 6",
        });
      } else if (status === "picked_up") {
        // Current → Dropoff (green solid)
        lines.push({
          positions: [[driverLocation.lat, driverLocation.lng], [dropoff.lat, dropoff.lng]],
          color: "#22c55e",
          dash: "",
        });
      }
    }

    if (!driverLocation) {
      lines.push({
        positions: [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]],
        color: "#6b7280",
        dash: "6 6",
      });
    }

    return lines;
  }, [driverLocation, status, pickup, dropoff]);

  // Show passenger icon on driver's map (at pickup) during approach
  const showPassenger = status === "assigned" || status === "driver_arriving" || status === "awaiting_driver_response";

  return (
    <>
      <InjectCSS />
      <MapContainer
        center={[pickup.lat, pickup.lng]}
        zoom={14}
        className="h-full w-full z-0"
        zoomControl={false}
      >
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
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Popup>📍 Jemput: {pickup.address}</Popup>
        </Marker>

        {/* Passenger waiting icon (at pickup, driver map only) */}
        {showPassenger && (
          <Marker
            position={[pickup.lat + 0.0003, pickup.lng + 0.0003]}
            icon={passengerIcon}
          >
            <Popup>👤 Penumpang menunggu di sini</Popup>
          </Marker>
        )}

        {/* Dropoff marker */}
        <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}>
          <Popup>🏁 Tujuan: {dropoff.address}</Popup>
        </Marker>

        {/* Driver marker (animated) */}
        {driverLocation && (
          <AnimatedMarker
            position={[driverLocation.lat, driverLocation.lng]}
            icon={driverIcon}
          >
            <Popup>
              {vehicleType === "motor" ? "🏍️" : "🚗"} Posisi Anda
              {navInfo && ` — ${navInfo.dist.toFixed(1)} km`}
            </Popup>
          </AnimatedMarker>
        )}

        <FitBounds pickup={pickup} dropoff={dropoff} driverLocation={driverLocation} />
      </MapContainer>

      {/* Navigation info overlay (inside the map area) */}
      {navInfo && (
        <div className="absolute top-14 left-3 right-3 z-[1000]">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white flex items-center justify-between">
            <span className="text-sm">📍 {navInfo.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{navInfo.dist.toFixed(1)} km</span>
              <span className="text-sm opacity-80">⏱️ ~{navInfo.eta} min</span>
            </div>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      {driverLocation && status !== "completed" && status !== "cancelled" && (
        <div className="absolute top-14 right-3 z-[1001]" style={{ top: navInfo ? "6.5rem" : "3.5rem" }}>
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-white text-xs font-semibold tracking-wider">LIVE</span>
          </div>
        </div>
      )}
    </>
  );
}
