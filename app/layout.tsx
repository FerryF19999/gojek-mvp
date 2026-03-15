import "./globals.css";
import { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/ui/toaster";

export const metadata = {
  title: "Gojek Agentic MVP Ops",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ConvexClientProvider>
            {children}
            <AppToaster />
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
