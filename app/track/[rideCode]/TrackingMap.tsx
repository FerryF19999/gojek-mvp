"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const greenIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const blueIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

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
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50] });
    fittedRef.current = true;
  }, [map, ride]);

  return null;
}

function getStatusText(ride: RideData, distanceKm: number | null): string {
  switch (ride.status) {
    case "created":
    case "awaiting_payment":
      return "Menunggu pembayaran...";
    case "dispatching":
    case "awaiting_driver_response":
      return "🔍 Mencari driver terdekat...";
    case "assigned":
    case "driver_arriving":
      return `🏍️ Driver ${ride.driver?.name ?? ""} menuju lokasi${distanceKm !== null ? ` (${distanceKm.toFixed(1)} km)` : ""}`;
    case "picked_up":
      return `🚀 Dalam perjalanan ke ${ride.dropoff.address}`;
    case "completed":
      return "Perjalanan selesai! ✅";
    case "cancelled":
      return "Perjalanan dibatalkan ❌";
    case "expired":
      return "Perjalanan expired ⏰";
    default:
      return ride.status;
  }
}

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

export default function TrackingMap({ ride }: { ride: RideData }) {
  const distanceKm = useMemo(() => {
    if (!ride.driver) return null;
    return haversineKm(
      ride.driver.lastLocation.lat,
      ride.driver.lastLocation.lng,
      ride.pickup.lat,
      ride.pickup.lng
    );
  }, [ride.driver, ride.pickup]);

  const center: [number, number] = [ride.pickup.lat, ride.pickup.lng];

  return (
    <div className="relative h-screen w-screen">
      {/* Map */}
      <MapContainer
        center={center}
        zoom={14}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Pickup marker - green */}
        <Marker position={[ride.pickup.lat, ride.pickup.lng]} icon={greenIcon}>
          <Popup>📍 Pickup: {ride.pickup.address}</Popup>
        </Marker>

        {/* Dropoff marker - red */}
        <Marker
          position={[ride.dropoff.lat, ride.dropoff.lng]}
          icon={redIcon}
        >
          <Popup>🏁 Dropoff: {ride.dropoff.address}</Popup>
        </Marker>

        {/* Driver marker - blue */}
        {ride.driver && (
          <Marker
            position={[
              ride.driver.lastLocation.lat,
              ride.driver.lastLocation.lng,
            ]}
            icon={blueIcon}
          >
            <Popup>
              🏍️ Driver: {ride.driver.name}
              {distanceKm !== null && ` (${distanceKm.toFixed(1)} km)`}
            </Popup>
          </Marker>
        )}

        <FitBounds ride={ride} />
      </MapContainer>

      {/* Status bar - top overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3">
        <div
          className={`${getStatusColor(ride.status)} backdrop-blur-sm rounded-xl px-4 py-3 text-white shadow-lg`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm opacity-80">{ride.code}</span>
            <span className="text-xs uppercase tracking-wider opacity-70">
              {ride.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-base font-semibold mt-1">
            {getStatusText(ride, distanceKm)}
          </p>
        </div>
      </div>

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
              <p className="text-lg font-bold text-green-400">
                {formatRupiah(ride.price.amount)}
              </p>
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
