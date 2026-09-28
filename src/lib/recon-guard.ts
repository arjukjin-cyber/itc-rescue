import type { MatchResult } from "./types";

/**
 * GSTIN + invoice pairs from /public/samples (purchase-register.csv + gstr-2b.csv).
 * Invoice numbers are compared alphanumeric-only, upper case.
 */
const SAMPLE_PAIRS_RAW: [string, string][] = [
  ["06AABCH7788E1ZT", "HC-556"],
  ["07AAACP0505B1ZQ", "DPS-4491"],
  ["09AABCT5521D1ZM", "NEH-3390"],
  ["19AADCF2211B1ZR", "KF/8834"],
  ["24AABCM9876C1ZX", "GP-2026-221"],
  ["27AABCT1332L1ZV", "INV-2026-1042"],
  ["27AABCT1332L1ZV", "INV-2026-1055"],
  ["27AABCW3344F1ZU", "PWM-4412"],
  ["27AAECS4455P1ZA", "MLE-2026-01"],
  ["29AADCS1234A1Z5", "BST-26-0901"],
  ["29AADCS1234A1Z5", "BST/26/0881"],
  ["33AAACR5055K1Z2", "CAC-7782"],
  ["36AABCT6677G1ZV", "HSM-1200"],
];

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const pairKey = (gstin: unknown, inv: unknown) => `${norm(gstin)}|${norm(inv)}`;
const SAMPLE_PAIRS = new Set(SAMPLE_PAIRS_RAW.map(([g, i]) => pairKey(g, i)));

/** A whole sample file contributes 10+ pairs; real files may coincide on one or two. */
const MIXED_THRESHOLD = 8;

export const TRIAL_USED_MESSAGE = "Free trial used. We'll email you when more runs open.";

function samplePairCount(results: MatchResult[]): number {
  return results.filter((r) => SAMPLE_PAIRS.has(pairKey(r.gstin, r.invoiceNumber))).length;
}

export function isSampleRecon(results: MatchResult[]): boolean {
  return results.length > 0 && samplePairCount(results) === results.length;
}

/** Most of a sample file is present alongside real rows: a sample file was mixed with a real one. */
export function isMixedSampleRecon(results: MatchResult[]): boolean {
  const n = samplePairCount(results);
  return n >= MIXED_THRESHOLD && n < results.length;
}

function unknown(v: unknown): boolean {
  const s = String(v ?? "").trim().toUpperCase();
  return !s || s === "UNKNOWN";
}

/**
 * A run is only saved (and only uses the trial) when the parse looks real:
 * at least one row with GSTIN + invoice no. + date, and at most half the rows
 * missing a GSTIN or invoice number. (Unregistered-dealer rows are already
 * dropped by reconcile(), so they don't count against this.)
 */
export function validateReconResults(results: MatchResult[]): { ok: boolean; reason?: string } {
  if (!results.length) {
    return { ok: false, reason: "No invoices found in either file. Nothing was saved and your free run wasn't used." };
  }
  const complete = results.filter(
    (r) => !unknown(r.gstin) && !unknown(r.invoiceNumber) && !unknown(r.invoiceDate)
  ).length;
  if (complete === 0) {
    return {
      ok: false,
      reason:
        "No rows had a GSTIN, invoice number and date together. Check the column headers. Nothing was saved and your free run wasn't used.",
    };
  }
  const bad = results.filter((r) => unknown(r.gstin) || unknown(r.invoiceNumber)).length;
  if (bad / results.length > 0.5) {
    return {
      ok: false,
      reason: `${bad} of ${results.length} rows are missing a GSTIN or invoice number, so the file probably didn't parse correctly. Nothing was saved and your free run wasn't used.`,
    };
  }
  return { ok: true };
}
