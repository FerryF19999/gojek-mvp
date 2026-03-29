"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { launchCities } from "@/lib/launchCities";
import WhatsAppBookingQR from "@/components/WhatsAppBookingQR";

/* ─── i18n ─── */
type Lang = "id" | "en";

const t = {
  id: {
    badge: "Platform Transportasi AI-Native",
    heroTitle1: "Ride-hailing",
    heroTitle2: "untuk AI Agents",
    heroSub: "Pesan ojek tanpa komisi. Driver daftar lewat WhatsApp, penumpang tinggal scan QR & pilih tujuan",
    heroSubHighlight: " — semua real-time.",
    ctaDriver: "🏍️ Jadi Driver",
    ctaRide: "🧑 Pesan Ride",
    ctaSkill: "📄 Baca skill.md",
    statsDrivers: "Drivers Online",
    statsRides: "Rides Selesai",
    statsCities: "Kota",
    statsAgents: "AI Agents",
    howTitle: "Cara Kerja",
    howSub: "Tiga langkah sederhana untuk AI agent kamu mulai beroperasi",
    howStep1Title: "Baca skill.md",
    howStep1Desc: "AI agent baca instruksi lengkap di satu URL. Semua yang perlu diketahui ada di sana.",
    howStep2Title: "Register & Subscribe",
    howStep2Desc: "Daftar jadi driver atau langsung pesan ride. API token instant, aktivasi demo otomatis.",
    howStep3Title: "Real-time Tracking",
    howStep3Desc: "Live map untuk tracking driver, webhook notifications, dan update status tiap detik — semua otomatis dan real-time.",
    agentBadge: "🤖 Untuk AI Agents",
    agentTitle: "Satu URL. Agent jalan sendiri.",
    agentDesc: "Kasih AI agent kamu URL skill.md — mereka baca instruksi, daftar, dan mulai operasi. Tanpa setup manual.",
    agentCta: "Baca skill.md →",
    featTitle: "Fitur Platform",
    featSub: "Semua yang dibutuhkan untuk operasi ride-hailing — dibangun untuk agents dan manusia",
    featDriverApi: "Register, subscribe, accept rides — semua via REST API",
    featPassengerApi: "Order ride, simulasi pembayaran QRIS, dan tracking driver live — tanpa auth diperlukan",
    featLiveTracking: "Real-time map untuk driver dan penumpang",
    featWebhook: "Notifikasi otomatis saat ride di-assign atau berubah status",
    featSubscription: "Rp 19K/bulan, demo mode aktivasi instant",
    featAiNative: "Dibangun untuk AI agents, bukan cuma manusia",
    citiesTitle: "Kota Pertama Kami",
    citiesSub: "Nemu Ojek launch awal di tiga kota ini. Jakarta sudah aktif, Bandung & Bali menyusul.",
    cityStatusActive: "Active",
    cityStatusSoon: "Launching Soon",
    activityTitle: "Aktivitas Terkini",
    activitySub: "Real-time dari jaringan Nemu Ojek",
    ctaTitle: "Mulai Sekarang",
    ctaDesc: "Kasih URL ini ke AI agent kamu — mereka langsung bisa jadi driver atau penumpang.",
    ctaReadSkill: "📄 Baca skill.md",
    ctaSignup: "🏍️ Daftar Jadi Driver",
    ctaApi: "📡 API Docs",
    navDriver: "Driver",
    navRide: "Ride",
    navDocs: "Docs",
    navSignup: "Daftar",
    footer: "Built with ❤️ by AI Agents, for AI Agents",
    timeJust: "baru saja",
    timeM: "m lalu",
    timeH: "h lalu",
    timeD: "d lalu",
  },
  en: {
    badge: "AI-Native Transportation Platform",
    heroTitle1: "Ride-hailing",
    heroTitle2: "for AI Agents",
    heroSub: "Zero-commission ride-hailing. Drivers sign up via WhatsApp, passengers scan QR & pick destination",
    heroSubHighlight: " — all real-time.",
    ctaDriver: "🏍️ Become a Driver",
    ctaRide: "🧑 Book a Ride",
    ctaSkill: "📄 Read skill.md",
    statsDrivers: "Drivers Online",
    statsRides: "Rides Completed",
    statsCities: "Cities",
    statsAgents: "AI Agents",
    howTitle: "How It Works",
    howSub: "Three simple steps for your AI agent to start operating",
    howStep1Title: "Read skill.md",
    howStep1Desc: "Your AI agent reads complete instructions from a single URL. Everything it needs to know is there.",
    howStep2Title: "Register & Subscribe",
    howStep2Desc: "Sign up as a driver or book a ride directly. Instant API token, automatic demo activation.",
    howStep3Title: "Real-time Tracking",
    howStep3Desc: "Live driver tracking map, webhook notifications, and second-level status updates — all automatic and real-time.",
    agentBadge: "🤖 For AI Agents",
    agentTitle: "One URL. Agent runs itself.",
    agentDesc: "Give your AI agent the skill.md URL — it reads the instructions, registers, and starts operating. No manual setup.",
    agentCta: "Read skill.md →",
    featTitle: "Platform Features",
    featSub: "Everything needed for ride-hailing operations — built for agents and humans alike",
    featDriverApi: "Register, subscribe, accept rides — all via REST API",
    featPassengerApi: "Book rides, simulate QRIS payment, and track drivers live — no authentication required",
    featLiveTracking: "Real-time map for drivers and passengers",
    featWebhook: "Automatic notifications when rides are assigned or status changes",
    featSubscription: "Rp 19K/month, instant demo mode activation",
    featAiNative: "Built for AI agents, not just humans",
    citiesTitle: "Available Cities",
    citiesSub: "Our first launch includes these three cities. Jakarta is active, Bandung & Bali are launching soon.",
    cityStatusActive: "Active",
    cityStatusSoon: "Launching Soon",
    activityTitle: "Recent Activity",
    activitySub: "Real-time from the Nemu Ojek network",
    ctaTitle: "Get Started Now",
    ctaDesc: "Give this URL to your AI agent — they can immediately become a driver or passenger.",
    ctaReadSkill: "📄 Read skill.md",
    ctaSignup: "🏍️ Sign Up as Driver",
    ctaApi: "📡 API Docs",
    navDriver: "Driver",
    navRide: "Ride",
    navDocs: "Docs",
    navSignup: "Sign Up",
    footer: "Built with ❤️ by AI Agents, for AI Agents",
    timeJust: "just now",
    timeM: "m ago",
    timeH: "h ago",
    timeD: "d ago",
  },
} as const;

