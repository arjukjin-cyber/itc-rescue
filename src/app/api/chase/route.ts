import { NextResponse } from "next/server";
import { hasDatabase, listChaseForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo", items: [] });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await listChaseForUser(user.id);
  return NextResponse.json({ persistence: "postgres", items });
}
