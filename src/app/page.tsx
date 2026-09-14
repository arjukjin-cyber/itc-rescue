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

const PREVIEW_STATS: {
  label: string;
  value: string;
  fg: string;
  bg: string;
}[] = [
  {
    label: "Matched",
    value: "8",
    fg: "var(--color-status-ok-fg)",
    bg: "var(--color-status-ok-bg)",
  },
  {
    label: "ITC at risk",
    value: "3",
    fg: "var(--color-status-risk-fg)",
    bg: "var(--color-status-risk-bg)",
  },
  {
    label: "Value mismatch",
    value: "1",
    fg: "var(--color-status-warn-fg)",
    bg: "var(--color-status-warn-bg)",
  },
  {
    label: "Unclaimed",
    value: "1",
    fg: "var(--color-status-info-fg)",
    bg: "var(--color-status-info-bg)",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg-muted)" }}>
      <Navbar />

      {/* Hero — no decorative gradients; high-contrast H1 + filled accent CTA */}
      <section
        className="relative overflow-hidden border-b"
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <div
              className="mb-5 inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold"
              style={{
                borderRadius: "9999px",
                border: "1px solid color-mix(in srgb, var(--color-status-warn-fg) 28%, transparent)",
                backgroundColor: "var(--color-status-warn-bg)",
                color: "var(--color-status-warn-fg)",
              }}
            >
              <AlertTriangle size={14} />
              April 2026 · GSTR-2B hard block is live
            </div>
            <h1
              className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
              style={{ color: "var(--color-text)" }}
            >
              Stop losing ITC because vendors{" "}
              <span style={{ color: "var(--color-accent)" }}>didn&apos;t file GSTR-1</span>
            </h1>
            <p
              className="mt-5 text-lg leading-relaxed sm:text-xl sm:leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Upload your purchase register and GSTR-2B. ITC Rescue finds every mismatch,
              drafts WhatsApp chases in English &amp; Hindi, and tracks who fixed it —
              built for Indian MSMEs (₹50L–₹5cr).
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="btn-accent inline-flex w-full items-center justify-center px-8 py-3.5 text-base font-semibold shadow-md sm:w-auto"
              >
                Start free trial
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center px-8 py-3.5 text-base font-semibold sm:w-auto"
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-strong)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text)",
                }}
              >
                Log in · try demo samples
              </Link>
            </div>
            <div
              className="mt-5 inline-flex max-w-xl flex-col items-center gap-1 px-4 py-2.5 text-sm sm:flex-row sm:gap-2"
              style={{
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-accent-ring)",
                backgroundColor: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              <span className="font-semibold">Waitlist open</span>
              <span className="hidden sm:inline" style={{ color: "var(--color-text-muted)" }}>
                ·
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                Free trial: 1 reconciliation or 50 invoices · No government API needed
              </span>
            </div>
          </div>

          {/* Preview card — KPI strip uses status token map */}
          <div className="mx-auto mt-10 max-w-4xl animate-fade-up delay-200 sm:mt-12">
            <div
              className="overflow-hidden shadow-md"
              style={{
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-muted)",
                }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: "var(--color-status-risk-fg)" }}
                />
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: "var(--color-status-warn-fg)" }}
                />
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: "var(--color-status-ok-fg)" }}
                />
                <span className="ml-2 text-meta">Reconciliation results · March 2026</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-6">
                {PREVIEW_STATS.map((s) => (
                  <div
                    key={s.label}
                    className="p-4 text-center"
                    style={{
                      borderRadius: "var(--radius-md)",
                      border: `1px solid color-mix(in srgb, ${s.fg} 22%, var(--color-border))`,
                      backgroundColor: "var(--color-bg-muted)",
                    }}
                  >
                    <div
                      className="text-3xl font-bold tabular-nums"
                      style={{ color: s.fg }}
                    >
                      {s.value}
                    </div>
                    <div
                      className="mt-1 text-meta font-medium"
                      style={{
                        display: "inline-block",
                        marginTop: "0.35rem",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: s.bg,
                        color: s.fg,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="px-6 py-4 text-sm font-medium"
                style={{
                  borderTop: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-status-risk-bg)",
                  color: "var(--color-status-risk-fg)",
                }}
              >
                <strong>₹86,400 ITC at risk</strong> — vendors missing from GSTR-2B. Chase them
                before filing GSTR-3B.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem — muted zebra band */}
      <section
        id="problem"
        className="landing-section py-16 sm:py-20"
        style={{ backgroundColor: "var(--color-bg-muted)" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--color-text)" }}
          >
            The unpaid work every GST filer knows
          </h2>
          <p
            className="mt-4 text-lg leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
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
              className="p-6 shadow-sm"
              style={{
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center"
                style={{
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                <card.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {card.title}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {card.desc}
              </p>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* How it works — white zebra band */}
      <section
        id="how"
        className="landing-section border-y py-16 sm:py-20"
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className="text-3xl font-bold sm:text-4xl"
              style={{ color: "var(--color-text)" }}
            >
              How it works
            </h2>
            <p
              className="mt-4 text-lg leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
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
              <div
                key={s.step}
                className="relative p-6"
                style={{
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-muted)",
                }}
              >
                <div
                  className="mb-3 text-xs font-bold tracking-widest"
                  style={{ color: "var(--color-accent)" }}
                >
                  {s.step}
                </div>
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center text-white"
                  style={{
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-accent)",
                  }}
                >
                  <s.icon size={20} />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  {s.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — muted zebra band */}
      <section
        id="pricing"
        className="landing-section py-16 sm:py-16"
        style={{ backgroundColor: "var(--color-bg-muted)" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--color-text)" }}
          >
            Simple MSME pricing
          </h2>
          <p
            className="mt-4 text-lg leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            After your free recon, upgrade in Settings to keep going. Paid checkout (Razorpay) ships in the final pre-launch update.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2 sm:mt-12">
          <div
            className="p-8 shadow-sm"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <div
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Starter
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold" style={{ color: "var(--color-text)" }}>
                ₹999
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>/mo</span>
            </div>
            <ul
              className="mt-6 space-y-3 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {[
                "Unlimited reconciliations",
                "Up to 500 invoices / month",
                "WhatsApp EN + HI templates",
                "Status board",
                "Email support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--color-accent)" }}
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 block py-3 text-center text-sm font-semibold"
              style={{
                borderRadius: "var(--radius-md)",
                border: "1.5px solid var(--color-border-strong)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
              }}
            >
              Start free trial
            </Link>
          </div>
          <div
            className="relative p-8 shadow-md"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--color-accent)",
              backgroundColor: "var(--color-accent-soft)",
            }}
          >
            <div
              className="absolute -top-3 right-6 px-3 py-0.5 text-xs font-bold text-white"
              style={{
                borderRadius: "9999px",
                backgroundColor: "var(--color-accent)",
              }}
            >
              Popular
            </div>
            <div
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-accent)" }}
            >
              Growth
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold" style={{ color: "var(--color-text)" }}>
                ₹2,499
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>/mo</span>
            </div>
            <ul
              className="mt-6 space-y-3 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {[
                "Everything in Starter",
                "Unlimited invoices",
                "Multi-GSTIN (coming soon)",
                "Priority chase reminders",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--color-accent)" }}
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="btn-accent mt-8 block py-3 text-center text-sm font-semibold"
            >
              Start free trial
            </Link>
          </div>
        </div>
        </div>
      </section>

      {/* Trust — white zebra band */}
      <section
        className="border-t py-12"
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 sm:flex-row sm:justify-center sm:gap-16 sm:px-6">
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Shield size={18} style={{ color: "var(--color-accent)" }} /> Your files stay
            in-browser for MVP
          </div>
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Zap size={18} style={{ color: "var(--color-accent)" }} /> Demo works offline with
            sample CSVs
          </div>
        </div>
      </section>

      {/* CTA — solid accent band (not a gradient) */}
      <section className="py-14" style={{ backgroundColor: "var(--color-accent)" }}>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-white">
            Rescue your ITC before the next 3B due date
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/90">
            Sign up in 30 seconds. Run a recon with our sample files — no GSTN credentials
            required.
          </p>
          <Link
            href="/signup"
            className="mt-7 inline-flex px-8 py-3.5 text-base font-semibold shadow"
            style={{
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-accent)",
            }}
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer
        className="border-t py-8"
        style={{
          backgroundColor: "var(--color-bg-muted)",
          borderColor: "var(--color-border)",
        }}
      >
        <div
          className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm sm:flex-row sm:px-6"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <div>© {new Date().getFullYear()} ITC Rescue · Built for Indian MSMEs</div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-[var(--color-accent)]">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-[var(--color-accent)]">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
