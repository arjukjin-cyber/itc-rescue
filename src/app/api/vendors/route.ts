import { NextResponse } from "next/server";
import { hasDatabase, listVendorsForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo", vendors: [] });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const vendors = await listVendorsForUser(user.id);
    return NextResponse.json({ persistence: "postgres", vendors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load vendors";
    console.error("[GET /api/vendors]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
