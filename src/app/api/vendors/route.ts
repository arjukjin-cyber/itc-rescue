import { NextResponse } from "next/server";
import { hasDatabase, listVendorsForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import { vendorsResponseMeta } from "@/lib/vendors";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo", vendors: [], ...vendorsResponseMeta() });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const vendors = await listVendorsForUser(user.id);
    // repeatOffenderLabel: "hidden" until OFFENDER_COUNT_BY_DISTINCT_PERIOD (CPO condition, #33)
    return NextResponse.json({ persistence: "postgres", vendors, ...vendorsResponseMeta() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load vendors";
    console.error("[GET /api/vendors]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
