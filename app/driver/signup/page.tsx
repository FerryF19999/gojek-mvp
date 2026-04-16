"use client";

import { Button } from "@/components/ui/button";

export default function DriverSignupPage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "NemuOjekBot";
  const deepLink = `https://t.me/${botUsername}?start=driver`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🏍️</div>
          <h1 className="text-3xl font-bold mb-2">Daftar Driver</h1>
          <p className="text-white/50">
            Klik tombol di bawah, daftar lewat Telegram.
            <br />Tanpa komisi — 100% penghasilan buat kamu.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 space-y-5 text-center">
          <a href={deepLink} target="_blank" rel="noreferrer">
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-12 font-semibold text-base">
              Daftar via Telegram
            </Button>
          </a>

          <p className="text-white/40 text-sm">
            Atau cari <strong className="text-white/70">@{botUsername}</strong> di Telegram
          </p>
        </div>

        <div className="mt-8 rounded-xl bg-white/[0.02] border border-white/5 p-5">
          <h3 className="text-sm font-medium mb-3">Cara kerjanya:</h3>
          <ol className="text-white/50 text-sm space-y-2 list-decimal list-inside">
            <li>Klik tombol &quot;Daftar via Telegram&quot; di atas</li>
            <li>Ketik <b>DAFTAR</b> di chat bot</li>
            <li>Isi data kamu (nama, kendaraan, plat, dll)</li>
            <li>Ketik <b>MULAI</b> untuk mulai terima orderan</li>
          </ol>
        </div>

        <p className="mt-6 text-center text-white/20 text-xs">
          NEMU RIDE — Ojek tanpa komisi
        </p>
      </div>
    </div>
  );
}
