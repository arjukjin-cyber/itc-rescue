"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Upload, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { HelpTip } from "@/components/HelpTip";
import { RiskTable, atRiskTotal, isActionable, sortForAction, useChaseRows } from "@/components/RiskTable";
import { Toast, useToast } from "@/components/Toast";
import { getSettings } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { formatINR } from "@/lib/reconcile";
import type { MatchResult, ReconSummary } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [company, setCompany] = useState("My Company");
  const { toast, show, dismiss } = useToast();
  const { setChase, statusById, pendingCount, resolve, busy } = useChaseRows(show);

  useEffect(() => {
    let cancelled = false;
    setCompany(getSettings().companyName || "My Company");
    (async () => {
      const [recon, chase] = await Promise.all([fetchReconState(), fetchChaseItems()]);
      if (cancelled) return;
      if (recon.authError) {
        router.replace("/login");
        return;
      }
      setSummary(recon.summary);
      setResults(recon.results);
      if (!chase.authError) setChase(chase.items);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, setChase]);

  const actionRows = useMemo(() => sortForAction(results.filter(isActionable)), [results]);
  const riskAmount = useMemo(() => atRiskTotal(results), [results]);

  if (!loaded) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <div className="card h-36 animate-pulse" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-24 animate-pulse" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return <DashboardEmpty />;

  const atRiskCount = results.filter((r) => r.category === "itc_at_risk").length;
  const mismatchCount = results.filter((r) => r.category === "value_mismatch").length;
  const chaseLabel = `Chase ${pendingCount} vendor${pendingCount === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Hero: ₹ ITC at risk (at-risk rows only) + one primary action */}
      <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-w-0">
          <div className="hero-label">ITC at risk</div>
          <div className="hero-amount mt-1">{formatINR(riskAmount)}</div>
          <div className="helper-line">
            <span>
              {atRiskCount} invoice{atRiskCount === 1 ? "" : "s"} missing from GSTR-2B · {mismatchCount} value
              mismatch{mismatchCount === 1 ? "" : "es"}
            </span>
            <HelpTip text="Total of ITC-at-risk invoices only, same as the at-risk CSV. Value mismatches are listed below but not added to this number." />
          </div>
        </div>
        {pendingCount > 0 ? (
          <Link href="/chase" className="btn btn-pri btn-lg shrink-0">
            <MessageCircle size={16} aria-hidden /> {chaseLabel}
          </Link>
        ) : (
          <Link href="/status" className="btn btn-lg shrink-0">
            <ListChecks size={16} aria-hidden /> Open status board
          </Link>
        )}
      </section>

      {/* Action steps */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StepDone title="Upload purchase register" sub={`${summary.totalBooks} invoices`} action="Replace" />
        <StepDone title="Upload GSTR-2B" sub={`${summary.totalGstr2b} invoices`} action="Replace" />
        <StepDone title="Run recon" sub={`${summary.totalBooks} books · ${summary.totalGstr2b} in 2B`} action="Run again" />
        <Link href="/chase" className={`card block p-4 transition hover:shadow-sm ${pendingCount > 0 ? "card-accent" : ""}`}>
          <div className="flex items-center justify-between">
            {pendingCount > 0 ? (
              <span className="pill pill-risk">{pendingCount} pending</span>
            ) : (
              <span className="pill pill-ok">
                <Check size={12} aria-hidden /> All chased
              </span>
            )}
          </div>
          <div className="mt-3 font-semibold" style={{ color: "var(--color-accent)" }}>
            {pendingCount > 0 ? chaseLabel : "Vendor chase"}
          </div>
          <div className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            WhatsApp · EN + HI
          </div>
        </Link>
      </div>

      {/* At-risk rows, then value-mismatch rows, with inline actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
          At-risk invoices
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill pill-ok">Matched {summary.matched}</span>
          <span className="pill pill-warn">Mismatch {summary.valueMismatch}</span>
          <span className="pill pill-info">Unclaimed {summary.unclaimed}</span>
          <Link href="/reconcile" className="link-accent ml-2 text-sm">
            View all →
          </Link>
        </div>
      </div>
      {actionRows.length ? (
        <RiskTable rows={actionRows} statusById={statusById} busy={busy} company={company} onResolve={resolve} />
      ) : (
        <EmptyState
          icon={Check}
          title="No invoices need chasing in this recon."
          actionLabel="View all results"
          actionHref="/reconcile"
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function StepDone({ title, sub, action }: { title: string; sub: string; action: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="pill pill-ok">
          <Check size={12} aria-hidden /> Done
        </span>
        <Link href="/reconcile" className="link-accent text-[0.8125rem]">
          {action}
        </Link>
      </div>
      <div className="mt-3 font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </div>
      <div className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {sub}
      </div>
    </div>
  );
}

const STEPS: [string, string][] = [
  ["Upload purchase register", "Tally, Zoho or Excel"],
  ["Upload GSTR-2B", "From the GST portal"],
  ["Run recon", "One click"],
  ["Chase vendors", "WhatsApp · EN + HI"],
];

function DashboardEmpty() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="card px-6 py-12 text-center sm:px-8 sm:py-14">
        <div
          className="mx-auto grid h-12 w-12 place-items-center"
          style={{ borderRadius: "var(--radius-md)", backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <Upload size={22} aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--color-text)" }}>
          Upload your purchase register to see how much ITC is at risk.
        </h1>
        <div className="mt-6">
          <Link href="/reconcile" className="btn btn-pri btn-lg">
            <Upload size={16} aria-hidden /> Upload purchase register
          </Link>
        </div>
        <div className="mt-4 text-[0.8125rem]">
          <Link href="/reconcile?sample=1" className="link-accent">
            Try with sample files
          </Link>
        </div>
      </section>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, sub], i) => {
          const on = i === 0;
          return (
            <li key={title} className={`card p-4 ${on ? "card-accent" : ""}`} style={on ? undefined : { opacity: 0.6 }}>
              <div
                className="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold"
                style={
                  on
                    ? { backgroundColor: "var(--color-accent)", color: "#fff" }
                    : { backgroundColor: "var(--color-bg-subtle)", color: "var(--color-text-muted)" }
                }
              >
                {i + 1}
              </div>
              <div className="mt-3 font-semibold" style={{ color: on ? "var(--color-accent)" : "var(--color-text)" }}>
                {title}
              </div>
              <div className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {sub}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
