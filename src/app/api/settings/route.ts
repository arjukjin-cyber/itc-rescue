import { NextRequest, NextResponse } from "next/server";
import { GstinError, hasDatabase, updateCompanyNameForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";

/**
 * PATCH /api/settings
 * Scope (Design spec, Oct 6): { name } only, which is the company name.
 * Primary GSTIN, profile name and email are read-only in Settings.
 */
export async function PATCH(req: NextRequest) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "bad_request" }, { status: 400 });
  }
  const extra = Object.keys(body).filter((k) => k !== "name");
  if (extra.length) {
    return NextResponse.json(
      { error: `Only the company name can be changed here (got: ${extra.join(", ")})`, code: "read_only_field" },
      { status: 400 }
    );
  }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json(
      { error: "Company name must be 2 to 120 characters", code: "invalid_name" },
      { status: 422 }
    );
  }
  try {
    const saved = await updateCompanyNameForUser(user.id, name);
    return NextResponse.json({ companyName: saved });
  } catch (err) {
    if (err instanceof GstinError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[PATCH /api/settings]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }
}
