import { NextRequest, NextResponse } from "next/server";
import {
  canUserRunRecon,
  getLatestReconForUser,
  hasDatabase,
  saveReconForUser,
  userOwnsGstin,
} from "@/lib/db";
import { normalizeGstin, normalizeReturnPeriod } from "@/lib/gstin";
import { requireDbUser } from "@/lib/session-user";
import {
  isMixedSampleRecon,
  isSampleRecon,
  TRIAL_USED_MESSAGE,
  validateReconResults,
} from "@/lib/recon-guard";
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
  try {
    const user = await requireDbUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const results = (body.results || []) as MatchResult[];
    const summary = body.summary as ReconSummary;
    if (!summary || !Array.isArray(results)) {
      return NextResponse.json({ error: "results and summary required" }, { status: 400 });
    }

    // Sample runs are never saved or counted against the trial.
    if (isSampleRecon(results)) {
      return NextResponse.json({ persistence: "sample", saved: false });
    }

    // A sample file mixed with a real one: don't save or count it.
    if (isMixedSampleRecon(results)) {
      return NextResponse.json(
        {
          error:
            "One of these files is our sample file. Upload both of your own files. Nothing was saved and your free run wasn't used.",
          code: "sample_mixed",
        },
        { status: 422 }
      );
    }

    // Don't save (or count) a run whose parse looks broken.
    const valid = validateReconResults(results);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.reason, code: "parse_invalid" }, { status: 422 });
    }

    // Optional scoping: which company GSTIN and return period (YYYY-MM or MMYYYY) this run covers.
    let companyGstin = "";
    if (body.gstin != null && body.gstin !== "") {
      companyGstin = normalizeGstin(body.gstin);
      if (!(await userOwnsGstin(user.id, companyGstin))) {
        return NextResponse.json(
          { error: "That GSTIN isn't on your account. Add it under Company first.", code: "gstin_not_found" },
          { status: 422 }
        );
      }
    }
    let returnPeriod = "";
    if (body.returnPeriod != null && body.returnPeriod !== "") {
      const p = normalizeReturnPeriod(body.returnPeriod);
      if (!p) {
        return NextResponse.json(
          { error: "Return period must look like 2026-09 or 092026", code: "invalid_return_period" },
          { status: 422 }
        );
      }
      returnPeriod = p;
    }

    const gate = await canUserRunRecon(user.id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.reason || TRIAL_USED_MESSAGE, code: "trial_exhausted" },
        { status: 402 }
      );
    }

    const saved = await saveReconForUser(user.id, results, summary, { companyGstin, returnPeriod });
    return NextResponse.json({
      persistence: "postgres",
      reconId: saved.reconId,
      companyGstin,
      returnPeriod,
      chase: saved.chase,
      trial: { reconCount: user.reconCount + 1, canRun: false },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    console.error("[POST /api/recon]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
