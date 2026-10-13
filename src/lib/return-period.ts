/** Return-period (YYYY-MM) helpers for the reconcile period picker. Pure; no DOM. */
const PERIOD_RE = /^(20[0-9]{2})-(0[1-9]|1[0-2])$/;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function isReturnPeriod(p: unknown): p is string {
  return typeof p === "string" && PERIOD_RE.test(p);
}

/** Previous calendar month in IST (UTC+5:30), as YYYY-MM. */
export function lastMonthIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  let y = ist.getUTCFullYear();
  let m = ist.getUTCMonth(); // 0-based current month == 1-based previous month
  if (m === 0) {
    y -= 1;
    m = 12;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Default picker value: the 2B-detected month when valid, else last month (IST). */
export function defaultReturnPeriod(detected: string | null | undefined, now: Date = new Date()): string {
  return isReturnPeriod(detected) ? detected : lastMonthIST(now);
}

/** "2026-07" -> "July 2026"; "" for invalid input. */
export function formatReturnPeriod(p: string | null | undefined): string {
  if (!isReturnPeriod(p)) return "";
  const [y, m] = p.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** True when a month was detected from the 2B file and the picked month differs from it. */
export function needsPeriodConfirm(picked: string, detected: string | null | undefined): boolean {
  return isReturnPeriod(detected) && picked !== detected;
}
