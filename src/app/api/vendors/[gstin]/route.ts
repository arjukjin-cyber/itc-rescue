import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, upsertVendorPhone } from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import { VendorValidationError } from "@/lib/vendors";

/** PATCH /api/vendors/:gstin  body: { phone: string | null, name?: string | null } */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ gstin: string }> }
) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gstin } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || !("phone" in body)) {
    return NextResponse.json({ error: "phone is required (use null to clear)" }, { status: 400 });
  }
  const phone = body.phone;
  if (phone !== null && typeof phone !== "string") {
    return NextResponse.json({ error: "phone must be a string or null" }, { status: 400 });
  }
  const name = body.name;
  if (name !== undefined && name !== null && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }

  try {
    const { vendor, vendors } = await upsertVendorPhone(
      user.id,
      gstin,
      phone,
      name as string | null | undefined
    );
    return NextResponse.json({ persistence: "postgres", vendor, vendors });
  } catch (err) {
    if (err instanceof VendorValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    console.error("[PATCH /api/vendors/:gstin]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
