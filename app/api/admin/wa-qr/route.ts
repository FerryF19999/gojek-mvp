import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'

function getConvex() {
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error('CONVEX_URL not set')
  return new ConvexHttpClient(url)
}

export async function GET() {
  try {
    const convex = getConvex()
    const status = await (convex as any).query('waBot:getStatus', {})
    return NextResponse.json({
      connected: status.connected,
      hasQR: !!status.qr,
      qr: status.qr,
      number: status.phoneNumber,
    })
  } catch (e) {
    return NextResponse.json({ connected: false, hasQR: false, qr: null, error: 'Failed to fetch status' })
  }
}
