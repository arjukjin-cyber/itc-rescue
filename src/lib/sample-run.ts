"use client";

import type { MatchResult, ReconSummary } from "./types";

/**
 * The unsaved sample run (#29: samples are never saved or counted) lives in memory only, for
 * this tab. It keeps the sample on screen across /reconcile and its ?view= filters (and
 * back from other pages in the same tab), and the sidebar counts follow it on those screens. Cleared by a real saved run;
 * gone on reload.
 */
export interface SampleRun {
  results: MatchResult[];
  summary: ReconSummary;
  files: [string, string];
}

let current: { scope: string | null; run: SampleRun } | null = null;
/** Active (user email|GSTIN) scope, published by AppShell (see client-scope.ts). */
let activeScope: string | null = null;

/** Called by AppShell on every render; a run from another user/GSTIN is dropped. */
export function setSampleRunScope(scope: string | null) {
  activeScope = scope;
  if (current && current.scope !== scope) current = null;
}

export function getSampleRun(): SampleRun | null {
  return current && current.scope !== null && current.scope === activeScope ? current.run : null;
}

export function setSampleRun(run: SampleRun) {
  current = { scope: activeScope, run };
}

export function clearSampleRun() {
  current = null;
}

/** Screens that show the in-page recon (and therefore a sample run). */
export function isReconScreen(pathname: string): boolean {
  return pathname === "/reconcile";
}
