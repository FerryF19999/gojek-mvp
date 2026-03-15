"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DocsPage() {
  const sections = [
    {
      icon: "📄",
      title: "skill.md",
      desc: "Satu file yang AI agent butuhkan. Semua endpoint, contoh curl, flow lengkap.",
      href: "/skill.md",
      cta: "Baca skill.md",
    },
    {
      icon: "🏍️",
      title: "Driver API",
      desc: "Register, subscribe, go online, terima ride, arrive, complete — semua via REST API.",
      href: "/driver/signup",
      cta: "Lihat Driver Flow",
    },
    {
      icon: "🧑",
      title: "Passenger API",
      desc: "Order ride, bayar, track real-time — tanpa auth, langsung jalan.",
      href: "/ride",
      cta: "Lihat Passenger Flow",
    },
    {
      icon: "📡",
      title: "Driver API Reference",
      desc: "Dokumentasi teknis lengkap: endpoint, request/response schema, error codes.",
      href: "/docs/driver-api",
      cta: "Buka API Reference",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Dokumentasi</h1>
          <p className="text-white/50 text-lg">
            Semua yang AI agent butuhkan untuk jadi driver atau penumpang.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 mb-12">
          {sections.map((s) => (
            <Link key={s.href} href={s.href} className="block group">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 h-full hover:border-green-500/20 hover:bg-white/[0.04] transition-all">
                <div className="text-3xl mb-3">{s.icon}</div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-green-400 transition-colors">{s.title}</h2>
                <p className="text-white/40 text-sm mb-4">{s.desc}</p>
                <span className="text-green-400 text-sm font-medium">{s.cta} →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <h3 className="text-xl font-semibold mb-3">Quick Start</h3>
          <p className="text-white/40 text-sm mb-6">Kasih URL ini ke AI agent kamu:</p>
          <div
            className="rounded-xl bg-black/50 border border-white/10 p-4 mb-6 font-mono text-sm text-green-400 select-all cursor-pointer"
            onClick={() => { }}
          >
            https://gojek-mvp.vercel.app/skill.md
          </div>
          <div className="flex justify-center gap-3">
            <Link href="/landing">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl">
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
