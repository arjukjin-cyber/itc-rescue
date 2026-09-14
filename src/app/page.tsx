import Link from "next/link";
import {
  AlertTriangle,
  Upload,
  GitCompareArrows,
  MessageCircle,
  CheckCircle2,
  Shield,
  Zap,
  IndianRupee,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white via-teal-50/40 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              <AlertTriangle size={14} />
              April 2026 · GSTR-2B hard block is live
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Stop losing ITC because vendors{" "}
              <span className="text-teal-700">didn&apos;t file GSTR-1</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-700 sm:text-xl sm:leading-relaxed">
              Upload your purchase register and GSTR-2B. ITC Rescue finds every mismatch,
              drafts WhatsApp chases in English &amp; Hindi, and tracks who fixed it —
              built for Indian MSMEs (₹50L–₹5cr).
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-teal-700/25 hover:bg-teal-800 sm:w-auto"
              >
                Start free trial
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-base font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
              >
                Log in · try demo samples
              </Link>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Free trial: 1 reconciliation or 50 invoices · No government API needed
            </p>
          </div>

          {/* Preview card — pulled up so KPI strip peeks above the fold */}
          <div className="mx-auto mt-10 max-w-4xl animate-fade-up delay-200 sm:mt-12">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 text-meta">
                  Reconciliation results · March 2026
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-6">
                {[
                  { label: "Matched", value: "8", tone: "text-emerald-700" },
                  { label: "ITC at risk", value: "3", tone: "text-red-600" },
                  { label: "Value mismatch", value: "1", tone: "text-amber-700" },
                  { label: "Unclaimed", value: "1", tone: "text-sky-700" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                    <div className={`text-3xl font-bold ${s.tone}`}>{s.value}</div>
                    <div className="mt-1 text-meta font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 bg-red-50 px-6 py-4 text-sm text-red-800">
                <strong>₹86,400 ITC at risk</strong> — vendors missing from GSTR-2B. Chase them before filing GSTR-3B.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="landing-section mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            The unpaid work every GST filer knows
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">
            From April 2026, claimed ITC that exceeds GSTR-2B can hard-block your GSTR-3B.
            Your books are fine — the vendor never uploaded the invoice in GSTR-1.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3 sm:mt-12 sm:gap-6">
          {[
            {
              icon: AlertTriangle,
              title: "3B gets blocked",
              desc: "Claimed ITC > auto-populated 2B? Portal refuses the return. Cash flow stalls until vendors fix it.",
            },
            {
              icon: MessageCircle,
              title: "Chase is manual hell",
              desc: "Excel diffs, WhatsApp forwards, missed follow-ups. Hours of unpaid work every month for ₹50L–₹5cr businesses.",
            },
            {
              icon: IndianRupee,
              title: "ITC sits on the table",
              desc: "Invoices in 2B but not in books = missed credit. Mismatched values = disputes. Nobody has time to reconcile properly.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <card.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="landing-section border-y border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How it works</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              Three steps. No GST portal login. Works offline with your Excel exports.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3 sm:mt-12 sm:gap-8">
            {[
              {
                step: "01",
                icon: Upload,
                title: "Upload files",
                desc: "Drop your purchase register and GSTR-2B (Excel/CSV). Sample files included so you can demo instantly.",
              },
              {
                step: "02",
                icon: GitCompareArrows,
                title: "Smart match",
                desc: "We normalize invoice numbers, match GSTIN + invoice# + date (±1 day), and classify: matched, ITC at risk, unclaimed, value mismatch.",
              },
              {
                step: "03",
                icon: MessageCircle,
                title: "Chase & track",
                desc: "Copy English or Hindi WhatsApp messages. Move vendors across Pending → Fixed → Still blocked on your status board.",
              },
            ].map((s) => (
              <div key={s.step} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="mb-3 text-xs font-bold tracking-widest text-teal-600">{s.step}</div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white">
                  <s.icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="landing-section mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Simple MSME pricing</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">
            Soft paywall after free trial. Razorpay checkout coming soon — upgrade in Settings for now.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2 sm:mt-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-600">Starter</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-slate-900">₹999</span>
              <span className="text-slate-600">/mo</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              {[
                "Unlimited reconciliations",
                "Up to 500 invoices / month",
                "WhatsApp EN + HI templates",
                "Status board",
                "Email support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 block rounded-xl border border-slate-300 py-3 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Start free trial
            </Link>
          </div>
          <div className="relative rounded-2xl border-2 border-teal-600 bg-white p-8 shadow-lg shadow-teal-100">
            <div className="absolute -top-3 right-6 rounded-full bg-teal-700 px-3 py-0.5 text-xs font-bold text-white">
              Popular
            </div>
            <div className="text-sm font-semibold uppercase tracking-wide text-teal-700">Growth</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-slate-900">₹2,499</span>
              <span className="text-slate-600">/mo</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              {[
                "Everything in Starter",
                "Unlimited invoices",
                "Multi-GSTIN (coming soon)",
                "Priority chase reminders",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 block rounded-xl bg-teal-700 py-3 text-center text-sm font-semibold text-white hover:bg-teal-800"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 sm:flex-row sm:justify-center sm:gap-16 sm:px-6">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Shield size={18} className="text-teal-700" /> Your files stay in-browser for MVP
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Zap size={18} className="text-teal-700" /> Demo works offline with sample CSVs
          </div>
        </div>
      </section>

      {/* CTA — tighter gap after pricing */}
      <section className="bg-teal-800 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-white">Rescue your ITC before the next 3B due date</h2>
          <p className="mt-3 text-base leading-relaxed text-teal-100">
            Sign up in 30 seconds. Run a recon with our sample files — no GSTN credentials required.
          </p>
          <Link
            href="/signup"
            className="mt-7 inline-flex rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-teal-800 shadow hover:bg-teal-50"
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-600 sm:flex-row sm:px-6">
          <div>© {new Date().getFullYear()} ITC Rescue · Built for Indian MSMEs</div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-teal-700">Log in</Link>
            <Link href="/signup" className="hover:text-teal-700">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
