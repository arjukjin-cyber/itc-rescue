"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Download, MessageCircle } from "lucide-react";
import { markResultResolved } from "@/lib/api-data";
import { downloadCsv, istDate, reconCsv } from "@/lib/csv-export";
import { formatINR } from "@/lib/reconcile";
import { getLocalUser } from "@/lib/storage";
import { waLink, whatsappEnglish } from "@/lib/templates";
import type { ChaseItem, ChaseStatus, MatchCategory, MatchResult } from "@/lib/types";
import type { ToastMsg } from "./Toast";

/** Rows that carry inline actions (chase item always exists for these). */
export function isActionable(r: MatchResult): boolean {
  return r.category === "itc_at_risk" || r.category === "value_mismatch";
}

const CATEGORY_ORDER: Record<MatchCategory, number> = {
  itc_at_risk: 0,
  value_mismatch: 1,
  unclaimed: 2,
  matched: 3,
};

/** At-risk first, then value mismatch, then the rest (stable). */
export function sortForAction(rows: MatchResult[]): MatchResult[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => CATEGORY_ORDER[a.r.category] - CATEGORY_ORDER[b.r.category] || a.i - b.i)
    .map((x) => x.r);
}

/** ₹ hero number = ITC-at-risk rows only (same basis as atRiskCsv total). */
export function atRiskTotal(results: MatchResult[]): number {
  return results
    .filter((r) => r.category === "itc_at_risk")
    .reduce((s, r) => s + (r.booksTax || 0), 0);
}

function safeFilePart(s: string): string {
  return (s || "row").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "row";
}

/** Single-row CSV — same builder + download path as the PR #23 exports. */
export function exportRow(r: MatchResult) {
  downloadCsv(`itc-rescue-${safeFilePart(r.invoiceNumber)}-${istDate()}.csv`, reconCsv([r]));
}

function formatDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "—";
  const dt = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/**
 * Chase status state + optimistic "Mark resolved".
 * Persists via markResultResolved (PATCH /api/chase/[id] → "fixed"), so the
 * row stays resolved after reload and shows in the Fixed lane on /status.
 */
export function useChaseRows(showToast: (m: ToastMsg) => void) {
  const [chase, setChase] = useState<ChaseItem[]>([]);
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

  const clearOverride = (id: string) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });

  const resolve = useCallback(
    async (id: string) => {
      setOverrides((o) => ({ ...o, [id]: "fixed" }));
      setBusy((b) => ({ ...b, [id]: true }));
      let next: ChaseItem[] | null = null;
      try {
        next = await markResultResolved(id);
      } catch {
        next = null;
      }
      setBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
      const ok = Array.isArray(next) && next.some((c) => c.id === id && c.status === "fixed");
      if (!ok || !next) {
        // Roll back the row. Empty list = 401 / server error / unknown id.
        clearOverride(id);
        const sessionGone = !getLocalUser();
        showToast(
          sessionGone
            ? { text: "Session expired. Log in again to save this.", action: { label: "Log in", href: "/login" } }
            : { text: "Couldn't mark resolved. Please try again." }
        );
        return;
      }
      setChase(next);
      clearOverride(id);
    },
    [showToast]
  );

  return { chase, setChase, statusById, pendingCount, resolve, busy };
}

export function RiskTable({
  rows,
  statusById,
  busy,
  company,
  showDate = false,
  showAllPills = false,
  onResolve,
}: {
  rows: MatchResult[];
  statusById: Map<string, ChaseStatus>;
  busy: Record<string, boolean>;
  company: string;
  showDate?: boolean;
  /** Show category pill on every row (All / Matched / Unclaimed views). Mismatch rows always get one. */
  showAllPills?: boolean;
  onResolve: (id: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="table-scroll overflow-x-auto">
        <table className="act-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Invoice</th>
              {showDate && <th>Date</th>}
              <th className="num">ITC</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actionable = isActionable(r);
              const resolved = actionable && statusById.get(r.id) === "fixed";
              const amount = r.category === "unclaimed" ? r.gstr2bTax : r.booksTax || r.gstr2bTax;
              return (
                <tr key={r.id} data-resolved={resolved ? "true" : undefined} title={r.notes || undefined}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: resolved ? undefined : "var(--color-text)" }}>
                        {r.vendorName}
                      </span>
                      {(showAllPills || r.category === "value_mismatch") && <RowPill category={r.category} />}
                    </div>
                    <div className="mono-sm" style={{ color: "var(--color-text-muted)" }}>
                      {r.gstin}
                    </div>
                  </td>
                  <td className="mono-sm">{r.invoiceNumber}</td>
                  {showDate && <td style={{ color: "var(--color-text-secondary)" }}>{formatDate(r.invoiceDate)}</td>}
                  <td className="num">
                    <span className="font-semibold">{amount ? formatINR(amount) : "—"}</span>
                    {r.category === "value_mismatch" && (
                      <div className="text-meta" style={{ color: "var(--color-text-muted)" }}>
                        2B {formatINR(r.gstr2bTax || 0)}
                      </div>
                    )}
                  </td>
                  <td>
                    {actionable ? (
                      <div className="flex items-center justify-end gap-2">
                        {resolved ? (
                          <span className="pill pill-ok">
                            <Check size={12} aria-hidden /> Resolved
                          </span>
                        ) : (
                          <>
                            <a
                              href={waLink(whatsappEnglish(r, company))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-wa"
                            >
                              <MessageCircle size={14} aria-hidden /> Chase on WhatsApp
                            </a>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={Boolean(busy[r.id])}
                              onClick={() => onResolve(r.id)}
                            >
                              <Check size={14} aria-hidden /> Mark resolved
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          onClick={() => exportRow(r)}
                          aria-label={`Export ${r.invoiceNumber} as CSV`}
                        >
                          <Download size={14} aria-hidden /> Export
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PILL: Record<MatchCategory, { cls: string; label: string }> = {
  itc_at_risk: { cls: "pill-risk", label: "ITC risk" },
  value_mismatch: { cls: "pill-warn", label: "Mismatch" },
  matched: { cls: "pill-ok", label: "Matched" },
  unclaimed: { cls: "pill-info", label: "Unclaimed" },
};

export function RowPill({ category }: { category: MatchCategory }) {
  const p = PILL[category];
  return <span className={`pill ${p.cls}`}>{p.label}</span>;
}
