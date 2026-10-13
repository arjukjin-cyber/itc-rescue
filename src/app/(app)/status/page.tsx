"use client";

import { useEffect, useState } from "react";
import { SquareKanban } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { fetchChaseItems, persistChaseStatus } from "@/lib/api-data";
import { inr } from "@/lib/format";
import { emitChaseCount } from "@/lib/ui-events";
import type { ChaseItem, ChaseStatus } from "@/lib/types";

const COLUMNS: { key: ChaseStatus; label: string; dot: string; emptyHint: string }[] = [
  { key: "pending", label: "Pending", dot: "dot-warn", emptyHint: "Invoices waiting on the vendor land here." },
  { key: "fixed", label: "Fixed", dot: "dot-ok", emptyHint: "Move here when the vendor files GSTR-1." },
  { key: "still_blocked", label: "Still blocked", dot: "dot-risk", emptyHint: "Park stuck invoices here for follow-up." },
];

export default function StatusPage() {
  const [items, setItems] = useState<ChaseItem[]>([]);
  /** Hold EmptyState until first fetch settles (no empty-board flash on cold load) */
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    const { items: next } = await fetchChaseItems();
    setItems(next);
    setLoaded(true);
  }

  useEffect(() => {
    reload();
    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (loaded) emitChaseCount(items.filter((i) => i.status === "pending").length);
  }, [items, loaded]);

  async function move(id: string, status: ChaseStatus) {
    const next = await persistChaseStatus(id, status);
    // Empty list = failed save (401 / server error): re-read instead of blanking the board
    if (next.length) setItems(next);
    else void reload();
  }

  if (!loaded) {
    return <div aria-busy="true" aria-label="Loading status board" />;
  }

  if (!items.length) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Status</h1>
        <EmptyState
          icon={SquareKanban}
          title="Run a reconciliation to start tracking vendor fixes."
          actionLabel="Run reconciliation"
          actionHref="/reconcile"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="page-title">Status</h1>
        <div className="helper-line">Move each invoice as the vendor fixes it.</div>
      </div>

      <div className="grid gap-3 pt-1 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          const total = colItems.reduce((s, i) => s + (i.amount || 0), 0);
          return (
            <section key={col.key} className="card flex min-h-[14rem] flex-col p-2" aria-label={col.label}>
              <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                <span className={`dot ${col.dot}`} aria-hidden />
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-ink)" }}>
                  {col.label}
                </h2>
                <span className="muted">{colItems.length}</span>
                <span className="ml-auto text-[12px]" style={{ color: "var(--color-text-2)" }}>
                  {inr(total)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {colItems.map((item) => (
                  <div key={item.id} className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium" style={{ color: "var(--color-ink)" }}>
                          {item.vendorName}
                        </div>
                        <div className="mono-sm muted">{item.invoiceNumber}</div>
                      </div>
                      <div className="shrink-0 text-right">{inr(item.amount)}</div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {COLUMNS.filter((c) => c.key !== item.status).map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => move(item.id, c.key)}
                          className="btn btn-sm btn-quiet"
                          style={{ height: 22, fontSize: 12 }}
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!colItems.length && (
                  <div
                    title={col.emptyHint}
                    className="flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-6 text-center"
                    style={{ borderColor: "#d4d4d8", color: "var(--color-text-3)" }}
                  >
                    No invoices
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
