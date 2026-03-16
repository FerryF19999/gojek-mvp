"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!token) return;

      try {
        const baseUrl = window.location.origin;
        const res = await fetch(`${baseUrl}/api/drivers/me/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ lat, lng }),
        });

        if (res.ok) {
          setLastUpdate(new Date().toLocaleTimeString("id-ID"));
          setUpdateCount((c) => c + 1);
        } else {
          console.error("Location update failed:", res.status);
        }
      } catch (err) {
        console.error("Location send error:", err);
      }
    },
    [token],
  );

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMsg("HP kamu gak support GPS 😢");
      setStatus("error");
      return;
    }

    setStatus("tracking");

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        sendLocation(lat, lng);
      },
      (err) => {
        setErrorMsg(getGeoError(err));
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );

    // Update every 10 seconds
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setCoords({ lat, lng });
          sendLocation(lat, lng);
        },
        (err) => {
          console.error("GPS error:", err);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }, 10000);
  }, [sendLocation]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!token) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>❌ Token Gak Ada</h1>
          <p style={styles.text}>
            Link ini harus dibuka dari chat WhatsApp NEMU Ojek ya.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏍️ NEMU Ojek</h1>
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
              <p style={styles.statusText}>Lokasi kamu dishare ke NEMU</p>
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

            <button
              onClick={() => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setStatus("idle");
              }}
              style={styles.stopButton}
            >
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
