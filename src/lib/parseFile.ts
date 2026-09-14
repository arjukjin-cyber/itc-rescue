"use client";

import * as XLSX from "xlsx";
import { rowToInvoice } from "./reconcile";
import type { InvoiceRecord } from "./types";

/**
 * Parse Excel/CSV into invoice records.
 * CSV is read as text first so DD/MM/YYYY dates are not misread as US MM/DD.
 */
export async function parseInvoiceFile(
  file: File,
  source: "books" | "gstr2b"
): Promise<InvoiceRecord[]> {
  const name = file.name.toLowerCase();
  let rows: Record<string, unknown>[] = [];

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const wb = XLSX.read(text, { type: "string", raw: true, cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false, // keep string dates
    });
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
  }

  const invoices: InvoiceRecord[] = [];
  for (const row of rows) {
    const inv = rowToInvoice(row, source);
    if (inv) invoices.push(inv);
  }
  return invoices;
}

export async function fetchSampleAsFile(path: string, name: string): Promise<File> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new File([blob], name, { type: "text/csv" });
}
