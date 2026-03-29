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

async function geocodeAddress(address, nearLat, nearLng) {
  // Add city context if we have a nearby location
  let query = address;
  if (nearLat && nearLng) {
    // Bias search to area near pickup
    const encoded = encodeURIComponent(query);
    const res = await safeFetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=3&viewbox=${nearLng-0.2},${nearLat-0.2},${nearLng+0.2},${nearLat+0.2}&bounded=1`,
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
    // Fallback: add "Bandung"/"Jakarta" context from reverse geocode
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
