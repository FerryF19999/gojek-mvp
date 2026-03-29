"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

export default function ConnectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const role = searchParams.get("role") || "passenger";

  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // Poll for QR / connection status
  useEffect(() => {
    if (connected) return;

    const botUrl = process.env.NEXT_PUBLIC_BOT_URL || "";
    const botKey = process.env.NEXT_PUBLIC_BOT_API_KEY || "";

    const poll = async () => {
      try {
        const res = await fetch(`${botUrl}/sessions/${encodeURIComponent(sessionId)}?key=${botKey}`);
        if (!res.ok) { setError("Session tidak ditemukan"); return; }
        const data = await res.json();
        if (data.connected) {
          setConnected(true);
          setQr(null);
        } else if (data.qr) {
          setQr(data.qr);
        }
      } catch {
        setError("Gagal connect ke server");
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessionId, connected]);

  // Render QR as image
  useEffect(() => {
    if (!qr) { setImgSrc(null); return; }
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(qr, { width: 280, margin: 2, color: { dark: "#000", light: "#fff" } })
        .then(setImgSrc);
    }).catch(() => setImgSrc(null));
  }, [qr]);

  const roleLabel = role === "driver" ? "Driver" : "Penumpang";
  const roleEmoji = role === "driver" ? "🏍️" : "🛵";

  // ─── Connected ───
  if (connected) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={styles.title}>WhatsApp Terhubung!</h1>
          <p style={styles.sub}>Bot Nemu Ojek sudah aktif di WhatsApp kamu.</p>
          <p style={styles.sub}>Buka WhatsApp → cari chat <b>&quot;Message Yourself&quot;</b> atau <b>&quot;You&quot;</b></p>

          <div style={styles.commandBox}>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>
              {role === "driver" ? "Perintah driver:" : "Cara pesan:"}
            </p>
            {role === "driver" ? (
              <div style={styles.commands}>
                <span style={styles.cmd}><b>checkin</b> — mulai shift</span>
                <span style={styles.cmd}><b>checkout</b> — selesai shift</span>
                <span style={styles.cmd}><b>saldo</b> — penghasilan</span>
                <span style={styles.cmd}><b>terima</b> / <b>tolak</b> — orderan</span>
              </div>
            ) : (
              <div style={styles.commands}>
                <span style={styles.cmd}><b>gas ke [tujuan]</b> — langsung pesan</span>
                <span style={styles.cmd}>Atau share <b>lokasi</b> lalu ketik tujuan</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── QR Scan ───
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{roleEmoji}</div>
        <h1 style={styles.title}>Scan QR — {roleLabel}</h1>
        <p style={styles.sub}>Buka WhatsApp → Linked Devices → Link a Device</p>

        <div style={{ background: "#fff", padding: 16, borderRadius: 16, margin: "20px 0" }}>
          {imgSrc ? (
            <img src={imgSrc} alt="QR" width={280} height={280} />
          ) : error ? (
            <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "red", textAlign: "center" }}>{error}</p>
            </div>
          ) : (
            <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={styles.spinner} />
            </div>
          )}
        </div>

        <p style={{ color: "#555", fontSize: 12 }}>QR auto-refresh — jangan close halaman ini</p>

        <div style={styles.steps}>
          <p><b>1.</b> Buka WhatsApp di HP</p>
          <p><b>2.</b> Tap ⋮ → <b>Linked Devices</b></p>
          <p><b>3.</b> Tap <b>Link a Device</b></p>
          <p><b>4.</b> Scan QR di atas</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  sub: {
    color: "#888",
    fontSize: 14,
    marginBottom: 4,
  },
  commandBox: {
    marginTop: 24,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 16,
    textAlign: "left",
  },
  commands: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cmd: {
    fontSize: 13,
    color: "#aaa",
  },
  steps: {
    marginTop: 20,
    textAlign: "left",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    fontSize: 13,
    color: "#888",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #333",
    borderTop: "3px solid #22c55e",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};
