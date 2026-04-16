"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type AuthState = "loading" | "waiting" | "verified";
type VerifyStatus = "pending" | "verified" | "expired";

type Stats = {
  driversOnline: number;
  activeRides: number;
  ridesToday: number;
};

type Ride = {
  rideCode: string;
  passengerName: string;
  driverName: string | null;
  status: string;
};

type Driver = {
  driverId: string;
  name: string;
  plate: string | null;
  status: string;
  city?: string | null;
  lastActive?: string | null;
};

const POLL_MS = 2000;
const DASHBOARD_REFRESH_MS = 30000;

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [token, setToken] = useState<string>("");
  const [qrContent, setQrContent] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<number>(0);

  const [stats, setStats] = useState<Stats | null>(null);
  const [activeRides, setActiveRides] = useState<Ride[]>([]);
  const [onlineDrivers, setOnlineDrivers] = useState<Driver[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const generateQr = useCallback(async () => {
    setAuthState("loading");
    const res = await fetch("/api/admin/auth/generate", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to generate QR");

    setToken(data.token);
    setQrContent(data.qrContent);
    setExpiresAt(data.expiresAt || Date.now() + 5 * 60 * 1000);
    setAuthState("waiting");
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [statsRes, ridesRes, driversRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch("/api/rides?status=active", { cache: "no-store" }),
        fetch("/api/drivers?status=online", { cache: "no-store" }),
      ]);

      const [statsData, ridesData, driversData] = await Promise.all([
        statsRes.json(),
        ridesRes.json(),
        driversRes.json(),
      ]);

      if (!statsRes.ok || !ridesRes.ok || !driversRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      setStats(statsData);
      setActiveRides(ridesData?.rides || []);
      setOnlineDrivers(driversData?.drivers || []);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    generateQr().catch(() => {
      setAuthState("loading");
    });
  }, [generateQr]);

  useEffect(() => {
    if (authState !== "waiting" || !token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/auth/verify?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data: { status: VerifyStatus } = await res.json();

        if (!res.ok) return;

        if (data.status === "verified") {
          setAuthState("verified");
          return;
        }

        if (data.status === "expired" || Date.now() > expiresAt) {
          await generateQr();
        }
      } catch {
        // noop
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [authState, expiresAt, generateQr, token]);

  useEffect(() => {
    if (authState !== "verified") return;

    fetchDashboardData().catch(() => undefined);
    const interval = setInterval(() => {
      fetchDashboardData().catch(() => undefined);
    }, DASHBOARD_REFRESH_MS);

    return () => clearInterval(interval);
  }, [authState, fetchDashboardData]);

  const expiresIn = useMemo(() => {
    if (!expiresAt) return "";
    const sec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${min}:${String(rem).padStart(2, "0")}`;
  }, [expiresAt, authState]);

  const handleLogout = () => {
    setAuthState("loading");
    setToken("");
    setQrContent("");
    setStats(null);
    setActiveRides([]);
    setOnlineDrivers([]);
    generateQr().catch(() => {
      setAuthState("loading");
    });
  };

  if (authState !== "verified") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Admin Login</h1>
        <p className="mt-2 text-sm text-gray-600">
          Scan QR atau gunakan Telegram untuk masuk sebagai admin.
        </p>

        <div className="mt-8 rounded-xl border p-6 text-center">
          {authState === "loading" ? (
            <p>Menyiapkan QR login...</p>
          ) : (
            <>
              <div className="mx-auto w-fit rounded-lg bg-white p-3">
                <QRCodeSVG value={qrContent} size={240} />
              </div>
              <p className="mt-4 text-sm text-gray-700">Menunggu verifikasi...</p>
              <p className="mt-1 text-xs text-gray-500">Token berlaku {expiresIn} menit</p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Logout
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="🟢 Driver online" value={stats?.driversOnline ?? 0} />
        <Card title="🏍️ Ride aktif" value={stats?.activeRides ?? 0} />
        <Card title="📊 Ride hari ini" value={stats?.ridesToday ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-medium">Ride aktif</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2 pr-3">Ride Code</th>
                  <th className="pb-2 pr-3">Penumpang</th>
                  <th className="pb-2 pr-3">Driver</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {activeRides.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-gray-500">Tidak ada ride aktif</td>
                  </tr>
                ) : (
                  activeRides.map((ride) => (
                    <tr key={ride.rideCode} className="border-t">
                      <td className="py-2 pr-3">{ride.rideCode}</td>
                      <td className="py-2 pr-3">{ride.passengerName}</td>
                      <td className="py-2 pr-3">{ride.driverName || "-"}</td>
                      <td className="py-2 pr-3">{ride.status}</td>
                      <td className="py-2">-</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-medium">Driver online</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2 pr-3">Nama</th>
                  <th className="pb-2 pr-3">Plat</th>
                  <th className="pb-2 pr-3">Kota</th>
                  <th className="pb-2">Last active</th>
                </tr>
              </thead>
              <tbody>
                {onlineDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-gray-500">Tidak ada driver online</td>
                  </tr>
                ) : (
                  onlineDrivers.map((driver) => (
                    <tr key={driver.driverId} className="border-t">
                      <td className="py-2 pr-3">{driver.name}</td>
                      <td className="py-2 pr-3">{driver.plate || "-"}</td>
                      <td className="py-2 pr-3">{driver.city || "-"}</td>
                      <td className="py-2">{driver.lastActive || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {dashboardLoading && <p className="mt-4 text-xs text-gray-500">Memuat data terbaru...</p>}
    </main>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
    </div>
  );
}
