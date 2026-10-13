"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Inbox, Lock, Plus, Send, SquareKanban, Upload } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { KpiStrip } from "@/components/KpiStrip";
import { ActionTable, ResultTabs, filterByTab, useChaseRows, type TabKey } from "@/components/RiskTable";
import { Toast, useToast } from "@/components/Toast";
import { syncProfileFromServer } from "@/lib/storage";
import { fetchChaseItems, fetchReconState, type ReconTri } from "@/lib/api-data";
import { daysText, getGstr3bDue, type Gstr3bDue } from "@/lib/filing";
import { formatIstTimestamp } from "@/lib/format";
import { TRIAL_USED_MESSAGE } from "@/lib/recon-guard";
import type { MatchResult, UserSession } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  /**
   * GET /api/recon tri-state: undefined = loading (skeleton), null = server said no recon
   * (empty state), object = data. Errors keep it undefined and take the existing path
   * (redirect to /login), so the empty state can't flash before data arrives.
   */
  const [recon, setRecon] = useState<ReconTri>(undefined);
  const loaded = recon !== undefined;
  const summary = recon?.summary ?? null;
  const results: MatchResult[] = useMemo(() => recon?.results ?? [], [recon]);
  /** Chase text sender name: the server profile (/api/auth/me, synced via #34's helper) only. */
  const [company, setCompany] = useState("");
  const [tab, setTab] = useState<TabKey>("action");
  const [lastRecon, setLastRecon] = useState<string | null>(null);
  /** Trial used → header "New recon" shown locked (v3 frame). */
  const [canRun, setCanRun] = useState(true);
  const { toast, show, dismiss } = useToast();
  const { setChase, statusById, pendingCount, resolve, resolveMany, busy } = useChaseRows(show);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [recon, chaseRes, me] = await Promise.all([
        fetchReconState(),
        fetchChaseItems(),
        fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d?.user as UserSession | null | undefined) ?? null)
        .catch(() => null),
      ]);
      if (cancelled) return;
      if (recon.authError) {
        router.replace("/login");
        return;
      }
      if (me) syncProfileFromServer(me);
      setCompany(me ? me.companyName || me.name || "" : "");
      if (!chaseRes.authError) setChase(chaseRes.items);
      // "Last recon" = the saved run's created_at from GET /api/recon (#28), shown in IST.
      setLastRecon(recon.recon ? recon.createdAt ?? null : null);
      setCanRun(recon.canRun);
      setRecon(recon.recon);
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
  const due = useMemo(() => getGstr3bDue(results), [results]);

  if (recon === undefined) return <LoadingSkeleton label="Loading dashboard" kpis={5} rows={5} cols={6} actions />;

  if (recon === null || !summary) return <DashboardEmpty due={due} />;

  const chaseLabel = `Chase ${pendingCount} vendor${pendingCount === 1 ? "" : "s"} on WhatsApp`;
  const meta = [
    due.kind !== "none" ? `${due.period} return period` : null,
    lastRecon ? `Last recon ${formatIstTimestamp(lastRecon)}` : null,
    `${summary.totalBooks} invoices in books, ${summary.totalGstr2b} in GSTR-2B`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      {/* v3 page header: H1 + one text-3 sub-line; page actions right of the H1. No greeting (v3 frame). */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="page-title">Dashboard</h1>
          <div className="helper-line">
            <span>{meta}</span>
          </div>
        </div>
        {canRun ? (
          <Link href="/reconcile?new=1" className="btn">
            <Plus aria-hidden /> New recon
          </Link>
        ) : (
          <button
            type="button"
            className="btn"
            aria-disabled="true"
            title="Free trial used"
            onClick={() => show({ text: TRIAL_USED_MESSAGE })}
          >
            <Lock aria-hidden /> New recon
          </button>
        )}
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
          {due.kind === "open"
            ? `GSTR-3B · ${daysText(due.daysLeft)} · due ${due.dueLabel}`
            : due.kind === "past"
              ? `GSTR-3B · Was due ${due.dueLabel}`
              : "GSTR-3B · No recon yet"}
        </span>
      </div>
    </div>
  );
}
