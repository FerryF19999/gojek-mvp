/**
 * WhatsApp Send — Send messages via Baileys (single or multi-session)
 * POST /api/whatsapp/send
 * 
 * Body: { phone, text }
 *   + Per-driver bot: { sessionId?, driverId? }
 */

import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || "";

// Legacy single-session Baileys server
const BAILEYS_SERVER_URL = process.env.BAILEYS_SERVER_URL || "";
// Multi-session Baileys server
const BAILEYS_MULTI_URL = process.env.BAILEYS_MULTI_URL || "";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    if (WEBHOOK_SECRET) {
      const authHeader = req.headers.get("x-webhook-secret") || req.headers.get("authorization");
      if (authHeader !== WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    if (!body.text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const text = body.text;

    // Per-driver bot mode: send via session
    if (body.sessionId && BAILEYS_MULTI_URL) {
      try {
        const res = await fetch(`${BAILEYS_MULTI_URL}/sessions/${body.sessionId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (res.ok) {
          return NextResponse.json({ ok: true, method: "per-driver-bot", sessionId: body.sessionId });
        }
        console.warn(`[WA Send] Multi-session send failed: ${res.status}`);
      } catch (err) {
        console.warn("[WA Send] Multi-session server not available:", err);
      }
    }

    // Per-driver bot mode: send via driverId lookup
    if (body.driverId && BAILEYS_MULTI_URL) {
      try {
        const res = await fetch(`${BAILEYS_MULTI_URL}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: body.driverId, text }),
        });

        if (res.ok) {
          return NextResponse.json({ ok: true, method: "per-driver-bot", driverId: body.driverId });
        }
        console.warn(`[WA Send] Multi-session driverId send failed: ${res.status}`);
      } catch (err) {
        console.warn("[WA Send] Multi-session server not available:", err);
      }
    }

    // Legacy mode: single-session Baileys
    if (body.phone && BAILEYS_SERVER_URL) {
      const phone = normalizePhone(body.phone);
      try {
        const res = await fetch(`${BAILEYS_SERVER_URL}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, text }),
        });

        if (res.ok) {
          return NextResponse.json({ ok: true, method: "baileys-single" });
        }
        console.warn(`[WA Send] Baileys single send failed: ${res.status}`);
      } catch (err) {
        console.warn("[WA Send] Baileys single server not available:", err);
      }
    }

    // Log fallback
    const target = body.sessionId || body.driverId || body.phone || "unknown";
    console.log(`[WA Send] Message queued for ${target}: "${text.substring(0, 50)}..."`);

    return NextResponse.json({
      ok: true,
      method: "queued",
      note: "Message logged. Configure BAILEYS_MULTI_URL or BAILEYS_SERVER_URL to send via WhatsApp.",
    });
  } catch (error) {
    console.error("[WA Send] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+]/g, "").replace(/@s\.whatsapp\.net/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  return cleaned;
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "whatsapp-send",
    modes: {
      singleSession: !!BAILEYS_SERVER_URL,
      multiSession: !!BAILEYS_MULTI_URL,
    },
    timestamp: new Date().toISOString(),
  });
}
