/**
 * Pure vendor helpers (no DB, no Next imports) so they can be unit-checked with
 * `npx tsx scripts/vendors-check.ts`.
 *
 * Stored on `vendors`: user-owned fields (name override, phone) + the
 * idempotent repeat-offender counter (offender_count / last_offense_run_id).
 * Computed at read time from the latest recon: at-risk ₹, mismatch count/₹.
 */
import { normalizeGstin } from "./reconcile";
import { normalizeIndianMobile as digits91 } from "./phone";
import type { ChaseItem, MatchResult } from "./types";

export class VendorValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "VendorValidationError";
  }
}

/** Standard 15-char GSTIN: 2-digit state + PAN (10) + entity + 'Z' + checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeVendorGstin(raw: unknown): string {
  const g = normalizeGstin(String(raw ?? ""));
  if (!GSTIN_RE.test(g)) {
    throw new VendorValidationError("Invalid GSTIN (expected 15-character GSTIN)");
  }
  return g;
}

/**
 * Normalise an Indian mobile to `+91XXXXXXXXXX` for the vendors table.
 * Reuses the shared rules in `src/lib/phone.ts` (UX-04 / #30) so chase WhatsApp
 * and vendor storage stay in sync on validation; the only difference is the
 * stored form: phone.ts keeps digits-only `91…` for wa.me, vendors stores
 * E.164-ish `+91…`. Throws VendorValidationError (400) on invalid input.
 */
export function normalizeIndianMobile(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new VendorValidationError("Phone must be a string");
  }
  // Reject blank / whitespace-only explicitly (digits91 would also return null).
  if (!String(raw).trim()) {
    throw new VendorValidationError(
      "Invalid Indian mobile number: expected 10 digits starting 6–9, optional +91/0 prefix"
    );
  }
  const n = digits91(raw);
  if (!n) {
    throw new VendorValidationError(
      "Invalid Indian mobile number: expected 10 digits starting 6–9, optional +91/0 prefix"
    );
  }
  return `+${n}`; // n is "91XXXXXXXXXX"
}

/** Rows that make a GSTIN an "offender" in a recon run. */
export function isOffenseCategory(category: MatchResult["category"]): boolean {
  return category === "itc_at_risk" || category === "value_mismatch";
}

function usableGstin(raw: string | undefined): string {
  const g = normalizeGstin(raw || "");
  return g && g !== "UNKNOWN" ? g : "";
}

/** Distinct GSTINs with ≥1 itc_at_risk or value_mismatch row in a run (sorted). */
export function offenderGstinsForRun(results: MatchResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) {
    if (!isOffenseCategory(r.category)) continue;
    const g = usableGstin(r.gstin);
    if (g) set.add(g);
  }
  return Array.from(set).sort();
}

export type OffenseState = { offenderCount: number; lastOffenseRunId: string | null };

/**
 * Pure model of the SQL bump in db.ts (VENDOR_OFFENSE_BUMP_SQL):
 *   INSERT ... offender_count = 1, last_offense_run_id = runId
 *   ON CONFLICT DO UPDATE SET offender_count = offender_count + 1, last_offense_run_id = runId
 *   WHERE vendors.last_offense_run_id IS DISTINCT FROM runId
 * Re-applying the same runId is a no-op. Returns a new Map; input is not mutated.
 */
export function applyOffenseBump(
  state: ReadonlyMap<string, OffenseState>,
  runId: string,
  offenderGstins: string[]
): Map<string, OffenseState> {
  const next = new Map(state);
  for (const g of new Set(offenderGstins)) {
    const cur = next.get(g);
    if (!cur) {
      next.set(g, { offenderCount: 1, lastOffenseRunId: runId });
    } else if (cur.lastOffenseRunId !== runId) {
      next.set(g, { offenderCount: cur.offenderCount + 1, lastOffenseRunId: runId });
    }
  }
  return next;
}

export const REPEAT_OFFENDER_THRESHOLD = 2;

export function isRepeatOffender(offenderCount: number): boolean {
  return offenderCount >= REPEAT_OFFENDER_THRESHOLD;
}

export interface StoredVendor {
  gstin: string;
  name: string | null;
  phone: string | null;
  offenderCount: number;
  updatedAt: string | null;
}

