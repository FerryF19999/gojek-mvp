export type LaunchCityStatus = "launching soon" | "active";

export type LaunchCity = {
  id: "jakarta" | "bandung" | "bali";
  name: string;
  center: { lat: number; lng: number };
  zones: string[];
  status: LaunchCityStatus;
};

export const launchCities: LaunchCity[] = [
  {
    id: "jakarta",
    name: "Jakarta",
    center: { lat: -6.2088, lng: 106.8456 },
    zones: ["Jakarta Pusat", "Jakarta Selatan", "Jakarta Barat", "Jakarta Timur"],
    status: "active",
  },
  {
    id: "bandung",
    name: "Bandung",
    center: { lat: -6.9175, lng: 107.6191 },
    zones: ["Bandung Wetan", "Coblong", "Lengkong", "Cicendo"],
    status: "launching soon",
  },
  {
    id: "bali",
    name: "Bali",
    center: { lat: -8.6705, lng: 115.2126 },
    zones: ["Denpasar", "Kuta", "Sanur", "Ubud"],
    status: "launching soon",
  },
];
