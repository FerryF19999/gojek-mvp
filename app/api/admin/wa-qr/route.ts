import { NextResponse } from 'next/server'

const BOT_QR_URL = process.env.WA_BOT_QR_URL || 'http://localhost:3001/qr-status'

export async function GET() {
  try {
    const res = await fetch(BOT_QR_URL, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ connected: false, hasQR: false, qr: null, error: 'Bot offline' })
  }
}
