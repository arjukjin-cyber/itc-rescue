"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Kanban } from "lucide-react";
import { getChaseItems, updateChaseStatus } from "@/lib/storage";
import { formatINRPrecise } from "@/lib/reconcile";
import type { ChaseItem, ChaseStatus } from "@/lib/types";

const COLUMNS: { key: ChaseStatus; label: string; tone: string }[] = [
  { key: "pending", label: "Pending", tone: "border-amber-200 bg-amber-50/50" },
  { key: "fixed", label: "Fixed", tone: "border-emerald-200 bg-emerald-50/50" },
  { key: "still_blocked", label: "Still blocked", tone: "border-red-200 bg-red-50/50" },
];

export default function StatusPage() {
  const [items, setItems] = useState<ChaseItem[]>([]);

  useEffect(() => {
    setItems(getChaseItems());
  }, []);

  function move(id: string, status: ChaseStatus) {
    setItems(updateChaseStatus(id, status));
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Kanban className="mx-auto text-teal-700" size={36} />
        <h1 className="mt-3 text-xl font-bold text-slate-900">Status board is empty</h1>
        <p className="mt-2 text-sm text-slate-600">
          After a reconciliation, at-risk invoices show up here so you can track vendor fixes.
        </p>
        <Link
          href="/reconcile"
          className="mt-5 inline-block rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Go to Reconcile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Status board</h1>
        <p className="mt-1 text-sm text-slate-600">
          Drag mentally — tap to move invoices across Pending / Fixed / Still blocked
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          return (
            <div
              key={col.key}
              className={`rounded-xl border p-3 ${col.tone}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-slate-800">{col.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {colItems.length}
                </span>
              </div>
              <div className="space-y-2">
                {colItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="font-semibold text-slate-900">{item.vendorName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
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
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
                    No items
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
