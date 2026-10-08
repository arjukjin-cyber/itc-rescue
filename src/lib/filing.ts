import { MONTHS } from "./format";
import type { MatchResult } from "./types";

/**
 * GSTR-3B due state for the dashboard KPI cell and the sidebar Filing block.
 *
 * Follows the RETURN PERIOD of the latest recon (CTO call, v3 frames): due date = the 20th of
 * the month after that period. Open period (due today or later, IST calendar days) → countdown +
 * ₹ blocked; past period → "Was due 20 Apr 2026" with no countdown and no blocked amount (we
 * don't know whether it was filed); no recon → neutral.
 *
 * There is no return-period picker / API yet, so the period is derived from the recon itself:
 * the latest invoice month in GSTR-2B (a period's 2B can carry older invoices but never later
 * ones), falling back to the books when no 2B rows exist. A future picker or `/api/filing` can
 * replace `returnPeriodOf` / `getGstr3bDue`; callers only use the returned shape.
 */
export type Gstr3bDue =
  | { kind: "none" }
  | {
      kind: "open";
      /** "Mar 2026" */
      period: string;
      /** YYYY-MM-DD */
      dueDate: string;
      /** "20 Oct" */
      dueLabel: string;
      /** Whole IST calendar days from today (0 = due today). */
      daysLeft: number;
      /** ₹ blocked = ITC-at-risk total of that recon. */
      blocked: number;
    }
  | {
      kind: "past";
      period: string;
      dueDate: string;
      /** "20 Apr 2026" */
      dueLabel: string;
    };

export interface ReturnPeriod {
  y: number;
  /** 1-12 */
  m: number;
}

function ym(d: string | undefined): ReturnPeriod | null {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(d || "");
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? { y: Number(m[1]), m: mo } : null;
}

function latest(ps: (ReturnPeriod | null)[]): ReturnPeriod | null {
  let best: ReturnPeriod | null = null;
  for (const p of ps) if (p && (!best || p.y * 12 + p.m > best.y * 12 + best.m)) best = p;
  return best;
}

export function returnPeriodOf(results: MatchResult[]): ReturnPeriod | null {
  const from2b = latest(results.map((r) => (r.gstr2b ? ym(r.gstr2b.invoiceDate) : null)));
  if (from2b) return from2b;
  return latest(results.map((r) => ym(r.books?.invoiceDate ?? r.invoiceDate)));
}

function istToday(now: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

export function getGstr3bDue(results: MatchResult[], now: Date = new Date()): Gstr3bDue {
  const p = results.length ? returnPeriodOf(results) : null;
  if (!p) return { kind: "none" };
  const dueY = p.m === 12 ? p.y + 1 : p.y;
  const dueM = p.m === 12 ? 1 : p.m + 1;
  const period = `${MONTHS[p.m - 1]} ${p.y}`;
  const dueDate = `${dueY}-${String(dueM).padStart(2, "0")}-20`;
  const t = istToday(now);
  const daysLeft = Math.round((Date.UTC(dueY, dueM - 1, 20) - Date.UTC(t.y, t.m - 1, t.d)) / 86_400_000);
  if (daysLeft < 0) {
    return { kind: "past", period, dueDate, dueLabel: `20 ${MONTHS[dueM - 1]} ${dueY}` };
  }
  const blocked = results.filter((r) => r.category === "itc_at_risk").reduce((s, r) => s + (r.booksTax || 0), 0);
  return { kind: "open", period, dueDate, dueLabel: `20 ${MONTHS[dueM - 1]}`, daysLeft, blocked };
}

export function daysText(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}
