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

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getLocalUser(): UserSession | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(KEYS.session), null);
}

export function setLocalUser(user: UserSession) {
  localStorage.setItem(KEYS.session, JSON.stringify(user));
}

export function clearLocalUser() {
  localStorage.removeItem(KEYS.session);
}

export function saveRecon(results: MatchResult[], summary: ReconSummary) {
  localStorage.setItem(KEYS.results, JSON.stringify(results));
  localStorage.setItem(KEYS.summary, JSON.stringify(summary));

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
    }));
  localStorage.setItem(KEYS.chase, JSON.stringify(chase));

  // Increment trial usage
  const trial = getTrialUsage();
  trial.reconCount += 1;
  trial.invoiceCount += results.length;
  localStorage.setItem(KEYS.trial, JSON.stringify(trial));
}

export function getResults(): MatchResult[] {
  return safeParse(localStorage.getItem(KEYS.results), []);
}

export function getSummary(): ReconSummary | null {
  return safeParse(localStorage.getItem(KEYS.summary), null);
}

export function getChaseItems(): ChaseItem[] {
  return safeParse(localStorage.getItem(KEYS.chase), []);
}

export function updateChaseStatus(
  id: string,
  status: ChaseItem["status"]
): ChaseItem[] {
  const items = getChaseItems().map((c) =>
    c.id === id ? { ...c, status, lastUpdated: new Date().toISOString() } : c
  );
  localStorage.setItem(KEYS.chase, JSON.stringify(items));
  return items;
}

export function getSettings(): CompanySettings {
  const user = getLocalUser();
  return safeParse(localStorage.getItem(KEYS.settings), {
    companyName: user?.companyName || user?.name || "My Company",
    gstin: user?.gstin || "",
    email: user?.email || "",
    plan: user?.plan || "trial",
    phone: "",
  });
}

export function saveSettings(s: CompanySettings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(s));
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
  return safeParse(localStorage.getItem(KEYS.trial), {
    reconCount: 0,
    invoiceCount: 0,
  });
}

/** Fresh account / signup — trial starts at 0/1 */
export function resetTrialUsage() {
  localStorage.setItem(
    KEYS.trial,
    JSON.stringify({ reconCount: 0, invoiceCount: 0 })
  );
}

/** Clear recon + chase so a new signup doesn't inherit prior demo state */
export function clearReconData() {
  localStorage.removeItem(KEYS.results);
  localStorage.removeItem(KEYS.summary);
  localStorage.removeItem(KEYS.chase);
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
        "Free trial allows 1 reconciliation. Upgrade to Starter (₹999/mo) or Growth (₹2,499/mo) to continue.",
    };
  }
  return { ok: true };
}
