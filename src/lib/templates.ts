import type { MatchResult } from "./types";
import { formatINRPrecise } from "./reconcile";

export function whatsappEnglish(r: MatchResult, companyName: string): string {
  return `Hi ${r.vendorName},

This is ${companyName}. Your invoice ${r.invoiceNumber} dated ${r.invoiceDate} (GSTIN ${r.gstin}, tax ${formatINRPrecise(r.booksTax || r.gstr2bTax)}) is not reflecting correctly in our GSTR-2B.

Due to the April 2026 GSTR-2B hard-block rules, we cannot claim ITC until this appears in 2B. Please file / amend your GSTR-1 for this invoice at the earliest.

Thank you,
${companyName}`;
}

export function whatsappHindi(r: MatchResult, companyName: string): string {
  return `नमस्ते ${r.vendorName},

यह ${companyName} की ओर से है। आपका इनवॉइस ${r.invoiceNumber} दिनांक ${r.invoiceDate} (GSTIN ${r.gstin}, टैक्स ${formatINRPrecise(r.booksTax || r.gstr2bTax)}) हमारे GSTR-2B में सही से नहीं दिख रहा है।

अप्रैल 2026 की GSTR-2B हार्ड-ब्लॉक नियम के कारण, 2B में आने तक हम ITC क्लेम नहीं कर सकते। कृपया इस इनवॉइस के लिए अपना GSTR-1 फाइल / अमेंड जल्द करें।

धन्यवाद,
${companyName}`;
}

export function emailSubject(r: MatchResult): string {
  return `Action needed: Invoice ${r.invoiceNumber} missing from GSTR-2B`;
}

export function emailBody(r: MatchResult, companyName: string): string {
  return whatsappEnglish(r, companyName);
}
