'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type WAStatus = {
  connected: boolean
  hasQR: boolean
  qr: string | null
  number?: string
  error?: string
}

export default function WASetupPage() {
  const [status, setStatus] = useState<WAStatus>({ connected: false, hasQR: false, qr: null })

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/admin/wa-qr', { cache: 'no-store' })
        const data = await res.json()
        setStatus(data)
      } catch {
        // ignore polling errors, UI will keep showing last state
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
      }}
    >
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Setup WhatsApp Bot</h1>

      {status.connected ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <p style={{ fontSize: '20px', color: '#4ade80' }}>Bot sudah konek!</p>
          {status.number && <p style={{ color: '#9ca3af', marginTop: '8px' }}>Nomor: {status.number}</p>}
          <a
            href="/admin"
            style={{
              display: 'inline-block',
              marginTop: '24px',
              background: '#16a34a',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Buka Admin Panel
          </a>
        </div>
      ) : status.hasQR && status.qr ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Scan QR ini dari WhatsApp untuk menghubungkan bot</p>
          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '16px',
              display: 'inline-block',
              marginBottom: '24px',
            }}
          >
            <QRCodeSVG value={status.qr} size={256} />
          </div>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>WA → Setelan → Perangkat Tertaut → Tautkan Perangkat</p>
          <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '8px' }}>Auto-refresh setiap 3 detik...</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: '#9ca3af' }}>{status.error || 'Menunggu QR dari bot...'}</p>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '8px' }}>Pastikan bot WA sudah dijalankan di server</p>
          <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Auto-refresh setiap 3 detik...</p>
        </div>
      )}
    </div>
  )
}
