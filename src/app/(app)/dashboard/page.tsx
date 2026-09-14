"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Upload,
  GitCompareArrows,
  MessageSquare,
  Kanban,
  FileSpreadsheet,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { getLocalUser, getSummary, getChaseItems, getSettings } from "@/lib/storage";
import { formatINR } from "@/lib/reconcile";
import type { ReconSummary } from "@/lib/types";

export default function DashboardPage() {
  const [name, setName] = useState("there");
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [pending, setPending] = useState(0);
  const [company, setCompany] = useState("");

  useEffect(() => {
    const u = getLocalUser();
    if (u) setName(u.name?.split(" ")[0] || "there");
    setSummary(getSummary());
    setPending(getChaseItems().filter((c) => c.status === "pending").length);
    setCompany(getSettings().companyName);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="welcome-strip">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">
            Namaste, {name} 👋
          </h1>
          <p
            className="mt-1.5 text-sm leading-relaxed sm:text-base"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {company ? `${company} · ` : ""}
            Unblock ITC before your next GSTR-3B filing.
          </p>
        </div>
        <Link
          href={summary ? "/chase" : "/reconcile"}
          className="btn-accent inline-flex shrink-0 items-center justify-center px-4 py-2.5 text-sm font-semibold"
        >
          {summary ? "Chase vendors →" : "Start reconciling →"}
        </Link>
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Matched" value={summary.matched} tone="success" sub={formatINR(summary.matchedAmount)} />
          <StatCard
            label="ITC at risk"
            value={summary.itcAtRisk}
            tone="danger"
            sub={formatINR(summary.itcAtRiskAmount)}
          />
          <StatCard label="Value mismatch" value={summary.valueMismatch} tone="warn" />
          <StatCard label="Unclaimed (2B only)" value={summary.unclaimed} tone="info" />
        </div>
      ) : (
        <EmptyState
          icon={FileSpreadsheet}
          title="No reconciliation yet"
          description="Upload purchase register + GSTR-2B, or load our sample files for a 30-second demo."
          actionLabel="Start reconciling"
          actionHref="/reconcile"
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: "/reconcile",
            icon: Upload,
            title: "Upload & reconcile",
            desc: "Match books vs GSTR-2B",
          },
          {
            href: "/reconcile",
            icon: GitCompareArrows,
            title: "View results",
            desc: summary ? `${summary.totalBooks} books · ${summary.totalGstr2b} in 2B` : "Run a recon first",
          },
          {
            href: "/chase",
            icon: MessageSquare,
            title: "Vendor chase",
            desc: pending ? `${pending} pending follow-ups` : "WhatsApp EN + HI templates",
          },
          {
            href: "/status",
            icon: Kanban,
            title: "Status board",
            desc: "Pending · Fixed · Still blocked",
          },
        ].map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <card.icon className="text-teal-700" size={22} />
            <div className="mt-3 font-semibold text-slate-900 group-hover:text-teal-800">
              {card.title}
            </div>
            <div className="mt-1 text-meta">{card.desc}</div>
          </Link>
        ))}
      </div>

      {/* Compact sample-files row */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">Sample files (offline demo)</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Download, then upload on Reconcile — or use &quot;Load sample files&quot; there.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/samples/purchase-register.csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            download
          >
            <FileSpreadsheet size={14} />
            purchase-register.csv
          </a>
          <a
            href="/samples/gstr-2b.csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            download
          >
            <FileSpreadsheet size={14} />
            gstr-2b.csv
          </a>
        </div>
      </div>
    </div>
  );
}
