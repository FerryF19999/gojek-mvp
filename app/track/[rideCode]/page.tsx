"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const TrackingMap = dynamic(() => import("./TrackingMap"), { ssr: false });

type Lang = "id" | "en";

export default function TrackRidePage() {
  const [lang, setLang] = useState<Lang>("id");
  const params = useParams();
  const rideCode = params.rideCode as string;
  const ride = useQuery(api.rides.getRideByCode, { code: rideCode });

  if (ride === undefined) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white relative">
        <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">{lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}</button>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4" />
          <p className="text-lg">{lang === "id" ? `Memuat tracking ${rideCode}...` : `Loading tracking ${rideCode}...`}</p>
        </div>
      </div>
    );
  }

  if (ride === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white relative">
        <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">{lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}</button>
        <div className="text-center">
          <p className="text-2xl mb-2">🚫</p>
          <p className="text-lg font-semibold">{lang === "id" ? "Ride tidak ditemukan" : "Ride not found"}</p>
          <p className="text-gray-400 mt-1">Code: {rideCode}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-3 top-3 z-[2000] rounded-full border border-white/10 bg-black/50 text-white px-3 py-1 text-xs">{lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}</button>
      <TrackingMap ride={ride} lang={lang} />
    </div>
  );
}
