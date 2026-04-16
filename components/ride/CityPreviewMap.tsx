"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type Props = {
  cityName: string;
  center: { lat: number; lng: number };
};

const cityIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;background:linear-gradient(135deg,#16a34a,#22c55e);border:3px solid #ffffff;box-shadow:0 6px 20px rgba(34,197,94,0.35);font-size:20px;">🏍️</div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

export default function CityPreviewMap({ cityName, center }: Props) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} className="h-[280px] w-full rounded-xl" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[center.lat, center.lng]} icon={cityIcon}>
        <Popup>
          <div className="font-semibold">{cityName}</div>
          <div className="text-xs text-gray-600">Area launching NEMU RIDE</div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
