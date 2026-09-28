"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Download, Send } from "lucide-react";
import { markResultResolved } from "@/lib/api-data";
import { downloadCsv, istDate, reconCsv } from "@/lib/csv-export";
import { formatDay, inr } from "@/lib/format";
import { getLocalUser } from "@/lib/storage";
import { whatsappEnglish } from "@/lib/templates";
import { waLink } from "@/lib/phone";
import { emitChaseCount } from "@/lib/ui-events";
import type { ChaseItem, ChaseStatus, MatchCategory, MatchResult } from "@/lib/types";
import type { ToastMsg } from "./Toast";

/** Rows that carry inline actions (a chase item always exists for these). */
export function isActionable(r: MatchResult): boolean {
  return r.category === "itc_at_risk" || r.category === "value_mismatch";
}

const CATEGORY_ORDER: Record<MatchCategory, number> = {
  itc_at_risk: 0,
  value_mismatch: 1,
  unclaimed: 2,
  matched: 3,
};

/** ₹ used to rank a needs-action row: at-risk = books tax, mismatch = |tax diff|. */
function actionAmount(r: MatchResult): number {
  if (r.category === "itc_at_risk") return r.booksTax || 0;
  if (r.category === "value_mismatch") return Math.abs(r.taxDiff || 0);
  return 0;
}

/**
 * Needs-action order everywhere: at-risk rows by ₹ at risk (descending), then value-mismatch
 * rows (by ₹ difference, descending), then unclaimed, then matched (stable within those).
 */
export function sortForAction(rows: MatchResult[]): MatchResult[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER[a.r.category] - CATEGORY_ORDER[b.r.category] ||
        actionAmount(b.r) - actionAmount(a.r) ||
        a.i - b.i
    )
    .map((x) => x.r);
}

/** ₹ ITC at risk = itc_at_risk rows only (same basis as the at-risk CSV total). */
export function atRiskTotal(results: MatchResult[]): number {
  return results.filter((r) => r.category === "itc_at_risk").reduce((s, r) => s + (r.booksTax || 0), 0);
}

export function mismatchTotal(results: MatchResult[]): number {
  return results.filter((r) => r.category === "value_mismatch").reduce((s, r) => s + Math.abs(r.taxDiff || 0), 0);
}

function safeFilePart(s: string): string {
  return (s || "row").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "row";
}

/** Single-row CSV: same builder + download path as the PR #23 exports. */
export function exportRow(r: MatchResult) {
  downloadCsv(`itc-rescue-${safeFilePart(r.invoiceNumber)}-${istDate()}.csv`, reconCsv([r]));
}

/** Bulk export of the selected rows. */
export function exportRows(rows: MatchResult[]) {
  downloadCsv(`itc-rescue-selected-${rows.length}-${istDate()}.csv`, reconCsv(rows));
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

export type TabKey = "action" | "matched" | "unclaimed" | "all";

export function filterByTab(results: MatchResult[], tab: TabKey): MatchResult[] {
  const rows =
    tab === "action"
      ? results.filter(isActionable)
      : tab === "all"
        ? results
        : results.filter((r) => r.category === tab);
  return sortForAction(rows);
}

export function ResultTabs({
  results,
  tab,
  onTab,
  right,
}: {
  results: MatchResult[];
  tab: TabKey;
  onTab: (t: TabKey) => void;
  right?: ReactNode;
}) {
  const counts: Record<TabKey, number> = {
    action: results.filter(isActionable).length,
    matched: results.filter((r) => r.category === "matched").length,
    unclaimed: results.filter((r) => r.category === "unclaimed").length,
    all: results.length,
  };
  const TABS: [TabKey, string][] = [
    ["action", "Needs action"],
    ["matched", "Matched"],
    ["unclaimed", "Unclaimed"],
    ["all", "All"],
  ];
  return (
    <div className="tabs">
      <div role="tablist" aria-label="Filter results" className="flex items-end gap-[18px] overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" onClick={() => onTab(k)}>
            {label}
            <span className="ct">{counts[k]}</span>
          </button>
        ))}
      </div>
      {right && <div className="ml-auto flex items-center gap-1.5 pb-1.5">{right}</div>}
    </div>
  );
}

/* ── Chase state + optimistic resolve ─────────────────────────────────── */

/**
 * Chase status state + optimistic "Mark resolved" (single + bulk).
 * Persists via markResultResolved (PATCH /api/chase/[id] → "fixed"), so rows stay
 * resolved after reload and land in the Fixed lane on /status.
 */
