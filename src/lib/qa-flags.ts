/**
 * PREVIEW-ONLY QA switches; ignored in production.
 *
 * Every switch is gated on isPreviewQa(), which requires BOTH
 *   VERCEL_ENV === "preview"   (set by Vercel on Preview deployments only)
 *   QA_HOOKS === "1"           (set by DevOps on the Vercel Preview environment only)
 * Production (VERCEL_ENV="production") and local dev (VERCEL_ENV unset) always
 * get `false`, even if QA_HOOKS=1 leaks into their env.
 *
 * Pure module (no Next/DB imports) so the gate decisions are unit-checked in
 * scripts/vendors-check.ts. `env` defaults to process.env; tests pass their own.
 */

type QaEnv = Record<string, string | undefined>;

export const QA_FAIL_VENDORS_COOKIE = "qa_fail_vendors";
export const QA_TRIAL_BYPASS_EMAIL_PREFIX = "qa.";
export const QA_FAIL_VENDORS_MESSAGE = "qa_fail_vendors: forced failure";

// PREVIEW-ONLY QA switch; ignored in production.
export function isPreviewQa(env: QaEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.QA_HOOKS === "1";
}

/**
 * PREVIEW-ONLY QA switch; ignored in production.
 * Free-trial gate bypass for test accounts whose email starts with "qa.".
 * The recon still counts normally (recon_count / invoice_count increment).
 */
export function shouldBypassTrial(
  email: string | null | undefined,
  env: QaEnv = process.env
): boolean {
  if (!isPreviewQa(env)) return false;
  return String(email || "")
    .trim()
    .toLowerCase()
    .startsWith(QA_TRIAL_BYPASS_EMAIL_PREFIX);
}

/**
 * PREVIEW-ONLY QA switch; ignored in production.
 * Cookie `qa_fail_vendors=1` forces the vendors offender bump (and PATCH
 * /api/vendors/:gstin) to fail before touching the DB. Route handlers read the
 * cookie and pass the resulting boolean down; db.ts never reads cookies.
 */
export function shouldForceVendorsFail(
  cookieValue: string | null | undefined,
  env: QaEnv = process.env
): boolean {
  if (!isPreviewQa(env)) return false;
  return cookieValue === "1";
}