export interface VendorSummary {
  gstin: string;
  /** vendors.name override, else supplier name from the latest recon, else "". */
  name: string;
  /** +91XXXXXXXXXX or null */
  phone: string | null;
  /** Σ booksTax of itc_at_risk rows in the latest recon (same basis as summary.itcAtRiskAmount). */
  atRiskAmount: number;
  atRiskCount: number;
  /** value_mismatch rows in the latest recon, reported separately (not in atRiskAmount). */
  mismatchCount: number;
  /** Σ |booksTax − gstr2bTax| (taxDiff) of value_mismatch rows in the latest recon. */
  mismatchAmount: number;
  /** chase_items with status pending | still_blocked for this GSTIN. */
  openChaseCount: number;
  /** Stored: number of distinct recon runs with at-risk/mismatch rows for this GSTIN. */
  offenderCount: number;
  repeatOffender: boolean;
  /** True if this GSTIN appears (any category) in the latest recon. */
  inLatestRecon: boolean;
  updatedAt: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Merge stored vendor rows, the latest recon results and chase items into the
 * per-GSTIN vendor view. Listed GSTINs = every GSTIN in the latest recon ∪ every
 * stored vendors row. Sorted by atRiskAmount desc, then mismatchAmount desc,
 * then name/gstin for stable output.
 */
export function buildVendorSummaries(input: {
  latestResults: MatchResult[] | null | undefined;
  stored: StoredVendor[];
  chase: Pick<ChaseItem, "gstin" | "status">[];
}): VendorSummary[] {
  const byGstin = new Map<string, VendorSummary>();
  const reconNames = new Map<string, string>();

  const ensure = (gstin: string): VendorSummary => {
    let v = byGstin.get(gstin);
    if (!v) {
      v = {
        gstin,
        name: "",
        phone: null,
        atRiskAmount: 0,
        atRiskCount: 0,
        mismatchCount: 0,
        mismatchAmount: 0,
        openChaseCount: 0,
        offenderCount: 0,
        repeatOffender: false,
        inLatestRecon: false,
        updatedAt: null,
      };
      byGstin.set(gstin, v);
    }
    return v;
  };

  for (const r of input.latestResults || []) {
    const g = usableGstin(r.gstin);
    if (!g) continue;
    const v = ensure(g);
    v.inLatestRecon = true;
    const nm = (r.vendorName || "").trim();
    if (nm && !reconNames.has(g)) reconNames.set(g, nm);
    if (r.category === "itc_at_risk") {
      v.atRiskCount += 1;
      v.atRiskAmount += finite(r.booksTax);
    } else if (r.category === "value_mismatch") {
      v.mismatchCount += 1;
      v.mismatchAmount += Math.abs(finite(r.taxDiff));
    }
  }

  for (const s of input.stored) {
    const g = usableGstin(s.gstin);
    if (!g) continue;
    const v = ensure(g);
    v.phone = s.phone || null;
    v.offenderCount = Math.max(0, Math.trunc(finite(s.offenderCount)));
    v.updatedAt = s.updatedAt;
    if (s.name && s.name.trim()) v.name = s.name.trim();
  }

  for (const c of input.chase) {
    if (c.status !== "pending" && c.status !== "still_blocked") continue;
    const g = usableGstin(c.gstin);
    if (!g || !byGstin.has(g)) continue;
    byGstin.get(g)!.openChaseCount += 1;
  }

  const out = Array.from(byGstin.values());
  for (const v of out) {
    if (!v.name) v.name = reconNames.get(v.gstin) || "";
    v.atRiskAmount = round2(v.atRiskAmount);
    v.mismatchAmount = round2(v.mismatchAmount);
    v.repeatOffender = isRepeatOffender(v.offenderCount);
  }
  out.sort(
    (a, b) =>
      b.atRiskAmount - a.atRiskAmount ||
      b.mismatchAmount - a.mismatchAmount ||
      (a.name || a.gstin).localeCompare(b.name || b.gstin) ||
      a.gstin.localeCompare(b.gstin)
  );
  return out;
}

export type OffenseBumpOutcome = { ok: true } | { ok: false; error: string };

/**
 * Run the offender bump as a best-effort side step. Never throws: on failure it
 * logs `[vendors] offender bump failed ... user=… run=… error=…` and resolves
 * `{ ok: false }`. Handles both sync throws and rejected promises.
 */
export async function runBestEffortOffenseBump(
  ctx: { userId: string; runId: string },
  bump: () => unknown,
  log: (...args: unknown[]) => void = console.error
): Promise<OffenseBumpOutcome> {
  try {
    await bump();
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      log(
        `[vendors] offender bump failed (best-effort; recon + chase already saved) user=${ctx.userId} run=${ctx.runId} error=${error}`
      );
    } catch {
      /* logging must never break the recon save */
    }
    return { ok: false, error };
  }
}

/**
 * Used at the end of saveReconForUser: runs the bump best-effort, then returns
 * the already-computed recon/chase result unchanged regardless of the outcome.
 */
export async function withBestEffortOffenseBump<T>(
  saved: T,
  ctx: { userId: string; runId: string },
  bump: () => unknown,
  log?: (...args: unknown[]) => void
): Promise<T> {
  await runBestEffortOffenseBump(ctx, bump, log);
  return saved;
}
