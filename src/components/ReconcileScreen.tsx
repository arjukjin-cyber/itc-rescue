"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Play, Loader2, Lock, Inbox, CircleCheck, Send, Download, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import * as XLSX from "xlsx";
import { reconCsv, atRiskCsv, atRiskResults, downloadCsv, istDate } from "@/lib/csv-export";
import { HelpTip } from "@/components/HelpTip";
import { ActionTable, ResultTabs, atRiskTotal, filterByTab, sortForAction, useChaseRows, type TabKey } from "@/components/RiskTable";
import { TRIAL_USED_MESSAGE } from "@/lib/recon-guard";
import { KpiStrip } from "@/components/KpiStrip";
import { emitReconChanged, emitTrialChanged } from "@/lib/ui-events";
import { Dropdown, MenuItem, MenuLabel } from "@/components/Dropdown";
import { viewDef, viewFromSlug, type ItcView } from "@/lib/views";
import { clearSampleRun, getSampleRun, setSampleRun } from "@/lib/sample-run";
import { Toast, useToast } from "@/components/Toast";
import { getSettings, setTrialFromServer } from "@/lib/storage";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchChaseItems, fetchReconState, persistRecon } from "@/lib/api-data";
import { parseInvoiceFile, parseInvoiceFileDetailed, fetchSampleAsFile } from "@/lib/parseFile";
import { describeImportSource } from "@/lib/importers/tally-busy";
import { reconcile } from "@/lib/reconcile";
import type { MatchResult, ReconSummary } from "@/lib/types";

const MATCH_RULE = "Matched on GSTIN + invoice number + invoice date (±1 day).";

/** #32: books rows with no GSTIN (unregistered dealer) are left out of the recon. */
function skippedNote(sum: ReconSummary | null): string | null {
  const n = sum?.unregisteredSkipped;
  if (!n) return null;
  return `${n} unregistered purchase${n === 1 ? "" : "s"} skipped`;
}
const SKIPPED_WHY = "No GSTIN on these rows (unregistered dealer), so no ITC can be claimed. They were left out of the match.";

/**
 * Runs default tab: "Needs action" only when there is ₹ at risk; with ₹0 at risk open on All
 * rather than a near-empty tab. Explicit ITC views (?view=at-risk) are unaffected.
 */
function defaultFilter(results: MatchResult[]): TabKey {
  return atRiskTotal(results) > 0 ? "action" : "all";
}

export function ReconcileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading reconciliation">
      <div className="h-6 w-32 animate-pulse rounded" style={{ backgroundColor: "var(--color-line-2)" }} />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg" style={{ backgroundColor: "var(--color-line-2)" }} />
        ))}
      </div>
    </div>
  );
}

/**
 * /reconcile (Runs) and its ITC views /reconcile?view=<slug> share this screen.
 * Uses useSearchParams (?new=1), so callers wrap it in <Suspense>.
 */
