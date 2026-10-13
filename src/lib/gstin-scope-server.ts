import { NextResponse } from "next/server";
import { listGstinsForUser, userOwnsGstin } from "@/lib/db";
import { normalizeGstin } from "@/lib/gstin";
import { companyGstinScope, type GstinScope } from "@/lib/gstin-scope";

/**
 * Reads the optional `?gstin=` of a GET. Same validation as POST /api/recon: normalizeGstin +
 * ownership (422 gstin_not_found otherwise). Absent/empty = unscoped (null).
 */
export async function scopeFromRequest(
  url: string,
  userId: string
): Promise<{ scope: GstinScope; error?: undefined } | { scope?: undefined; error: NextResponse }> {
  const raw = new URL(url).searchParams.get("gstin");
  if (raw == null || raw.trim() === "") return { scope: null };
  const gstin = normalizeGstin(raw);
  if (!(await userOwnsGstin(userId, gstin))) {
    return {
      error: NextResponse.json(
        { error: "That GSTIN isn't on your account. Add it under Company first.", code: "gstin_not_found" },
        { status: 422 }
      ),
    };
  }
  return { scope: companyGstinScope(gstin, await listGstinsForUser(userId)) };
}
