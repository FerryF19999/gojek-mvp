/**
 * API client for Nemu Ojek backend
 * Handles all HTTP calls to the Next.js API routes
 */

const API_BASE = process.env.NEMU_API_BASE || "https://gojek-mvp.vercel.app/api";
const FETCH_TIMEOUT_MS = 10000;

/**
 * fetch with timeout + safe JSON parsing
 */
async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`);
  }
}

async function createRideAPI(payload) {
  const res = await safeFetch(`${API_BASE}/rides/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create ride failed (${res.status})`);
  return safeJson(res);
}

async function getRideStatus(rideCode) {
  const res = await safeFetch(`${API_BASE}/rides/${encodeURIComponent(rideCode)}`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return safeJson(res);
}

async function submitRideRating(rideCode, rating) {
  const res = await safeFetch(`${API_BASE}/rides/${encodeURIComponent(rideCode)}/rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error(`Rating submit failed (${res.status})`);
  return safeJson(res);
}

async function registerDriver(phone, fullName, plate, city) {
  const res = await safeFetch(`${API_BASE}/drivers/register/direct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName,
      phone: `+${phone}`,
      vehicleType: "motor",
      vehicleBrand: "Honda",
      vehicleModel: "Beat",
      vehiclePlate: plate,
      licenseNumber: `SIM-${phone.slice(-6)}`,
      city,
    }),
  });
  if (!res.ok) throw new Error(`Driver register failed (${res.status})`);
  return safeJson(res);
}

async function setDriverAvailability(token, availability) {
  const res = await safeFetch(`${API_BASE}/drivers/me/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ availability }),
  });
  if (!res.ok) throw new Error(`Set availability failed (${res.status})`);
  return safeJson(res);
}

async function getDriverProfile(token) {
  const res = await safeFetch(`${API_BASE}/drivers/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get profile failed (${res.status})`);
  return safeJson(res);
}

async function getDriverRides(token) {
  const res = await safeFetch(`${API_BASE}/drivers/me/rides`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get driver rides failed (${res.status})`);
  const data = await res.json();
  return data.rides || data.data || data.items || [];
}

async function getDriverEarnings(token) {
  const res = await safeFetch(`${API_BASE}/drivers/me/earnings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get earnings failed (${res.status})`);
  return safeJson(res);
}

async function driverRespondRide(token, rideCode, action) {
  const endpoint = action === "accept" ? "accept" : "decline";
  const res = await fetch(
    `${API_BASE}/drivers/me/rides/${encodeURIComponent(rideCode)}/${endpoint}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`${endpoint} ride failed (${res.status})`);
  return safeJson(res);
}

