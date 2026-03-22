"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

const BOT_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER || "6288971081746";

export default function QRDriverPage() {
  const qrValue = `https://wa.me/${BOT_NUMBER}?text=driver`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-green-500/30 overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/landing" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-2xl">🏍️</span>
            <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Nemu Ojek</span>
          </Link>
          <Link href="/qr">
            <Button size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-full px-5 text-sm font-medium">
              Kembali
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-28 pb-16 px-4 print:pt-8">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/20 p-7 sm:p-8 text-center">
          <div className="text-4xl mb-4">🏍️</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Daftar Jadi Driver Nemu</h1>
          <p className="text-zinc-600 mb-8">Scan QR ini untuk mulai daftar</p>

          <div className="flex justify-center mb-8">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <QRCodeSVG value={qrValue} size={220} />
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 p-5 max-w-sm mx-auto text-left mb-6">
            <p className="font-semibold mb-2">Cara daftar:</p>
            <p className="text-sm mb-1">1️⃣ Scan QR dengan kamera HP</p>
            <p className="text-sm mb-1">2️⃣ WhatsApp terbuka otomatis</p>
            <p className="text-sm">3️⃣ Ikuti proses pendaftaran driver</p>
          </div>

          <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-11 px-6 font-semibold print:hidden">
            🖨️ Print QR
          </Button>
        </div>
      </main>
    </div>
  );
}
