/**
 * WhatsApp Webhook — Receives messages from Baileys (single + multi-session)
 * POST /api/whatsapp/webhook
 * 
 * Body: { phone, text, hasImage?, hasLocation?, location?, messageId?, timestamp? }
 *   + Per-driver bot fields: { isDriverBot?, sessionId?, driverPhone?, fromMe?, isSelfChat? }
 * 
 * Returns: { replies: [{ phone, text }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { handleMessage, IncomingMessage } from "@/lib/whatsapp/bridge";
import { handlePassengerMessage } from "@/lib/whatsapp/passenger-bot";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// driverSessions may not be in generated types yet — use dynamic access
const driverSessionsApi = (api as any).driverSessions;

// Shared secret to prevent unauthorized webhook calls
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || "";
const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(/\/+$/, "");

function getConvex() {
  return new ConvexHttpClient(CONVEX_URL);
}

export async function POST(req: NextRequest) {
  try {
    // Optional auth check
    if (WEBHOOK_SECRET) {
      const authHeader = req.headers.get("x-webhook-secret") || req.headers.get("authorization");
      if (authHeader !== WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    // Validate required fields
    if (!body.phone || typeof body.phone !== "string") {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    // Handle internal registration from web UI
    if (body._internal && body._registerData) {
      try {
        const convex = getConvex();
        await convex.mutation(api.whatsappState.upsert, {
          phone: normalizePhone(body.phone),
          state: "idle",
          driverId: body._registerData.driverId,
          apiToken: body._registerData.apiToken,
          lastMessageAt: Date.now(),
        });

        // Also update the session in Convex
        if (body.sessionId && driverSessionsApi) {
          await convex.mutation(driverSessionsApi.upsert, {
            sessionId: body.sessionId,
            driverId: body._registerData.driverId,
            phone: normalizePhone(body.phone),
            status: "connected",
            lastConnectedAt: Date.now(),
          });
        }
      } catch (e) {
        console.warn("[WA Webhook] Internal registration state update failed:", e);
      }

      return NextResponse.json({ ok: true, internal: true });
    }

    const message: IncomingMessage = {
      phone: body.phone,
      text: body.text || "",
      hasImage: body.hasImage || false,
      hasLocation: body.hasLocation || false,
      location: body.location,
      messageId: body.messageId,
      timestamp: body.timestamp,
    };

    // Log based on source
    const source = body.isDriverBot ? `[per-driver-bot:${body.sessionId}]` : "[single-bot]";
    console.log(`[WA Webhook] ${source} From: ${message.phone} | Text: "${message.text}" | Image: ${message.hasImage} | Location: ${message.hasLocation}`);

    // If this is from the per-driver bot, sync session status to Convex
    if (body.isDriverBot && body.sessionId) {
      try {
        const convex = getConvex();
        await convex.mutation(driverSessionsApi.updateStatus, {
          sessionId: body.sessionId,
          status: "connected",
          phone: normalizePhone(body.phone),
          lastConnectedAt: Date.now(),
        });
      } catch (e) {
        // Non-critical
      }
    }

    // Passenger booking bot flow (scan QR -> chat order)
    const passengerFlow = await handlePassengerMessage({ phone: message.phone, text: message.text });
    if (passengerFlow.handled) {
      const replies = passengerFlow.replies.map((text) => ({ phone: normalizePhone(message.phone), text }));
      console.log(`[WA Webhook] ${source} Passenger flow replies: ${replies.length}`);
      return NextResponse.json({ ok: true, replies });
    }

    // Fallback to existing driver bridge flow
    const replies = await handleMessage(message);

    console.log(`[WA Webhook] ${source} Replies: ${replies.length}`);

    return NextResponse.json({ ok: true, replies });
  } catch (error) {
    console.error("[WA Webhook] Error:", error);
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
    service: "whatsapp-webhook",
    modes: ["single-bot", "per-driver-bot"],
    timestamp: new Date().toISOString(),
  });
}
