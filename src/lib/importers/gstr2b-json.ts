/**
 * GST portal GSTR-2B JSON importer (B2B section).
 *
 * Expected shape (portal download): { data: { docdata: { b2b: [ { ctin, trdnm,
 * inv: [ { inum, dt: "DD-MM-YYYY", val, txval?, igst?, cgst?, sgst?, cess?,
 * itcavl?: "Y"|"N", items?: [ { rt, txval, igst, cgst, sgst, cess } ] } ] } ] } } }
 * Some downloads have `docdata` at the top level (no `data` wrapper). Tax and
 * taxable amounts are summed across `items[]` when present, otherwise read from
 * the invoice itself. GSTR-2A style `itms[].itm_det` (iamt/camt/samt/csamt) is
 * also accepted.
 *
 * Pure: takes the parsed JSON value, no DOM/XLSX.
 */

import { normalizeGstin, normalizeInvoiceNumber } from "../reconcile";
import type { InvoiceRecord } from "../types";
import { parseImportAmount, parseImportDate } from "./tally-busy";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The `b2b` array of a GSTR-2B JSON (data.docdata.b2b or docdata.b2b), or null. */
export function findGstr2bB2b(json: unknown): Obj[] | null {
  if (!isObj(json)) return null;
  const data = isObj(json.data) ? json.data : json;
  const docdata = isObj(data.docdata) ? data.docdata : isObj(json.docdata) ? json.docdata : null;
  const b2b = docdata?.b2b;
  return Array.isArray(b2b) ? (b2b.filter(isObj) as Obj[]) : null;
}

interface Amounts {
  txval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

function amountsOf(o: Obj): Amounts {
  // 2B uses igst/cgst/sgst/cess; 2A item details use iamt/camt/samt/csamt
  return {
    txval: parseImportAmount(o.txval),
    igst: parseImportAmount(o.igst ?? o.iamt),
    cgst: parseImportAmount(o.cgst ?? o.camt),
    sgst: parseImportAmount(o.sgst ?? o.samt),
    cess: parseImportAmount(o.cess ?? o.csamt),
  };
}

function invoiceAmounts(inv: Obj): Amounts {
  const rawItems = Array.isArray(inv.items) ? inv.items : Array.isArray(inv.itms) ? inv.itms : [];
  const items = rawItems
    .filter(isObj)
    .map((it) => (isObj(it.itm_det) ? it.itm_det : it));
  if (!items.length) return amountsOf(inv);
  return items.reduce<Amounts>(
    (acc, it) => {
      const a = amountsOf(it);
      return {
        txval: acc.txval + a.txval,
        igst: acc.igst + a.igst,
        cgst: acc.cgst + a.cgst,
        sgst: acc.sgst + a.sgst,
        cess: acc.cess + a.cess,
      };
    },
    { txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }
  );
}

/**
 * Map a GSTR-2B JSON to invoice records. Returns null when there is no B2B
 * section; an empty array when the section has no invoices.
 */
export function mapGstr2bJson(
  json: unknown,
  recordSource: "books" | "gstr2b"
): InvoiceRecord[] | null {
  const b2b = findGstr2bB2b(json);
  if (!b2b) return null;
  const out: InvoiceRecord[] = [];
  for (const supplier of b2b) {
    const gstin = normalizeGstin(String(supplier.ctin ?? ""));
    const vendorName = String(supplier.trdnm ?? "").trim() || "Unknown Vendor";
    const invs = Array.isArray(supplier.inv) ? supplier.inv.filter(isObj) : [];
    for (const inv of invs as Obj[]) {
      const rawInv = String(inv.inum ?? "").trim();
      if (!gstin && !rawInv) continue;
      const a = invoiceAmounts(inv);
      const igst = round2(a.igst);
      const cgst = round2(a.cgst);
      const sgst = round2(a.sgst);
      const rec: InvoiceRecord = {
        gstin: gstin || "UNKNOWN",
        vendorName,
        invoiceNumber: normalizeInvoiceNumber(rawInv) || "UNKNOWN",
        rawInvoiceNumber: rawInv,
        invoiceDate: parseImportDate(inv.dt ?? inv.idt),
        taxableValue: round2(a.txval),
        igst,
        cgst,
        sgst,
        totalTax: round2(igst + cgst + sgst), // cess excluded, as for Excel/CSV
        source: recordSource,
      };
      const itc = String(inv.itcavl ?? "").trim().toUpperCase();
      if (itc === "Y" || itc === "N") rec.itcAvailable = itc === "Y";
      out.push(rec);
    }
  }
  return out;
}
