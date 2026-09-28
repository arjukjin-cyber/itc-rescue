"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, FileText, Search, Upload, type LucideIcon } from "lucide-react";
import { fetchReconState } from "@/lib/api-data";
import { getSampleRun } from "@/lib/sample-run";
import { formatDay, inrParts } from "@/lib/format";
import { viewHref, type ItcView } from "@/lib/views";
import type { MatchResult } from "@/lib/types";

/**
 * ⌘K palette (v3 cmdk.html): centred 600px over a 32% ink scrim. Groups Vendors · Invoices ·
 * Pages · Actions. Navigation only (CTO): every entry opens a real screen; there are no
 * "do something" commands (no chase-from-palette), so nothing here can be a dead command.
 */
export interface PalettePage {
  label: string;
  href: string;
  icon: LucideIcon;
  section: string;
}

interface Entry {
  id: string;
  group: "Vendors" | "Invoices" | "Pages" | "Actions";
  href: string;
  icon: LucideIcon;
  text: string;
  body: ReactNode;
}

const ISSUE: Record<string, string> = {
  itc_at_risk: "Missing in 2B",
  value_mismatch: "Tax differs",
  unclaimed: "Not in books",
  matched: "Matched",
};
const VIEW_OF: Record<string, ItcView> = {
  itc_at_risk: "at_risk",
  value_mismatch: "mismatch",
  unclaimed: "unclaimed",
  matched: "matched",
};

export function CommandPalette({
  open,
  onClose,
  pages,
  canUpload,
}: {
  open: boolean;
  onClose: () => void;
  pages: PalettePage[];
  /** "Upload files" opens the upload step on Runs */
  canUpload: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const sample = getSampleRun();
    if (sample) setResults(sample.results);
    else
      void fetchReconState().then((st) => {
        if (!st.authError) setResults(st.results || []);
      });
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const needle = q.trim().toLowerCase();
    const hit = (...xs: (string | undefined)[]) => !needle || xs.some((x) => x?.toLowerCase().includes(needle));

    // Vendors with something to act on, ₹ at risk first
    const byGstin = new Map<string, { name: string; gstin: string; risk: number; view: ItcView }>();
    for (const r of results) {
      if (r.category !== "itc_at_risk" && r.category !== "value_mismatch") continue;
      const cur = byGstin.get(r.gstin) ?? { name: r.vendorName, gstin: r.gstin, risk: 0, view: VIEW_OF[r.category] };
      if (r.category === "itc_at_risk") {
        cur.risk += r.booksTax || 0;
        cur.view = "at_risk";
      }
      byGstin.set(r.gstin, cur);
    }
    const vendors = [...byGstin.values()]
      .filter((v) => hit(v.name, v.gstin))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, needle ? 6 : 3)
      .map<Entry>((v) => ({
        id: `v-${v.gstin}`,
        group: "Vendors",
        href: viewHref(v.view),
        icon: Building2,
        text: v.name,
        body: (
          <>
            <span className="truncate font-medium" style={{ color: "var(--color-ink)" }}>
              {v.name}
            </span>
            <span className="v3-mono hidden sm:inline" style={{ color: "var(--color-text-3)" }}>
              {v.gstin}
            </span>
            <span className="flex-1" />
            {v.risk > 0 && (
              <span className="whitespace-nowrap font-semibold" style={{ color: "var(--color-risk)" }}>
                {inrParts(v.risk).whole} at risk
              </span>
            )}
          </>
        ),
      }));

    const invoices = needle
      ? results
          .filter((r) => hit(r.invoiceNumber, r.gstin))
          .slice(0, 5)
          .map<Entry>((r) => ({
            id: `i-${r.id}`,
            group: "Invoices",
            href: viewHref(VIEW_OF[r.category] ?? "at_risk"),
            icon: FileText,
            text: r.invoiceNumber,
            body: (
              <>
                <span className="v3-mono" style={{ color: "var(--color-ink)" }}>
                  {r.invoiceNumber}
                </span>
                <span className="truncate" style={{ color: "var(--color-text-3)" }}>
                  {formatDay(r.invoiceDate)} · {ISSUE[r.category] ?? r.category}
                </span>
              </>
            ),
          }))
      : [];

    const pageEntries = pages
      .filter((p) => hit(p.label, p.section))
      .map<Entry>((p) => ({
        id: `p-${p.href}`,
        group: "Pages",
        href: p.href,
        icon: p.icon,
        text: p.label,
        body: (
          <>
            <span style={{ color: "var(--color-ink)" }}>{p.label}</span>
            <span style={{ color: "var(--color-text-3)" }}>{p.section}</span>
          </>
        ),
      }));

    const actions: Entry[] = canUpload && hit("Upload files", "new recon", "purchase register", "gstr-2b")
      ? [{ id: "a-upload", group: "Actions", href: "/reconcile?new=1", icon: Upload, text: "Upload files", body: <span>Upload files</span> }]
      : [];

    return [...vendors, ...invoices, ...pageEntries, ...actions];
  }, [q, results, pages, canUpload]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (e?: Entry) => {
    if (!e) return;
    onClose();
    router.push(e.href);
  };

  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActive((a) => Math.min(a + 1, entries.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      go(entries[active]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <>
      <div className="v3-scrim" onMouseDown={onClose} aria-hidden />
      <div className="v3-cmdk" role="dialog" aria-modal="true" aria-label="Search or jump to" onKeyDown={onKey}>
        <div className="v3-cmdk-in">
          <Search aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or jump to"
            aria-label="Search vendors, GSTINs, invoices and pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={entries[active] ? `cmdk-${entries[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="v3-kbd" style={{ marginLeft: 0 }} onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="v3-cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {entries.length === 0 && (
            <div className="px-2.5 py-6 text-center text-[13px]" style={{ color: "var(--color-text-3)" }}>
              No matches for “{q}”.
            </div>
          )}
          {entries.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            const Icon = e.icon;
            return (
              <div key={e.id}>
                {head && <div className="v3-mh">{head}</div>}
                <div
                  id={`cmdk-${e.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  className="v3-mi cursor-pointer"
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(e)}
                >
                  <Icon aria-hidden />
                  {e.body}
                </div>
              </div>
            );
          })}
        </div>
        <div className="v3-cmdk-foot">
          <span>
            <span className="v3-kbd">↑↓</span> Move
          </span>
          <span>
            <span className="v3-kbd">↵</span> Open
          </span>
          <span className="flex-1" />
          <span className="hidden sm:inline">Search vendors, GSTINs, invoices and pages</span>
        </div>
      </div>
    </>
  );
}
