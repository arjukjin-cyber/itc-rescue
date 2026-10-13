import { NextRequest, NextResponse } from "next/server";
import { scopeFromRequest } from "@/lib/gstin-scope-server";
import { hasDatabase, listReconRunsForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import { parseHistoryPaging } from "@/lib/run-history";

/**
 * GET /api/recon/history?gstin=&limit=&offset= — the user's saved runs, newest first.
 * ?gstin= is validated like /api/recon (normalizeGstin + ownership, 422 gstin_not_found);
 * legacy runs (company_gstin '') count under the PRIMARY GSTIN only.
 */
export async function GET(req: NextRequest) {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo", runs: [], nextOffset: null });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sc = await scopeFromRequest(req.url, user.id);
  if (sc.error) return sc.error;
  const { limit, offset } = parseHistoryPaging(new URL(req.url).searchParams);
  try {
    const page = await listReconRunsForUser(user.id, sc.scope, limit, offset);
    return NextResponse.json({ persistence: "postgres", ...page });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load run history";
    console.error("[GET /api/recon/history]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
