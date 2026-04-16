"use client";

import { useSearchParams } from "next/navigation";

/**
 * Connect page — redirects users to Telegram bot
 * No longer needs QR scanning since we use Telegram
 */
export default function ConnectPage() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "passenger";
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "NemuOjekBot";

  const deepLink = role === "driver"
    ? `https://t.me/${botUsername}?start=driver`
    : `https://t.me/${botUsername}?start=passenger`;

  const roleLabel = role === "driver" ? "Driver" : "Penumpang";
  const roleEmoji = role === "driver" ? "🏍️" : "🛵";

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{roleEmoji}</div>
        <h1 style={styles.title}>Hubungkan ke Telegram</h1>
        <p style={styles.sub}>Klik tombol di bawah untuk mulai sebagai {roleLabel}</p>

        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            background: "#2563eb",
            color: "white",
            padding: "16px 32px",
            borderRadius: 16,
            fontSize: 18,
            fontWeight: "bold",
            textDecoration: "none",
            marginTop: 24,
            marginBottom: 24,
          }}
        >
          Buka Telegram
        </a>

        <p style={{ color: "#555", fontSize: 13 }}>
          Atau cari <b>@{botUsername}</b> di Telegram
        </p>

        <div style={styles.commandBox}>
          <p style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>
            {role === "driver" ? "Perintah driver:" : "Cara pesan:"}
          </p>
          {role === "driver" ? (
            <div style={styles.commands}>
              <span style={styles.cmd}><b>DAFTAR</b> — mendaftar sebagai driver</span>
              <span style={styles.cmd}><b>MULAI</b> — mulai shift (online)</span>
              <span style={styles.cmd}><b>STOP</b> — selesai shift (offline)</span>
              <span style={styles.cmd}><b>GAJI</b> — cek penghasilan</span>
            </div>
          ) : (
            <div style={styles.commands}>
              <span style={styles.cmd}><b>PESAN</b> — pesan ojek</span>
              <span style={styles.cmd}>Bot akan tanya detail ride kamu</span>
            </div>
          )}
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
};