export function useChaseRows(showToast: (m: ToastMsg) => void) {
  const [chase, setChase] = useState<ChaseItem[]>([]);
  const [loadedChase, setLoadedChase] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ChaseStatus>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const statusById = useMemo(() => {
    const m = new Map<string, ChaseStatus>(chase.map((c) => [c.id, c.status]));
    for (const [id, st] of Object.entries(overrides)) m.set(id, st);
    return m;
  }, [chase, overrides]);

  const pendingCount = useMemo(
    () => chase.filter((c) => (overrides[c.id] ?? c.status) === "pending").length,
    [chase, overrides]
  );

  useEffect(() => {
    if (loadedChase) emitChaseCount(pendingCount);
  }, [pendingCount, loadedChase]);

  const hydrate = useCallback((items: ChaseItem[]) => {
    setChase(items);
    setLoadedChase(true);
  }, []);

  const setOverride = (ids: string[], st: ChaseStatus | null) =>
    setOverrides((o) => {
      const n = { ...o };
      for (const id of ids) {
        if (st) n[id] = st;
        else delete n[id];
      }
      return n;
    });
  const setBusyIds = (ids: string[], on: boolean) =>
    setBusy((b) => {
      const n = { ...b };
      for (const id of ids) {
        if (on) n[id] = true;
        else delete n[id];
      }
      return n;
    });

  /** Resolve ids sequentially; returns ids that failed (already rolled back). */
  const resolveMany = useCallback(
    async (ids: string[]): Promise<string[]> => {
      if (!ids.length) return [];
      setOverride(ids, "fixed");
      setBusyIds(ids, true);
      const hadSession = Boolean(getLocalUser());
      const failed: string[] = [];
      let latest: ChaseItem[] | null = null;
      let authLost = false;
      for (const id of ids) {
        // A 401 clears the local session; stop so later calls can't fall back to local-only storage.
        if (authLost || (hadSession && !getLocalUser())) {
          authLost = true;
          failed.push(id);
          continue;
        }
        let next: ChaseItem[] | null = null;
        try {
          next = await markResultResolved(id);
        } catch {
          next = null;
        }
        const ok = Array.isArray(next) && next.some((c) => c.id === id && c.status === "fixed");
        if (ok) latest = next;
        else {
          failed.push(id);
          if (hadSession && !getLocalUser()) authLost = true;
        }
      }
      if (latest) setChase(latest); // server truth after the last successful PATCH
      setOverride(ids, null);
      setBusyIds(ids, false);
      if (failed.length) {
        const sessionGone = hadSession && !getLocalUser();
        showToast(
          sessionGone
            ? { text: "Session expired. Log in again to save this.", action: { label: "Log in", href: "/login" } }
            : {
                text:
                  failed.length === 1 && ids.length === 1
                    ? "Couldn't mark resolved. Please try again."
                    : `${failed.length} of ${ids.length} couldn't be marked resolved. Please try again.`,
              }
        );
      }
      return failed;
    },
    [showToast]
  );

  const resolve = useCallback((id: string) => resolveMany([id]), [resolveMany]);

  return { chase, setChase: hydrate, statusById, pendingCount, resolve, resolveMany, busy };
}

/* ── Table ────────────────────────────────────────────────────────────── */

const ISSUE: Record<MatchCategory, { dot: string; label: string }> = {
  itc_at_risk: { dot: "dot-risk", label: "Missing in 2B" },
  value_mismatch: { dot: "dot-warn", label: "Mismatch" },
  unclaimed: { dot: "dot-info", label: "Unclaimed" },
  matched: { dot: "dot-ok", label: "Matched" },
};

export function IssueCell({ category }: { category: MatchCategory }) {
  const i = ISSUE[category];
  return (
    <span className="status">
      <span className={`dot ${i.dot}`} aria-hidden />
      {i.label}
    </span>
  );
}

const CHASE_LABEL: Record<ChaseStatus, string> = {
  pending: "Pending",
  fixed: "Fixed",
  still_blocked: "Still blocked",
};

export function ChaseStateCell({ status }: { status?: ChaseStatus }) {
  if (!status) return <span className="muted">—</span>;
  return (
    <span className="status" style={{ color: "var(--color-text-3)" }}>
      {status === "fixed" && <span className="dot dot-ok" aria-hidden />}
      {CHASE_LABEL[status]}
    </span>
  );
}

