"use client";

/**
 * Tiny UI-only event bus so the app shell (sidebar pending count, trial meter)
 * refreshes after in-page actions without a navigation. No data logic here.
 */
export const CHASE_COUNT_EVENT = "itc:chase-count";
export const TRIAL_EVENT = "itc:trial-changed";

export function emitChaseCount(pending: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number>(CHASE_COUNT_EVENT, { detail: pending }));
}

export function emitTrialChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRIAL_EVENT));
}

/* "Last recon" stamp. GET /api/recon does not return the run's created_at, so we
   keep a per-browser stamp written when a recon is saved here, and fall back to
   the oldest chase-item lastUpdated (set at save time) when it's missing. */
const LAST_RECON_KEY = "itc_last_recon_at";

export function setLastReconAt(iso: string = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_RECON_KEY, iso);
}

export function getLastReconAt(chaseLastUpdated: string[] = []): string | null {
  if (typeof window !== "undefined") {
    const v = localStorage.getItem(LAST_RECON_KEY);
    if (v) return v;
  }
  const times = chaseLastUpdated.map((s) => Date.parse(s)).filter((n) => Number.isFinite(n));
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