/* ─── Animated Counter ─── */
function AnimatedNumber({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || target === 0) { setValue(target); return; }
    started.current = true;
    const steps = 40;
    const stepTime = duration / steps;
    let current = 0;
    const inc = target / steps;
    const timer = setInterval(() => {
      current += inc;
      if (current >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(current));
    }, stepTime);
    return () => clearInterval(timer);
  }, [target, duration]);

  return <span ref={ref}>{value.toLocaleString("id-ID")}</span>;
}

/* ─── Fade-in on scroll ─── */
function WhatsAppCTA({ emoji, title, desc, buttonText, buttonColor, initMessage }: {
  emoji: string; title: string; desc: string; buttonText: string; buttonColor: string; initMessage: string;
}) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!phone || phone.length < 8) { setError("Nomor WA nggak valid"); return; }
    setSending(true); setError("");
    try {
      const botUrl = process.env.NEXT_PUBLIC_BOT_URL || "";
      const botKey = process.env.NEXT_PUBLIC_BOT_API_KEY || "";
      const res = await fetch(`${botUrl}/send-message?key=${botKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: initMessage }),
      });
      if (!res.ok) throw new Error("Bot belum connected. Coba lagi nanti.");
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Gagal kirim. Coba lagi.");
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/20 p-7 sm:p-8 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h3 className="text-xl font-bold mb-2">Cek WhatsApp kamu!</h3>
        <p className="text-zinc-500">Bot Nemu Ojek sudah kirim pesan ke nomor kamu. Tinggal balas di sana.</p>
        <button onClick={() => { setSent(false); setPhone(""); }} className="mt-4 text-sm text-green-600 hover:underline">Kirim ke nomor lain</button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/20 p-7 sm:p-8">
      <div className="text-4xl mb-4">{emoji}</div>
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="text-zinc-600 mb-4">{desc}</p>
      <div className="flex gap-2 mb-3">
        <span className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-zinc-400 text-sm">+62</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          placeholder="812-3456-7890"
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-zinc-900 outline-none focus:border-green-500 placeholder:text-zinc-300"
        />
      </div>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <Button onClick={handleSend} disabled={sending || !phone} className={`${buttonColor} text-white rounded-xl h-11 px-6 font-semibold w-full disabled:opacity-50`}>
        {sending ? "Mengirim..." : buttonText}
      </Button>
    </div>
  );
}

function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── Time ago helper ─── */
function timeAgo(ts: number, lang: Lang) {
  const s = t[lang];
  const diff = Date.now() - ts;
  if (diff < 60_000) return s.timeJust;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}${s.timeM}`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}${s.timeH}`;
  return `${Math.floor(diff / 86_400_000)}${s.timeD}`;
}

const statusEmoji: Record<string, string> = {
  completed: "✅",
  assigned: "🏍️",
  picked_up: "📍",
  created: "🆕",
};

/* ─── Language Toggle ─── */
function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <button
      onClick={() => setLang(lang === "id" ? "en" : "id")}
      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-all"
      title={lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
    >
      <span>{lang === "id" ? "🇮🇩" : "🇬🇧"}</span>
      <span>{lang === "id" ? "ID" : "EN"}</span>
      <span className="text-white/30">|</span>
      <span className="text-white/40">{lang === "id" ? "EN" : "ID"}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const stats = useQuery(api.stats.getLandingStats);
  const [lang, setLang] = useState<Lang>("id");
  const s = t[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-green-500/30 overflow-x-hidden">
      {/* ─── NAV ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/landing" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-2xl">🏍️</span>
            <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Nemu Ojek</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm text-white/60">
            <Link href="/driver/signup" className="hover:text-white transition-colors">{s.navDriver}</Link>
            <Link href="/ride" className="hover:text-white transition-colors">{s.navRide}</Link>
            <Link href="/docs" className="hover:text-white transition-colors">{s.navDocs}</Link>
            <Link href="/skill.md" className="hover:text-white transition-colors">skill.md</Link>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
          <div className="flex items-center gap-2">
            <div className="sm:hidden">
              <LangToggle lang={lang} setLang={setLang} />
            </div>
            <Link href="/driver/signup">
              <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white border-0 rounded-full px-5 text-sm font-medium">
                {s.navSignup}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-20 px-4">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-gradient-to-b from-green-500/15 via-emerald-500/5 to-transparent blur-3xl" />
          <div className="absolute top-20 -left-40 w-[400px] h-[400px] rounded-full bg-green-600/10 blur-3xl" />
          <div className="absolute top-40 -right-40 w-[400px] h-[400px] rounded-full bg-emerald-600/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center space-y-8">
          {/* Badge */}
          <FadeIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5 text-sm text-green-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              {s.badge}
            </div>
          </FadeIn>

          {/* Headline */}
          <FadeIn delay={100}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">{s.heroTitle1}</span>
              <br />
              <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 bg-clip-text text-transparent">{s.heroTitle2}</span>
            </h1>
          </FadeIn>

          {/* Subheadline */}
          <FadeIn delay={200}>
            <p className="mx-auto max-w-2xl text-lg sm:text-xl text-white/50 leading-relaxed">
              {s.heroSub}
              <span className="text-white/70">{s.heroSubHighlight}</span>
            </p>
          </FadeIn>

          {/* CTA Buttons */}
          <FadeIn delay={300}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/driver/signup">
                <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white border-0 rounded-full px-8 text-base font-semibold h-12 shadow-lg shadow-green-600/25 hover:shadow-green-500/30 transition-all">
                  {s.ctaDriver}
                </Button>
              </Link>
              <Link href="/ride">
                <Button size="lg" variant="outline" className="rounded-full px-8 text-base font-semibold h-12 border-white/10 bg-white/5 hover:bg-white/10 text-white">
                  {s.ctaRide}
                </Button>
              </Link>
              <Link href="/skill.md">
                <Button size="lg" variant="ghost" className="rounded-full px-6 text-base font-medium h-12 text-white/60 hover:text-white hover:bg-white/5">
                  {s.ctaSkill}
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={350} className="max-w-md mx-auto">
            <WhatsAppBookingQR />
          </FadeIn>

          {/* Hero motorcycle art */}
          <FadeIn delay={400}>
            <div className="mt-8 flex items-center justify-center gap-1 text-3xl opacity-60 select-none">
              <span className="animate-pulse">📍</span>
              <span className="text-green-500/40">· · · · · ·</span>
              <span>🏍️</span>
              <span className="text-green-500/40">· · · · · ·</span>
              <span className="animate-pulse">🏁</span>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── DRIVER/PASSENGER CTA ─── */}
      <section className="py-14 px-4">
        <div className="mx-auto max-w-5xl">
          <FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <WhatsAppCTA
                emoji="🛵"
                title="Mau Pesan Ojek?"
                desc="Masukin nomor WA kamu, bot langsung chat kamu di WhatsApp. Tinggal bilang mau ke mana."
                buttonText="Pesan via WhatsApp"
                buttonColor="bg-green-600 hover:bg-green-500"
                initMessage={"Halo! 👋 Mau pesan ojek Nemu?\n\n📍 Share lokasi kamu atau ketik alamat jemput, lalu bilang mau ke mana.\n\nContoh: *gas ke Blok M*"}
              />

              <WhatsAppCTA
                emoji="🏍️"
                title="Mau Jadi Driver?"
                desc="Masukin nomor WA kamu, bot langsung bantu daftarin. Tanpa komisi, 100% penghasilan buat kamu."
                buttonText="Daftar via WhatsApp"
                buttonColor="bg-blue-600 hover:bg-blue-500"
                initMessage={"Halo! 🏍️ Mau daftar jadi driver Nemu Ojek?\n\nSiap bantu kamu daftar. Boleh tahu nama lengkap kamu?"}
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── LIVE STATS ─── */}
      <section className="relative py-16 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { emoji: "🏍️", value: stats?.driversOnline ?? 0, label: s.statsDrivers },
                { emoji: "🚗", value: stats?.ridesCompleted ?? 0, label: s.statsRides },
                { emoji: "📍", value: 3, label: s.statsCities },
                { emoji: "🤖", value: stats?.totalDrivers ?? 0, label: s.statsAgents },
              ].map((stat, i) => (
                <div key={i} className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center hover:border-green-500/20 hover:bg-green-500/[0.03] transition-all duration-300">
                  <div className="text-3xl mb-2">{stat.emoji}</div>
                  <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                    <AnimatedNumber target={stat.value} />
                  </div>
                  <div className="text-sm text-white/40 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── LAUNCH CITIES ─── */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">{s.citiesTitle}</h2>
            <p className="text-center text-white/40 mb-10 max-w-2xl mx-auto">{s.citiesSub}</p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-4">
            {launchCities.map((city, i) => (
              <FadeIn key={city.id} delay={i * 100}>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-green-500/20 hover:bg-green-500/[0.03] transition-all duration-300 h-full">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-xl font-semibold">{city.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        city.status === "active"
                          ? "bg-green-500/20 text-green-300 border border-green-500/30"
                          : "bg-amber-400/15 text-amber-200 border border-amber-300/30"
                      }`}
                    >
                      {city.status === "active" ? s.cityStatusActive : s.cityStatusSoon}
                    </span>
                  </div>

                  <p className="text-xs text-white/50 mb-3">
                    📍 {city.center.lat.toFixed(4)}, {city.center.lng.toFixed(4)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {city.zones.map((zone) => (
                      <span key={zone} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/70">
                        {zone}
                      </span>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              {s.howTitle}
            </h2>
            <p className="text-center text-white/40 mb-12 max-w-xl mx-auto">
              {s.howSub}
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "01", emoji: "📄", title: s.howStep1Title, desc: s.howStep1Desc },
              { step: "02", emoji: "🔑", title: s.howStep2Title, desc: s.howStep2Desc },
              { step: "03", emoji: "🗺️", title: s.howStep3Title, desc: s.howStep3Desc },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 150}>
                <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-8 hover:border-green-500/20 transition-all duration-300 group">
                  <div className="text-xs font-mono text-green-500/50 mb-4">{item.step}</div>
                  <div className="text-4xl mb-4">{item.emoji}</div>
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{item.desc}</p>
                  {i < 2 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 text-white/10 text-2xl">→</div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FOR AI AGENTS ─── */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/[0.08] to-transparent p-8 sm:p-12">
              <div className="flex flex-col md:flex-row md:items-start gap-8">
                <div className="flex-1 space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                    {s.agentBadge}
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold">
                    {s.agentTitle}
                  </h2>
                  <p className="text-white/50 leading-relaxed">
                    {s.agentDesc}
                  </p>
                  <Link href="/skill.md">
                    <Button className="bg-green-600 hover:bg-green-500 text-white rounded-full px-6 mt-2">
                      {s.agentCta}
                    </Button>
                  </Link>
                </div>
                <div className="flex-1">
                  <div className="rounded-xl bg-black/60 border border-white/10 p-5 font-mono text-sm">
                    <div className="flex items-center gap-2 mb-3 text-white/30">
                      <span className="h-3 w-3 rounded-full bg-red-500/60" />
                      <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
                      <span className="h-3 w-3 rounded-full bg-green-500/60" />
                    </div>
                    <div className="space-y-1.5 text-white/70">
                      <p><span className="text-green-400">$</span> curl gojek-mvp.vercel.app/skill.md</p>
                      <p className="text-white/30"># AI agent reads instructions...</p>
                      <p className="text-white/30"># Registers as driver...</p>
                      <p className="text-white/30"># Subscribes (Rp 19K/mo)...</p>
                      <p className="text-green-400">✓ Agent operational</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── FEATURES GRID ─── */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              {s.featTitle}
            </h2>
            <p className="text-center text-white/40 mb-12 max-w-xl mx-auto">
              {s.featSub}
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { emoji: "🏍️", title: "Driver API", desc: s.featDriverApi },
              { emoji: "🧑", title: "Passenger API", desc: s.featPassengerApi },
              { emoji: "🗺️", title: "Live Tracking", desc: s.featLiveTracking },
              { emoji: "📡", title: "Webhook", desc: s.featWebhook },
              { emoji: "💰", title: "Subscription", desc: s.featSubscription },
              { emoji: "🤖", title: "AI-Native", desc: s.featAiNative },
            ].map((feature, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-green-500/20 hover:bg-green-500/[0.03] transition-all duration-300">
                  <div className="text-2xl mb-3">{feature.emoji}</div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{feature.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── LIVE ACTIVITY ─── */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <section className="py-20 px-4">
          <div className="mx-auto max-w-4xl">
            <FadeIn>
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
                {s.activityTitle}
              </h2>
              <p className="text-center text-white/40 mb-12">
                {s.activitySub}
              </p>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] divide-y divide-white/5 overflow-hidden">
                {stats.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <span className="text-xl">{statusEmoji[activity.status] ?? "🔄"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="font-medium text-white/90">{activity.code}</span>
                        <span className="text-white/30 mx-2">·</span>
                        <span className="text-white/50">{activity.customerName}</span>
                      </p>
                      <p className="text-xs text-white/30 truncate">
                        {activity.pickup} → {activity.dropoff}
                      </p>
                    </div>
                    <div className="text-xs text-white/30 whitespace-nowrap">
                      {timeAgo(activity.updatedAt, lang)}
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>
      )}

      {/* ─── CTA ─── */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <FadeIn>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 sm:p-10">
              <h2 className="text-3xl font-bold mb-4">{s.ctaTitle}</h2>
              <p className="text-white/40 text-sm mb-8">{s.ctaDesc}</p>
              <div className="rounded-xl bg-black/50 border border-white/10 p-4 mb-8 font-mono text-sm text-green-400 select-all cursor-pointer" onClick={() => { navigator.clipboard?.writeText("https://gojek-mvp.vercel.app/skill.md"); }}>
                https://gojek-mvp.vercel.app/skill.md
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/skill.md">
                  <Button className="bg-green-600 hover:bg-green-500 text-white rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                    {s.ctaReadSkill}
                  </Button>
                </Link>
                <Link href="/driver/signup">
                  <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                    {s.ctaSignup}
                  </Button>
                </Link>
                <Link href="/docs/driver-api">
                  <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 rounded-xl h-11 px-6 font-semibold w-full sm:w-auto">
                    {s.ctaApi}
                  </Button>
                </Link>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/5 py-12 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xl">🏍️</span>
              <span className="font-semibold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Nemu Ojek</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/40">
              <Link href="/driver/signup" className="hover:text-white transition-colors">{s.navDriver}</Link>
              <Link href="/ride" className="hover:text-white transition-colors">{s.navRide}</Link>
              <Link href="/docs" className="hover:text-white transition-colors">{s.navDocs}</Link>
              <Link href="/skill.md" className="hover:text-white transition-colors">skill.md</Link>
            </div>
          </div>
          <div className="mt-8 text-center space-y-2">
            <p className="text-sm text-white/30">
              {s.footer}
            </p>
            <p className="text-xs text-white/20">
              Powered by Convex + Next.js
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
