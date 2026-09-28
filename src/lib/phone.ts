/**
 * Vendor phone helpers (pure; no DB / React imports). UX-04.
 *
 * Phone values are stored as "91" + 10 digits (e.g. "919999900001"), which is
 * the digits-only form wa.me expects. Rules match PR #25's
 * `normalizeIndianMobile` (src/lib/vendors.ts, unmerged) except for the output
 * format (#25 stores "+91XXXXXXXXXX"). Once #25 merges it should reuse this
 * module and keep the "+" only at its storage boundary.
 */

/**
 * Register column aliases for the vendor phone, in the key-normaliser form used by
 * reconcile.ts `pick` (lower-case, trimmed, whitespace -> "_").
 */
export const PHONE_ALIASES = [
  "vendor_phone",
  "phone",
  "mobile",
  "contact_no",
  "contact_number",
  "whatsapp",
  "mobile_no",
  "phone_no",
] as const;

/** Same aliases in importers/tally-busy `normalizeHeader` form ("vendor phone", "mobile no"). */
export const PHONE_HEADERS: readonly string[] = PHONE_ALIASES.map((a) => a.replace(/_/g, " "));

const MOBILE_RE = /^(?:\+91|91|0)?([6-9][0-9]{9})$/;

function normalizeOne(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  const m = compact.match(MOBILE_RE);
  return m ? `91${m[1]}` : null;
}

/**
 * Normalise an Indian mobile to "91XXXXXXXXXX".
 * Accepts 10 digits starting 6–9 with an optional +91 / 91 / 0 prefix; spaces,
 * dashes, dots and parentheses are ignored. A cell holding several numbers
 * ("99999 00001 / 99999 00002") yields the first valid one.
 * Anything else (landlines, short numbers, other country codes) -> null.
 */
export function normalizeIndianMobile(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw);
  if (!s.trim()) return null;
  for (const part of s.split(/[,;/|]/)) {
    const n = normalizeOne(part);
    if (n) return n;
  }
  return null;
}

/** "919999900001" -> "+91 99999 00001" (display only). */
export function formatIndianMobile(phone: string | null | undefined): string {
  const n = normalizeIndianMobile(phone);
  if (!n) return "";
  return `+91 ${n.slice(2, 7)} ${n.slice(7)}`;
}

/**
 * WhatsApp click-to-chat link. With a valid phone: https://wa.me/91XXXXXXXXXX?text=…
 * Without one (or invalid): https://wa.me/?text=… (user picks the contact).
 * The phone is re-normalised here, so a bad value can never alter the URL.
 */
export function waLink(text: string, phone?: string | null): string {
  const n = normalizeIndianMobile(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}

/**
 * GSTIN -> first valid phone, in row order. Rows without a usable GSTIN are skipped
 * (several unrelated vendors can share "UNKNOWN").
 */
export function firstPhoneByGstin(
  rows: Iterable<{ gstin?: string; phone?: string | null }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const g = String(r.gstin || "").trim().toUpperCase();
    if (!g || g === "UNKNOWN" || map.has(g)) continue;
    const p = normalizeIndianMobile(r.phone);
    if (p) map.set(g, p);
  }
  return map;
}

/**
 * Attach phones to chase items: keep a valid item.phone, else look up by GSTIN.
 * Returns new objects; items without a phone are returned without the key.
 */
export function attachPhones<T extends { gstin: string; phone?: string }>(
  items: T[],
  phoneByGstin: ReadonlyMap<string, string>
): T[] {
  return items.map((item) => {
    const phone =
      normalizeIndianMobile(item.phone) ??
      phoneByGstin.get(String(item.gstin || "").trim().toUpperCase());
    if (phone) return { ...item, phone };
    if ("phone" in item) {
      const { phone: _drop, ...rest } = item;
      void _drop;
      return rest as T;
    }
    return item;
  });
}
