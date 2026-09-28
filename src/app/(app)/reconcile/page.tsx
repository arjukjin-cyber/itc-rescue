"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Play, Loader2, Lock, Filter, Check, Download, MessageCircle, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import * as XLSX from "xlsx";
import { reconCsv, atRiskCsv, atRiskResults, downloadCsv, istDate } from "@/lib/csv-export";
import { HelpTip } from "@/components/HelpTip";
import { RiskTable, atRiskTotal, sortForAction, useChaseRows } from "@/components/RiskTable";
import { Toast, useToast } from "@/components/Toast";
import { getSettings, setTrialFromServer } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { fetchChaseItems, fetchReconState, persistRecon } from "@/lib/api-data";
import { parseInvoiceFile, fetchSampleAsFile } from "@/lib/parseFile";
import { formatINR, reconcile } from "@/lib/reconcile";
import type { MatchCategory, MatchResult, ReconSummary } from "@/lib/types";

const MATCH_RULE = "Matched on GSTIN + invoice number + invoice date (±1 day).";

type FilterKey = MatchCategory | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "itc_at_risk", label: "At risk" },
  { key: "value_mismatch", label: "Mismatch" },
  { key: "matched", label: "Matched" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "all", label: "All" },
];

function defaultFilter(results: MatchResult[]): FilterKey {
  if (results.some((r) => r.category === "itc_at_risk")) return "itc_at_risk";
  if (results.some((r) => r.category === "value_mismatch")) return "value_mismatch";
  return "all";
}

