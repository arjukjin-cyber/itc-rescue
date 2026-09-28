/**
 * GSTR-3B due date for the dashboard countdown.
 *
 * Client-side placeholder until a `/api/filing` endpoint exists: the due date is
 * the 20th of the month after TODAY's month, counted in IST calendar days.
 * (Deliberately NOT derived from the sample data's return period.)
 * Swap the body of `getGstr3bDue` for an API call later; callers only use the
 * returned shape.
 */
import { MONTHS } from "./format";

export interface Gstr3bDue {
  /** YYYY-MM-DD (IST calendar date) */
  dueDate: string;
  /** "20 Oct" */
  dueLabel: string;
  /** Whole IST calendar days from today to the due date (0 = due today, <0 = overdue). */
  daysLeft: number;
  /** ₹ blocked = ITC-at-risk total passed in by the caller. */
  blocked: number;
}

function istYmd(now: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

export function getGstr3bDue(blocked: number, now: Date = new Date()): Gstr3bDue {
  const t = istYmd(now);
  const dueY = t.m === 12 ? t.y + 1 : t.y;
  const dueM = t.m === 12 ? 1 : t.m + 1; // 1-based
  const today = Date.UTC(t.y, t.m - 1, t.d);
  const due = Date.UTC(dueY, dueM - 1, 20);
  const daysLeft = Math.round((due - today) / 86_400_000);
  const dueDate = `${dueY}-${String(dueM).padStart(2, "0")}-20`;
  const dueLabel = `20 ${MONTHS[dueM - 1]}`;
  return { dueDate, dueLabel, daysLeft, blocked };
}
