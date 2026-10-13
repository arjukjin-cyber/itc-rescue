"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { fetchRunHistory } from "@/lib/api-data";
import { formatIstTimestamp, inr } from "@/lib/format";
import { historyPeriodLabel, isLegacyPeriod, type RunHistoryRow } from "@/lib/run-history";
import { getSelectedGstin } from "@/lib/selected-gstin";

/**
 * Reconcile › History. AppShell remounts <main> on a GSTIN switch, and the effect also keys on the
 * selected GSTIN, so the list refetches for the new company. There is no past-run view yet, so
 * rows link to /reconcile (the latest run).
 */
export default function RunHistoryPage() {
  const gstin = getSelectedGstin();
  /** undefined = loading (skeleton), [] = no runs (empty state). */
  const [runs, setRuns] = useState<RunHistoryRow[] | undefined>(undefined);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRuns(undefined);
    setError(null);
    fetchRunHistory().then((r) => {
      if (cancelled) return;
      if (r.authError || r.error) setError(r.authError || r.error || "Could not load run history");
      setRuns(r.runs);
      setNextOffset(r.nextOffset);
    });
    return () => {
      cancelled = true;
    };
  }, [gstin]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    setMore(true);
    const r = await fetchRunHistory(nextOffset);
    setMore(false);
    if (r.error || r.authError) return setError(r.authError || r.error || "Could not load more runs");
    setRuns((prev) => [...(prev ?? []), ...r.runs]);
    setNextOffset(r.nextOffset);
  }, [nextOffset]);

  if (runs === undefined) return <LoadingSkeleton label="Loading run history" rows={5} cols={7} />;

  if (!runs.length) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Run history</h1>
        {error ? (
          <p className="helper-line" role="alert">{error}</p>
        ) : (
          <EmptyState icon={History} title="No reconciliations yet for this GSTIN." actionLabel="Run reconciliation" actionHref="/reconcile" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h1 className="page-title">Run history</h1>
        <div className="helper-line">
          {runs.length}
          {nextOffset != null ? "+" : ""} run{runs.length === 1 ? "" : "s"}, newest first. Open a row to go to Reconcile.
        </div>
      </div>
      {error && <p className="helper-line" role="alert">{error}</p>}
      <div className="table-scroll">
        <table className="dt">
          <thead>
            <tr>
              <th>Period</th>
              <th>Run at</th>
              <th>File</th>
              <th className="r">Matched</th>
              <th className="r">ITC at risk</th>
              <th className="r">Mismatch</th>
              <th className="r">Unclaimed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href="/reconcile" className="link-accent">
                    {historyPeriodLabel(r.returnPeriod, r.createdAt)}
                  </Link>
                  {isLegacyPeriod(r.returnPeriod) && <span className="muted"> (run date)</span>}
                </td>
                <td>{formatIstTimestamp(r.createdAt)}</td>
                <td>{r.fileName || <span className="muted">—</span>}</td>
                <td className="r">{r.matched}</td>
                <td className="r">{r.itcAtRiskAmount > 0 ? <span className="amt-risk">{inr(r.itcAtRiskAmount)}</span> : inr(0)}</td>
                <td className="r">{inr(r.mismatchAmount)}</td>
                <td className="r">{r.unclaimed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextOffset != null && (
        <button type="button" className="btn" onClick={loadMore} disabled={more}>
          {more ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
