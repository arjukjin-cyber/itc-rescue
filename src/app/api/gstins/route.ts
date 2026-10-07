import { NextRequest, NextResponse } from "next/server";
import { addGstinForUser, GstinError, hasDatabase, listGstinsForUser } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import { validateGstin } from "@/lib/gstin";

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ gstins: [], persistence: "demo" });
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gstins = await listGstinsForUser(user.id);
  return NextResponse.json({ gstins });
}

export async function POST(req: NextRequest) {
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
  const check = validateGstin(body.gstin);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason, code: "invalid_gstin" }, { status: 422 });
  }
  try {
    const gstin = await addGstinForUser(user.id, {
      gstin: check.gstin,
      stateCode: check.stateCode,
      label: typeof body.label === "string" ? body.label : "",
    });
    return NextResponse.json({ gstin }, { status: 201 });
  } catch (err) {
    if (err instanceof GstinError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[POST /api/gstins]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not add GSTIN" }, { status: 500 });
  }
}
