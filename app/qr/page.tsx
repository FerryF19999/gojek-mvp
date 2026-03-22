import Link from "next/link";

const cardStyle =
  "block rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export default function QRIndexPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 print:bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            QR Nemu Ojek
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Pilih jenis QR sesuai kebutuhan akuisisi pengguna.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/qr/penumpang" className={cardStyle}>
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
              Penumpang
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              Mau Pesan Ojek?
            </h2>
            <p className="mt-2 text-slate-600">
              Buka halaman QR untuk calon penumpang dan langsung arahkan ke WhatsApp bot.
            </p>
          </Link>

          <Link href="/qr/driver" className={cardStyle}>
            <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
              Driver
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              Mau Jadi Driver?
            </h2>
            <p className="mt-2 text-slate-600">
              Buka halaman QR untuk pendaftaran driver baru lewat WhatsApp.
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
