import { NextResponse } from "next/server";

// Read the env at request time (never a build-time snapshot of a different deploy).
export const dynamic = "force-dynamic";

/**
 * GET /api/version → { sha }: the commit this deployment was built from.
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment; local / non-Vercel runs report "dev".
 * Public and read-only (no session, no data); the app footer shows the first 7 characters.
 */
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "dev";
  return NextResponse.json({ sha }, { headers: { "Cache-Control": "no-store" } });
}
