"use client";

import { useEffect, useState } from "react";
import { Inbox, Kanban } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { fetchChaseItems, persistChaseStatus } from "@/lib/api-data";
import { formatINRPrecise } from "@/lib/reconcile";
import type { ChaseItem, ChaseStatus } from "@/lib/types";

const COLUMNS: { key: ChaseStatus; label: string; tone: string; emptyHint: string }[] = [
  {
    key: "pending",
    label: "Pending",
    tone: "border-amber-200 bg-amber-50/50",
    emptyHint: "Move an invoice here while you wait on the vendor",
  },
  {
    key: "fixed",
    label: "Fixed",
    tone: "border-emerald-200 bg-emerald-50/50",
    emptyHint: "Move here when the vendor files GSTR-1",
  },
  {
    key: "still_blocked",
    label: "Still blocked",
    tone: "border-red-200 bg-red-50/50",
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Status board</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Tap to move invoices across Pending / Fixed / Still blocked
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          return (
            <div
              key={col.key}
              className={`flex min-h-[16rem] flex-col rounded-xl border p-3 ${col.tone}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-slate-800">{col.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {colItems.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col space-y-2">
                {colItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="font-semibold text-slate-900">{item.vendorName}</div>
                    <div className="mt-0.5 text-meta">
                      {item.invoiceNumber} · {formatINRPrecise(item.amount)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {COLUMNS.filter((c) => c.key !== item.status).map((c) => (
                        <button
                          key={c.key}
                          onClick={() => move(item.id, c.key)}
                          className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 hover:bg-teal-100 hover:text-teal-800"
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!colItems.length && (
                  <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Inbox size={18} aria-hidden />
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-slate-700">No items</p>
                    <p className="mt-1 max-w-[13rem] text-meta leading-snug text-slate-600">
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