async function updateDriverLocation(token, lat, lng) {
  const res = await safeFetch(`${API_BASE}/drivers/me/location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error(`Update location failed (${res.status})`);
  return safeJson(res);
}

async function fetchJson(pathname) {
  const res = await fetch(`${API_BASE}${pathname}`);
  if (!res.ok) throw new Error(`API failed ${pathname} (${res.status})`);
  return safeJson(res);
}

// Known local places that Nominatim gets wrong
const LOCAL_PLACES = {
  "gunung batu": { lat: -6.8747, lng: 107.5675, name: "Gunung Batu, Cimahi" },
  "gunung batu bandung": { lat: -6.8747, lng: 107.5675, name: "Gunung Batu, Cimahi" },
  "gunung batu cimahi": { lat: -6.8747, lng: 107.5675, name: "Gunung Batu, Cimahi" },
  "gedung sate": { lat: -6.9025, lng: 107.6186, name: "Gedung Sate, Bandung" },
  "gedung sate bandung": { lat: -6.9025, lng: 107.6186, name: "Gedung Sate, Bandung" },
  "alun alun bandung": { lat: -6.9216, lng: 107.607, name: "Alun-alun Bandung" },
  "alun-alun bandung": { lat: -6.9216, lng: 107.607, name: "Alun-alun Bandung" },
  "dago": { lat: -6.8848, lng: 107.6186, name: "Dago, Bandung" },
  "dago bandung": { lat: -6.8848, lng: 107.6186, name: "Dago, Bandung" },
  "pasteur": { lat: -6.8936, lng: 107.5932, name: "Pasteur, Bandung" },
  "pasteur bandung": { lat: -6.8936, lng: 107.5932, name: "Pasteur, Bandung" },
  "cimindi": { lat: -6.8793, lng: 107.5718, name: "Cimindi, Cimahi" },
  "cimahi": { lat: -6.8722, lng: 107.5413, name: "Cimahi" },
  "pvj": { lat: -6.8868, lng: 107.6105, name: "Paris Van Java, Bandung" },
  "mall pvj": { lat: -6.8868, lng: 107.6105, name: "Paris Van Java, Bandung" },
  "braga": { lat: -6.9178, lng: 107.6098, name: "Braga, Bandung" },
  "itb": { lat: -6.8915, lng: 107.6107, name: "ITB, Bandung" },
  "unpad": { lat: -6.8936, lng: 107.6167, name: "UNPAD, Bandung" },
  "stasiun bandung": { lat: -6.9126, lng: 107.6091, name: "Stasiun Bandung" },
  "husein": { lat: -6.9006, lng: 107.5762, name: "Bandara Husein, Bandung" },
  "bandara husein": { lat: -6.9006, lng: 107.5762, name: "Bandara Husein, Bandung" },
  "cicaheum": { lat: -6.9058, lng: 107.6518, name: "Terminal Cicaheum, Bandung" },
  "leuwipanjang": { lat: -6.9381, lng: 107.6014, name: "Terminal Leuwipanjang, Bandung" },
  "buah batu": { lat: -6.9395, lng: 107.6353, name: "Buah Batu, Bandung" },
  "kopo": { lat: -6.9363, lng: 107.5859, name: "Kopo, Bandung" },
};

async function geocodeAddress(address, nearLat, nearLng) {
  // Check local places first
  const normalized = (address || "").toLowerCase().trim();
  const local = LOCAL_PLACES[normalized];
  if (local) {
    return { lat: local.lat, lng: local.lng, displayName: local.name };
  }

  let query = address;

  if (nearLat && nearLng) {
    // Detect city from coordinates for context
    let cityName = "";
    if (nearLat > -6.95 && nearLat < -6.82 && nearLng > 107.5 && nearLng < 107.72) cityName = "Bandung";
    else if (nearLat > -6.4 && nearLat < -6.1 && nearLng > 106.6 && nearLng < 107.0) cityName = "Jakarta";
    else if (nearLat > -7.35 && nearLat < -7.2 && nearLng > 112.65 && nearLng < 112.85) cityName = "Surabaya";

    // Search with city context + viewbox bias (0.5 degree ~ 55km radius)
    const searchQuery = cityName ? `${query} ${cityName}` : query;
    const encoded = encodeURIComponent(searchQuery);
    const vb = `${nearLng-0.5},${nearLat+0.5},${nearLng+0.5},${nearLat-0.5}`;
    const res = await safeFetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=3&viewbox=${vb}&bounded=0`,
      { headers: { "User-Agent": "NemuOjek/1.0" } }
    );
    if (res.ok) {
      const results = await safeJson(res).catch(() => []);
      if (results.length) {
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
          displayName: results[0].display_name,
        };
      }
    }
  }

  // Fallback: simple search with Indonesia context
  const encoded = encodeURIComponent(query + " Indonesia");
  const res = await safeFetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
    { headers: { "User-Agent": "NemuOjek/1.0" } }
  );
  if (!res.ok) return null;
  const results = await safeJson(res).catch(() => []);
  if (!results.length) return null;
  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };
}

async function reverseGeocode(lat, lng) {
  const res = await safeFetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
    { headers: { "User-Agent": "NemuOjek/1.0" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const parts = [];
  if (data.address?.road) parts.push(data.address.road);
  if (data.address?.suburb) parts.push(data.address.suburb);
  if (data.address?.city || data.address?.town) parts.push(data.address.city || data.address.town);
  return parts.length ? parts.join(", ") : data.display_name?.split(",").slice(0, 3).join(",");
}

module.exports = {
  API_BASE,
  createRideAPI,
  getRideStatus,
  submitRideRating,
  registerDriver,
  setDriverAvailability,
  getDriverProfile,
  getDriverRides,
  getDriverEarnings,
  driverRespondRide,
  updateDriverLocation,
  fetchJson,
  geocodeAddress,
  reverseGeocode,
};
