"use client";

import * as XLSX from "xlsx";
import { rowToInvoice } from "./reconcile";
import {
  detectImport,
  mapRegisterRows,
  type ImportSource,
} from "./importers/tally-busy";
import type { InvoiceRecord } from "./types";

export type { ImportSource } from "./importers/tally-busy";

export interface ParsedInvoiceFile {
  invoices: InvoiceRecord[];
  /** Which export format was recognised: "tally" | "busy" | "template" | "generic" */
  detected: ImportSource;
  /** 0-based row of the header that was used */
  headerRowIndex: number;
}

/**
 * Parse Excel/CSV into invoice records.
 * CSV is read as text first so DD/MM/YYYY dates are not misread as US MM/DD.
 */
export async function parseInvoiceFile(
  file: File,
  source: "books" | "gstr2b"
): Promise<InvoiceRecord[]> {
  return (await parseInvoiceFileDetailed(file, source)).invoices;
}

/**
 * Same as parseInvoiceFile, but also reports the detected export format.
 *
 * - ITC Rescue template (or any sheet whose header is already row 1 and is not a
 *   Tally/Busy export) -> legacy `rowToInvoice` path, unchanged.
 * - Tally / Busy exports, or any sheet whose header sits below title rows ->
 *   importers/tally-busy (header-row search, synonym mapping, total-row skipping,
 *   date/amount normalisation).
 */
export async function parseInvoiceFileDetailed(
  file: File,
  source: "books" | "gstr2b"
): Promise<ParsedInvoiceFile> {
  const name = file.name.toLowerCase();
  let sheet: XLSX.WorkSheet;
  let rows: Record<string, unknown>[] = [];

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const wb = XLSX.read(text, { type: "string", raw: true, cellDates: false });
    sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false, // keep string dates
    });
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
    sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
  }

  // Row grid (typed values: numbers, Date cells) for header detection + Tally/Busy mapping.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true, // keep row indexes aligned with the sheet
  });
  const detection = detectImport(grid);

  const useLegacy =
    !detection ||
    (detection.headerRowIndex === 0 &&
      (detection.source === "template" || detection.source === "generic"));

  if (useLegacy) {
    const invoices: InvoiceRecord[] = [];
    for (const row of rows) {
      const inv = rowToInvoice(row, source);
      if (inv) invoices.push(inv);
    }
    return {
      invoices,
      detected: detection?.source ?? "generic",
      headerRowIndex: 0,
    };
  }

  return {
    invoices: mapRegisterRows(grid, detection, source),
    detected: detection.source,
    headerRowIndex: detection.headerRowIndex,
  };
}

export async function fetchSampleAsFile(path: string, name: string): Promise<File> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new File([blob], name, { type: "text/csv" });
}
