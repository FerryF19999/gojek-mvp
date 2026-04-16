'use client'

import { useState } from 'react'

export default function TelegramSetupPage() {
  const [status, setStatus] = useState<{ ok?: boolean; webhookUrl?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [botInfo, setBotInfo] = useState<{ username?: string; first_name?: string } | null>(null)

  const setupWebhook = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      setStatus(data)
    } catch (e: any) {
      setStatus({ error: e.message })
    }
    setLoading(false)
  }

  const checkBot = async () => {
    try {
      const res = await fetch('/api/telegram/setup')
      const data = await res.json()
      if (data.ok) setBotInfo(data.bot)
    } catch {}
  }

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
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Setup Telegram Bot</h1>
      <p style={{ color: '#9ca3af', marginBottom: '32px', textAlign: 'center' }}>
        Klik tombol di bawah untuk mendaftarkan webhook Telegram
      </p>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        <button
          onClick={setupWebhook}
          disabled={loading}
          style={{
            background: '#2563eb',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 'bold',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Setting up...' : 'Setup Webhook'}
        </button>

        <button
          onClick={checkBot}
          style={{
            background: '#374151',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Check Bot Info
        </button>
      </div>

      {status && (
        <div style={{
          padding: '16px 24px',
          borderRadius: '12px',
          background: status.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${status.ok ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          marginBottom: '16px',
          textAlign: 'center',
        }}>
          {status.ok ? (
            <>
              <p style={{ color: '#4ade80', fontWeight: 'bold' }}>Webhook berhasil didaftarkan!</p>
              {status.webhookUrl && (
                <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '8px', fontFamily: 'monospace' }}>
                  {status.webhookUrl}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: '#f87171' }}>Error: {status.error}</p>
          )}
        </div>
      )}

      {botInfo && (
        <div style={{
          padding: '16px 24px',
          borderRadius: '12px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          textAlign: 'center',
        }}>
          <p style={{ color: '#60a5fa', fontWeight: 'bold' }}>Bot: @{botInfo.username}</p>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>{botInfo.first_name}</p>
        </div>
      )}

      <a
        href="/admin"
        style={{
          display: 'inline-block',
          marginTop: '24px',
          color: '#9ca3af',
          textDecoration: 'underline',
          fontSize: '14px',
        }}
      >
        Kembali ke Admin Panel
      </a>
    </div>
  )
}
