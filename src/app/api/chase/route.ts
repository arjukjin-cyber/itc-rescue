import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, listChaseForUser } from "@/lib/db";
import { scopeFromRequest } from "@/lib/gstin-scope-server";
import { requireDbUser } from "@/lib/session-user";

export async function GET(req: NextRequest) {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo", items: [] });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sc = await scopeFromRequest(req.url, user.id);
  if (sc.error) return sc.error;
  const items = await listChaseForUser(user.id, sc.scope);
  return NextResponse.json({ persistence: "postgres", items });
}
