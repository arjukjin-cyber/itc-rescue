/** v1.0 number/date formatting — ₹ + Indian grouping + 2 decimals; dates in IST. */

const INR2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,43,460.00 */
export function inr(n: number): string {
  return INR2.format(Number.isFinite(n) ? n : 0);
}

/** Split for KPI figures: { whole: "₹86,400", paise: ".00" } */
export function inrParts(n: number): { whole: string; paise: string } {
  const s = inr(n);
  const i = s.lastIndexOf(".");
  return i === -1 ? { whole: s, paise: "" } : { whole: s.slice(0, i), paise: s.slice(i) };
}

// Explicit 3-letter months: ICU's en-GB short month renders September as "Sept".
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-28" → "28 Mar 2026" (calendar date, no TZ shift). */
export function formatDay(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
  if (!m) return d || "—";
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return d;
  return `${Number(m[3])} ${MONTHS[mi]} ${m[1]}`;
}

/** ISO instant → "29 Sep 2026, 04:17 IST" */
export function formatIstTimestamp(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = MONTHS[Number(get("month")) - 1] ?? get("month");
  return `${Number(get("day"))} ${month} ${get("year")}, ${get("hour")}:${get("minute")} IST`;
}
