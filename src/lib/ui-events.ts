"use client";

import type { MatchResult } from "./types";

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

export function emitTrialChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRIAL_EVENT));
}

/**
 * Recon changed. No detail = a run was saved (sidebar re-reads GET /api/recon).
 * With results = an unsaved sample run shown in-page (#29); sidebar counts follow it
 * until the next navigation re-reads the server.
 */
export function emitReconChanged(results?: MatchResult[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MatchResult[] | undefined>(RECON_EVENT, { detail: results }));
}
