"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OrderRidePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-4 py-1.5 text-sm text-green-400 mb-6">
            🧑 Untuk AI Agent
          </div>
          <h1 className="text-4xl font-bold mb-4">Pesan Ride</h1>
          <p className="text-white/50 text-lg">
            Order ride lewat API. Tanpa auth, tanpa form — AI agent hit endpoint, ride jalan.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-6 mb-12">
          {/* Step 1 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">1</span>
              <h2 className="text-xl font-semibold">Create Ride</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`curl -X POST https://gojek-mvp.vercel.app/api/rides/create \\
  -H "Content-Type: application/json" \\
  -d '{
    "customerName": "AI Passenger",
    "customerPhone": "081234567890",
    "pickup": {
      "address": "ITB Bandung",
      "lat": -6.8915,
      "lng": 107.6107
    },
    "dropoff": {
      "address": "Trans Studio Bandung",
      "lat": -6.9261,
      "lng": 107.6356
    },
    "vehicleType": "motor"
  }'`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Response: <code className="text-green-400/70">{"{ code: \"RIDE-000017\", rideId, price: { amount: 15000 } }"}</code>
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">2</span>
              <h2 className="text-xl font-semibold">Bayar (Demo)</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`curl -X POST https://gojek-mvp.vercel.app/api/rides/RIDE-000017/pay`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Demo mode: langsung paid. Ride otomatis masuk dispatching → cari driver terdekat.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">3</span>
              <h2 className="text-xl font-semibold">Track Real-time</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`# Via API
curl https://gojek-mvp.vercel.app/api/rides/RIDE-000017/status

# Via browser (live map)
https://gojek-mvp.vercel.app/track/RIDE-000017`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Status: <code className="text-white/60">created → dispatching → assigned → picked_up → completed</code>
            </p>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-12">
          <h3 className="text-lg font-semibold mb-4">💰 Pricing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-black/30 p-4 text-center">
              <div className="text-2xl mb-1">🏍️</div>
              <div className="font-semibold">Motor</div>
              <div className="text-green-400 text-sm">Rp 2.500/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 text-center">
              <div className="text-2xl mb-1">🚗</div>
              <div className="font-semibold">Mobil</div>
              <div className="text-green-400 text-sm">Rp 4.000/km</div>
              <div className="text-white/30 text-xs">min Rp 10.000</div>
            </div>
          </div>
        </div>

        {/* Full docs CTA */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <h3 className="text-xl font-semibold mb-3">Dokumentasi Lengkap</h3>
          <p className="text-white/40 text-sm mb-6">Semua endpoint, contoh request/response, dan flow lengkap:</p>
          <div
            className="rounded-xl bg-black/50 border border-white/10 p-4 mb-6 font-mono text-sm text-green-400 select-all cursor-pointer"
            onClick={() => { navigator.clipboard?.writeText("https://gojek-mvp.vercel.app/skill.md"); }}
          >
            https://gojek-mvp.vercel.app/skill.md
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/skill.md">
              <Button className="bg-green-600 hover:bg-green-500 text-white rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                📄 Baca skill.md
              </Button>
            </Link>
            <Link href="/driver/signup">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                🏍️ Jadi Driver
              </Button>
            </Link>
            <Link href="/landing">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                🏠 Landing Page
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-12 text-center text-white/20 text-sm">
          Built for AI Agents 🤖
        </div>
      </div>
    </div>
  );
}
