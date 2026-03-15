import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  OpsApiError,
  assertOpsAuth,
  getConvexClient,
  parseJsonBody,
  requireString,
  safeError,
} from "@/lib/ops-api";

const PROVIDER = "openstreetmap-nominatim";
let lastNominatimCallAt = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocodeWithNominatim(query: string) {
  const now = Date.now();
  const elapsed = now - lastNominatimCallAt;
  const minIntervalMs = 1000;
  if (elapsed < minIntervalMs) {
    await wait(minIntervalMs - elapsed);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "gojek-agentic-mvp/0.1 (ops geocode endpoint)",
        "Accept-Language": "id,en",
      },
      cache: "no-store",
    });
    lastNominatimCallAt = Date.now();
  } catch {
    throw new OpsApiError(502, "Geocoding provider request failed");
  }

  if (!response.ok) {
    throw new OpsApiError(502, `Geocoding provider error: ${response.status}`);
  }

  let data: Array<{ lat?: string; lon?: string; display_name?: string }>;
  try {
    data = await response.json();
  } catch {
    throw new OpsApiError(502, "Geocoding provider returned invalid response");
  }

  const best = data[0];
  const lat = Number(best?.lat);
  const lng = Number(best?.lon);
  const displayName = best?.display_name?.trim();

  if (!best || Number.isNaN(lat) || Number.isNaN(lng) || !displayName) {
    throw new OpsApiError(502, "Geocoding provider returned no result");
  }

  return { lat, lng, displayName, provider: PROVIDER };
}

export async function POST(req: NextRequest) {
  try {
    assertOpsAuth(req.headers.get("x-ops-key"));

    const body = parseJsonBody(await req.json());
    const query = requireString(body, "query");
    const cacheKey = query.toLowerCase();

    const convex = getConvexClient();
    const cached = await convex.query(api.geocodes.getByQuery, { query: cacheKey });
    if (cached) {
      return NextResponse.json({
        ok: true,
        query,
        lat: cached.lat,
        lng: cached.lng,
        displayName: cached.displayName,
        provider: cached.provider,
      });
    }

    const geocoded = await geocodeWithNominatim(query);

    await convex.mutation(api.geocodes.put, {
      query: cacheKey,
      lat: geocoded.lat,
      lng: geocoded.lng,
      displayName: geocoded.displayName,
      provider: geocoded.provider,
    });

    return NextResponse.json({
      ok: true,
      query,
      lat: geocoded.lat,
      lng: geocoded.lng,
      displayName: geocoded.displayName,
      provider: geocoded.provider,
    });
  } catch (error) {
    const parsed = safeError(error);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }
}
