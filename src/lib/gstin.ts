/**
 * GSTIN validation (pure, no DB).
 * Format: 2-digit state code + 10-char PAN + entity digit + 'Z' + checksum.
 * Checksum: GSTN's base-36 mod algorithm over the first 14 chars.
 */
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

export function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    if (v < 0) return "";
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: true; gstin: string; stateCode: string } | { ok: false; reason: string };

export function validateGstin(raw: unknown): GstinCheck {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15) return { ok: false, reason: "GSTIN must be 15 characters" };
  if (!GSTIN_RE.test(gstin)) return { ok: false, reason: "That doesn't look like a valid GSTIN" };
  const state = Number(gstin.slice(0, 2));
  if (state < 1 || state > 38) {
    if (state !== 97 && state !== 99) return { ok: false, reason: "Unknown state code in GSTIN" };
  }
  if (gstinChecksum(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, reason: "GSTIN check digit doesn't match. Check for a typo." };
  }
  return { ok: true, gstin, stateCode: gstin.slice(0, 2) };
}

/** Return period as YYYY-MM (the month the return covers). */
const PERIOD_RE = /^(20[0-9]{2})-(0[1-9]|1[0-2])$/;

export function normalizeReturnPeriod(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (PERIOD_RE.test(s)) return s;
  // GSTN portal style MMYYYY (e.g. 092026)
  const m = /^(0[1-9]|1[0-2])(20[0-9]{2})$/.exec(s);
  if (m) return `${m[2]}-${m[1]}`;
  return null;
}
