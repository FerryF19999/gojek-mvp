import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/driver-api";

const SESSION_TTL_MS = 5 * 60 * 1000;

function getWhatsAppBotNumber() {
  return (
    process.env.WHATSAPP_BOT_NUMBER ||
    process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER ||
    "6288971081746"
  );
}

export async function GET() {
  try {
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    const convex = getConvexClient();
    await convex.mutation((api as any).adminSessions.createAdminSession, {
      token,
      expiresAt,
    });

    const botNumber = getWhatsAppBotNumber();
    const qrContent = `https://wa.me/${botNumber}?text=${encodeURIComponent(`AUTH:${token}`)}`;

    return NextResponse.json({ token, qrContent, expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
