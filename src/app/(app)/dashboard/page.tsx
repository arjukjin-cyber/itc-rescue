"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Inbox, Send, SquareKanban, Upload } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { KpiStrip } from "@/components/KpiStrip";
import { ActionTable, ResultTabs, atRiskTotal, filterByTab, useChaseRows, type TabKey } from "@/components/RiskTable";
import { Toast, useToast } from "@/components/Toast";
import { getSettings } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { getGstr3bDue, type Gstr3bDue } from "@/lib/filing";
import { formatIstTimestamp } from "@/lib/format";
import type { MatchResult, ReconSummary } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [company, setCompany] = useState("My Company");
  const [tab, setTab] = useState<TabKey>("action");
  const [lastRecon, setLastRecon] = useState<string | null>(null);
  const { toast, show, dismiss } = useToast();
  const { setChase, statusById, pendingCount, resolve, resolveMany, busy } = useChaseRows(show);

  useEffect(() => {
    let cancelled = false;
    setCompany(getSettings().companyName || "My Company");
    (async () => {
      const [recon, chaseRes] = await Promise.all([fetchReconState(), fetchChaseItems()]);
      if (cancelled) return;
      if (recon.authError) {
        router.replace("/login");
        return;
      }
      setSummary(recon.summary);
      setResults(recon.results);
      if (!chaseRes.authError) setChase(chaseRes.items);
      // "Last recon" = the saved run's created_at from GET /api/recon (#28), shown in IST.
      setLastRecon(recon.summary ? recon.createdAt ?? null : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, setChase]);

  // Sidebar "Filing" block links to /dashboard#filing; the cell only exists after load.
  useEffect(() => {
    if (!loaded || window.location.hash !== "#filing") return;
    document.getElementById("filing")?.scrollIntoView({ block: "center" });
  }, [loaded]);

  const rows = useMemo(() => filterByTab(results, tab), [results, tab]);
  const due = useMemo(() => getGstr3bDue(atRiskTotal(results)), [results]);

  if (!loaded) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-6 w-32 animate-pulse rounded" style={{ backgroundColor: "var(--color-line-2)" }} />
        <div className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "var(--color-line-2)" }} />
        <div className="h-12 animate-pulse rounded-lg" style={{ backgroundColor: "var(--color-line-2)" }} />
      </div>
    );
  }

  if (!summary) return <DashboardEmpty due={due} />;

  const chaseLabel = `Chase ${pendingCount} vendor${pendingCount === 1 ? "" : "s"} on WhatsApp`;
  const meta = [
    lastRecon ? `Last recon ${formatIstTimestamp(lastRecon)}` : null,
    `${summary.totalBooks} invoices in books`,
    `${summary.totalGstr2b} in GSTR-2B`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="page-title">Dashboard</h1>
        <span className="muted">{meta}</span>
      </div>

      <div className="pt-1">
        <KpiStrip results={results} summary={summary} due={due} />
      </div>

      <div className="progress-line">
        <span className="step">
          <CircleCheck aria-hidden /> Purchase register
        </span>
        <span className="step">
          <CircleCheck aria-hidden /> GSTR-2B
        </span>
        <span className="step">
          <CircleCheck aria-hidden /> Recon run
        </span>
        {pendingCount > 0 ? (
          <span className="step" data-current="true">
            <span className="dot dot-accent" aria-hidden /> Chase vendors · {pendingCount} pending
          </span>
        ) : (
          <span className="step">
            <CircleCheck aria-hidden /> Vendors chased
          </span>
        )}
        <div className="flex-1" />
        {pendingCount > 0 ? (
          <Link href="/chase" className="btn btn-pri btn-lg">
            <Send aria-hidden /> {chaseLabel}
          </Link>
        ) : (
          <Link href="/status" className="btn btn-lg">
            <SquareKanban aria-hidden /> Open status board
          </Link>
        )}
      </div>

      <div className="pt-2">
        <ResultTabs results={results} tab={tab} onTab={setTab} />
      </div>

      {rows.length ? (
        <ActionTable
          rows={rows}
          statusById={statusById}
          busy={busy}
          company={company}
          onResolve={(id) => void resolve(id)}
          onResolveMany={resolveMany}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title={tab === "action" ? "Nothing needs action in this recon." : "No invoices in this view."}
          actionLabel="Show all invoices"
          onAction={() => setTab("all")}
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

const STEPS = ["Purchase register", "GSTR-2B", "Recon run", "Chase vendors"];

function DashboardEmpty({ due }: { due: Gstr3bDue }) {
  return (
    <div className="space-y-3">
      <h1 className="page-title">Dashboard</h1>
      <EmptyState
        icon={Upload}
        title="Upload your purchase register to see how much ITC is at risk."
        actionLabel="Upload purchase register"
        actionHref="/reconcile"
        secondaryLabel="Try with sample files (not saved)"
        secondaryHref="/reconcile?sample=1"
      />
      <div className="progress-line">
        {STEPS.map((s, i) => (
          <span key={s} className="step" data-current={i === 0 ? "true" : undefined} data-todo={i > 0 ? "true" : undefined}>
            <span className={`dot ${i === 0 ? "dot-accent" : ""}`} style={i > 0 ? { backgroundColor: "var(--color-line)" } : undefined} aria-hidden />
            {s}
          </span>
        ))}
        <div className="flex-1" />
        <span id="filing" className="filing-target inline-flex items-center gap-1.5 rounded px-1 muted">
          <Clock size={13} strokeWidth={1.75} aria-hidden />
          GSTR-3B due {due.dueLabel} ·{" "}
          {due.daysLeft < 0 ? `${Math.abs(due.daysLeft)} days overdue` : `${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
}