export function ReconcileScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** ITC filtered view (?view=at-risk | mismatches | unclaimed | matched); null = Runs. */
  const view: ItcView | null = viewFromSlug(searchParams.get("view"));
  const def = view ? viewDef(view) : null;
  /** Sidebar "New recon" → upload step */
  const wantsNew = searchParams.get("new") === "1";
  const [loaded, setLoaded] = useState(false);
  const [booksFile, setBooksFile] = useState<File | null>(null);
  const [gstrFile, setGstrFile] = useState<File | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [filter, setFilter] = useState<TabKey>("action");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booksNote, setBooksNote] = useState<string | null>(null);
  /** #32 "N unregistered purchase(s) skipped" from the last parse (kept even if the save fails). */
  const [skipNote, setSkipNote] = useState<string | null>(null);
  /** Trial used → locked "Run again" button (no banner above results). */
  const [locked, setLocked] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [company, setCompany] = useState("My Company");
  const { toast, show, dismiss } = useToast();
  const { setChase, statusById, pendingCount, resolve, resolveMany, busy } = useChaseRows(show);
  const autoSampleDone = useRef(false);
  /** Sample run (#29): shown in-page only, never saved — chase tracking is off. */
  const [isSample, setIsSample] = useState(false);
  const [sampleFiles, setSampleFiles] = useState<[string, string] | null>(null);

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
      // An unsaved sample run in this tab (#29) wins over the saved one on these screens.
      const sample = getSampleRun();
      if (sample) {
        setResults(sample.results);
        setSummary(sample.summary);
        setFilter(defaultFilter(sample.results));
        setSampleFiles(sample.files);
        setIsSample(true);
      } else if (state.results.length) {
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
        // Sample runs are never saved or counted (#29), so they don't need the trial gate.
        if (!state.results.length && !autoSampleDone.current) {
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

  useEffect(() => {
    if (!wantsNew) return;
    setShowUpload(true);
    setError("");
    router.replace("/reconcile", { scroll: false });
  }, [wantsNew, router]);

  const filtered = useMemo(() => filterByTab(results, filter), [results, filter]);
  const viewRows = useMemo(
    () => (def ? sortForAction(results.filter((r) => r.category === def.category)) : []),
    [results, def]
  );

  async function afterSaved(
    matched: MatchResult[],
    sum: ReconSummary,
    saved: { persistence: "postgres" | "demo" | "sample"; reconCount?: number; canRun?: boolean }
  ) {
    setIsSample(false);
    setSampleFiles(null);
    clearSampleRun();
    // F-9: trial state straight from the POST /api/recon response, in this tick: sidebar meter
    // (event detail = trial.reconCount), locked Run and disabled drop zones. No reload/navigation.
    const serverCount =
      saved.persistence === "postgres" && typeof saved.reconCount === "number" ? saved.reconCount : undefined;
    if (serverCount !== undefined) setTrialFromServer(serverCount);
    emitTrialChanged(serverCount);
    if (saved.canRun === false) setLocked(true);
    emitReconChanged();
    setResults(matched);
    setSummary(sum);
    setFilter(defaultFilter(matched));
    setShowUpload(false);
    // Re-read gate + chase list so the locked button and "Chase N" are authoritative
    const [state, chase] = await Promise.all([fetchReconState(), fetchChaseItems()]);
    if (!state.authError) setLocked(saved.canRun === false || !state.canRun);
    if (!chase.authError) setChase(chase.items);
  }

  /** Sample run (#29): shown in-page only. Sidebar counts follow it until the next navigation. */
  function showSample(matched: MatchResult[], sum: ReconSummary, files: [string, string]) {
    setSampleRun({ results: matched, summary: sum, files });
    setSampleFiles(files);
    setResults(matched);
    setSummary(sum);
    setFilter(defaultFilter(matched));
    setShowUpload(false);
    setIsSample(true);
    emitReconChanged();
  }

  function lockedToast() {
    show({ text: TRIAL_USED_MESSAGE });
  }

  /**
   * 402 handler (server gate) + pre-run gate: lock Run and the drop zones, show the v1 ink toast
   * "Free trial used. We'll email you when more runs open." (no action link, T-08).
   */
  function onPaywall() {
    setLocked(true);
    setShowUpload(false);
    show({ text: TRIAL_USED_MESSAGE });
  }

  async function runWithFiles(books: File, gstr: File) {
    setError("");

    const state = await fetchReconState();
    if (!state.canRun) {
      onPaywall();
      return;
    }

    setLoading(true);
    setBooksNote(null);
    setSkipNote(null);
    try {
      // #27: both files go through the detailed parser (GST portal 2B .xlsx / .json detection);
      // it throws a file-specific InvoiceParseError, surfaced in the role="alert" error line.
      const booksParsed = await parseInvoiceFileDetailed(books, "books");
      const booksInv = booksParsed.invoices;
      const gstrParsed = await parseInvoiceFileDetailed(gstr, "gstr2b");
      const gstrInv = gstrParsed.invoices;
      const notes = [booksParsed.detected, gstrParsed.detected].map(describeImportSource).filter(Boolean);
      setBooksNote(notes.length ? notes.join(" · ") : null);
      if (!booksInv.length || !gstrInv.length) {
        // parseInvoiceFileDetailed normally throws a file-specific error first
        setError(`${(!booksInv.length ? books : gstr).name}: no invoice rows found`);
        return;
      }

      const { results: matched, summary: sum } = reconcile(booksInv, gstrInv);
      setSkipNote(skippedNote(sum));
      const saved = await persistRecon(matched, sum);
      if (!saved.ok) {
        if (saved.authError) {
          setError(saved.authError);
          router.replace("/login");
          return;
        }
        if (saved.paywall) {
          onPaywall();
          return;
        }
        // Surface 500 / other server failures (do not silently pretend success)
        setError(saved.error || "Failed to save reconciliation");
        return;
      }
      if (saved.persistence === "sample") {
        showSample(matched, sum, [books.name, gstr.name]);
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
    if (locked) {
      lockedToast();
      return;
    }
    if (!booksFile || !gstrFile) {
      // Run is hidden/disabled until both files are picked; never stack this over a sample result.
      if (!isSample) setError("Please select both purchase register and GSTR-2B files.");
      return;
    }
    await runWithFiles(booksFile, gstrFile);
  }

  async function loadSamples() {
    // Sample runs are shown in-page only: never saved, never counted against the trial.
    setError("");
    setLoading(true);
    setBooksNote(null);
    setSkipNote(null);
    try {
      const books = await fetchSampleAsFile(
        "/samples/purchase-register.csv",
        "purchase-register.csv"
      );
      const gstr = await fetchSampleAsFile("/samples/gstr-2b.csv", "gstr-2b.csv");
      // #31: leave the upload zones empty so a sample file can never be mixed into a real run
      // (the file bar still shows the sample file names from the sample-run store).
      setBooksFile(null);
      setGstrFile(null);
      const booksInv = await parseInvoiceFile(books, "books");
      const gstrInv = await parseInvoiceFile(gstr, "gstr2b");
      const { results: matched, summary: sum } = reconcile(booksInv, gstrInv);
      showSample(matched, sum, [books.name, gstr.name]);
    } catch {
      setError("Failed to load sample files");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) return <ReconcileSkeleton />;

  const bothFiles = Boolean(booksFile && gstrFile);
  const chaseBtn = (large: boolean) =>
    pendingCount > 0 && !isSample ? (
      <Link href="/chase" className={`btn btn-pri${large ? " btn-lg" : ""}`}>
        <Send aria-hidden /> Chase {pendingCount} vendor{pendingCount === 1 ? "" : "s"}
      </Link>
    ) : null;
  const uploadStep = !view && (!summary || showUpload);
  const skipLine = skipNote ?? (isSample ? null : skippedNote(summary));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="page-title">{def ? def.title : "Reconcile"}</h1>
          <div className="helper-line">
            <span>
              {def ? def.helper : summary ? "Match your books against GSTR-2B." : "Drop both files, then run the match."}
            </span>
            <HelpTip label="Matching rule" text={MATCH_RULE} />
          </div>
        </div>
        {summary && results.length > 0 && (
          <div className="flex items-center gap-2">
            {def && (view === "at_risk" || view === "mismatch") && viewRows.length > 0 && chaseBtn(false)}
            <ExportMenu results={results} />
          </div>
        )}
      </div>

      {uploadStep && (
        <>
          <div className="grid gap-3 pt-1 md:grid-cols-2">
            <FileDrop
              label="Purchase register"
              hint="Tally, Zoho or Excel · .csv / .xlsx"
              file={booksFile}
              onFile={setBooksFile}
              disabled={locked}
            />
            <FileDrop
              label="GSTR-2B"
              hint="From the GST portal · .json or .xlsx"
              file={gstrFile}
              onFile={setGstrFile}
              disabled={locked}
            />
          </div>
          {locked && (
            <p className="helper-line" data-trial-used="true">
              <Lock size={13} strokeWidth={1.75} aria-hidden />
              <span>1 of 1 free recon used. Sample files still run in your browser and are never saved.</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {locked ? (
              <LockedRun />
            ) : isSample && !bothFiles ? null : (
              // After a sample run Run stays hidden until both real files are picked (no
              // "select both files" error over a valid sample result).
              <button
                type="button"
                onClick={onRun}
                disabled={loading || !bothFiles}
                className="btn btn-pri btn-lg"
              >
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                Run recon
              </button>
            )}
            <button
              type="button"
              onClick={loadSamples}
              disabled={loading}
              className="link-accent text-[13px] disabled:opacity-45"
            >
              Try with sample files (not saved)
            </button>
            {summary && (
              <button type="button" className="btn btn-quiet" onClick={() => setShowUpload(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="status" style={{ color: "var(--color-text-2)" }} role="alert">
          <span className="dot dot-risk" aria-hidden />
          {error}
        </p>
      )}
      {uploadStep && (booksNote || skipNote) && <ImportNote source={booksNote} skipped={skipNote} />}

      {isSample && summary && !uploadStep && (
        <p className="status" style={{ color: "var(--color-text-2)" }}>
          <span className="dot" style={{ backgroundColor: "var(--color-text-3)" }} aria-hidden />
          {/* On Runs the file bar already says "Sample data · not saved"; views have no file bar. */}
          {view ? "Sample data · not saved. Upload your own files to track chases." : "Upload your own files to track chases."}
          <button
            type="button"
            className="link-accent"
            onClick={() => {
              setShowUpload(true);
              if (view) router.push("/reconcile?new=1");
            }}
          >
            Upload files
          </button>
        </p>
      )}

      {def &&
        (summary ? (
          viewRows.length ? (
            <ActionTable
              tracking={!isSample}
              rows={viewRows}
              statusById={statusById}
              busy={busy}
              company={company}
              onResolve={(id) => void resolve(id)}
              onResolveMany={resolveMany}
            />
          ) : (
            <EmptyState icon={Inbox} title={def.empty} actionLabel="Open latest run" actionHref="/reconcile" />
          )
        ) : (
          <EmptyState
            icon={Upload}
            title="Run your first recon to see these invoices."
            actionLabel="New recon"
            actionHref="/reconcile?new=1"
          />
        ))}

      {summary && !view && (
        <>
          {!showUpload && (
            <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
              <FileName name={booksFile?.name ?? (isSample ? sampleFiles?.[0] : undefined)} fallback="Purchase register" />
              {(booksNote || skipLine) && <ImportNote source={booksNote} skipped={skipLine} />}
              <FileName name={gstrFile?.name ?? (isSample ? sampleFiles?.[1] : undefined)} fallback="GSTR-2B" />
              <span className="muted">
                {summary.totalBooks} books · {summary.totalGstr2b} in 2B
              </span>
              {isSample && (
                <span className="chip" data-sample="true">
                  Sample data · not saved
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <button type="button" className="link-accent text-[13px]" onClick={() => setShowUpload(true)}>
                  Replace files
                </button>
                {isSample ? (
                  <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void loadSamples()}>
                    {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                    Run again
                  </button>
                ) : locked ? (
                  <LockedRun small />
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={loading}
                    onClick={() => (bothFiles ? void onRun() : setShowUpload(true))}
                  >
                    {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                    Run again
                  </button>
                )}
              </div>
            </div>
          )}

          {/* UX-11: KPI strip (ITC at risk first) with the single Primary "Chase N vendors"
              right-aligned in the same row; on mobile it goes full width under the strip. */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
            <div className="min-w-0 flex-1">
              <KpiStrip results={results} summary={summary} />
            </div>
            {chaseBtn(true) && <div className="shrink-0 [&>a]:w-full lg:[&>a]:w-auto">{chaseBtn(true)}</div>}
          </div>

          <div className="pt-2">
            <ResultTabs results={results} tab={filter} onTab={setFilter} />
          </div>

          {filtered.length ? (
            <ActionTable
              tracking={!isSample}
              rows={filtered}
              statusById={statusById}
              busy={busy}
              company={company}
              onResolve={(id) => void resolve(id)}
              onResolveMany={resolveMany}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No invoices in this view."
              actionLabel="Show all invoices"
              onAction={() => setFilter("all")}
            />
          )}
        </>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/**
 * Trial gate: locked "Run again" (tooltip "Free trial used") + sidebar meter replace the old
 * red banner. No upgrade path exists (#29); natively disabled after trial used.
 */
function LockedRun({ small = false }: { small?: boolean }) {
  return (
    <span title="Free trial used" className="inline-flex" tabIndex={0} aria-label="Run again, free trial used">
      <button type="button" disabled className={`btn ${small ? "btn-sm" : "btn-lg"}`}>
        <Lock aria-hidden /> Run again
      </button>
    </span>
  );
}

/**
 * Import note, v3 style (muted 12px + ok check): PR #24 source ("Detected Tally export") and
 * #32 skipped rows, joined by a middle dot: "Detected Tally export · 1 unregistered purchase skipped".
 */
function ImportNote({ source, skipped }: { source: string | null; skipped: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-3)" }} data-import-note>
      <CircleCheck size={13} strokeWidth={1.75} style={{ color: "var(--color-ok)" }} aria-hidden />
      <span>
        {source}
        {source && skipped ? " · " : null}
        {skipped && (
          <span title={SKIPPED_WHY} style={{ cursor: "help" }}>
            {skipped}
            <span className="sr-only"> ({SKIPPED_WHY})</span>
          </span>
        )}
      </span>
    </span>
  );
}

function FileName({ name, fallback }: { name?: string; fallback: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text-2)" }}>
      <CircleCheck size={14} strokeWidth={1.75} style={{ color: "var(--color-ok)" }} aria-hidden />
      <span className={name ? "mono-sm" : undefined}>{name || fallback}</span>
    </span>
  );
}

function FileDrop({
  label,
  hint,
  file,
  onFile,
  disabled = false,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File) => void;
  /** Trial used: zone is inert (45%, no drop, input disabled). */
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const uid = useId();
  const inputId = `drop-${uid}`;
  const hintId = `drop-hint-${uid}`;
  return (
    // UX-14: the label is linked to a focusable sr-only file input (keyboard: Tab → Enter/Space);
    // drop works too; the zone shows the focus outline via :has(input:focus-visible).
    <label
      htmlFor={inputId}
      className="dropzone"
      data-over={over && !disabled ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      aria-disabled={disabled ? "true" : undefined}
      title={disabled ? "Free trial used" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <span className="icon-tile">
        <Upload size={16} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span id={hintId} className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-3)" }}>
        {hint}
      </span>
      {file && (
        <span className="mt-3 inline-flex items-center gap-1.5" style={{ color: "var(--color-text-2)" }}>
          <CircleCheck size={14} strokeWidth={1.75} style={{ color: "var(--color-ok)" }} aria-hidden />
          <span className="mono-sm">{file.name}</span>
        </span>
      )}
      <input
        id={inputId}
        type="file"
        accept=".csv,.xlsx,.xls,.json"
        aria-describedby={hintId}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

/**
 * Header Export menu (replaces the three buttons #23 put under the results).
 * Same #23 builders + download path and the same outputs: recon CSV (all rows),
 * at-risk ITC CSV, Excel. Always exports the whole latest recon, whatever the view.
 */
function ExportMenu({ results }: { results: MatchResult[] }) {
  const atRiskN = atRiskResults(results).length;
  return (
    <Dropdown
      label="Export"
      align="right"
      menuClassName="w-[248px]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className="btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
        >
          <Download aria-hidden /> Export <ChevronDown aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Latest recon · all views</MenuLabel>
          <MenuItem
            meta={`${results.length} rows`}
            onSelect={() => {
              close();
              downloadCsv(`itc-rescue-recon-${istDate()}.csv`, reconCsv(results));
            }}
          >
            Recon CSV
          </MenuItem>
          <MenuItem
            meta={`${atRiskN} rows`}
            disabled={atRiskN === 0}
            onSelect={() => {
              close();
              downloadCsv(`itc-at-risk-${istDate()}.csv`, atRiskCsv(results));
            }}
          >
            At-risk ITC CSV
          </MenuItem>
          <MenuItem
            meta=".xlsx"
            onSelect={() => {
              close();
              exportResults(results);
            }}
          >
            Excel
          </MenuItem>
        </>
      )}
    </Dropdown>
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
  XLSX.writeFile(wb, `itc-rescue-recon-${istDate()}.xlsx`);
}