export function ActionTable({
  rows,
  statusById,
  busy,
  company,
  onResolve,
  onResolveMany,
  tracking = true,
}: {
  /**
   * false for an unsaved sample run (#29): no chase items exist server-side, so row
   * checkboxes, the bulk bar, Chase and Mark resolved are hidden (row Export stays).
   */
  tracking?: boolean;
  rows: MatchResult[];
  statusById: Map<string, ChaseStatus>;
  busy: Record<string, boolean>;
  company: string;
  onResolve: (id: string) => void;
  onResolveMany: (ids: string[]) => Promise<string[]>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const headerCb = useRef<HTMLInputElement>(null);

  const selectable = useMemo(() => (tracking ? rows.filter(isActionable) : []), [rows, tracking]);
  // Drop selections that are no longer visible (tab switch / new recon)
  useEffect(() => {
    setSelected((s) => {
      const visible = new Set(selectable.map((r) => r.id));
      const next = new Set([...s].filter((id) => visible.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [selectable]);

  const selRows = useMemo(() => selectable.filter((r) => selected.has(r.id)), [selectable, selected]);
  const allOn = selectable.length > 0 && selRows.length === selectable.length;
  const someOn = selRows.length > 0 && !allOn;
  useEffect(() => {
    if (headerCb.current) headerCb.current.indeterminate = someOn;
  }, [someOn]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulkResolve() {
    const ids = selRows.filter((r) => statusById.get(r.id) !== "fixed").map((r) => r.id);
    const failed = await onResolveMany(ids);
    const failedSet = new Set(failed);
    setSelected(new Set(ids.filter((id) => failedSet.has(id))));
  }

  const riskTotal = atRiskTotal(rows);
  const mmTotal = mismatchTotal(rows);
  const vendors = new Set(rows.map((r) => r.gstin || r.vendorName)).size;
  const selRisk = atRiskTotal(selRows);
  const hasSelectable = selectable.length > 0;

  return (
    <div className="space-y-2">
      {selRows.length > 0 && (
        <div className="bulk" role="region" aria-label="Bulk actions">
          <span className="font-medium">{selRows.length} selected</span>
          <span style={{ color: "#a1a1aa" }}>{inr(selRisk)} at risk</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn btn-ghost-dark" onClick={() => void bulkResolve()}>
              Mark resolved
            </button>
            <button type="button" className="btn btn-ghost-dark" onClick={() => exportRows(selRows)}>
              Export
            </button>
            {/* Slot kept for bulk "Chase N on WhatsApp" — hidden until feature #1 ships. */}
            <button
              type="button"
              className="btn btn-white"
              style={{ visibility: "hidden" }}
              aria-hidden
              tabIndex={-1}
              disabled
            >
              <Send aria-hidden /> Chase {selRows.length} on WhatsApp
            </button>
          </div>
        </div>
      )}
      <div className="table-scroll">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                {hasSelectable && (
                  <input
                    ref={headerCb}
                    type="checkbox"
                    className="cb"
                    aria-label="Select all rows that need action"
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((r) => r.id)))}
                  />
                )}
              </th>
              <th>Vendor</th>
              <th>Invoice</th>
              <th>Issue</th>
              <th className="r">Books tax</th>
              <th className="r">2B tax</th>
              <th className="r">At risk</th>
              <th>Chase</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actionable = isActionable(r);
              const trackable = actionable && tracking;
              const st = trackable ? statusById.get(r.id) : undefined;
              const resolved = st === "fixed";
              const isSel = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  data-selected={isSel ? "true" : undefined}
                  data-resolved={resolved ? "true" : undefined}
                  title={r.notes || undefined}
                >
                  <td>
                    {trackable && (
                      <input
                        type="checkbox"
                        className="cb"
                        checked={isSel}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.vendorName} ${r.invoiceNumber}`}
                      />
                    )}
                  </td>
                  <td>
                    <div className="vn">{r.vendorName}</div>
                    <div className="mono-sm muted">{r.gstin}</div>
                  </td>
                  <td>
                    <div className="mono-sm">{r.invoiceNumber}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatDay(r.invoiceDate)}
                    </div>
                  </td>
                  <td>
                    <IssueCell category={r.category} />
                  </td>
                  <td className="r">{r.booksTax ? inr(r.booksTax) : <span className="muted">—</span>}</td>
                  <td className="r">{r.gstr2bTax ? inr(r.gstr2bTax) : <span className="muted">—</span>}</td>
                  <td className="r">
                    {r.category === "itc_at_risk" ? (
                      <span className={resolved ? "font-semibold" : "amt-risk"}>{inr(r.booksTax || 0)}</span>
                    ) : r.category === "value_mismatch" ? (
                      <span className="font-semibold">{inr(Math.abs(r.taxDiff || 0))}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{trackable ? <ChaseStateCell status={st} /> : <span className="muted">—</span>}</td>
                  <td>
                    {actionable && (
                      <div className="acts">
                        {trackable && !resolved && (
                          <>
                            <a
                              href={waLink(whatsappEnglish(r, company), r.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm"
                              title="Chase on WhatsApp"
                              aria-label={`Chase on WhatsApp: ${r.vendorName} ${r.invoiceNumber}`}
                            >
                              <Send aria-hidden /> Chase
                            </a>
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet"
                              disabled={Boolean(busy[r.id])}
                              onClick={() => onResolve(r.id)}
                              title="Mark resolved"
                              aria-label={`Mark resolved: ${r.invoiceNumber}`}
                            >
                              <Check aria-hidden /> Resolve
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet btn-icon"
                          onClick={() => exportRow(r)}
                          title="Export this row as CSV"
                          aria-label={`Export this row as CSV: ${r.invoiceNumber}`}
                        >
                          <Download aria-hidden />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td colSpan={5}>
                {rows.length} invoice{rows.length === 1 ? "" : "s"} · {vendors} vendor{vendors === 1 ? "" : "s"}
              </td>
              <td className="r">{riskTotal > 0 ? <span className="amt-risk">{inr(riskTotal)}</span> : null}</td>
              <td colSpan={2} className="muted">
                {mmTotal > 0 ? `excl. ${inr(mmTotal)} mismatch` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
