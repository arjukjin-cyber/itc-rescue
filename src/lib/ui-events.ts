"use client";

/**
 * Tiny UI-only event bus so the app shell (sidebar pending count, trial meter)
 * refreshes after in-page actions without a navigation. No data logic here.
 */
export const CHASE_COUNT_EVENT = "itc:chase-count";
export const TRIAL_EVENT = "itc:trial-changed";
/** A new recon was saved: the sidebar re-reads ITC view counts + GSTR-3B ₹ blocked. */
export const RECON_EVENT = "itc:recon-changed";

export function emitChaseCount(pending: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number>(CHASE_COUNT_EVENT, { detail: pending }));
}

/**
 * Trial usage changed. Pass the authoritative count (POST /api/recon → trial.reconCount) so the
 * sidebar meter updates in the same tick, with no navigation, reload or extra request.
 */
export function emitTrialChanged(reconCount?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number | undefined>(TRIAL_EVENT, { detail: reconCount }));
}

/** Recon changed (saved run, or an unsaved sample run shown in-page): the sidebar re-reads counts. */
export function emitReconChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECON_EVENT));
}
