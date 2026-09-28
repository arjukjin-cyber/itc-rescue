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

let current: SampleRun | null = null;

export function getSampleRun(): SampleRun | null {
  return current;
}

export function setSampleRun(run: SampleRun) {
  current = run;
}

export function clearSampleRun() {
  current = null;
}

/** Screens that show the in-page recon (and therefore a sample run). */
export function isReconScreen(pathname: string): boolean {
  return pathname === "/reconcile";
}
