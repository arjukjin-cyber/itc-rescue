"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Upload, Play, Loader2, Lock, Filter } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import * as XLSX from "xlsx";
import { CategoryBadge } from "@/components/Badge";
import { StatCard } from "@/components/StatCard";
import { isPaywalled, setTrialFromServer } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { fetchReconState, persistRecon } from "@/lib/api-data";
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
  const router = useRouter();
  const [booksFile, setBooksFile] = useState<File | null>(null);
  const [gstrFile, setGstrFile] = useState<File | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [filter, setFilter] = useState<MatchCategory | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paywall, setPaywall] = useState<string | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await fetchReconState();
      if (cancelled) return;
      if (state.authError) {
        setError(state.authError);
        router.replace("/login");
        return;
      }
      if (state.results.length) {
        setResults(state.results);
        setSummary(state.summary);
      }
      if (!state.canRun) {
        setTrialUsed(true);
        setPaywall(state.reason || "Upgrade required");
      } else {
        setTrialUsed(isPaywalled() && state.persistence === "demo");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => r.category === filter);
  }, [results, filter]);

  async function runWithFiles(books: File, gstr: File) {
    setError("");
    setPaywall(null);

    const state = await fetchReconState();
    if (!state.canRun) {
      setPaywall(state.reason || "Upgrade required");
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
      const saved = await persistRecon(matched, sum);
      if (!saved.ok) {
        if (saved.authError) {
          setError(saved.authError);
          router.replace("/login");
          return;
        }
        if (saved.paywall) {
          setPaywall(saved.error || "Upgrade required");
          setTrialUsed(true);
          return;
        }
        // Surface 500 / other server failures (do not silently pretend success)
        setError(saved.error || "Failed to save reconciliation");
        return;
      }
      if (saved.persistence === "postgres" && typeof saved.reconCount === "number") {
        setTrialFromServer(saved.reconCount);
      }
      setResults(matched);
      setSummary(sum);
      setFilter("itc_at_risk");
      setTrialUsed(true);
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
    const state = await fetchReconState();
    if (!state.canRun) {
      setPaywall(state.reason || "Upgrade required");
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
      const saved = await persistRecon(matched, sum);
      if (!saved.ok) {
        if (saved.authError) {
          setError(saved.authError);
          router.replace("/login");
          return;
        }
        if (saved.paywall) {
          setPaywall(saved.error || "Upgrade required");
          setTrialUsed(true);
          return;
        }
        // Surface 500 / other server failures (do not silently pretend success)
        setError(saved.error || "Failed to save reconciliation");
        return;
      }
      if (saved.persistence === "postgres" && typeof saved.reconCount === "number") {
        setTrialFromServer(saved.reconCount);
      }
      setResults(matched);
      setSummary(sum);
      setFilter("itc_at_risk");
      setTrialUsed(true);
    } catch {
      setError("Failed to load sample files");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="page-title">Reconcile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Match purchase register vs GSTR-2B · GSTIN + invoice# + date (±1 day)
        </p>
      </div>

      {paywall && (
        <div className="toast-risk" role="alert">
          <div className="flex min-w-0 items-start gap-2 text-sm">
            <Lock size={18} className="mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="toast-risk-title">Free trial used — upgrade to continue</p>
              <p className="toast-risk-body">{paywall}</p>
            </div>
          </div>
          <Link
            href="/settings"
            className="btn-accent shrink-0 px-4 py-2 text-center text-sm font-semibold"
          >
            Upgrade in Settings
          </Link>
        </div>
      )}

      {!paywall && trialUsed && summary && (
        <div
          className="px-4 py-3 text-sm"
          style={{
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-accent-ring)",
            backgroundColor: "var(--color-accent-soft)",
            color: "var(--color-text)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
            Trial recon used.
          </span>{" "}
          <span style={{ color: "var(--color-text-secondary)" }}>
            Chase vendors below on this result. Next upload needs a paid plan —{" "}
          </span>
          <Link
            href="/settings"
            className="font-semibold underline"
            style={{ color: "var(--color-accent)" }}
          >
            see Starter / Growth
          </Link>
          .
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

          {summary.itcAtRiskAmount > 0 && (
            <div
              className="px-4 py-3 text-sm font-medium sm:px-5"
              style={{
                borderRadius: "var(--radius-md)",
                border: "1px solid color-mix(in srgb, var(--color-status-risk-fg) 28%, transparent)",
                backgroundColor: "var(--color-status-risk-bg)",
                color: "var(--color-status-risk-fg)",
              }}
            >
              <strong className="font-bold tabular-nums">
                {formatINR(summary.itcAtRiskAmount)} ITC at risk
              </strong>
              {" — "}
              {summary.itcAtRisk} invoice{summary.itcAtRisk === 1 ? "" : "s"} missing from
              GSTR-2B. Chase vendors before filing GSTR-3B.
            </div>
          )}

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

          <div
            className="overflow-hidden shadow-sm"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <div className="table-scroll overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
                <tbody style={{ borderColor: "var(--color-border)" }} className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.id} className="recon-row">
                      <td className="whitespace-nowrap px-4 py-3">
                        <CategoryBadge category={r.category} />
                      </td>
                      <td
                        className="max-w-[160px] truncate px-4 py-3 font-medium"
                        style={{ color: "var(--color-text)" }}
                      >
                        {r.vendorName}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 font-mono"
                        style={{
                          fontSize: "0.8125rem",
                          lineHeight: "1.125rem",
                          color: "var(--color-text-secondary)",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                        }}
                      >
                        {r.gstin}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 font-mono"
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-text)",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                        }}
                      >
                        {r.invoiceNumber}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {r.invoiceDate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {r.booksTax ? formatINRPrecise(r.booksTax) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {r.gstr2bTax ? formatINRPrecise(r.gstr2bTax) : "—"}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-4 py-3 text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <div className="border-t px-3 py-4" style={{ borderColor: "var(--color-border)" }}>
                <EmptyState
                  icon={Filter}
                  title="No rows in this filter"
                  description="Nothing matches the selected category. Switch filter or show all invoices from this recon."
                  actionLabel="Show all rows"
                  onAction={() => setFilter("all")}
                />
              </div>
            )}
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
