"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Send, ChevronDown, CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ChaseStateCell, IssueCell } from "@/components/RiskTable";
import { formatDay, inr } from "@/lib/format";
import { emitChaseCount } from "@/lib/ui-events";
import { getSettings } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { whatsappEnglish, whatsappHindi, emailSubject, emailBody, waLink } from "@/lib/templates";
import type { ChaseItem, MatchResult } from "@/lib/types";

export default function ChasePage() {
  const router = useRouter();
  const [items, setItems] = useState<ChaseItem[]>([]);
  const [resultsMap, setResultsMap] = useState<Map<string, MatchResult>>(new Map());
  const [company, setCompany] = useState("My Company");
  const [copied, setCopied] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [allFixed, setAllFixed] = useState(false);
  /** Hold EmptyState until first fetch settles — kills hydrate flash */
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    const [{ items: all, authError: chaseAuth }, recon] = await Promise.all([
      fetchChaseItems(),
      fetchReconState(),
    ]);
    if (chaseAuth || recon.authError) {
      router.replace("/login");
      return;
    }
    const open = all.filter((c) => c.status === "pending" || c.status === "still_blocked");
    setItems(open);
    emitChaseCount(open.filter((c) => c.status === "pending").length);
    setAllFixed(open.length === 0 && all.some((c) => c.status === "fixed"));
    setResultsMap(new Map(recon.results.map((r) => [r.id, r])));
    setCompany(getSettings().companyName || "My Company");
    setLoaded(true);
  }

  useEffect(() => {
    void reload();
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

  function copyText(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    // Brief check microfeedback — not an alert
    window.setTimeout(() => setCopied(null), 1200);
  }

  if (!loaded) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading chase list">
        <div className="h-6 w-40 animate-pulse rounded" style={{ backgroundColor: "var(--color-line-2)" }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded" style={{ backgroundColor: "var(--color-line-2)" }} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Vendor chase</h1>
        <EmptyState
          icon={allFixed ? CircleCheck : Send}
          title={
            allFixed
              ? "Every vendor is sorted, nothing left to chase."
              : "Run a reconciliation to see which vendors to chase."
          }
          actionLabel={allFixed ? "Open status board" : "Run reconciliation"}
          actionHref={allFixed ? "/status" : "/reconcile"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Vendor chase</h1>
          <div className="helper-line">
            {items.length} invoice{items.length === 1 ? "" : "s"} need vendor action
          </div>
        </div>
        <div className="seg" role="group" aria-label="Message language">
          <button type="button" onClick={() => setLang("en")} aria-pressed={lang === "en"}>
            English
          </button>
          <button type="button" onClick={() => setLang("hi")} aria-pressed={lang === "hi"}>
            हिंदी
          </button>
        </div>
      </div>

      <p className="copy-live" role="status" aria-live="polite">
        {copied ? "Copied" : ""}
      </p>

      <div className="table-scroll">
        <table className="dt">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Invoice</th>
              <th>Issue</th>
              <th className="r">At risk</th>
              <th>Chase</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const result = resultsMap.get(item.id);
              const msg = result
                ? lang === "hi"
                  ? whatsappHindi(result, company)
                  : whatsappEnglish(result, company)
                : "";
              const isOpen = expanded === item.id;
              const amount =
                item.category === "value_mismatch" && result ? Math.abs(result.taxDiff || 0) : item.amount;
              const copyBtn = (k: "en" | "hi", label: string, text: () => string) => {
                const key = `${item.id}-${k}`;
                return (
                  <button
                    type="button"
                    onClick={() => result && copyText(key, text())}
                    disabled={!result}
                    className="btn btn-sm btn-quiet copy-btn"
                    data-copied={copied === key ? "true" : undefined}
                    aria-label={copied === key ? `Copied ${label}` : `Copy ${label} WhatsApp message`}
                  >
                    {copied === key ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied === key ? "Copied" : `Copy ${k.toUpperCase()}`}
                  </button>
                );
              };

              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      <div className="vn">{item.vendorName}</div>
                      <div className="mono-sm muted">{item.gstin}</div>
                    </td>
                    <td>
                      <div className="mono-sm">{item.invoiceNumber}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {formatDay(item.invoiceDate)}
                      </div>
                    </td>
                    <td>
                      <IssueCell category={item.category} />
                    </td>
                    <td className="r">
                      <span className={item.category === "itc_at_risk" ? "amt-risk" : "font-semibold"}>
                        {inr(amount)}
                      </span>
                    </td>
                    <td>
                      <ChaseStateCell status={item.status} />
                    </td>
                    <td>
                      <div className="acts">
                        {result && copyBtn("en", "English", () => whatsappEnglish(result, company))}
                        {result && copyBtn("hi", "Hindi", () => whatsappHindi(result, company))}
                        <a
                          href={waLink(msg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          aria-disabled={!result ? "true" : undefined}
                        >
                          <Send aria-hidden /> Open WhatsApp
                        </a>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : item.id)}
                          className="btn btn-sm btn-quiet btn-icon"
                          aria-expanded={isOpen}
                          title={isOpen ? "Hide message" : "Preview message"}
                          aria-label={isOpen ? "Hide message" : "Preview message"}
                          disabled={!result}
                        >
                          <ChevronDown
                            aria-hidden
                            style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .12s" }}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && result && (
                    <tr>
                      <td colSpan={6} style={{ whiteSpace: "normal", backgroundColor: "var(--color-surface)" }}>
                        <pre
                          className="whitespace-pre-wrap rounded-md border px-3 py-2.5 text-[13px]"
                          style={{
                            fontFamily: "inherit",
                            borderColor: "var(--color-line)",
                            backgroundColor: "var(--color-subtle)",
                            color: "var(--color-text-2)",
                          }}
                        >
                          {msg}
                        </pre>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              copyText(`${item.id}-em`, `Subject: ${emailSubject(result)}\n\n${emailBody(result, company)}`)
                            }
                            className="btn btn-sm copy-btn"
                            data-copied={copied === `${item.id}-em` ? "true" : undefined}
                          >
                            {copied === `${item.id}-em` ? <Check aria-hidden /> : <Copy aria-hidden />}
                            {copied === `${item.id}-em` ? "Copied" : "Copy email"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
