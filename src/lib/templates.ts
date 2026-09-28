import type { MatchResult } from "./types";
import { formatINRPrecise } from "./reconcile";

/** 20 Aug 2026 style. Falls back to the raw string if it doesn't parse. */
export function formatInvoiceDate(d: string): string {
  if (!d) return "";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isTaxDiff(r: MatchResult): boolean {
  return r.category === "value_mismatch";
}

export function whatsappEnglish(r: MatchResult, companyName: string): string {
  const date = formatInvoiceDate(r.invoiceDate);
  if (isTaxDiff(r)) {
    return `Hi ${r.vendorName}, this is ${companyName}. Invoice ${r.invoiceNumber} dated ${date} shows GST of ${formatINRPrecise(r.gstr2bTax || 0)} in GSTR-2B, but our invoice says ${formatINRPrecise(r.booksTax || 0)}. Please amend it in your GSTR-1. Thank you.`;
  }
  return `Hi ${r.vendorName}, this is ${companyName}. Invoice ${r.invoiceNumber} dated ${date} (${formatINRPrecise(r.booksTax || r.gstr2bTax || 0)} GST) is not showing in our GSTR-2B. Please upload it in your GSTR-1 so we can claim the credit. Thank you.`;
}

export function whatsappHindi(r: MatchResult, companyName: string): string {
  const date = formatInvoiceDate(r.invoiceDate);
  if (isTaxDiff(r)) {
    return `नमस्ते ${r.vendorName}, यह ${companyName} की ओर से है। इनवॉइस ${r.invoiceNumber} दिनांक ${date} में GSTR-2B में GST ${formatINRPrecise(r.gstr2bTax || 0)} दिख रहा है, लेकिन हमारे इनवॉइस में ${formatINRPrecise(r.booksTax || 0)} है। कृपया अपने GSTR-1 में इसे संशोधित करें। धन्यवाद।`;
  }
  return `नमस्ते ${r.vendorName}, यह ${companyName} की ओर से है। इनवॉइस ${r.invoiceNumber} दिनांक ${date} (GST ${formatINRPrecise(r.booksTax || r.gstr2bTax || 0)}) हमारे GSTR-2B में नहीं दिख रहा है। कृपया इसे अपने GSTR-1 में अपलोड करें ताकि हम क्रेडिट क्लेम कर सकें। धन्यवाद।`;
}

export function emailSubject(r: MatchResult): string {
  return isTaxDiff(r)
    ? `Invoice ${r.invoiceNumber}: GST amount differs in GSTR-2B`
    : `Invoice ${r.invoiceNumber} not showing in GSTR-2B`;
}

export function emailBody(r: MatchResult, companyName: string): string {
  return whatsappEnglish(r, companyName);
}
