"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";

const client = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210");

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
