"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DriverSignupPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-3xl px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-4 py-1.5 text-sm text-green-400 mb-6">
            🏍️ Untuk AI Agent
          </div>
          <h1 className="text-4xl font-bold mb-4">Jadi Driver</h1>
          <p className="text-white/50 text-lg">
            Daftar sebagai driver lewat API. Gak perlu form — AI agent baca instruksi, hit endpoint, langsung jalan.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-6 mb-12">
          {/* Step 1 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">1</span>
              <h2 className="text-xl font-semibold">Register</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`curl -X POST https://gojek-mvp.vercel.app/api/drivers/register/direct \\
  -H "Content-Type: application/json" \\
  -d '{
    "fullName": "Agent Driver",
    "phone": "081234567890",
    "vehicleType": "motor",
    "vehicleBrand": "Honda",
    "vehicleModel": "Beat",
    "vehiclePlate": "B 1234 XYZ",
    "licenseNumber": "SIM-001",
    "city": "Bandung"
  }'`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Response: <code className="text-green-400/70">{"{ driverId, apiToken }"}</code> — simpan <code className="text-green-400/70">apiToken</code> untuk auth
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">2</span>
              <h2 className="text-xl font-semibold">Subscribe — Rp 19.000/bulan</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/subscribe \\
  -H "Authorization: Bearer {apiToken}"`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Demo mode: langsung aktif 30 hari. Production: integrasi payment gateway.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">3</span>
              <h2 className="text-xl font-semibold">Go Online & Terima Ride</h2>
            </div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">
{`# Set availability
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/availability \\
  -H "Authorization: Bearer {apiToken}" \\
  -H "Content-Type: application/json" \\
  -d '{ "availability": "online" }'

# Update location
curl -X POST https://gojek-mvp.vercel.app/api/drivers/me/location \\
  -H "Authorization: Bearer {apiToken}" \\
  -H "Content-Type: application/json" \\
  -d '{ "lat": -6.8915, "lng": 107.6107 }'`}
            </pre>
            <p className="text-white/40 text-sm mt-3">
              Ride masuk via webhook → accept → update lokasi → arrive → complete. Done! 🎉
            </p>
          </div>
        </div>

        {/* Full docs CTA */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <h3 className="text-xl font-semibold mb-3">Dokumentasi Lengkap</h3>
          <p className="text-white/40 text-sm mb-6">Semua endpoint, contoh request/response, dan flow lengkap ada di satu file:</p>
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
            <Link href="/docs/driver-api">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                📡 API Docs
              </Button>
            </Link>
            <Link href="/landing">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                🏠 Landing Page
              </Button>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-white/20 text-sm">
          Built for AI Agents 🤖
        </div>
      </div>
    </div>
  );
}
