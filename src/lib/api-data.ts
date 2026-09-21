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

export async function fetchReconState(): Promise<{
  persistence: "postgres" | "demo";
  results: MatchResult[];
  summary: ReconSummary | null;
  canRun: boolean;
  reason?: string;
  authError?: string;
}> {
  const wantsAuth = expectsServerAuth();
  try {
    const res = await fetch("/api/recon", { credentials: "include" });
    if (res.status === 401) {
      if (wantsAuth) {
        return {
          persistence: "postgres",
          results: [],
          summary: null,
          canRun: false,
          reason: authRequiredError(),
          authError: "Session expired. Please log in again.",
        };
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
    if (!res.ok) {
      if (wantsAuth) {
        const data = await res.json().catch(() => ({}));
        return {
          persistence: "postgres",
          results: [],
          summary: null,
          canRun: false,
          reason: (data as { error?: string }).error || "Could not load reconciliation",
          authError: (data as { error?: string }).error || "Could not load reconciliation",
        };
      }
    } else {
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
      if (!wantsAuth || data.persistence === "demo") {
        const g = localCanRun();
        return {
          persistence: "demo",
          results: getResults(),
          summary: getSummary(),
          canRun: g.ok,
          reason: g.reason,
        };
      }
    }
  } catch (e) {
    if (wantsAuth) {
      return {
        persistence: "postgres",
        results: [],
        summary: null,
        canRun: false,
        reason: e instanceof Error ? e.message : "Network error",
        authError: e instanceof Error ? e.message : "Network error",
      };
    }
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
): Promise<{
  ok: boolean;
  error?: string;
  chase?: ChaseItem[];
  persistence: "postgres" | "demo";
  reconCount?: number;
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
      };
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
    const res = await fetch(`/api/chase/${id}`, {
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
