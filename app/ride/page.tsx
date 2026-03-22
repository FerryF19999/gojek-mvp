"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { launchCities, type LaunchCity } from "@/lib/launchCities";

const CityPreviewMap = dynamic(() => import("@/components/ride/CityPreviewMap"), { ssr: false });

type Lang = "id" | "en";
const t = {
  id: {
    badge: "🧑 Untuk AI Agent",
    title: "Pesan Ride",
    sub: "Order ride lewat API. Tanpa auth, tanpa form — AI agent hit endpoint, ride jalan.",
    cityTitle: "📍 Pilih Kota Booking",
    cityDesc: "Map akan auto pindah ke kota yang dipilih",
    step2: "Bayar (Demo)",
    step3: "Track Real-time",
    payDesc: "Demo mode: langsung paid. Ride otomatis masuk dispatching → cari driver terdekat.",
    status: "Status:",
    pricing: "💰 Pricing",
    docsTitle: "Dokumentasi Lengkap",
    docsSub: "Semua endpoint, contoh request/response, dan flow lengkap:",
    readSkill: "📄 Baca skill.md",
    driver: "🏍️ Jadi Driver",
    landing: "🏠 Landing Page",
    footer: "Built for AI Agents 🤖",
    active: "Active",
    soon: "Launching Soon",
    launchArea: "Area layanan awal:",
  },
  en: {
    badge: "🧑 For AI Agents",
    title: "Book a Ride",
    sub: "Order rides via API. No auth, no form — AI agents hit endpoints and rides run instantly.",
    cityTitle: "📍 Select Booking City",
    cityDesc: "Map automatically moves to selected city",
    step2: "Pay (Demo)",
    step3: "Track in Real-time",
    payDesc: "Demo mode: instantly marked paid. Ride automatically enters dispatching → finds nearest driver.",
    status: "Status:",
    pricing: "💰 Pricing",
    docsTitle: "Full Documentation",
    docsSub: "All endpoints, request/response examples, and full flow:",
    readSkill: "📄 Read skill.md",
    driver: "🏍️ Become Driver",
    landing: "🏠 Landing Page",
    footer: "Built for AI Agents 🤖",
    active: "Active",
    soon: "Launching Soon",
    launchArea: "Initial service zones:",
  },
} as const;

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-all">
      <span>{lang === "id" ? "🇮🇩" : "🇬🇧"}</span><span>{lang === "id" ? "ID" : "EN"}</span>
    </button>
  );
}

export default function OrderRidePage() {
  const [lang, setLang] = useState<Lang>("id");
  const [selectedCityId, setSelectedCityId] = useState<LaunchCity["id"]>("jakarta");
  const s = t[lang];

  const selectedCity = useMemo(
    () => launchCities.find((city) => city.id === selectedCityId) ?? launchCities[0],
    [selectedCityId]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative">
      <LangToggle lang={lang} setLang={setLang} />
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-4 py-1.5 text-sm text-green-400 mb-6">{s.badge}</div>
          <h1 className="text-4xl font-bold mb-4">{s.title}</h1>
          <p className="text-white/50 text-lg">{s.sub}</p>
        </div>

        <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/[0.08] to-transparent p-6 mb-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">{s.cityTitle}</h2>
            <span className="text-xs text-white/50">{s.cityDesc}</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {launchCities.map((city) => {
              const active = city.id === selectedCity.id;
              return (
                <button key={city.id} onClick={() => setSelectedCityId(city.id)} className={`rounded-xl border px-4 py-3 text-left transition-all ${active ? "border-green-500/40 bg-green-500/15" : "border-white/10 bg-black/30 hover:border-green-500/20"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{city.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${city.status === "active" ? "bg-green-500/20 text-green-300" : "bg-amber-400/20 text-amber-200"}`}>
                      {city.status === "active" ? s.active : s.soon}
                    </span>
                  </div>
                  <p className="text-xs text-white/45 mt-1">{city.zones.slice(0, 2).join(" • ")}</p>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl overflow-hidden border border-white/10">
            <CityPreviewMap cityName={selectedCity.name} center={selectedCity.center} />
          </div>
          <p className="text-xs text-white/45 mt-3">{s.launchArea} {selectedCity.zones.join(", ")}.</p>
        </div>

        <div className="space-y-6 mb-12">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4"><span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">1</span><h2 className="text-xl font-semibold">Create Ride</h2></div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">{`curl -X POST https://gojek-mvp.vercel.app/api/rides/create \\
  -H "Content-Type: application/json" \\
  -d '{
    "customerName": "AI Passenger",
    "customerPhone": "081234567890",
    "city": "${selectedCity.name}",
    "pickup": {
      "address": "${selectedCity.zones[0]}",
      "lat": ${selectedCity.center.lat},
      "lng": ${selectedCity.center.lng}
    },
    "dropoff": {
      "address": "${selectedCity.zones[1] ?? selectedCity.zones[0]}",
      "lat": ${selectedCity.center.lat + 0.018},
      "lng": ${selectedCity.center.lng + 0.015}
    },
    "vehicleType": "motor"
  }'`}</pre>
            <p className="text-white/40 text-sm mt-3">Response: <code className="text-green-400/70">{"{ code: \"RIDE-000017\", rideId, price: { amount: 15000 } }"}</code></p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4"><span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">2</span><h2 className="text-xl font-semibold">{s.step2}</h2></div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">{`curl -X POST https://gojek-mvp.vercel.app/api/rides/RIDE-000017/pay`}</pre>
            <p className="text-white/40 text-sm mt-3">{s.payDesc}</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-4"><span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">3</span><h2 className="text-xl font-semibold">{s.step3}</h2></div>
            <pre className="rounded-xl bg-black/50 border border-white/10 p-4 text-sm text-green-400 overflow-x-auto">{`# Via API
curl https://gojek-mvp.vercel.app/api/rides/RIDE-000017/status

# Via browser (live map)
https://gojek-mvp.vercel.app/track/RIDE-000017`}</pre>
            <p className="text-white/40 text-sm mt-3">{s.status} <code className="text-white/60">created → dispatching → assigned → picked_up → completed</code></p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-12">
          <h3 className="text-lg font-semibold mb-4">{s.pricing}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-black/30 p-4 text-center"><div className="text-2xl mb-1">🏍️</div><div className="font-semibold">Motor</div><div className="text-green-400 text-sm">Rp 2.500/km</div><div className="text-white/30 text-xs">min Rp 10.000</div></div>
            <div className="rounded-xl bg-black/30 p-4 text-center"><div className="text-2xl mb-1">🚗</div><div className="font-semibold">Mobil</div><div className="text-green-400 text-sm">Rp 4.000/km</div><div className="text-white/30 text-xs">min Rp 10.000</div></div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <h3 className="text-xl font-semibold mb-3">{s.docsTitle}</h3>
          <p className="text-white/40 text-sm mb-6">{s.docsSub}</p>
          <div className="rounded-xl bg-black/50 border border-white/10 p-4 mb-6 font-mono text-sm text-green-400 select-all cursor-pointer" onClick={() => { navigator.clipboard?.writeText("https://gojek-mvp.vercel.app/skill.md"); }}>
            https://gojek-mvp.vercel.app/skill.md
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/skill.md"><Button className="bg-green-600 hover:bg-green-500 text-white rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">{s.readSkill}</Button></Link>
            <Link href="/driver/signup"><Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">{s.driver}</Button></Link>
            <Link href="/landing"><Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">{s.landing}</Button></Link>
          </div>
        </div>

        <div className="mt-12 text-center text-white/20 text-sm">{s.footer}</div>
      </div>
    </div>
  );
}
