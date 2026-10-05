import { NextRequest, NextResponse } from "next/server";
import {
  canUserRunRecon,
  getLatestReconForUser,
  hasDatabase,
  saveReconForUser,
} from "@/lib/db";
import { requireDbUser } from "@/lib/session-user";
import {
  QA_FAIL_VENDORS_COOKIE,
  shouldBypassTrial,
  shouldForceVendorsFail,
} from "@/lib/qa-flags";
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
  // PREVIEW-ONLY QA switch; ignored in production (qa. trial bypass).
  const gate = await canUserRunRecon(user.id, { bypassTrial: shouldBypassTrial(user.email) });
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

    // PREVIEW-ONLY QA switch; ignored in production (qa. trial bypass).
    const bypassTrial = shouldBypassTrial(user.email);
    const gate = await canUserRunRecon(user.id, { bypassTrial });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.reason || TRIAL_USED_MESSAGE, code: "trial_exhausted" },
        { status: 402 }
      );
    }

    // PREVIEW-ONLY QA switch; ignored in production (qa_fail_vendors=1 cookie
    // forces the best-effort vendors bump to fail; recon/chase still save).
    const forceVendorsFail = shouldForceVendorsFail(req.cookies.get(QA_FAIL_VENDORS_COOKIE)?.value);
    const saved = await saveReconForUser(user.id, results, summary, { forceVendorsFail });
    return NextResponse.json({
      persistence: "postgres",
      reconId: saved.reconId,
      chase: saved.chase,
      // canRun stays false in production; only a preview QA bypass keeps it true.
      trial: { reconCount: user.reconCount + 1, canRun: bypassTrial },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    console.error("[POST /api/recon]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
