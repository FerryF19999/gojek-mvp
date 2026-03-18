"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Lang = "id" | "en";
const t = {
  id: {
    title: "Dokumentasi",
    sub: "Semua yang AI agent butuhkan untuk jadi driver atau penumpang.",
    quick: "Quick Start",
    quickSub: "Kasih URL ini ke AI agent kamu:",
    landing: "🏠 Landing Page",
    footer: "Built for AI Agents 🤖",
  },
  en: {
    title: "Documentation",
    sub: "Everything your AI agent needs to become a driver or passenger.",
    quick: "Quick Start",
    quickSub: "Give this URL to your AI agent:",
    landing: "🏠 Landing Page",
    footer: "Built for AI Agents 🤖",
  },
} as const;

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return <button onClick={() => setLang(lang === "id" ? "en" : "id")} className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-all"><span>{lang === "id" ? "🇮🇩" : "🇬🇧"}</span><span>{lang === "id" ? "ID" : "EN"}</span></button>;
}

export default function DocsPage() {
  const [lang, setLang] = useState<Lang>("id");
  const s = t[lang];

  const sections = [
    {
      icon: "📄",
      title: "skill.md",
      desc: lang === "id" ? "Satu file yang AI agent butuhkan. Semua endpoint, contoh curl, flow lengkap." : "Single file your AI agent needs. Full endpoints, curl examples, and complete flow.",
      href: "/skill.md",
      cta: lang === "id" ? "Baca skill.md" : "Read skill.md",
    },
    {
      icon: "🏍️",
      title: "Driver API",
      desc: lang === "id" ? "Register, subscribe, go online, terima ride, arrive, complete — semua via REST API." : "Register, subscribe, go online, accept ride, arrive, complete — all via REST API.",
      href: "/driver/signup",
      cta: lang === "id" ? "Lihat Driver Flow" : "View Driver Flow",
    },
    {
      icon: "🧑",
      title: "Passenger API",
      desc: lang === "id" ? "Order ride, bayar, track real-time — tanpa auth, langsung jalan." : "Create rides, pay, track in real-time — no auth required.",
      href: "/ride",
      cta: lang === "id" ? "Lihat Passenger Flow" : "View Passenger Flow",
    },
    {
      icon: "📡",
      title: "Driver API Reference",
      desc: lang === "id" ? "Dokumentasi teknis lengkap: endpoint, request/response schema, error codes." : "Complete technical docs: endpoint, request/response schemas, error codes.",
      href: "/docs/driver-api",
      cta: lang === "id" ? "Buka API Reference" : "Open API Reference",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative">
      <LangToggle lang={lang} setLang={setLang} />
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">{s.title}</h1>
          <p className="text-white/50 text-lg">{s.sub}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 mb-12">
          {sections.map((x) => (
            <Link key={x.href} href={x.href} className="block group">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 h-full hover:border-green-500/20 hover:bg-white/[0.04] transition-all">
                <div className="text-3xl mb-3">{x.icon}</div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-green-400 transition-colors">{x.title}</h2>
                <p className="text-white/40 text-sm mb-4">{x.desc}</p>
                <span className="text-green-400 text-sm font-medium">{x.cta} →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <h3 className="text-xl font-semibold mb-3">{s.quick}</h3>
          <p className="text-white/40 text-sm mb-6">{s.quickSub}</p>
          <div className="rounded-xl bg-black/50 border border-white/10 p-4 mb-6 font-mono text-sm text-green-400 select-all cursor-pointer">https://gojek-mvp.vercel.app/skill.md</div>
          <div className="flex justify-center gap-3">
            <Link href="/landing"><Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl">{s.landing}</Button></Link>
          </div>
        </div>

        <div className="mt-12 text-center text-white/20 text-sm">{s.footer}</div>
      </div>
    </div>
  );
}
