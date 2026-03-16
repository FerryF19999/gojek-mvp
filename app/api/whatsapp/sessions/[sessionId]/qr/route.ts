/**
 * WhatsApp Session QR — Proxy to Baileys Multi-Server
 * GET /api/whatsapp/sessions/:sessionId/qr — Get QR code
 */

import { NextRequest, NextResponse } from "next/server";

const BAILEYS_URL = process.env.BAILEYS_MULTI_URL || process.env.NEXT_PUBLIC_BAILEYS_MULTI_URL || "https://oc-196993-lsur.xc1.app/nemu-api";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const res = await fetch(`${BAILEYS_URL}/sessions/${params.sessionId}/qr`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: "Baileys multi-server not available" },
      { status: 503 },
    );
  }
}
