"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Send, ArrowDown, ArrowUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { IssueCell } from "@/components/RiskTable";
import { formatDay, inr } from "@/lib/format";
import { syncProfileFromServer } from "@/lib/storage";
import { fetchReconState, fetchVendors } from "@/lib/api-data";
import { formatIndianMobile, waLink } from "@/lib/phone";
import { whatsappEnglish } from "@/lib/templates";
import type { MatchResult, UserSession } from "@/lib/types";
import type { VendorSummary } from "@/lib/vendors";

type SortKey = "name" | "gstin" | "atRiskAmount" | "mismatchAmount" | "openChaseCount";

/** Rows the vendor needs to act on (same set /chase messages are built from). */
const isActionable = (r: MatchResult) => r.category === "itc_at_risk" || r.category === "value_mismatch";

/** Chase message for a vendor: reuses /chase's WhatsApp template on the vendor's largest open invoice. */
function chaseHref(v: VendorSummary, invoices: MatchResult[], company: string): string | null {
  const open = invoices.filter(isActionable);
  if (!open.length) return null;
  const top = [...open].sort(
    (a, b) =>
      (a.category === "itc_at_risk" ? 0 : 1) - (b.category === "itc_at_risk" ? 0 : 1) ||
      (b.booksTax || 0) - (a.booksTax || 0)
  )[0];
  return waLink(whatsappEnglish(top, company), v.phone ?? top.phone);
}

function RepeatChip({ show }: { show: boolean }) {
  return show ? (
    <span className="chip ml-2" data-testid="repeat-offender">
      Repeat offender
    </span>
  ) : null;
}

