/** Run history (/reconcile/history): pure helpers shared by GET /api/recon/history, the page and tests. */
import { MONTHS, formatIstTimestamp } from "./format";
import { inGstinScope, type GstinScope } from "./gstin-scope";
import { isReturnPeriod } from "./return-period";

export const HISTORY_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

/** One saved recon run as the history table needs it. */
export interface RunHistoryRow {
  id: string;
  createdAt: string; // ISO
  /** YYYY-MM; "" for legacy runs saved before the period picker. */
  returnPeriod: string;
  /** "" for legacy runs saved before GSTIN scoping (they count under the PRIMARY GSTIN only). */
  companyGstin: string;
  /** Source file name; null — recon_runs does not store it today. */
  fileName: string | null;
  matched: number;
  itcAtRiskAmount: number;
  mismatchAmount: number;
  unclaimed: number;
}

export interface RunHistoryPage {
  runs: RunHistoryRow[];
  /** Offset for the next page; null when this is the last one. */
  nextOffset: number | null;
}

/** "2026-08" → "Aug 2026"; legacy row (no/invalid period) → created date in IST, e.g. "12 Oct 2026". */
export function historyPeriodLabel(returnPeriod: string | null | undefined, createdAt: string): string {
  if (isReturnPeriod(returnPeriod)) {
    const [y, m] = returnPeriod.split("-");
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }
  const ts = formatIstTimestamp(createdAt); // "12 Oct 2026, 09:05 IST"
  return ts ? ts.split(",")[0] : "—";
}

/** True when the row has no saved return period (shown with a "no period" hint). */
export function isLegacyPeriod(returnPeriod: string | null | undefined): boolean {
  return !isReturnPeriod(returnPeriod);
}

/** ?limit=&offset= → clamped numbers (limit 1..50, default 20; offset ≥ 0). */
export function parseHistoryPaging(params: URLSearchParams): { limit: number; offset: number } {
  const l = Number.parseInt(params.get("limit") || "", 10);
  const o = Number.parseInt(params.get("offset") || "", 10);
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, HISTORY_MAX_LIMIT) : HISTORY_LIMIT,
    offset: Number.isFinite(o) && o > 0 ? o : 0,
  };
}

/**
 * In-memory twin of the SQL filter (CHASE_SCOPE_SQL): runs in scope, newest first, one page.
 * Rows are fetched with limit+1 so `nextOffset` is known without a COUNT.
 */
export function pageRuns<T extends { companyGstin: string; createdAt: string }>(
  rows: T[],
  scope: GstinScope,
  limit: number,
  offset: number
): { runs: T[]; nextOffset: number | null } {
  const inScope = rows
    .filter((r) => inGstinScope(r.companyGstin, scope))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const slice = inScope.slice(offset, offset + limit + 1);
  return toPage(slice, limit, offset);
}

/** Trims a limit+1 fetch to a page. */
export function toPage<T>(rows: T[], limit: number, offset: number): { runs: T[]; nextOffset: number | null } {
  return { runs: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** DB row (summary JSONB fields + aggregated mismatch) → RunHistoryRow. */
export function toHistoryRow(r: Record<string, unknown>): RunHistoryRow {
  return {
    id: String(r.id),
    createdAt: new Date(r.created_at as string).toISOString(),
    returnPeriod: String(r.return_period || ""),
    companyGstin: String(r.company_gstin || ""),
    fileName: r.file_name ? String(r.file_name) : null,
    matched: num(r.matched),
    itcAtRiskAmount: num(r.itc_at_risk_amount),
    mismatchAmount: num(r.mismatch_amount),
    unclaimed: num(r.unclaimed),
  };
}
