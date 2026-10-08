"use client";

import type { ChaseItem, ChaseStatus, MatchResult, ReconSummary } from "./types";
import {
  canRunRecon as localCanRun,
  clearLocalUser,
  getChaseItems,
  getLocalUser,
  getOpenChaseItems,
  getResults,
  getSummary,
  saveRecon as localSaveRecon,
  updateChaseStatus as localUpdateChase,
} from "./storage";

/** True when the UI believes the user is logged in (localStorage session). */
function expectsServerAuth(): boolean {
  return Boolean(getLocalUser());
}

function authRequiredError(message = "Session expired. Please log in again.") {
  clearLocalUser();
  return message;
}

/** The latest saved recon as a screen needs it. */
export interface ReconData {
  results: MatchResult[];
  summary: ReconSummary;
  createdAt?: string;
}

/**
 * Tri-state for screens fed by GET /api/recon:
 *   undefined = not loaded / failed (render a skeleton or the error path, never the empty state)
 *   null      = the server explicitly said there is no saved recon (`recon: null`), or, in
 *               demo mode (no Postgres), there is no local recon
 *   object    = data
 */
export type ReconTri = ReconData | null | undefined;

export interface ReconState {
  persistence: "postgres" | "demo";
  results: MatchResult[];
  summary: ReconSummary | null;
  canRun: boolean;
  reason?: string;
  /** Set on every failure (401, non-2xx, network, unexpected body). `recon` is then undefined. */
  authError?: string;
  /** Saved run's created_at (ISO) from GET /api/recon (#28); postgres only. */
  createdAt?: string;
  recon: ReconTri;
}

function demoState(): ReconState {
  const g = localCanRun();
  const results = getResults();
  const summary = getSummary();
  return {
    persistence: "demo",
    results,
    summary,
    canRun: g.ok,
    reason: g.reason,
    recon: summary ? { results, summary } : null,
  };
}

function failState(message: string): ReconState {
  return { persistence: "postgres", results: [], summary: null, canRun: false, reason: message, authError: message, recon: undefined };
}

export async function fetchReconState(): Promise<ReconState> {
  const wantsAuth = expectsServerAuth();
  try {
    const res = await fetch("/api/recon", { credentials: "include" });
    if (res.status === 401) {
      if (wantsAuth) {
        authRequiredError();
        return failState("Session expired. Please log in again.");
      }
      return demoState();
    }
    if (!res.ok) {
      if (wantsAuth) {
        const data = await res.json().catch(() => ({}));
        return failState((data as { error?: string }).error || "Could not load reconciliation");
      }
    } else {
      const data = await res.json().catch(() => null);
      if (data?.persistence === "postgres") {
        const raw = data.recon;
        // Empty ONLY on an explicit `recon: null`. A missing field is an unexpected body → error.
        if (raw === undefined) return failState("Could not load reconciliation");
        const results: MatchResult[] = raw?.results || [];
        const summary: ReconSummary | null = raw?.summary || null;
        const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : undefined;
        return {
          persistence: "postgres",
          results,
          summary,
          canRun: data.trial?.canRun !== false,
          reason: data.trial?.reason,
          createdAt,
          recon: raw === null ? null : summary ? { results, summary, createdAt } : null,
        };
      }
      if (!wantsAuth || data?.persistence === "demo") return demoState();
      // Signed-in user, 2xx but an unrecognised body: an error, not "no recon" (no empty flash).
      return failState("Could not load reconciliation");
    }
  } catch (e) {
    if (wantsAuth) return failState(e instanceof Error ? e.message : "Network error");
  }
  return demoState();
}

export async function persistRecon(
  results: MatchResult[],
  summary: ReconSummary
): Promise<{
  ok: boolean;
  error?: string;
  chase?: ChaseItem[];
  persistence: "postgres" | "demo" | "sample";
  reconCount?: number;
  /** POST /api/recon → trial.canRun (false once the free run is used). */
  canRun?: boolean;
  authError?: string;
  paywall?: boolean;
}> {
  const wantsAuth = expectsServerAuth();
  try {
    const res = await fetch("/api/recon", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, summary }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.ok && data.persistence === "postgres") {
      localSaveRecon(results, summary);
      return {
        ok: true,
        chase: data.chase as ChaseItem[] | undefined,
        persistence: "postgres",
        reconCount: (data.trial as { reconCount?: number } | undefined)?.reconCount,
        canRun: (data.trial as { canRun?: boolean } | undefined)?.canRun,
      };
    }
    if (res.ok && data.persistence === "sample") {
      // Sample data: shown only, never saved or counted.
      return { ok: true, persistence: "sample" };
    }
    if (res.status === 402) {
      return {
        ok: false,
        error: (data.error as string) || "Upgrade required",
        persistence: "postgres",
        paywall: true,
      };
    }
    if (res.status === 401) {
      const msg = authRequiredError((data.error as string) || "Unauthorized");
      return {
        ok: false,
        error: msg,
        persistence: "postgres",
        authError: msg,
      };
    }
    // Authenticated users must NEVER silently fall back to demo on 503/500/etc.
    if (wantsAuth) {
      return {
        ok: false,
        error: (data.error as string) || `Save failed (${res.status})`,
        persistence: "postgres",
      };
    }
    if (res.status === 503) {
      localSaveRecon(results, summary);
      return { ok: true, persistence: "demo" };
    }
    return {
      ok: false,
      error: (data.error as string) || "Save failed",
      persistence: "demo",
    };
  } catch (e) {
    if (wantsAuth) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Network error saving reconciliation",
        persistence: "postgres",
      };
    }
    localSaveRecon(results, summary);
    return { ok: true, persistence: "demo" };
  }
}

export async function fetchChaseItems(): Promise<{
  persistence: "postgres" | "demo";
  items: ChaseItem[];
  authError?: string;
}> {
  const wantsAuth = expectsServerAuth();
  try {
    const res = await fetch("/api/chase", { credentials: "include" });
    if (res.status === 401) {
      if (wantsAuth) {
        return {
          persistence: "postgres",
          items: [],
          authError: authRequiredError(),
        };
      }
      return { persistence: "demo", items: getChaseItems() };
    }
    if (res.ok) {
      const data = await res.json();
      if (data.persistence === "postgres") {
        return { persistence: "postgres", items: data.items || [] };
      }
    } else if (wantsAuth) {
      return {
        persistence: "postgres",
        items: [],
        authError: "Could not load chase items",
      };
    }
  } catch (e) {
    if (wantsAuth) {
      return {
        persistence: "postgres",
        items: [],
        authError: e instanceof Error ? e.message : "Network error",
      };
    }
  }
  if (wantsAuth) {
    return { persistence: "postgres", items: [], authError: "Could not load chase items" };
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
  const wantsAuth = expectsServerAuth();
  try {
    const res = await fetch(`/api/chase/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401 && wantsAuth) {
      authRequiredError();
      return [];
    }
    if (res.ok) {
      const data = await res.json();
      if (data.persistence === "postgres") return data.items || [];
    }
    if (wantsAuth) return [];
  } catch {
    if (wantsAuth) return [];
  }
  return localUpdateChase(id, status);
}

/**
 * Inline "Mark resolved" for an at-risk recon row. Chase items share the
 * recon result id, so this flips the chase item to "fixed" (persisted in
 * Postgres for signed-in users). Returns the updated chase list.
 */
export function markResultResolved(resultId: string): Promise<ChaseItem[]> {
  return persistChaseStatus(resultId, "fixed");
}
