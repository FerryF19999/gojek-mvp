"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Driver Dashboard — Shows driver status, current order, earnings, WA connection
 */

export default function DriverDashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#94a3b8" }}>⏳ Memuat...</div>}>
      <DriverDashboard />
    </Suspense>
  );
}

interface DriverInfo {
  name: string;
  phone: string;
  vehicleBrand: string;
  vehiclePlate: string;
  availability: string;
  rating?: number;
}

interface RideInfo {
  code: string;
  customerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  price: number;
  status: string;
}

interface SessionInfo {
  sessionId: string;
  status: string;
  phone?: string;
  lastConnectedAt?: number;
}

interface EarningsInfo {
  todayOrders: number;
  todayEarnings: number;
  weekOrders: number;
  weekEarnings: number;
}

const API_BASE = "/api/whatsapp";

function DriverDashboard() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [currentRide, setCurrentRide] = useState<RideInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [earnings, setEarnings] = useState<EarningsInfo>({
    todayOrders: 0,
    todayEarnings: 0,
    weekOrders: 0,
    weekEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDriverInfo = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch("/api/drivers/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setError("Token tidak valid. Silakan login ulang.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.driver) {
        setDriver({
          name: data.driver.name || "Driver",
          phone: data.driver.phone || "",
          vehicleBrand: data.driver.vehicleBrand || "",
          vehiclePlate: data.driver.vehiclePlate || "",
          availability: data.driver.availability || "offline",
          rating: data.driver.rating,
        });
      }

      // Fetch current rides
      try {
        const ridesRes = await fetch("/api/drivers/me/rides", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ridesRes.ok) {
          const ridesData = await ridesRes.json();
          const activeRide = ridesData.rides?.find((r: any) =>
            ["assigned", "driver_arriving", "picked_up"].includes(r.status)
          );
          if (activeRide) {
            setCurrentRide({
              code: activeRide.code,
              customerName: activeRide.customerName,
              pickupAddress: activeRide.pickup?.address || "",
              dropoffAddress: activeRide.dropoff?.address || "",
              price: activeRide.price?.amount || 0,
              status: activeRide.status,
            });
          }

          // Calculate earnings
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStart = today.getTime();
          const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

          const completed = (ridesData.rides || []).filter((r: any) => r.status === "completed");
          const todayRides = completed.filter((r: any) => r.createdAt >= todayStart);
          const weekRides = completed.filter((r: any) => r.createdAt >= weekStart);

          setEarnings({
            todayOrders: todayRides.length,
            todayEarnings: todayRides.reduce((s: number, r: any) => s + (r.price?.amount || 0), 0),
            weekOrders: weekRides.length,
            weekEarnings: weekRides.reduce((s: number, r: any) => s + (r.price?.amount || 0), 0),
          });
        }
      } catch (e) {}

      setLoading(false);
    } catch (err) {
      setError("Gagal memuat data driver");
      setLoading(false);
    }
  }, [token]);

  // Check WA session status
  const checkSession = useCallback(async () => {
    if (!driver?.phone) return;

    try {
      // Find session by scanning all sessions
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) return;

      const data = await res.json();
      const driverSession = data.sessions?.find(
        (s: any) => s.phone === driver.phone || s.phone === driver.phone.replace(/^62/, "")
      );

      if (driverSession) {
        setSession(driverSession);
      }
    } catch (e) {
      // Baileys server might not be running
    }
  }, [driver?.phone]);

  useEffect(() => {
    fetchDriverInfo();
    const interval = setInterval(fetchDriverInfo, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchDriverInfo]);

  useEffect(() => {
    if (driver?.phone) {
      checkSession();
      const interval = setInterval(checkSession, 15000);
      return () => clearInterval(interval);
    }
  }, [driver?.phone, checkSession]);

  // Toggle availability
  const toggleAvailability = async () => {
    if (!token || !driver) return;

    const newAvailability = driver.availability === "online" ? "offline" : "online";
    try {
      const res = await fetch("/api/drivers/me/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ availability: newAvailability }),
      });

      if (res.ok) {
        setDriver({ ...driver, availability: newAvailability });
      }
    } catch (e) {}
  };

  if (!token) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>❌ Token Diperlukan</h1>
          <p style={styles.text}>
            Buka halaman ini dari link yang dikirim di WhatsApp, atau tambahkan ?token=YOUR_TOKEN di URL.
          </p>
          <a href="/driver/register" style={styles.linkBtn}>Daftar Jadi Driver →</a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={styles.text}>⏳ Memuat data driver...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>❌ Error</h1>
          <p style={styles.errorText}>{error}</p>
          <a href="/driver/register" style={styles.linkBtn}>Daftar Ulang →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.logo}>🏍️ NEMU Ojek</h1>
          <p style={styles.subtitle}>Dashboard Driver</p>
        </div>

        {/* Driver Info */}
        <div style={styles.driverCard}>
          <div style={styles.driverHeader}>
            <div>
              <h2 style={styles.driverName}>{driver?.name || "Driver"}</h2>
              <p style={styles.driverMeta}>
                {driver?.vehicleBrand} • {driver?.vehiclePlate}
              </p>
            </div>
            {driver?.rating && (
              <div style={styles.ratingBadge}>⭐ {driver.rating.toFixed(1)}</div>
            )}
          </div>
        </div>

        {/* Status Toggle */}
        <div style={styles.statusSection}>
          <div style={{
            ...styles.statusIndicator,
            background: driver?.availability === "online"
              ? "rgba(34, 197, 94, 0.15)"
              : driver?.availability === "busy"
              ? "rgba(245, 158, 11, 0.15)"
              : "rgba(239, 68, 68, 0.15)",
            borderColor: driver?.availability === "online"
              ? "rgba(34, 197, 94, 0.3)"
              : driver?.availability === "busy"
              ? "rgba(245, 158, 11, 0.3)"
              : "rgba(239, 68, 68, 0.3)",
          }}>
            <span style={{
              ...styles.statusDot,
              background: driver?.availability === "online"
                ? "#22c55e"
                : driver?.availability === "busy"
                ? "#f59e0b"
                : "#ef4444",
            }} />
            <span style={{
              fontWeight: 700,
              color: driver?.availability === "online"
                ? "#22c55e"
                : driver?.availability === "busy"
                ? "#f59e0b"
                : "#ef4444",
            }}>
              {driver?.availability === "online" ? "ONLINE" : driver?.availability === "busy" ? "SIBUK" : "OFFLINE"}
            </span>
          </div>

          {driver?.availability !== "busy" && (
            <button onClick={toggleAvailability} style={{
              ...styles.toggleBtn,
              background: driver?.availability === "online"
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(34, 197, 94, 0.15)",
              color: driver?.availability === "online" ? "#ef4444" : "#22c55e",
              borderColor: driver?.availability === "online"
                ? "rgba(239, 68, 68, 0.3)"
                : "rgba(34, 197, 94, 0.3)",
            }}>
              {driver?.availability === "online" ? "⛔ Go Offline" : "✅ Go Online"}
            </button>
          )}
        </div>

        {/* WhatsApp Connection */}
        <div style={styles.waSection}>
          <div style={styles.waBadge}>
            <span style={{
              ...styles.statusDot,
              background: session?.status === "connected" ? "#22c55e" : "#ef4444",
              width: 8,
              height: 8,
            }} />
            <span style={{ color: session?.status === "connected" ? "#22c55e" : "#ef4444", fontWeight: 600, fontSize: 13 }}>
              WhatsApp {session?.status === "connected" ? "Terhubung ✅" : "Terputus ❌"}
            </span>
          </div>
          {session?.status !== "connected" && (
            <a href="/driver/register" style={styles.reconnectLink}>Hubungkan ulang →</a>
          )}
        </div>

        {/* Current Ride */}
        {currentRide && (
          <div style={styles.rideCard}>
            <h3 style={styles.sectionTitle}>🚗 Order Aktif</h3>
            <div style={styles.rideInfo}>
              <p style={styles.rideCustomer}>👤 {currentRide.customerName}</p>
              <p style={styles.rideDetail}>📍 {currentRide.pickupAddress}</p>
              <p style={styles.rideDetail}>📍 → {currentRide.dropoffAddress}</p>
              <p style={styles.ridePrice}>💰 Rp {currentRide.price.toLocaleString("id-ID")}</p>
              <div style={styles.rideStatus}>{getStatusLabel(currentRide.status)}</div>
            </div>
          </div>
        )}

        {/* Earnings */}
        <div style={styles.earningsSection}>
          <h3 style={styles.sectionTitle}>💰 Penghasilan</h3>
          <div style={styles.earningsGrid}>
            <div style={styles.earningCard}>
              <p style={styles.earningLabel}>Hari Ini</p>
              <p style={styles.earningAmount}>Rp {earnings.todayEarnings.toLocaleString("id-ID")}</p>
              <p style={styles.earningOrders}>{earnings.todayOrders} order</p>
            </div>
            <div style={styles.earningCard}>
              <p style={styles.earningLabel}>Minggu Ini</p>
              <p style={styles.earningAmount}>Rp {earnings.weekEarnings.toLocaleString("id-ID")}</p>
              <p style={styles.earningOrders}>{earnings.weekOrders} order</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    assigned: "🏍️ Menuju lokasi jemput",
    driver_arriving: "📍 Sudah di lokasi",
    picked_up: "🛣️ Mengantar penumpang",
  };
  return map[status] || status;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    padding: "24px 16px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "#1e293b",
    borderRadius: 20,
    padding: 24,
    maxWidth: 440,
    width: "100%",
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 20,
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "4px 0 0 0",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: "0 0 12px 0",
    textAlign: "center" as const,
  },
  text: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center" as const,
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center" as const,
    marginBottom: 20,
  },
  linkBtn: {
    display: "block",
    textAlign: "center" as const,
    color: "#818cf8",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    marginTop: 16,
  },
  driverCard: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  driverHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  driverName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  driverMeta: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "4px 0 0 0",
  },
  ratingBadge: {
    background: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 14,
    fontWeight: 700,
    color: "#f59e0b",
  },
  statusSection: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  statusIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid",
    fontSize: 14,
    flex: 1,
    justifyContent: "center",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  toggleBtn: {
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  waSection: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    padding: "10px 16px",
    marginBottom: 16,
  },
  waBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  reconnectLink: {
    fontSize: 12,
    color: "#818cf8",
    textDecoration: "none",
    fontWeight: 600,
  },
  rideCard: {
    background: "rgba(99, 102, 241, 0.08)",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: "0 0 12px 0",
  },
  rideInfo: {},
  rideCustomer: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f1f5f9",
    margin: "0 0 4px 0",
  },
  rideDetail: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "2px 0",
  },
  ridePrice: {
    fontSize: 16,
    fontWeight: 700,
    color: "#22c55e",
    margin: "8px 0 4px 0",
  },
  rideStatus: {
    fontSize: 13,
    color: "#818cf8",
    fontWeight: 600,
  },
  earningsSection: {
    marginBottom: 8,
  },
  earningsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  earningCard: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 14,
    textAlign: "center" as const,
  },
  earningLabel: {
    fontSize: 12,
    color: "#94a3b8",
    margin: "0 0 4px 0",
  },
  earningAmount: {
    fontSize: 18,
    fontWeight: 700,
    color: "#22c55e",
    margin: "0 0 2px 0",
  },
  earningOrders: {
    fontSize: 12,
    color: "#64748b",
    margin: 0,
  },
};