export default function VendorsPage() {
  const router = useRouter();
  /** undefined = loading; [] = no vendors; array = data. AppShell remounts <main> on GSTIN switch → refetch. */
  const [vendors, setVendors] = useState<VendorSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [labelShown, setLabelShown] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [company, setCompany] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "atRiskAmount", dir: "desc" });

  async function load() {
    setError(null);
    const [v, recon, me] = await Promise.all([
      fetchVendors(),
      fetchReconState(),
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d?.user as UserSession | null | undefined) ?? null)
        .catch(() => null),
    ]);
    if (v.authError) {
      router.replace("/login");
      return;
    }
    if (v.error) {
      setError(v.error);
      setVendors([]);
      return;
    }
    setLabelShown(v.repeatOffenderLabel === "shown");
    setResults(recon.results || []);
    if (me) syncProfileFromServer(me);
    setCompany(me ? me.companyName || me.name || "" : "");
    setVendors(v.vendors);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invoicesBy = useMemo(() => {
    const m = new Map<string, MatchResult[]>();
    for (const r of results) {
      const g = (r.gstin || "").trim().toUpperCase();
      if (!g) continue;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    return m;
  }, [results]);

  const sorted = useMemo(() => {
    const list = [...(vendors ?? [])];
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const c =
        key === "name" || key === "gstin"
          ? (a[key] || a.gstin).localeCompare(b[key] || b.gstin)
          : (a[key] as number) - (b[key] as number);
      return mul * c || b.atRiskAmount - a.atRiskAmount || a.gstin.localeCompare(b.gstin);
    });
    return list;
  }, [vendors, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "gstin" ? "asc" : "desc" }
    );

  if (vendors === undefined) return <LoadingSkeleton label="Loading vendors" rows={6} cols={6} />;

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Vendors</h1>
        <div role="alert" className="rounded-md border px-3 py-2.5 text-[13px]" style={{ borderColor: "var(--color-line)" }}>
          Couldn&apos;t load vendors: {error}{" "}
          <button
            type="button"
            className="btn btn-sm ml-2"
            onClick={() => {
              setVendors(undefined);
              void load();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!vendors.length) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Vendors</h1>
        <EmptyState
          icon={Building2}
          title="No vendors yet. Run a reconciliation and your suppliers will appear here."
          actionLabel="Go to Reconcile"
          actionHref="/reconcile"
        />
      </div>
    );
  }

  const th = (key: SortKey, label: string, right = false) => {
    const active = sort.key === key;
    return (
      <th className={right ? "r" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1" style={{ font: "inherit", color: "inherit" }}>
          {label}
          {active && (sort.dir === "asc" ? <ArrowUp aria-hidden size={12} /> : <ArrowDown aria-hidden size={12} />)}
        </button>
      </th>
    );
  };

  const detail = (v: VendorSummary) => {
    const inv = invoicesBy.get(v.gstin) ?? [];
    if (!inv.length) return <div className="muted text-[13px]">No invoices for this vendor in the latest reconciliation.</div>;
    return (
      <ul className="space-y-1.5 text-[13px]" data-testid="vendor-invoices">
        {inv.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="mono-sm">{r.invoiceNumber}</span>
              <span className="muted"> · {formatDay(r.invoiceDate)}</span>
            </span>
            <span className="flex items-center gap-3">
              <IssueCell category={r.category} />
              <span className="font-semibold">
                {inr(r.category === "value_mismatch" ? Math.abs(r.taxDiff || 0) : r.booksTax || r.gstr2bTax || 0)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const actions = (v: VendorSummary) => {
    const href = chaseHref(v, invoicesBy.get(v.gstin) ?? [], company);
    const isOpen = expanded === v.gstin;
    return (
      <div className="acts">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
            <Send aria-hidden /> Chase on WhatsApp
          </a>
        ) : (
          <span className="btn btn-sm" aria-disabled="true" title="Nothing to chase for this vendor">
            <Send aria-hidden /> Chase on WhatsApp
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : v.gstin)}
          className="btn btn-sm btn-quiet btn-icon"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Hide invoices" : "Show invoices"}
          title={isOpen ? "Hide invoices" : "Show invoices"}
        >
          <ChevronDown aria-hidden style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .12s" }} />
        </button>
      </div>
    );
  };

  const repeat = (v: VendorSummary) => labelShown && v.repeatOffender === true;
  const name = (v: VendorSummary) => v.name || "Unnamed vendor";

  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h1 className="page-title">Vendors</h1>
        <div className="helper-line">
          {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · sorted by ITC at risk
        </div>
      </div>

      {/* Desktop / tablet: table */}
      <div className="table-scroll hidden md:block">
        <table className="dt" data-testid="vendors-table">
          <thead>
            <tr>
              {th("name", "Vendor")}
              {th("gstin", "GSTIN")}
              {th("atRiskAmount", "ITC at risk", true)}
              {th("mismatchAmount", "Mismatch", true)}
              {th("openChaseCount", "Open chases", true)}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => (
              <Fragment key={v.gstin}>
                <tr onClick={() => setExpanded(expanded === v.gstin ? null : v.gstin)} style={{ cursor: "pointer" }}>
                  <td>
                    <span className="vn">{name(v)}</span>
                    <RepeatChip show={repeat(v)} />
                    {v.phone && <div className="mono-sm muted">{formatIndianMobile(v.phone)}</div>}
                  </td>
                  <td className="mono-sm">{v.gstin}</td>
                  <td className="r">
                    <span className={v.atRiskAmount > 0 ? "amt-risk" : undefined}>{inr(v.atRiskAmount)}</span>
                  </td>
                  <td className="r">{inr(v.mismatchAmount)}</td>
                  <td className="r">{v.openChaseCount}</td>
                  <td onClick={(e) => e.stopPropagation()}>{actions(v)}</td>
                </tr>
                {expanded === v.gstin && (
                  <tr>
                    <td colSpan={6} style={{ whiteSpace: "normal", backgroundColor: "var(--color-surface)" }}>
                      {detail(v)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <ul className="space-y-2 md:hidden" data-testid="vendors-cards">
        {sorted.map((v) => (
          <li
            key={v.gstin}
            className="rounded-md border p-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-surface)" }}
          >
            <div className="flex flex-wrap items-center">
              <span className="vn">{name(v)}</span>
              <RepeatChip show={repeat(v)} />
            </div>
            <div className="mono-sm muted">{v.gstin}</div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
              <div>
                <dt className="muted">At risk</dt>
                <dd className={v.atRiskAmount > 0 ? "amt-risk" : undefined}>{inr(v.atRiskAmount)}</dd>
              </div>
              <div>
                <dt className="muted">Mismatch</dt>
                <dd>{inr(v.mismatchAmount)}</dd>
              </div>
              <div>
                <dt className="muted">Open chases</dt>
                <dd>{v.openChaseCount}</dd>
              </div>
            </dl>
            <div className="mt-2">{actions(v)}</div>
            {expanded === v.gstin && <div className="mt-2">{detail(v)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
