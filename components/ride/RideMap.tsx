"use client";

import { MapContainer, Marker, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";

// Fix Leaflet default marker icons
const pickupIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const dropoffIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Location {
  address: string;
  lat: number;
  lng: number;
}

function FitBounds({ pickup, destination }: { pickup: Location | null; destination: Location | null }) {
  const map = useMap();

  useEffect(() => {
    if (pickup && destination) {
      const bounds = L.latLngBounds(
        [pickup.lat, pickup.lng],
        [destination.lat, destination.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (pickup) {
      map.setView([pickup.lat, pickup.lng], 15);
    }
  }, [map, pickup, destination]);

  return null;
}

export default function RideMap({
  pickup,
  destination,
}: {
  pickup: Location | null;
  destination: Location | null;
}) {
  const center = pickup
    ? [pickup.lat, pickup.lng] as [number, number]
    : [-6.2088, 106.8456] as [number, number];

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <FitBounds pickup={pickup} destination={destination} />

      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={dropoffIcon} />
      )}

      {pickup && destination && (
        <Polyline
          positions={[
            [pickup.lat, pickup.lng],
            [destination.lat, destination.lng],
          ]}
          color="#22c55e"
          weight={3}
          dashArray="8 8"
        />
      )}
    </MapContainer>
  );
}
