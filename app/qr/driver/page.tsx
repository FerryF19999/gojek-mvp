'use client'

export default function QRDriverPage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "NemuOjekBot";
  const deepLink = `https://t.me/${botUsername}?start=driver`;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏍️</div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Daftar sebagai Driver</h1>
      <p style={{ color: '#9ca3af', marginBottom: '32px', textAlign: 'center' }}>Klik tombol di bawah untuk mulai daftar lewat Telegram</p>

      <a
        href={deepLink}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          background: '#2563eb',
          color: 'white',
          padding: '16px 32px',
          borderRadius: '16px',
          fontSize: '18px',
          fontWeight: 'bold',
          textDecoration: 'none',
          marginBottom: '24px',
        }}
      >
        ✈️ Buka Telegram
      </a>

      <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>
        Atau cari <strong>@{botUsername}</strong> di Telegram
      </p>
      <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
        Ketik DAFTAR setelah membuka bot
      </p>
    </div>
  )
}
