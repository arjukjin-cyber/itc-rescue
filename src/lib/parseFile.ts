"use client";

import * as XLSX from "xlsx";
import { rowToInvoice } from "./reconcile";
import {
  detectImport,
  guessHeaderRow,
  headerLabels,
  mapColumns,
  mapRegisterRows,
  missingColumnsMessage,
  missingRequiredColumns,
  normalizeHeader,
  type ImportSource,
} from "./importers/tally-busy";
import { findGstr2bReturnPeriod, mapGstr2bJson } from "./importers/gstr2b-json";
import {
  detectGstr2bPortal,
  extractGstr2bPortalPeriod,
  mapGstr2bPortalRows,
  pickGstr2bSheet,
} from "./importers/gstr2b-portal";
import type { InvoiceRecord } from "./types";

export type { ImportSource } from "./importers/tally-busy";

/** A file that can't be turned into invoices; `message` names the file and what is missing. */
export class InvoiceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceParseError";
  }
}

export interface ParsedInvoiceFile {
  invoices: InvoiceRecord[];
  /** Which format was recognised: "tally" | "busy" | "template" | "generic" | "gstr2b_portal" | "gstr2b_portal_json" */
  detected: ImportSource;
  /** 0-based row of the header that was used */
  headerRowIndex: number;
  /**
   * GSTR-2B return period as YYYY-MM (e.g. "2026-09"), for pre-filling the period
   * picker. Set from portal JSON `rtnprd` or the portal Excel header block
   * ("Financial Year" + "Tax Period"); null when not found, for Tally/CSV/template
   * 2B files, and always null for books.
   */
  returnPeriod: string | null;
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
 * - GST portal GSTR-2B workbook -> the B2B sheet is picked automatically and read
 *   with importers/gstr2b-portal (two-row merged header).
 * - GST portal GSTR-2B .json -> importers/gstr2b-json (docdata.b2b[].inv[]).
 *
 * Throws InvoiceParseError (file name + what's missing) for invalid JSON, a JSON
 * without a B2B section, a sheet without GSTIN / invoice number / invoice date
 * columns, or a file with no invoice rows.
 */
export async function parseInvoiceFileDetailed(
  file: File,
  source: "books" | "gstr2b"
): Promise<ParsedInvoiceFile> {
  const name = file.name.toLowerCase();
  let sheet: XLSX.WorkSheet;
  let rows: Record<string, unknown>[] = [];
  let workbook: XLSX.WorkBook | null = null;

  if (name.endsWith(".json") || file.type === "application/json") {
    return parseJsonFile(file, source);
  }

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
    workbook = wb;
    // GST portal GSTR-2B workbooks start with "Read me"; invoices live in "B2B".
    sheet = wb.Sheets[pickGstr2bSheet(wb.SheetNames) ?? wb.SheetNames[0]];
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

  const portal = detectGstr2bPortal(grid);
  if (portal) {
    assertRequiredColumns(file.name, grid, portal.columns, portal.headerRowIndex, portal.headerRowCount);
    return nonEmpty(file.name, {
      invoices: mapGstr2bPortalRows(grid, portal, source),
      detected: "gstr2b_portal",
      headerRowIndex: portal.headerRowIndex,
      returnPeriod: source === "gstr2b" ? portalReturnPeriod(workbook, grid, portal) : null,
    });
  }

  const detection = detectImport(grid);
  if (detection) {
    assertRequiredColumns(file.name, grid, detection.columns, detection.headerRowIndex);
  } else {
    const guess = guessHeaderRow(grid);
    const columns = guess >= 0 ? mapColumns((grid[guess] ?? []).map(normalizeHeader)) : {};
    assertRequiredColumns(file.name, grid, columns, Math.max(guess, 0));
  }

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
    return nonEmpty(file.name, {
      invoices,
      detected: detection?.source ?? "generic",
      headerRowIndex: 0,
      returnPeriod: null,
    });
  }

  return nonEmpty(file.name, {
    invoices: mapRegisterRows(grid, detection, source),
    detected: detection.source,
    headerRowIndex: detection.headerRowIndex,
    returnPeriod: null,
  });
}

/**
 * Period from the portal workbook's header block: the title rows above the B2B
 * header first, then the "Read me" sheet (where the portal puts
 * "Financial Year" / "Tax Period"). Null when neither states it.
 */
function portalReturnPeriod(
  wb: XLSX.WorkBook | null,
  grid: unknown[][],
  portal: { headerRowIndex: number; headerRowCount?: number }
): string | null {
  const firstHeaderRow = portal.headerRowIndex - ((portal.headerRowCount ?? 1) - 1);
  const blocks: unknown[][][] = [grid.slice(0, Math.max(firstHeaderRow, 0))];
  const readMe = wb?.SheetNames.find((n) => n.trim().toLowerCase().replace(/\s+/g, " ") === "read me");
  if (wb && readMe) {
    const rm = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[readMe], { header: 1, defval: "", raw: true });
    blocks.push(rm.slice(0, 20));
  }
  return extractGstr2bPortalPeriod(blocks);
}

function assertRequiredColumns(
  fileName: string,
  grid: unknown[][],
  columns: Parameters<typeof missingRequiredColumns>[0],
  headerRowIndex: number,
  headerRowCount = 1
): void {
  const missing = missingRequiredColumns(columns);
  if (!missing.length) return;
  const found = headerLabels(grid, headerRowIndex, headerRowCount);
  throw new InvoiceParseError(missingColumnsMessage(fileName, missing, found));
}

function nonEmpty(fileName: string, parsed: ParsedInvoiceFile): ParsedInvoiceFile {
  if (!parsed.invoices.length) {
    throw new InvoiceParseError(`${fileName}: no invoice rows found below the header row`);
  }
  return parsed;
}

async function parseJsonFile(file: File, source: "books" | "gstr2b"): Promise<ParsedInvoiceFile> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new InvoiceParseError(`${file.name}: not valid JSON (download the GSTR-2B JSON again from the GST portal)`);
  }
  const invoices = mapGstr2bJson(json, source);
  if (!invoices || !invoices.length) {
    throw new InvoiceParseError(`${file.name}: no B2B invoices found (expected docdata.b2b)`);
  }
  return {
    invoices,
    detected: "gstr2b_portal_json",
    headerRowIndex: -1,
    returnPeriod: source === "gstr2b" ? findGstr2bReturnPeriod(json) : null,
  };
}

export async function fetchSampleAsFile(path: string, name: string): Promise<File> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new File([blob], name, { type: "text/csv" });
}
