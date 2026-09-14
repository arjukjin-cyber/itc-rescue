import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, updateChaseStatusForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import type { ChaseStatus } from "@/lib/types";

const ALLOWED: ChaseStatus[] = ["pending", "fixed", "still_blocked"];

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const status = body.status as ChaseStatus;
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const items = await updateChaseStatusForUser(user.id, id, status);
  return NextResponse.json({ persistence: "postgres", items });
}
