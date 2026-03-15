import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { rideId } = body as { rideId: string; provider?: string };

  const provider = body?.provider || "xendit";

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "NEXT_PUBLIC_CONVEX_URL missing" }, { status: 500 });

  // Call Convex action endpoint. In dev, Convex action base URL is the deployment URL.
  // This is a minimal proxy to avoid wiring Convex actions directly into the React client.
  const url = `${convexUrl}/api/action/payments:createPaymentQris`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rideId, provider }),
  });

  const text = await res.text();
  if (!res.ok) return new NextResponse(text, { status: res.status });

  return new NextResponse(text, { status: 200, headers: { "content-type": "application/json" } });
}
