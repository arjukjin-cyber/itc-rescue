"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Upload, Play, Loader2, Lock } from "lucide-react";
import * as XLSX from "xlsx";
import { CategoryBadge } from "@/components/Badge";
import { StatCard } from "@/components/StatCard";
import {
  canRunRecon,
  getResults,
  getSummary,
  saveRecon,
} from "@/lib/storage";
import { parseInvoiceFile, fetchSampleAsFile } from "@/lib/parseFile";
import { formatINR, formatINRPrecise, reconcile } from "@/lib/reconcile";
import type { MatchCategory, MatchResult, ReconSummary } from "@/lib/types";

const FILTERS: { key: MatchCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "itc_at_risk", label: "ITC at risk" },
  { key: "value_mismatch", label: "Value mismatch" },
  { key: "matched", label: "Matched" },
  { key: "unclaimed", label: "Unclaimed" },
];

export default function ReconcilePage() {
  const [booksFile, setBooksFile] = useState<File | null>(null);
  const [gstrFile, setGstrFile] = useState<File | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [filter, setFilter] = useState<MatchCategory | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paywall, setPaywall] = useState<string | null>(null);

  useEffect(() => {
    const r = getResults();
    const s = getSummary();
    if (r.length) {
      setResults(r);
      setSummary(s);
    }
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => r.category === filter);
  }, [results, filter]);

  async function runWithFiles(books: File, gstr: File) {
    setError("");
    setPaywall(null);

    const gate = canRunRecon();
    if (!gate.ok) {
      setPaywall(gate.reason || "Upgrade required");
      return;
    }

    setLoading(true);
    try {
      const booksInv = await parseInvoiceFile(books, "books");
      const gstrInv = await parseInvoiceFile(gstr, "gstr2b");
      if (!booksInv.length || !gstrInv.length) {
        setError(
          "Could not parse invoices. Check column headers (GSTIN, Invoice Number, Invoice Date, tax columns)."
        );
        return;
      }

      const { results: matched, summary: sum } = reconcile(booksInv, gstrInv);
      saveRecon(matched, sum);
      setResults(matched);
      setSummary(sum);
      setFilter("itc_at_risk");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation failed");
    } finally {
      setLoading(false);
    }
  }

  async function onRun() {
    if (!booksFile || !gstrFile) {
      setError("Please select both purchase register and GSTR-2B files.");
      return;
    }
    await runWithFiles(booksFile, gstrFile);
  }

  async function loadSamples() {
    setError("");
    setPaywall(null);
    const gate = canRunRecon();
    if (!gate.ok) {
      setPaywall(gate.reason || "Upgrade required");
      return;
    }
    setLoading(true);
    try {
      const books = await fetchSampleAsFile(
        "/samples/purchase-register.csv",
        "purchase-register.csv"
      );
      const gstr = await fetchSampleAsFile("/samples/gstr-2b.csv", "gstr-2b.csv");
      setBooksFile(books);
      setGstrFile(gstr);
      // parse inline so loading spinner stays until done
      const booksInv = await parseInvoiceFile(books, "books");
      const gstrInv = await parseInvoiceFile(gstr, "gstr2b");
      const { results: matched, summary: sum } = reconcile(booksInv, gstrInv);
      saveRecon(matched, sum);
      setResults(matched);
      setSummary(sum);
      setFilter("itc_at_risk");
    } catch {
      setError("Failed to load sample files");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reconcile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Match purchase register vs GSTR-2B · GSTIN + invoice# + date (±1 day)
        </p>
      </div>

      {paywall && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-amber-950">
            <Lock size={18} className="mt-0.5 shrink-0" />
            <span>{paywall}</span>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-teal-800"
          >
            Upgrade plan
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FileDrop
          label="Purchase register (books)"
          hint="Excel or CSV from Tally / Zoho / Excel"
          file={booksFile}
          onFile={setBooksFile}
        />
        <FileDrop
          label="GSTR-2B"
          hint="Excel/CSV export from GST portal"
          file={gstrFile}
          onFile={setGstrFile}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onRun}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Run reconciliation
        </button>
        <button
          onClick={loadSamples}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          <Upload size={16} />
          Load sample files
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Matched"
              value={summary.matched}
              tone="success"
              sub={formatINR(summary.matchedAmount)}
            />
            <StatCard
              label="ITC at risk"
              value={summary.itcAtRisk}
              tone="danger"
              sub={formatINR(summary.itcAtRiskAmount)}
            />
            <StatCard label="Value mismatch" value={summary.valueMismatch} tone="warn" />
            <StatCard label="Unclaimed" value={summary.unclaimed} tone="info" />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f.key
                    ? "bg-teal-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {f.label}
                {f.key !== "all" &&
                  ` (${results.filter((r) => r.category === f.key).length})`}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="table-scroll overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Vendor</th>
                    <th className="px-4 py-3 font-semibold">GSTIN</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Books tax</th>
                    <th className="px-4 py-3 font-semibold text-right">2B tax</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3">
                        <CategoryBadge category={r.category} />
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-900">
                        {r.vendorName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {r.gstin}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{r.invoiceNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {r.invoiceDate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {r.booksTax ? formatINRPrecise(r.booksTax) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {r.gstr2bTax ? formatINRPrecise(r.gstr2bTax) : "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-500">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No rows in this filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/chase"
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Chase vendors →
            </Link>
            <Link
              href="/status"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open status board
            </Link>
            <button
              onClick={() => exportResults(results)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FileDrop({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 transition hover:border-teal-400 hover:bg-teal-50/30">
      <Upload className="text-teal-700" size={28} />
      <span className="mt-3 text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-1 text-xs text-slate-500">{hint}</span>
      {file && (
        <span className="mt-3 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
          {file.name}
        </span>
      )}
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function exportResults(results: MatchResult[]) {
  const rows = results.map((r) => ({
    Category: r.category,
    Vendor: r.vendorName,
    GSTIN: r.gstin,
    Invoice: r.invoiceNumber,
    Date: r.invoiceDate,
    "Books Tax": r.booksTax,
    "2B Tax": r.gstr2bTax,
    Diff: r.taxDiff,
    Notes: r.notes || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recon");
  XLSX.writeFile(wb, "itc-rescue-recon.xlsx");
}