export default function ReconcilePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [booksFile, setBooksFile] = useState<File | null>(null);
  const [gstrFile, setGstrFile] = useState<File | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>("itc_at_risk");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** 402 toast — set only by a real run attempt (server still enforces the gate). */
  const [paywall, setPaywall] = useState<string | null>(null);
  /** Trial used → locked "Run again · Upgrade" button (no banner above results). */
  const [locked, setLocked] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [company, setCompany] = useState("My Company");
  const { toast, show, dismiss } = useToast();
  const { setChase, statusById, pendingCount, resolve, busy } = useChaseRows(show);
  const autoSampleDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setCompany(getSettings().companyName || "My Company");
    (async () => {
      const [state, chase] = await Promise.all([fetchReconState(), fetchChaseItems()]);
      if (cancelled) return;
      if (state.authError) {
        setError(state.authError);
        router.replace("/login");
        return;
      }
      if (state.results.length) {
        setResults(state.results);
        setSummary(state.summary);
        setFilter(defaultFilter(state.results));
      }
      if (!chase.authError) setChase(chase.items);
      setLocked(!state.canRun);
      setLoaded(true);
      // Dashboard "Try with sample files" deep link (/reconcile?sample=1)
      if (new URLSearchParams(window.location.search).get("sample") === "1") {
        router.replace("/reconcile");
        if (state.canRun && !state.results.length && !autoSampleDone.current) {
          autoSampleDone.current = true;
          void loadSamples();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setChase]);

  const counts = useMemo(() => {
    const c: Record<MatchCategory, number> = { matched: 0, itc_at_risk: 0, unclaimed: 0, value_mismatch: 0 };
    for (const r of results) c[r.category] += 1;
    return c;
  }, [results]);

  const filtered = useMemo(
    () => sortForAction(filter === "all" ? results : results.filter((r) => r.category === filter)),
    [results, filter]
  );

  const riskAmount = useMemo(() => atRiskTotal(results), [results]);

  async function afterSaved(
    matched: MatchResult[],
    sum: ReconSummary,
    saved: { persistence: "postgres" | "demo"; reconCount?: number }
  ) {
    if (saved.persistence === "postgres" && typeof saved.reconCount === "number") {
      setTrialFromServer(saved.reconCount);
    }
    setResults(matched);
    setSummary(sum);
    setFilter(defaultFilter(matched));
    setShowUpload(false);
    // Re-read gate + chase list so the locked button and "Chase N" are authoritative
    const [state, chase] = await Promise.all([fetchReconState(), fetchChaseItems()]);
    setLocked(!state.canRun);
    if (!chase.authError) setChase(chase.items);
  }

  async function runWithFiles(books: File, gstr: File) {
    setError("");
    setPaywall(null);

    const state = await fetchReconState();
    if (!state.canRun) {
      setPaywall(state.reason || "Upgrade required");
      setLocked(true);
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
          setLocked(true);
          return;
        }
        // Surface 500 / other server failures (do not silently pretend success)
        setError(saved.error || "Failed to save reconciliation");
        return;
      }
      await afterSaved(matched, sum, saved);
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
      setLocked(true);
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
          setLocked(true);
          return;
        }
        // Surface 500 / other server failures (do not silently pretend success)
        setError(saved.error || "Failed to save reconciliation");
        return;
      }
      await afterSaved(matched, sum, saved);
    } catch {
      setError("Failed to load sample files");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading reconciliation">
        <div className="h-8 w-40 animate-pulse rounded-[var(--radius-sm)]" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="card h-32 animate-pulse" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  const bothFiles = Boolean(booksFile && gstrFile);
  const chaseLabel = `Chase ${pendingCount} vendor${pendingCount === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="page-title">Reconcile</h1>
        <div className="helper-line">
          <span>{summary ? "Match your books against GSTR-2B." : "Drop both files, then run the match."}</span>
          <HelpTip label="Matching rule" text={MATCH_RULE} />
        </div>
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

      {(!summary || showUpload) && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <FileDrop
              label="Purchase register"
              hint="Tally, Zoho or Excel · .csv / .xlsx"
              file={booksFile}
              onFile={setBooksFile}
            />
            <FileDrop
              label="GSTR-2B"
              hint="From the GST portal · .csv / .xlsx"
              file={gstrFile}
              onFile={setGstrFile}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {locked ? (
              <LockedRun large label={summary ? "Run again · Upgrade" : "Run recon · Upgrade"} />
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRun}
                  disabled={loading || !bothFiles}
                  className="btn btn-pri btn-lg"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Run recon
                </button>
                <button
                  type="button"
                  onClick={loadSamples}
                  disabled={loading}
                  className="link-accent text-sm disabled:opacity-50"
                >
                  Try with sample files
                </button>
              </>
            )}
            {summary && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setShowUpload(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-risk-fg)" }}>
          {error}
        </p>
      )}

      {summary && (
        <>
          {!showUpload && (
            <div className="card flex flex-wrap items-center gap-4 px-4 py-3">
              <FilePill name={booksFile?.name} fallback="Purchase register" />
              <FilePill name={gstrFile?.name} fallback="GSTR-2B" />
              <span className="text-[0.8125rem]" style={{ color: "var(--color-text-secondary)" }}>
                {summary.totalBooks} books · {summary.totalGstr2b} in 2B
              </span>
              <div className="ml-auto flex items-center gap-2">
                {locked ? (
                  <LockedRun label="Run again · Upgrade" />
                ) : (
                  <>
                    <button
                      type="button"
                      className="link-accent text-[0.8125rem]"
                      onClick={() => setShowUpload(true)}
                    >
                      Replace files
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={loading}
                      onClick={() => (bothFiles ? void onRun() : setShowUpload(true))}
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      Run again
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Hero: ₹ = ITC-at-risk rows only (matches the at-risk CSV total) */}
          <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="hero-label">ITC at risk</div>
              <div className="hero-amount mt-1">{formatINR(riskAmount)}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {counts.itc_at_risk} invoice{counts.itc_at_risk === 1 ? "" : "s"} missing from GSTR-2B ·{" "}
                {counts.value_mismatch} value mismatch{counts.value_mismatch === 1 ? "" : "es"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-lg"
                disabled={counts.itc_at_risk === 0}
                onClick={() => downloadCsv(`itc-at-risk-${istDate()}.csv`, atRiskCsv(results))}
              >
                <Download size={16} aria-hidden /> At-risk CSV ({counts.itc_at_risk})
              </button>
              {pendingCount > 0 ? (
                <Link href="/chase" className="btn btn-pri btn-lg">
                  <MessageCircle size={16} aria-hidden /> {chaseLabel}
                </Link>
              ) : (
                <Link href="/status" className="btn btn-lg">
                  <ListChecks size={16} aria-hidden /> Open status board
                </Link>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-2 pt-2" role="tablist" aria-label="Filter results">
            {FILTERS.map((f) => {
              const n = f.key === "all" ? results.length : counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  data-active={filter === f.key ? "true" : undefined}
                  onClick={() => setFilter(f.key)}
                  className="tab-pill"
                >
                  {f.label} · {n}
                  {f.key === "matched" && summary.matchedAmount > 0 && (
                    <span style={{ opacity: 0.7 }}>{formatINR(summary.matchedAmount)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {filtered.length ? (
            <RiskTable
              rows={filtered}
              statusById={statusById}
              busy={busy}
              company={company}
              showDate
              showAllPills={filter === "all"}
              onResolve={resolve}
            />
          ) : (
            <EmptyState
              icon={Filter}
              title="No rows in this filter."
              actionLabel="Show all rows"
              onAction={() => setFilter("all")}
            />
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => exportResults(results)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export Excel
            </button>
            <button
              onClick={() => downloadCsv(`itc-rescue-recon-${istDate()}.csv`, reconCsv(results))}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Download recon CSV
            </button>
            <button
              onClick={() => downloadCsv(`itc-at-risk-${istDate()}.csv`, atRiskCsv(results))}
              disabled={atRiskResults(results).length === 0}
              className="rounded-xl border border-rose-300 bg-white px-5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download at-risk ITC CSV ({atRiskResults(results).length})
            </button>
          </div>
        </>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/** Trial gate: locked button + sidebar meter replace the old red banner. */
function LockedRun({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <Link
      href="/settings"
      className={`btn ${large ? "btn-lg" : "btn-sm"}`}
      title="Free trial used. Upgrade to run another reconciliation."
    >
      <Lock size={14} aria-hidden /> {label}
    </Link>
  );
}

function FilePill({ name, fallback }: { name?: string; fallback: string }) {
  return (
    <span className="pill pill-ok">
      <Check size={12} aria-hidden />
      <span className={name ? "mono-sm" : undefined}>{name || fallback}</span>
    </span>
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
  const [over, setOver] = useState(false);
  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center px-4 py-8 text-center transition"
      style={{
        borderRadius: "var(--radius-lg)",
        border: `1.5px dashed ${over ? "var(--color-accent)" : "var(--color-border-strong)"}`,
        backgroundColor: over ? "var(--color-accent-soft)" : "var(--color-bg)",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <span
        className="grid h-10 w-10 place-items-center"
        style={{
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-accent-soft)",
          color: "var(--color-accent)",
        }}
      >
        <Upload size={20} aria-hidden />
      </span>
      <span className="mt-3 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        {label}
      </span>
      <span className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--color-text-muted)" }}>
        {hint}
      </span>
      {file && (
        <span className="pill pill-ok mt-3">
          <Check size={12} aria-hidden />
          <span className="mono-sm">{file.name}</span>
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
