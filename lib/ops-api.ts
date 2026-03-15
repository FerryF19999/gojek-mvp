import { ConvexHttpClient } from "convex/browser";
import { Id } from "@/convex/_generated/dataModel";

export class OpsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const normalizeConvexUrl = (url: string) => url.trim().replace(/\/+$/, "");

export function getConvexUrl() {
  const raw = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!raw) {
    throw new OpsApiError(500, "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required");
  }
  return normalizeConvexUrl(raw);
}

export function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export function assertOpsAuth(headerValue: string | null) {
  const expected = process.env.OPS_API_KEY;
  if (!expected) {
    throw new OpsApiError(500, "OPS_API_KEY is not configured");
  }
  if (!headerValue || headerValue !== expected) {
    throw new OpsApiError(401, "Unauthorized");
  }
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpsApiError(400, "Body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function parseJsonBody(body: unknown) {
  return asRecord(body);
}

export function requireString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpsApiError(400, `${field} is required`);
  }
  return value.trim();
}

export function optionalNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new OpsApiError(400, `${field} must be a number`);
  }
  return value;
}

export function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new OpsApiError(400, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requireRideId(value: string): Id<"rides"> {
  const rideId = value.trim();
  if (!rideId) {
    throw new OpsApiError(400, "rideId is required");
  }
  return rideId as Id<"rides">;
}

export function safeError(error: unknown) {
  if (error instanceof OpsApiError) {
    return { status: error.status, body: { error: error.message } };
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return { status: 500, body: { error: message } };
}
