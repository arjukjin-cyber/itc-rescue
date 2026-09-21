"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Check, MessageCircle } from "lucide-react";
import { CategoryBadge, StatusBadge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { getSettings } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { formatINRPrecise } from "@/lib/reconcile";
import { whatsappEnglish, whatsappHindi, emailSubject, emailBody } from "@/lib/templates";
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
    setAllFixed(open.length === 0 && all.some((c) => c.status === "fixed"));
    setResultsMap(new Map(recon.results.map((r) => [r.id, r])));
    setCompany(getSettings().companyName || "My Company");
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
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function waLink(text: string) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  if (!items.length) {
    return (
      <div className="flex min-h-[min(28rem,70vh)] items-center justify-center px-2">
        <EmptyState
          icon={MessageCircle}
          title={allFixed ? "Nothing left to chase" : "No vendors to chase"}
          description={
            allFixed
              ? "All chase invoices are Fixed or cleared. Track them on the Status board."
              : "Run a reconciliation first. ITC-at-risk and value-mismatch rows appear here."
          }
          actionLabel={allFixed ? "Open Status board" : "Go to Reconcile"}
          actionHref={allFixed ? "/status" : "/reconcile"}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Vendor chase list</h1>
          <p className="mt-1 text-sm text-slate-600">
            {items.length} invoice{items.length === 1 ? "" : "s"} need vendor action · Copy WhatsApp or open chat
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setLang("en")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              lang === "en" ? "bg-teal-700 text-white" : "text-slate-600"
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLang("hi")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              lang === "hi" ? "bg-teal-700 text-white" : "text-slate-600"
            }`}
          >
            हिंदी
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const result = resultsMap.get(item.id);
          const msg = result
            ? lang === "hi"
              ? whatsappHindi(result, company)
              : whatsappEnglish(result, company)
            : "";
          const isOpen = expanded === item.id;

          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.vendorName}</span>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={item.category} />
                      <StatusBadge status={item.status} />
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.invoiceNumber} · {item.invoiceDate} · {item.gstin} ·{" "}
                    {formatINRPrecise(item.amount)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    {isOpen ? "Hide message" : "Show message"}
                  </button>
                  <button
                    onClick={() =>
                      result &&
                      copyText(`${item.id}-en`, whatsappEnglish(result, company))
                    }
                    className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                  >
                    {copied === `${item.id}-en` ? <Check size={14} /> : <Copy size={14} />}
                    Copy EN
                  </button>
                  <button
                    onClick={() =>
                      result &&
                      copyText(`${item.id}-hi`, whatsappHindi(result, company))
                    }
                    className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                  >
                    {copied === `${item.id}-hi` ? <Check size={14} /> : <Copy size={14} />}
                    Copy HI
                  </button>
                  <a
                    href={waLink(msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-accent inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold"
                  >
                    <MessageCircle size={14} /> Open WhatsApp
                  </a>
                </div>
              </div>
              {isOpen && result && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    {msg}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        copyText(
                          `${item.id}-em`,
                          `Subject: ${emailSubject(result)}\n\n${emailBody(result, company)}`
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copied === `${item.id}-em` ? "Copied email!" : "Copy email"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
