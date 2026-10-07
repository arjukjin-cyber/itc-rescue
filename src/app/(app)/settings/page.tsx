"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { getSettings, getTrialUsage, saveSettings, syncProfileFromServer } from "@/lib/storage";
import type { CompanySettings, UserSession } from "@/lib/types";

export default function SettingsPage() {
  const [form, setForm] = useState<CompanySettings>({
    companyName: "",
    gstin: "",
    email: "",
    plan: "trial",
  });
  const [persistence, setPersistence] = useState<"postgres" | "demo">("postgres");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [trial, setTrial] = useState({ reconCount: 0, invoiceCount: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Company details come from the server, never from another session's local copy.
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const user = data.user as (UserSession & { reconCount?: number }) | null;
          if (!cancelled && user && data.persistence === "postgres") {
            syncProfileFromServer(user);
            setPersistence("postgres");
            setForm({
              companyName: user.companyName || user.name || "",
              gstin: user.gstin || "",
              email: user.email,
              plan: user.plan || "trial",
            });
            setTrial((t) => ({ ...getTrialUsage(), reconCount: user.reconCount ?? t.reconCount }));
            return;
          }
        }
      } catch {
        /* fall back to local (demo mode) */
      }
      if (cancelled) return;
      setPersistence("demo");
      setForm(getSettings());
      setTrial(getTrialUsage());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    const name = form.companyName.replace(/\s+/g, " ").trim();
    if (persistence === "demo") {
      saveSettings({ ...form, companyName: name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save. Try again.");
        return;
      }
      const companyName = String(data.companyName || name);
      setForm((f) => ({ ...f, companyName }));
      saveSettings({ ...form, companyName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Company profile and subscription</p>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Company</h2>
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-slate-700">Company name</label>
          <input
            id="companyName"
            type="text"
            autoComplete="organization"
            value={form.companyName || ""}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            minLength={2}
            maxLength={120}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        {[
          { key: "gstin" as const, label: "Primary GSTIN" },
          { key: "email" as const, label: "Account email" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-slate-700">{f.label}</label>
            <input
              type="text"
              value={form[f.key] || "Not set"}
              readOnly
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--color-status-risk-fg)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save changes"
          )}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-teal-700" />
          <h2 className="font-semibold text-slate-900">Plan</h2>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Current plan:{" "}
          <span className="font-semibold capitalize" style={{ color: "var(--color-accent)" }}>
            {form.plan}
          </span>
        </p>

        {form.plan === "trial" && (
          <div
            className="trial-meter mt-3"
            data-risk={trial.reconCount >= 1 ? "true" : "false"}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                Trial usage
              </span>
              <span
                className="text-xs font-bold tabular-nums"
                style={{
                  color:
                    trial.reconCount >= 1
                      ? "var(--color-status-risk-fg)"
                      : "var(--color-text-secondary)",
                }}
              >
                {trial.reconCount}/1 recon
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--color-bg-subtle)" }}
              role="progressbar"
              aria-valuenow={Math.min(trial.reconCount, 1)}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-label="Trial reconciliations used"
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(trial.reconCount, 1) * 100}%`,
                  backgroundColor:
                    trial.reconCount >= 1
                      ? "var(--color-status-risk-fg)"
                      : "var(--color-accent)",
                }}
              />
            </div>
            <p className="mt-1 text-meta">
              {trial.invoiceCount}/50 invoices processed
              {trial.reconCount >= 1 ? " · trial exhausted" : ""}
            </p>
          </div>
        )}

        {form.plan === "trial" && trial.reconCount >= 1 && (
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Free trial used. We&apos;ll email you when more runs open.
          </p>
        )}
      </div>
    </div>
  );
}
