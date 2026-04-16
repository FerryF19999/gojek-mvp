"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";

const SEND_INTERVAL_MS = 2000; // max 2s cadence for near real-time
const FALLBACK_POLL_MS = 3000; // backup if watchPosition stalls
const MIN_MOVE_METERS = 3; // allow tiny movement threshold to avoid noisy spam

export default function DriverGpsWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#94a3b8" }}>⏳ Memuat GPS...</div>}>
      <DriverGpsPage />
    </Suspense>
  );
}

function DriverGpsPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentAtRef = useRef(0);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const sendLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!token) return false;

      try {
        const res = await fetch(`/api/drivers/me/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ lat, lng }),
          keepalive: true,
        });

        if (res.ok) {
          setLastUpdate(new Date().toLocaleTimeString("id-ID"));
          setUpdateCount((c) => c + 1);
          lastSentAtRef.current = Date.now();
          lastSentCoordsRef.current = { lat, lng };
          return true;
        }

        console.error("Location update failed:", res.status);
        return false;
      } catch (err) {
        console.error("Location send error:", err);
        return false;
      }
    },
    [token],
  );

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    setStatus("idle");
  }, []);

  const maybeSendPosition = useCallback(
    (lat: number, lng: number, force = false) => {
      const now = Date.now();
      const last = lastSentCoordsRef.current;
      const moved = last ? haversineMeters(last.lat, last.lng, lat, lng) : Infinity;
      const elapsed = now - lastSentAtRef.current;

      const shouldSend = force || elapsed >= SEND_INTERVAL_MS || moved >= MIN_MOVE_METERS;
      if (!shouldSend) return;

      void sendLocation(lat, lng);
    },
    [sendLocation],
  );

  const onGeoPosition = useCallback(
    (pos: GeolocationPosition, force = false) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      maybeSendPosition(lat, lng, force);
    },
    [maybeSendPosition],
  );

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMsg("HP kamu gak support GPS 😢");
      setStatus("error");
      return;
    }

    setErrorMsg("");
    setStatus("tracking");

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }

    // Immediate first point
    navigator.geolocation.getCurrentPosition(
      (pos) => onGeoPosition(pos, true),
      (err) => {
        setErrorMsg(getGeoError(err));
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );

    // Primary realtime stream
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => onGeoPosition(pos, false),
      (err) => {
        console.error("watchPosition error:", err);
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMsg(getGeoError(err));
          setStatus("error");
          stopTracking();
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000,
      },
    );

    // Fallback heartbeat polling every 3s (helps when watch callback stalls on some devices)
    fallbackIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => onGeoPosition(pos, false),
        (err) => {
          if (err.code !== err.TIMEOUT) {
            console.error("Fallback GPS error:", err);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }, FALLBACK_POLL_MS);
  }, [onGeoPosition, stopTracking]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
    };
  }, []);

  if (!token) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>❌ Token Gak Ada</h1>
          <p style={styles.text}>
            Link ini harus dibuka dari chat WhatsApp NEMU RIDE ya.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏍️ NEMU RIDE</h1>
        <h2 style={styles.subtitle}>Sharing Lokasi Driver</h2>

        {status === "idle" && (
          <>
            <p style={styles.text}>
              Tap tombol di bawah buat mulai share lokasi kamu ke NEMU.
            </p>
            <button onClick={startTracking} style={styles.button}>
              📍 Mulai Share Lokasi
            </button>
          </>
        )}

        {status === "tracking" && (
          <>
            <div style={styles.statusBox}>
              <div style={styles.pulseWrapper}>
                <div style={styles.pulse} />
                <span style={styles.pulseText}>🟢 LIVE</span>
              </div>
              <p style={styles.statusText}>Lokasi kamu dikirim real-time (±2-3 detik)</p>
            </div>

            {coords && (
              <div style={styles.coordBox}>
                <p style={styles.coordText}>
                  📍 {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </p>
              </div>
            )}

            <div style={styles.infoBox}>
              <p style={styles.infoText}>⏱️ Update terakhir: {lastUpdate || "..."}</p>
              <p style={styles.infoText}>📡 Total update: {updateCount}x</p>
            </div>

            <p style={styles.hint}>
              ⚠️ Jangan tutup halaman ini ya!
              <br />
              Biar lokasi kamu terus ke-update.
            </p>

            <button onClick={stopTracking} style={styles.stopButton}>
              ⛔ Stop Share Lokasi
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div style={styles.errorBox}>
              <p style={styles.errorText}>❌ {errorMsg}</p>
            </div>
            <button onClick={startTracking} style={styles.button}>
              🔄 Coba Lagi
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function getGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Izin lokasi ditolak. Buka Settings > Site > Location dan izinin ya.";
    case err.POSITION_UNAVAILABLE:
      return "GPS gak bisa dapetin lokasi. Coba di tempat terbuka ya.";
    case err.TIMEOUT:
      return "GPS lama banget. Coba lagi ya.";
    default:
      return "Ada error GPS nih.";
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: 32,
    maxWidth: 400,
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    textAlign: "center" as const,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 4px 0",
    color: "#1a1a2e",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 400,
    margin: "0 0 24px 0",
    color: "#666",
  },
  text: {
    fontSize: 15,
    color: "#444",
    lineHeight: 1.6,
    margin: "0 0 20px 0",
  },
  button: {
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "14px 28px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  stopButton: {
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    marginTop: 16,
  },
  statusBox: {
    margin: "0 0 16px 0",
  },
  pulseWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  pulse: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#2ecc71",
    animation: "pulse 1.5s infinite",
  },
  pulseText: {
    fontSize: 18,
    fontWeight: 700,
    color: "#2ecc71",
  },
  statusText: {
    fontSize: 14,
    color: "#666",
    margin: 0,
  },
  coordBox: {
    background: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  coordText: {
    fontSize: 13,
    color: "#333",
    margin: 0,
    fontFamily: "monospace",
  },
  infoBox: {
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    color: "#888",
    margin: "4px 0",
  },
  hint: {
    fontSize: 13,
    color: "#e67e22",
    lineHeight: 1.5,
    margin: 0,
  },
  errorBox: {
    background: "#fee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#c0392b",
    margin: 0,
  },
};
