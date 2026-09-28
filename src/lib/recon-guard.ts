import type { MatchResult } from "./types";

/** GSTINs used only in /public/samples. Sample runs are never saved or counted. */
export const SAMPLE_GSTINS = new Set([
  "27AABCT1332L1ZV",
  "29AADCS1234A1Z5",
  "07AAACP0505B1ZQ",
  "24AABCM9876C1ZX",
  "33AAACR5055K1Z2",
  "09AABCT5521D1ZM",
  "27AAECS4455P1ZA",
  "19AADCF2211B1ZR",
  "06AABCH7788E1ZT",
  "27AABCW3344F1ZU",
  "36AABCT6677G1ZV",
]);

export const TRIAL_USED_MESSAGE = "Free trial used. We'll email you when more runs open.";

/** Some rows come from the sample files but not all: a sample file was mixed with a real one. */
export function isMixedSampleRecon(results: MatchResult[]): boolean {
  const n = results.filter((r) => SAMPLE_GSTINS.has(String(r.gstin || "").toUpperCase())).length;
  return n > 0 && n < results.length;
}

export function isSampleRecon(results: MatchResult[]): boolean {
  if (!results.length) return false;
  return results.every((r) => SAMPLE_GSTINS.has(String(r.gstin || "").toUpperCase()));
}

function unknown(v: unknown): boolean {
  const s = String(v ?? "").trim().toUpperCase();
  return !s || s === "UNKNOWN";
}

/**
 * A run is only saved (and only uses the trial) when the parse looks real:
 * at least one row with GSTIN + invoice no. + date, and no more than 10% of rows
 * missing a GSTIN or invoice number.
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
  if (bad / results.length > 0.1) {
    return {
      ok: false,
      reason: `${bad} of ${results.length} rows are missing a GSTIN or invoice number, so the file probably didn't parse correctly. Nothing was saved and your free run wasn't used.`,
    };
  }
  return { ok: true };
}
