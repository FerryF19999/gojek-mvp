'use client'
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type WAQRStatus = {
  connected: boolean
  hasQR: boolean
  qr: string | null
  number?: string | null
  error?: string
}

export default function QRDriverPage() {
  const [status, setStatus] = useState<WAQRStatus>({ connected: false, hasQR: false, qr: null })

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/admin/wa-qr', { cache: 'no-store' })
        setStatus(await res.json())
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏍️</div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Daftar sebagai Driver</h1>
      <p style={{ color: '#9ca3af', marginBottom: '32px', textAlign: 'center' }}>Scan QR ini untuk menghubungkan WhatsApp kamu ke Nemu sebagai driver</p>

      {status.connected ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '64px' }}>✅</div>
          <p style={{ color: '#4ade80', marginTop: '16px', fontSize: '18px' }}>Berhasil terhubung!</p>
          {status.number && <p style={{ color: '#9ca3af' }}>Nomor: {status.number}</p>}
        </div>
      ) : status.hasQR && status.qr ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', display: 'inline-block', marginBottom: '24px' }}>
            <QRCodeSVG value={status.qr} size={256} />
          </div>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>WA → Setelan → Perangkat Tertaut → Tautkan Perangkat</p>
          <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Auto-refresh setiap 3 detik</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>⏳</div>
          <p style={{ color: '#9ca3af', marginTop: '16px' }}>{status.error || 'Menunggu koneksi bot...'}</p>
        </div>
      )}
    </div>
  )
}
