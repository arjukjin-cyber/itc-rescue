"use client";

import type { ChaseItem, ChaseStatus, MatchResult, ReconSummary } from "./types";
import {
  canRunRecon as localCanRun,
  getChaseItems,
  getOpenChaseItems,
  getResults,
  getSummary,
  saveRecon as localSaveRecon,
  updateChaseStatus as localUpdateChase,
} from "./storage";

export async function fetchReconState(): Promise<{
  persistence: "postgres" | "demo";
  results: MatchResult[];
  summary: ReconSummary | null;
  canRun: boolean;
  reason?: string;
}> {
  try {
    const res = await fetch("/api/recon", { credentials: "include" });
    if (res.status === 401) {
      return {
        persistence: "demo",
        results: getResults(),
        summary: getSummary(),
        ...(() => {
          const g = localCanRun();
          return { canRun: g.ok, reason: g.reason };
        })(),
      };
    }
    const data = await res.json();
    if (data.persistence === "postgres") {
      return {
        persistence: "postgres",
        results: data.recon?.results || [],
        summary: data.recon?.summary || null,
        canRun: data.trial?.canRun !== false,
        reason: data.trial?.reason,
      };
    }
  } catch {
    // fall through
  }
  const g = localCanRun();
  return {
    persistence: "demo",
    results: getResults(),
    summary: getSummary(),
    canRun: g.ok,
    reason: g.reason,
  };
}

export async function persistRecon(
  results: MatchResult[],
  summary: ReconSummary
): Promise<{ ok: boolean; error?: string; chase?: ChaseItem[]; persistence: "postgres" | "demo" }> {
  try {
    const res = await fetch("/api/recon", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, summary }),
    });
    const data = await res.json();
    if (res.ok && data.persistence === "postgres") {
      // mirror locally for snappy UI
      localSaveRecon(results, summary);
      return { ok: true, chase: data.chase, persistence: "postgres" };
    }
    if (res.status === 402) {
      return { ok: false, error: data.error || "Upgrade required", persistence: "postgres" };
    }
    if (res.status === 401 || res.status === 503) {
      localSaveRecon(results, summary);
      return { ok: true, persistence: "demo" };
    }
    return { ok: false, error: data.error || "Save failed", persistence: "demo" };
  } catch {
    localSaveRecon(results, summary);
    return { ok: true, persistence: "demo" };
  }
}

export async function fetchChaseItems(): Promise<{
  persistence: "postgres" | "demo";
  items: ChaseItem[];
}> {
  try {
    const res = await fetch("/api/chase", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.persistence === "postgres") {
        return { persistence: "postgres", items: data.items || [] };
      }
    }
  } catch {
    // fall through
  }
  return { persistence: "demo", items: getChaseItems() };
}

export async function fetchOpenChaseItems(): Promise<ChaseItem[]> {
  const { persistence, items } = await fetchChaseItems();
  if (persistence === "postgres") {
    return items.filter((c) => c.status === "pending" || c.status === "still_blocked");
  }
  return getOpenChaseItems();
}

export async function persistChaseStatus(
  id: string,
  status: ChaseStatus
): Promise<ChaseItem[]> {
  try {
    const res = await fetch(`/api/chase/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.persistence === "postgres") return data.items || [];
    }
  } catch {
    // fall through
  }
  return localUpdateChase(id, status);
}
