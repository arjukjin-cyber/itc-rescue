import { NextRequest, NextResponse } from "next/server";
import {
  canUserRunRecon,
  getLatestReconForUser,
  hasDatabase,
  saveReconForUser,
} from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import type { MatchResult, ReconSummary } from "@/lib/types";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ persistence: "demo" });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const latest = await getLatestReconForUser(user.id);
  const gate = await canUserRunRecon(user.id);
  return NextResponse.json({
    persistence: "postgres",
    recon: latest,
    trial: { reconCount: user.reconCount, canRun: gate.ok, reason: gate.reason },
  });
}

export async function POST(req: NextRequest) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const user = await requireDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await canUserRunRecon(user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason || "Upgrade required" }, { status: 402 });
  }

  const body = await req.json();
  const results = (body.results || []) as MatchResult[];
  const summary = body.summary as ReconSummary;
  if (!summary || !Array.isArray(results)) {
    return NextResponse.json({ error: "results and summary required" }, { status: 400 });
  }

  const saved = await saveReconForUser(user.id, results, summary);
  return NextResponse.json({
    persistence: "postgres",
    reconId: saved.reconId,
    chase: saved.chase,
    trial: { reconCount: user.reconCount + 1 },
  });
}
