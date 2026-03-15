import "./globals.css";
import { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";

export const metadata = {
  title: "Gojek Agentic MVP Ops",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
