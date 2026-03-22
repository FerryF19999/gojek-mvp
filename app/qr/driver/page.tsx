"use client";

import { QRCodeSVG } from "qrcode.react";

const fallbackNumber = "6288971081746";

function getWaLink(text: string) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER || fallbackNumber;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export default function QRDriverPage() {
  const qrValue = getWaLink("driver");

  return (
    <main className="min-h-screen bg-white px-4 py-10 sm:px-6 print:p-0">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          Daftar Jadi Driver Nemu
        </h1>
        <p className="mt-2 text-slate-600 sm:text-lg">
          Scan QR ini untuk mulai daftar
        </p>

        <div className="mt-8 flex justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <QRCodeSVG value={qrValue} size={256} />
          </div>
        </div>

        <ol className="mx-auto mt-8 max-w-md list-decimal space-y-2 pl-6 text-left text-slate-700">
          <li>Scan QR dengan kamera HP</li>
          <li>WhatsApp terbuka otomatis</li>
          <li>Ikuti proses pendaftaran driver</li>
        </ol>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-8 inline-flex print:hidden items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Print
        </button>
      </div>
    </main>
  );
}
