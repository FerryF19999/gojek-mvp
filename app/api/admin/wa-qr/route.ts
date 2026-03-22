import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'

const convex = new ConvexHttpClient(process.env.CONVEX_URL!)

export async function GET() {
  try {
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
