"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const blueIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

interface Props {
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  driverLocation: { lat: number; lng: number } | null;
  status: string;
}

function FitBounds({ pickup, dropoff, driverLocation }: Omit<Props, "status">) {
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
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    fittedRef.current = true;
  }, [map, pickup, dropoff, driverLocation]);

  return null;
}

export default function DriverMap({ pickup, dropoff, driverLocation }: Props) {
  return (
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
      <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon}>
        <Popup>📍 Jemput: {pickup.address}</Popup>
      </Marker>
      <Marker position={[dropoff.lat, dropoff.lng]} icon={redIcon}>
        <Popup>🏁 Tujuan: {dropoff.address}</Popup>
      </Marker>
      {driverLocation && (
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={blueIcon}>
          <Popup>🏍️ Posisi Anda</Popup>
        </Marker>
      )}
      <FitBounds pickup={pickup} dropoff={dropoff} driverLocation={driverLocation} />
    </MapContainer>
  );
}
