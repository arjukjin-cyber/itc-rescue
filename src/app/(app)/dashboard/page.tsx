"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Upload,
  GitCompareArrows,
  MessageSquare,
  Kanban,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Namaste, {name} 👋
        </h1>
        <p className="mt-1 text-slate-600">
          {company ? `${company} · ` : ""}
          Unblock ITC before your next GSTR-3B filing.
        </p>
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
        <div className="rounded-2xl border border-dashed border-teal-300 bg-teal-50/50 p-8 text-center">
          <FileSpreadsheet className="mx-auto text-teal-700" size={36} />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">No reconciliation yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload purchase register + GSTR-2B, or load our sample files for a 30-second demo.
          </p>
          <Link
            href="/reconcile"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Start reconciling <ArrowRight size={16} />
          </Link>
        </div>
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
            <div className="mt-1 text-xs text-slate-500">{card.desc}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Sample files (offline demo)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Download these, then upload on the Reconcile page — or use &quot;Load sample files&quot; there.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href="/samples/purchase-register.csv"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            download
          >
            purchase-register.csv
          </a>
          <a
            href="/samples/gstr-2b.csv"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            download
          >
            gstr-2b.csv
          </a>
        </div>
      </div>
    </div>
  );
}
