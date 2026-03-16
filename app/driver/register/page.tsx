"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Driver Registration Page — QR Pairing + Registration Form
 * 
 * Flow:
 *   1. Create session → Show QR code
 *   2. Driver scans QR with WhatsApp
 *   3. Connected! → Show registration form
 *   4. Fill form (name, vehicle, plate, city)
 *   5. Submit → Register driver via API
 *   6. Redirect to dashboard
 */

type Step = "qr" | "form" | "submitting" | "success" | "error";

interface SessionStatus {
  ok: boolean;
  session?: {
    sessionId: string;
    status: string;
    phone?: string;
    qrCode?: string;
  };
  status?: string;
  qr?: string;
  phone?: string;
}

interface FormData {
  fullName: string;
  vehicleType: "motor" | "car";
  vehicleBrand: string;
  vehiclePlate: string;
  city: string;
}

// Direct HTTPS call to Baileys server via Nginx reverse proxy
const API_BASE = "https://oc-196993-lsur.xc1.app/nemu-api";

export default function DriverRegisterPage() {
  const [step, setStep] = useState<Step>("qr");
  const [sessionId, setSessionId] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [form, setForm] = useState<FormData>({
    fullName: "",
    vehicleType: "motor",
    vehicleBrand: "",
    vehiclePlate: "",
    city: "",
  });
  const [driverResult, setDriverResult] = useState<{ driverId: string; apiToken: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionCreated = useRef(false);

  // Create session and start QR flow
  const createSession = useCallback(async () => {
    try {
      const newSessionId = `driver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch(`${API_BASE}/sessions/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: newSessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create session" }));
        throw new Error(err.error || "Failed to create session");
      }

      const data = await res.json();
      setSessionId(newSessionId);

      // If already connected (restored session), skip to form
      if (data.session?.status === "connected") {
        setPhone(data.session.phone || "");
        setStep("form");
        return;
      }

      // Start polling for QR
      startQrPolling(newSessionId);
    } catch (err: any) {
      setError(err.message || "Gagal membuat sesi");
      setStep("error");
    }
  }, []);

  // Poll for QR code and connection status
  const startQrPolling = useCallback((sid: string) => {
    // Clear existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sid}/qr`);
        if (!res.ok) return;

        const data: SessionStatus = await res.json();

        if (data.status === "connected" || data.session?.status === "connected") {
          // Connected!
          const connectedPhone = data.phone || data.session?.phone || "";
          setPhone(connectedPhone);
          setStep("form");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        if (data.qr) {
          setQrDataUrl(data.qr);
        }
      } catch (e) {
        // Ignore poll errors, will retry
      }
    };

    // Poll immediately then every 3 seconds
    poll();
    pollRef.current = setInterval(poll, 3000);
  }, []);

  // Also try WebSocket for real-time updates (only works if BAILEYS WS is accessible)
  const connectWebSocket = useCallback(() => {
    try {
      const baileysDirect = process.env.NEXT_PUBLIC_BAILEYS_MULTI_URL || "";
      if (!baileysDirect) return; // Skip WS if no direct URL configured
      const wsUrl = baileysDirect.replace("http", "ws") + "/ws";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.event === "qr" && msg.data?.sessionId === sessionId) {
            setQrDataUrl(msg.data.qr);
          }

          if (msg.event === "connected" && msg.data?.sessionId === sessionId) {
            setPhone(msg.data.phone || "");
            setStep("form");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (e) {}
      };

      ws.onerror = () => {}; // WebSocket is optional, polling is primary
      ws.onclose = () => { wsRef.current = null; };
    } catch (e) {
      // WebSocket not available, polling will handle it
    }
  }, [sessionId]);

  // Initialize
  useEffect(() => {
    if (!sessionCreated.current) {
      sessionCreated.current = true;
      createSession();
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [createSession]);

  // Connect WS after session is created
  useEffect(() => {
    if (sessionId) connectWebSocket();
  }, [sessionId, connectWebSocket]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep("submitting");

    try {
      // Register driver via NEMU API
      const res = await fetch("/api/drivers/register/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          phone,
          vehicleType: form.vehicleType,
          vehicleBrand: form.vehicleBrand,
          vehicleModel: form.vehicleBrand,
          vehiclePlate: form.vehiclePlate,
          licenseNumber: "WEB-REG",
          city: form.city || "Indonesia",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Registration failed" }));
        throw new Error(err.error || err.message || "Registration failed");
      }

      const data = await res.json();

      if (data.ok && data.driverId && data.apiToken) {
        setDriverResult({ driverId: data.driverId, apiToken: data.apiToken });

        // Link driver to session
        try {
          await fetch(`${API_BASE}/sessions/${sessionId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `🎉 Selamat ${form.fullName}! Kamu udah terdaftar sebagai driver NEMU Ojek!\n\n` +
                `Perintah yang bisa kamu pake:\n` +
                `✅ MULAI → siap terima order\n` +
                `⛔ STOP → istirahat\n` +
                `💰 GAJI → cek penghasilan\n` +
                `❓ HELP → butuh bantuan\n\n` +
                `Bot NEMU udah aktif di WhatsApp kamu! 🏍️`,
            }),
          });
        } catch (e) {
          // Non-critical: welcome message failed
        }

        // Also create the WhatsApp state for this driver
        try {
          await fetch("/api/whatsapp/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone,
              text: "REGISTERED_VIA_WEB",
              isDriverBot: true,
              sessionId,
              _internal: true,
              _registerData: {
                driverId: data.driverId,
                apiToken: data.apiToken,
              },
            }),
          });
        } catch (e) {}

        setStep("success");
      } else {
        throw new Error(data.error || "Registration failed");
      }
    } catch (err: any) {
      setError(err.message || "Pendaftaran gagal");
      setStep("error");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.logo}>🏍️ NEMU Ojek</h1>
          <p style={styles.subtitle}>Daftar Jadi Driver</p>
        </div>

        {/* Step: QR Code */}
        {step === "qr" && (
          <div style={styles.section}>
            <div style={styles.stepBadge}>Step 1/2</div>
            <h2 style={styles.stepTitle}>Hubungkan WhatsApp</h2>
            <p style={styles.stepDesc}>
              Scan QR code ini pake WhatsApp kamu.
              <br />
              Sama kayak nambah WhatsApp Web.
            </p>

            <div style={styles.qrContainer}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" style={styles.qrImage} />
              ) : (
                <div style={styles.qrLoading}>
                  <div style={styles.spinner} />
                  <p style={styles.loadingText}>Generating QR Code...</p>
                </div>
              )}
            </div>

            <div style={styles.instructions}>
              <p style={styles.instructionItem}>1. Buka WhatsApp di HP</p>
              <p style={styles.instructionItem}>2. Tap ⋮ → Perangkat Tertaut</p>
              <p style={styles.instructionItem}>3. Tap "Tautkan Perangkat"</p>
              <p style={styles.instructionItem}>4. Scan QR code di atas</p>
            </div>

            {sessionId && (
              <p style={styles.sessionHint}>Session: {sessionId.slice(0, 20)}...</p>
            )}
          </div>
        )}

        {/* Step: Registration Form */}
        {step === "form" && (
          <div style={styles.section}>
            <div style={styles.connectedBanner}>
              <span style={styles.connectedDot} />
              WhatsApp Terhubung! ({phone})
            </div>

            <div style={styles.stepBadge}>Step 2/2</div>
            <h2 style={styles.stepTitle}>Data Driver</h2>
            <p style={styles.stepDesc}>Isi data kamu buat daftar jadi driver</p>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="Budi Santoso"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Kendaraan</label>
                <div style={styles.vehicleToggle}>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, vehicleType: "motor" })}
                    style={{
                      ...styles.vehicleBtn,
                      ...(form.vehicleType === "motor" ? styles.vehicleBtnActive : {}),
                    }}
                  >
                    🏍️ Motor
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, vehicleType: "car" })}
                    style={{
                      ...styles.vehicleBtn,
                      ...(form.vehicleType === "car" ? styles.vehicleBtnActive : {}),
                    }}
                  >
                    🚗 Mobil
                  </button>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Merk & Tipe Kendaraan</label>
                <input
                  type="text"
                  required
                  placeholder="Honda Beat, Yamaha NMAX, dll"
                  value={form.vehicleBrand}
                  onChange={(e) => setForm({ ...form, vehicleBrand: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Nomor Plat</label>
                <input
                  type="text"
                  required
                  placeholder="B 6234 KJT"
                  value={form.vehiclePlate}
                  onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value.toUpperCase() })}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Kota</label>
                <input
                  type="text"
                  required
                  placeholder="Jakarta, Bandung, dll"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  style={styles.input}
                />
              </div>

              <button type="submit" style={styles.submitBtn}>
                ✅ Daftar Sekarang
              </button>
            </form>
          </div>
        )}

        {/* Step: Submitting */}
        {step === "submitting" && (
          <div style={styles.section}>
            <div style={styles.qrLoading}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Mendaftarkan kamu...</p>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <div style={styles.section}>
            <div style={styles.successIcon}>🎉</div>
            <h2 style={styles.stepTitle}>Pendaftaran Berhasil!</h2>
            <p style={styles.stepDesc}>
              Selamat {form.fullName}! Kamu udah jadi driver NEMU Ojek.
            </p>

            <div style={styles.successInfo}>
              <p>📱 WhatsApp: {phone}</p>
              <p>🏍️ {form.vehicleBrand} ({form.vehiclePlate})</p>
              <p>📍 {form.city}</p>
            </div>

            <div style={styles.successTips}>
              <p style={styles.tipTitle}>Bot NEMU udah aktif di WhatsApp kamu!</p>
              <p style={styles.tipItem}>Ketik <strong>MULAI</strong> buat siap terima order</p>
              <p style={styles.tipItem}>Ketik <strong>STOP</strong> buat istirahat</p>
              <p style={styles.tipItem}>Ketik <strong>GAJI</strong> buat cek penghasilan</p>
            </div>

            <a href="/driver/dashboard" style={styles.dashboardBtn}>
              📊 Buka Dashboard Driver
            </a>
          </div>
        )}

        {/* Step: Error */}
        {step === "error" && (
          <div style={styles.section}>
            <div style={styles.successIcon}>❌</div>
            <h2 style={styles.stepTitle}>Ada Masalah</h2>
            <p style={styles.errorText}>{error}</p>
            <button
              onClick={() => {
                setError("");
                setStep("qr");
                sessionCreated.current = false;
                createSession();
              }}
              style={styles.submitBtn}
            >
              🔄 Coba Lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    padding: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "#1e293b",
    borderRadius: 20,
    padding: 32,
    maxWidth: 440,
    width: "100%",
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 24,
  },
  logo: {
    fontSize: 28,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: "#94a3b8",
    margin: "4px 0 0 0",
  },
  section: {
    textAlign: "center" as const,
  },
  stepBadge: {
    display: "inline-block",
    background: "rgba(34, 197, 94, 0.15)",
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 12px",
    borderRadius: 20,
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: "0 0 8px 0",
  },
  stepDesc: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.5,
    margin: "0 0 20px 0",
  },
  qrContainer: {
    background: "white",
    borderRadius: 16,
    padding: 20,
    display: "inline-block",
    marginBottom: 20,
  },
  qrImage: {
    width: 260,
    height: 260,
    display: "block",
  },
  qrLoading: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: 40,
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid rgba(34, 197, 94, 0.2)",
    borderTopColor: "#22c55e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    fontSize: 14,
    color: "#94a3b8",
    margin: 0,
  },
  instructions: {
    textAlign: "left" as const,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  instructionItem: {
    fontSize: 13,
    color: "#cbd5e1",
    margin: "6px 0",
  },
  sessionHint: {
    fontSize: 11,
    color: "#475569",
    margin: 0,
  },
  connectedBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    borderRadius: 12,
    padding: "10px 16px",
    marginBottom: 20,
    fontSize: 14,
    color: "#22c55e",
    fontWeight: 600,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22c55e",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    textAlign: "left" as const,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#cbd5e1",
  },
  input: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 15,
    color: "#f1f5f9",
    outline: "none",
  },
  vehicleToggle: {
    display: "flex",
    gap: 8,
  },
  vehicleBtn: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  vehicleBtnActive: {
    background: "rgba(34, 197, 94, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    color: "#22c55e",
  },
  submitBtn: {
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "14px 28px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
  },
  successIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  successInfo: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    textAlign: "left" as const,
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 2,
  },
  successTips: {
    background: "rgba(34, 197, 94, 0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    textAlign: "left" as const,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#22c55e",
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 13,
    color: "#94a3b8",
    margin: "4px 0",
  },
  dashboardBtn: {
    display: "block",
    background: "rgba(99, 102, 241, 0.15)",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    borderRadius: 12,
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    color: "#818cf8",
    textDecoration: "none",
    textAlign: "center" as const,
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    marginBottom: 20,
  },
};
