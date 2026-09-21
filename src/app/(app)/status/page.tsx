"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Inbox, Kanban } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { fetchChaseItems, persistChaseStatus } from "@/lib/api-data";
import { formatINRPrecise } from "@/lib/reconcile";
import type { ChaseItem, ChaseStatus } from "@/lib/types";

const COLUMNS: {
  key: ChaseStatus;
  label: string;
  laneStyle: CSSProperties;
  headerFg: string;
  emptyHint: string;
}[] = [
  {
    key: "pending",
    label: "Pending",
    laneStyle: {
      borderColor: "var(--color-status-warn-bd)",
      backgroundColor: "var(--color-status-warn-bg)",
    },
    headerFg: "var(--color-status-warn-fg)",
    emptyHint: "Move an invoice here while you wait on the vendor",
  },
  {
    key: "fixed",
    label: "Fixed",
    laneStyle: {
      borderColor: "var(--color-status-ok-bd)",
      backgroundColor: "var(--color-status-ok-bg)",
    },
    headerFg: "var(--color-status-ok-fg)",
    emptyHint: "Move here when the vendor files GSTR-1",
  },
  {
    key: "still_blocked",
    label: "Still blocked",
    laneStyle: {
      borderColor: "var(--color-status-risk-bd)",
      backgroundColor: "var(--color-status-risk-bg)",
    },
    headerFg: "var(--color-status-risk-fg)",
    emptyHint: "Park stuck invoices here for follow-up",
  },
];

export default function StatusPage() {
  const [items, setItems] = useState<ChaseItem[]>([]);

  async function reload() {
    const { items: next } = await fetchChaseItems();
    setItems(next);
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

  async function move(id: string, status: ChaseStatus) {
    const next = await persistChaseStatus(id, status);
    setItems(next);
  }

  if (!items.length) {
    return (
      <div className="flex min-h-[min(28rem,70vh)] items-center justify-center px-2">
        <EmptyState
          icon={Kanban}
          title="Status board is empty"
          description="After a reconciliation, at-risk invoices show up here so you can track vendor fixes."
          actionLabel="Go to Reconcile"
          actionHref="/reconcile"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="page-title">Status board</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Tap to move invoices across Pending / Fixed / Still blocked
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          return (
            <div
              key={col.key}
              className="flex min-h-[14rem] flex-col rounded-[var(--radius-md)] border p-2"
              style={col.laneStyle}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold" style={{ color: col.headerFg }}>
                  {col.label}
                </h2>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {colItems.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {colItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--radius-sm)] border p-2.5 shadow-sm"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      {item.vendorName}
                    </div>
                    <div className="mt-0.5 text-meta">
                      {item.invoiceNumber} · {formatINRPrecise(item.amount)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {COLUMNS.filter((c) => c.key !== item.status).map((c) => (
                        <button
                          key={c.key}
                          onClick={() => move(item.id, c.key)}
                          className="rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:opacity-90"
                          style={{
                            backgroundColor: "var(--color-bg-subtle)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!colItems.length && (
                  <div
                    className="flex min-h-[8rem] flex-1 flex-col items-center justify-center rounded-[var(--radius-sm)] border border-dashed px-3 py-4 text-center"
                    style={{
                      borderColor: "var(--color-border-strong)",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]"
                      style={{
                        backgroundColor: "var(--color-bg-subtle)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <Inbox size={16} aria-hidden />
                    </div>
                    <p
                      className="mt-2 text-sm font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      No items
                    </p>
                    <p className="mt-1 max-w-[13rem] text-meta leading-snug">
                      {col.emptyHint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
