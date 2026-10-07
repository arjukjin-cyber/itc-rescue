"use client";

import type {
  ChaseItem,
  CompanySettings,
  MatchResult,
  ReconSummary,
  UserSession,
} from "./types";

const KEYS = {
  session: "itc_user",
  results: "itc_results",
  summary: "itc_summary",
  chase: "itc_chase",
  settings: "itc_settings",
  trial: "itc_trial",
} as const;

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function lsSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

function lsRemove(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getLocalUser(): UserSession | null {
  return safeParse(lsGet(KEYS.session), null);
}

/**
 * Wipe every piece of local profile/recon/trial data (all itc_* keys).
 * Called on logout, login, signup and expired sessions so a shared computer
 * never shows the previous account's company, GSTIN or results.
 */
export function clearAllLocal() {
  if (typeof window === "undefined") return;
  for (const k of Object.values(KEYS)) lsRemove(k);
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("itc_")) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function setLocalUser(user: UserSession) {
  // Different account in the same browser: drop everything from the previous one first.
  const prev = getLocalUser();
  if (prev && prev.email !== user.email) clearAllLocal();
  lsSet(KEYS.session, JSON.stringify(user));
}

/** Server is the source of truth for company name, GSTIN, email and plan. */
export function syncProfileFromServer(user: UserSession) {
  setLocalUser(user);
  lsSet(
    KEYS.settings,
    JSON.stringify({
      companyName: user.companyName || user.name || "My Company",
      gstin: user.gstin || "",
      email: user.email,
      plan: user.plan || "trial",
    } satisfies CompanySettings)
  );
}

/** Logout / expired session: nothing from this account stays in the browser. */
export function clearLocalUser() {
  clearAllLocal();
}

export function saveRecon(results: MatchResult[], summary: ReconSummary) {
  lsSet(KEYS.results, JSON.stringify(results));
  lsSet(KEYS.summary, JSON.stringify(summary));

  // Seed chase list from at-risk + mismatch
  const existing = getChaseItems();
  const statusMap = new Map(existing.map((c) => [c.id, c.status]));
  const chase: ChaseItem[] = results
    .filter((r) => r.category === "itc_at_risk" || r.category === "value_mismatch")
    .map((r) => ({
      id: r.id,
      gstin: r.gstin,
      vendorName: r.vendorName,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      amount: r.booksTax || r.gstr2bTax,
      category: r.category,
      status: statusMap.get(r.id) || ("pending" as const),
      lastUpdated: new Date().toISOString(),
      ...(r.phone ? { phone: r.phone } : {}), // UX-04
    }));
  lsSet(KEYS.chase, JSON.stringify(chase));

  // Increment trial usage
  const trial = getTrialUsage();
  trial.reconCount += 1;
  trial.invoiceCount += results.length;
  lsSet(KEYS.trial, JSON.stringify(trial));
}

export function getResults(): MatchResult[] {
  return safeParse(lsGet(KEYS.results), []);
}

export function getSummary(): ReconSummary | null {
  return safeParse(lsGet(KEYS.summary), null);
}

export function getChaseItems(): ChaseItem[] {
  return safeParse(lsGet(KEYS.chase), []);
}

export function updateChaseStatus(
  id: string,
  status: ChaseItem["status"]
): ChaseItem[] {
  const items = getChaseItems().map((c) =>
    c.id === id ? { ...c, status, lastUpdated: new Date().toISOString() } : c
  );
  lsSet(KEYS.chase, JSON.stringify(items));
  return items;
}

export function getSettings(): CompanySettings {
  const user = getLocalUser();
  const fallback: CompanySettings = {
    companyName: user?.companyName || user?.name || "My Company",
    gstin: user?.gstin || "",
    email: user?.email || "",
    plan: user?.plan || "trial",
  };
  const stored = safeParse<CompanySettings | null>(lsGet(KEYS.settings), null);
  // Never show settings that belong to another account.
  if (!stored || !user || stored.email !== user.email) return fallback;
  return stored;
}

export function saveSettings(s: CompanySettings) {
  lsSet(KEYS.settings, JSON.stringify(s));
  const user = getLocalUser();
  if (user) {
    setLocalUser({
      ...user,
      companyName: s.companyName,
      gstin: s.gstin,
      plan: s.plan,
    });
  }
}

export function getTrialUsage(): {
  reconCount: number;
  invoiceCount: number;
} {
  return safeParse(lsGet(KEYS.trial), {
    reconCount: 0,
    invoiceCount: 0,
  });
}

/** Fresh account / signup — trial starts at 0/1 */
export function resetTrialUsage() {
  lsSet(
    KEYS.trial,
    JSON.stringify({ reconCount: 0, invoiceCount: 0 })
  );
}

/** Sync local trial counter from authoritative server recon_count (postgres). */
export function setTrialFromServer(reconCount: number, invoiceCount?: number) {
  const prev = getTrialUsage();
  lsSet(
    KEYS.trial,
    JSON.stringify({
      reconCount: Math.max(0, Number(reconCount) || 0),
      invoiceCount:
        invoiceCount !== undefined
          ? Math.max(0, Number(invoiceCount) || 0)
          : prev.invoiceCount,
    })
  );
  const user = getLocalUser();
  if (user) {
    setLocalUser({ ...user, reconCount: Math.max(0, Number(reconCount) || 0) });
  }
}

/** Clear recon + chase so a new signup doesn't inherit prior demo state */
export function clearReconData() {
  lsRemove(KEYS.results);
  lsRemove(KEYS.summary);
  lsRemove(KEYS.chase);
}

/** Invoices that still need vendor action (shared by chase + status) */
export function getOpenChaseItems(): ChaseItem[] {
  return getChaseItems().filter((c) => c.status === "pending" || c.status === "still_blocked");
}

/** Soft paywall: free trial = 1 recon OR 50 invoices */
export function isPaywalled(): boolean {
  const settings = getSettings();
  if (settings.plan !== "trial") return false;
  const t = getTrialUsage();
  return t.reconCount >= 1 || t.invoiceCount >= 50;
}

export function canRunRecon(): { ok: boolean; reason?: string } {
  const settings = getSettings();
  if (settings.plan !== "trial") return { ok: true };
  const t = getTrialUsage();
  if (t.reconCount >= 1) {
    return {
      ok: false,
      reason:
        "Free trial used. We'll email you when more runs open.",
    };
  }
  return { ok: true };
}
