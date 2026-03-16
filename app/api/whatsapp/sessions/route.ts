/**
 * WhatsApp Sessions API — Proxy to Baileys Multi-Server
 * GET /api/whatsapp/sessions — List sessions
 * POST /api/whatsapp/sessions — Create session
 */

import { NextRequest, NextResponse } from "next/server";

const BAILEYS_URL = process.env.BAILEYS_MULTI_URL || "http://localhost:3002";

export async function GET() {
  try {
    const res = await fetch(`${BAILEYS_URL}/sessions`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Baileys multi-server not available" },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BAILEYS_URL}/sessions/create`, {
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
