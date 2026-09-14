"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageCircle } from "lucide-react";
import { CategoryBadge } from "@/components/Badge";
import { getChaseItems, getResults, getSettings } from "@/lib/storage";
import { formatINRPrecise } from "@/lib/reconcile";
import { whatsappEnglish, whatsappHindi, emailSubject, emailBody } from "@/lib/templates";
import type { ChaseItem, MatchResult } from "@/lib/types";

export default function ChasePage() {
  const [items, setItems] = useState<ChaseItem[]>([]);
  const [resultsMap, setResultsMap] = useState<Map<string, MatchResult>>(new Map());
  const [company, setCompany] = useState("My Company");
  const [copied, setCopied] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setItems(getChaseItems());
    const map = new Map(getResults().map((r) => [r.id, r]));
    setResultsMap(map);
    setCompany(getSettings().companyName || "My Company");
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
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <MessageCircle className="mx-auto text-teal-700" size={36} />
        <h1 className="mt-3 text-xl font-bold text-slate-900">No vendors to chase</h1>
        <p className="mt-2 text-sm text-slate-600">
          Run a reconciliation first. ITC-at-risk and value-mismatch rows appear here.
        </p>
        <Link
          href="/reconcile"
          className="mt-5 inline-block rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Go to Reconcile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendor chase list</h1>
          <p className="mt-1 text-sm text-slate-600">
            {items.length} invoices need vendor action · Copy WhatsApp or open chat
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

      <div className="space-y-4">
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
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.vendorName}</span>
                    <CategoryBadge category={item.category} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.invoiceNumber} · {item.invoiceDate} · {item.gstin} ·{" "}
                    {formatINRPrecise(item.amount)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {isOpen ? "Hide message" : "Show message"}
                  </button>
                  <button
                    onClick={() => copyText(`${item.id}-wa`, msg)}
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    {copied === `${item.id}-wa` ? <Check size={14} /> : <Copy size={14} />}
                    Copy WhatsApp
                  </button>
                  <a
                    href={waLink(msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <MessageCircle size={14} /> Open WhatsApp
                  </a>
                </div>
              </div>
              {isOpen && result && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
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
