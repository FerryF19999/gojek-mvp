import "./globals.css";
import { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/ui/toaster";

export const metadata = {
  title: "NEMU RIDE — Ride-hailing tanpa komisi",
  description: "Pesan ojek atau jadi driver langsung lewat Telegram. 100% penghasilan buat driver, no commission.",
  openGraph: {
    title: "NEMU RIDE",
    description: "Ride-hailing tanpa komisi — pesan ojek atau jadi driver lewat Telegram.",
    url: "https://gojek-mvp.vercel.app",
    siteName: "NEMU RIDE",
    images: ["/og-image.png"],
    locale: "id_ID",
    type: "website",
  },
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
