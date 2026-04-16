"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function QRIndexPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-green-500/30 overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/landing" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-2xl">🏍️</span>
            <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">NEMU RIDE</span>
          </Link>
          <Link href="/driver/signup">
            <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white border-0 rounded-full px-5 text-sm font-medium">
              Daftar
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-28 pb-16 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">QR NEMU RIDE</span>
            </h1>
            <p className="mt-3 text-white/50">Pilih sesuai kebutuhanmu</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/20 p-7 sm:p-8">
              <div className="text-4xl mb-4">🛵</div>
              <h2 className="text-2xl font-bold mb-2">Mau Pesan Ojek?</h2>
              <p className="text-zinc-600 mb-6">Pesan ojek lewat Telegram, mudah dan cepat.</p>
              <Link href="/qr/penumpang">
                <Button className="bg-green-600 hover:bg-green-500 text-white rounded-xl h-11 px-6 font-semibold">
                  Pesan Sekarang
                </Button>
              </Link>
            </div>

            <div className="rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/20 p-7 sm:p-8">
              <div className="text-4xl mb-4">🏍️</div>
              <h2 className="text-2xl font-bold mb-2">Mau Jadi Driver?</h2>
              <p className="text-zinc-600 mb-6">Daftar jadi mitra driver, tentukan jadwalmu sendiri.</p>
              <Link href="/qr/driver">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-11 px-6 font-semibold">
                  Daftar Driver
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
