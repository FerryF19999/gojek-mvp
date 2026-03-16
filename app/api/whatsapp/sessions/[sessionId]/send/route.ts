/**
 * WhatsApp Session Send API — Proxy to Baileys Multi-Server
 * POST /api/whatsapp/sessions/:sessionId/send — Send message via session
 */

import { NextRequest, NextResponse } from "next/server";

const BAILEYS_URL = process.env.BAILEYS_MULTI_URL || process.env.NEXT_PUBLIC_BAILEYS_MULTI_URL || "https://oc-196993-lsur.xc1.app/nemu-api";

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const body = await req.json();
    const res = await fetch(`${BAILEYS_URL}/sessions/${params.sessionId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: "Baileys multi-server not available" },
      { status: 503 },
    );
  }
}
