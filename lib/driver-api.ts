import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export class DriverApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getConvexUrl() {
  const raw = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!raw) throw new DriverApiError(500, "CONVEX_URL not configured");
  return raw.trim().replace(/\/+$/, "");
}

export function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

/**
 * Extract Bearer token and resolve to a driver record.
 * Returns the full driver object (with user info) or throws 401.
 */
export async function authenticateDriver(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new DriverApiError(401, "Missing or invalid Authorization header. Use: Bearer <driverToken>");
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new DriverApiError(401, "Empty bearer token");
  }

  const convex = getConvexClient();
  const driver = await convex.query(api.drivers.getDriverByApiToken, { apiToken: token });
  if (!driver) {
    throw new DriverApiError(401, "Invalid driver token");
  }
  return driver;
}

export function parseJsonBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DriverApiError(400, "Body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DriverApiError(400, `${field} is required`);
  }
  return value.trim();
}

export function safeError(error: unknown) {
  if (error instanceof DriverApiError) {
    return { status: error.status, body: { error: error.message } };
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  return { status: 500, body: { error: message } };
}
