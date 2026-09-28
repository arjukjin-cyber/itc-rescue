import Link from "next/link";
import { AlertTriangle, MessageCircle, IndianRupee, Upload, GitCompareArrows, Send, Shield, Zap } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const PROBLEMS = [
  {
    icon: AlertTriangle,
    title: "GSTR-3B gets blocked",
    desc: "Claimed ITC above auto-populated 2B stops the return until vendors fix it.",
  },
  {
    icon: MessageCircle,
    title: "Chasing is manual",
    desc: "Excel diffs, WhatsApp forwards and missed follow-ups, every month.",
  },
  {
    icon: IndianRupee,
    title: "Credit sits on the table",
    desc: "Invoices in 2B but not in books are ITC you never claim.",
  },
];

const STEPS = [
  { icon: Upload, title: "Upload", desc: "Purchase register + GSTR-2B, Excel or CSV." },
  { icon: GitCompareArrows, title: "Match", desc: "Matched, ITC at risk, value mismatch, unclaimed." },
  { icon: Send, title: "Chase", desc: "WhatsApp in English or Hindi, then track Pending → Fixed." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <Navbar />

      {/* Hero: H1, one sub-line, one primary CTA, real product frame */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        {/* UX-08: approved H1, one sub-line, one Large Primary, meta line. No pill, no demo CTA. */}
        <div className="mx-auto max-w-[640px] text-center">
          <h1
            className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[40px]"
            style={{ color: "var(--color-ink)" }}
          >
            Catch the mismatch before the notice.
          </h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-[16px]" style={{ color: "var(--color-text-2)" }}>
            Match your purchase register with GSTR-2B and see which vendors to chase.
          </p>
          <div className="hero-cta-sticky mt-6 flex justify-center">
            <Link href="/signup" className="btn btn-pri btn-lg w-full sm:w-auto">
              Start free
            </Link>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-3)" }}>
            1 free reconciliation · No card · No GST portal login
          </p>
        </div>

        <figure className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
          {/* Real v1 dashboard (sample data), captured from the app. */}
          <img
            src="/landing/dashboard-v1.png"
            alt="ITC Rescue dashboard: ₹86,400.00 ITC at risk across 3 invoices, GSTR-3B countdown, and a Needs action table with Chase and Resolve on each row"
            width={1280}
            height={800}
            className="block h-auto w-full"
          />
        </figure>
      </section>

      <section id="problem" className="landing-section border-t py-14" style={{ borderColor: "var(--color-line)" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: "var(--color-ink)" }}>
            The unpaid work every GST filer knows
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
                <p.icon size={16} strokeWidth={1.75} style={{ color: "var(--color-text-3)" }} aria-hidden />
                <h3 className="mt-2 text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
                  {p.title}
                </h3>
                <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-2)" }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="landing-section border-t py-14" style={{ borderColor: "var(--color-line)" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: "var(--color-ink)" }}>
            How it works
          </h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
                <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: "var(--color-text-3)" }}>
                  <s.icon size={15} strokeWidth={1.75} aria-hidden /> Step {i + 1}
                </div>
                <h3 className="mt-2 text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
                  {s.title}
                </h3>
                <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-2)" }}>
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust (#29 copy) */}
      <section className="border-t py-10" style={{ borderColor: "var(--color-line)" }}>
        <div
          className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-[13px] sm:flex-row sm:gap-10 sm:px-6"
          style={{ color: "var(--color-text-2)" }}
        >
          <div className="flex items-start gap-2">
            <Shield size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-3)" }} aria-hidden />
            <span>
              Files are read in your browser. Only match results (GSTIN, invoice no., tax) are saved to your account.{" "}
              <Link href="/privacy" className="link-accent">
                Privacy
              </Link>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-3)" }} aria-hidden />
            Demo works offline with sample CSVs
          </div>
        </div>
      </section>

      <footer className="border-t py-6" style={{ borderColor: "var(--color-line)" }}>
        <div
          className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-[12px] sm:flex-row sm:px-6"
          style={{ color: "var(--color-text-3)" }}
        >
          <div>© {new Date().getFullYear()} ITC Rescue · Built for Indian MSMEs</div>
          <div className="flex gap-4">
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
