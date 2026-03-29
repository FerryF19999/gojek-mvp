import { NextRequest, NextResponse } from "next/server";

const BOT_URL = process.env.BOT_INTERNAL_URL || "http://45.32.136.27:3001";
const BOT_KEY = process.env.BOT_API_KEY || "nemu-xcloud-2026";

/**
 * Proxy API route: forwards requests from Vercel to VPS bot server
 * This avoids CORS/mixed-content issues (HTTPS → HTTP)
 *
 * Usage: /api/bot/sessions, /api/bot/send-message, /api/bot/health, etc.
 */
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path);
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const path = "/" + pathSegments.join("/");
  const url = `${BOT_URL}${path}?key=${BOT_KEY}`;

  try {
    const options: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        const body = await req.text();
        if (body) options.body = body;
      } catch {}
    }

    const res = await fetch(url, options);
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Bot server unreachable", detail: (e as Error).message },
      { status: 502 }
    );
  }
}
