"use client";

import { Button } from "@/components/ui/button";

export default function RidePage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "NemuOjekBot";
  const deepLink = `https://t.me/${botUsername}?start=passenger`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🛵</div>
          <h1 className="text-3xl font-bold mb-2">Pesan Ojek</h1>
          <p className="text-white/50">
            Klik tombol di bawah, pesan ojek langsung di Telegram.
            <br />Bilang aja mau ke mana — bot urus semuanya.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 space-y-5 text-center">
          <a href={deepLink} target="_blank" rel="noreferrer">
            <Button className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl h-12 font-semibold text-base">
              Pesan via Telegram
            </Button>
          </a>

          <p className="text-white/40 text-sm">
            Atau cari <strong className="text-white/70">@{botUsername}</strong> di Telegram
          </p>
        </div>

        <div className="mt-8 rounded-xl bg-white/[0.02] border border-white/5 p-5">
          <h3 className="text-sm font-medium mb-3">Cara kerjanya:</h3>
          <ol className="text-white/50 text-sm space-y-2 list-decimal list-inside">
            <li>Klik tombol &quot;Pesan via Telegram&quot; di atas</li>
            <li>Ketik <b>PESAN</b> di chat bot</li>
            <li>Bot akan tanya: nama, dari mana, ke mana, bayar pakai apa</li>
            <li>Driver akan dipilih otomatis, kamu tinggal tunggu</li>
          </ol>
        </div>

        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/5 p-5">
          <h3 className="text-sm font-medium mb-3">💰 Harga</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-black/30 p-3 text-center">
              <div className="text-xl mb-1">🏍️</div>
              <div className="font-semibold">Motor</div>
              <div className="text-green-400 text-xs">Rp 3.500/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
            <div className="rounded-lg bg-black/30 p-3 text-center">
              <div className="text-xl mb-1">🚗</div>
              <div className="font-semibold">Mobil</div>
              <div className="text-green-400 text-xs">Rp 4.000/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-white/20 text-xs">
          NEMU RIDE — Ojek tanpa komisi
        </p>
      </div>
    </div>
  );
}
