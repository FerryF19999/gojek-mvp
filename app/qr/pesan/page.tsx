"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

export default function QRPesanPage() {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const rideUrl = origin ? `${origin}/ride` : "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏍️</div>
      <h1 style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "8px" }}>
        NEMU RIDE
      </h1>
      <p style={{ color: "#888", marginBottom: "32px", textAlign: "center" }}>
        Scan untuk pesan ojek
      </p>

      {rideUrl && (
        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "20px",
            marginBottom: "24px",
          }}
        >
          <QRCodeSVG
            value={rideUrl}
            size={280}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
      )}

      <p style={{ color: "#22c55e", fontSize: "14px", fontWeight: 600 }}>
        Scan QR &rarr; Isi tujuan &rarr; Konfirmasi &rarr; Driver datang
      </p>

      <div
        style={{
          marginTop: "32px",
          padding: "16px 24px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.1)",
          textAlign: "center",
          maxWidth: "320px",
        }}
      >
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "8px" }}>
          Atau buka langsung:
        </p>
        <p
          style={{
            color: "#22c55e",
            fontSize: "14px",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {rideUrl || "Loading..."}
        </p>
      </div>

      <p
        style={{
          marginTop: "40px",
          color: "#333",
          fontSize: "12px",
        }}
      >
        NEMU RIDE &mdash; Ojek tanpa komisi
      </p>
    </div>
  );
}
