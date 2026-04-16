"use client";

export default function TelegramBookingLink() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "NemuOjekBot";
  const deepLink = `https://t.me/${botUsername}?start=passenger`;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5">
      <p className="text-sm text-blue-300 font-semibold">Pesan via Telegram Bot</p>
      <p className="text-xs text-white/60 mt-1">Klik link → Telegram kebuka → bot tanya detail ride → auto create booking.</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="w-28 h-28 rounded-lg bg-blue-500/20 flex items-center justify-center text-4xl">
          ✈️
        </div>
        <div className="text-xs text-white/70">
          <p className="mb-2">Link:</p>
          <a href={deepLink} target="_blank" rel="noreferrer" className="text-blue-300 underline text-sm">
            @{botUsername}
          </a>
          <p className="mt-2 text-white/50">
            Atau cari &quot;{botUsername}&quot; di Telegram
          </p>
        </div>
      </div>
    </div>
  );
}
