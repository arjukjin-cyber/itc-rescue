export type MatchCategory =
  | "matched"
  | "itc_at_risk"
  | "unclaimed"
  | "value_mismatch";

export type ChaseStatus = "pending" | "fixed" | "still_blocked";

export interface InvoiceRecord {
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  source: "books" | "gstr2b";
  rawInvoiceNumber?: string;
}

export interface MatchResult {
  id: string;
  category: MatchCategory;
  books?: InvoiceRecord;
  gstr2b?: InvoiceRecord;
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  booksTax: number;
  gstr2bTax: number;
  taxDiff: number;
  notes?: string;
}

export interface ReconSummary {
  totalBooks: number;
  totalGstr2b: number;
  matched: number;
  itcAtRisk: number;
  unclaimed: number;
  valueMismatch: number;
  itcAtRiskAmount: number;
  matchedAmount: number;
}

export interface UserSession {
  email: string;
  name: string;
  companyName?: string;
  gstin?: string;
  plan: "trial" | "starter" | "growth";
  reconCount: number;
  createdAt: string;
}

export interface CompanySettings {
  companyName: string;
  gstin: string;
  email: string;
  plan: "trial" | "starter" | "growth";
  phone?: string;
}

export interface ChaseItem {
  id: string;
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  category: MatchCategory;
  status: ChaseStatus;
  lastUpdated: string;
}
