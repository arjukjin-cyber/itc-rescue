"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { getSettings, saveSettings, getTrialUsage } from "@/lib/storage";
import type { CompanySettings } from "@/lib/types";

export default function SettingsPage() {
  const [form, setForm] = useState<CompanySettings>({
    companyName: "",
    gstin: "",
    email: "",
    plan: "trial",
    phone: "",
  });
  const [saved, setSaved] = useState(false);
  const [trial, setTrial] = useState({ reconCount: 0, invoiceCount: 0 });

  useEffect(() => {
    setForm(getSettings());
    setTrial(getTrialUsage());
  }, []);

  function set<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Company profile and subscription</p>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Company</h2>
        {[
          { key: "companyName" as const, label: "Company name", type: "text", autoComplete: "organization" },
          { key: "gstin" as const, label: "GSTIN", type: "text", autoComplete: "off" },
          { key: "email" as const, label: "Billing email", type: "email", autoComplete: "email" },
          { key: "phone" as const, label: "Phone (optional)", type: "tel", autoComplete: "tel" },
        ].map((f) => (
          <div key={f.key}>
            <label htmlFor={`settings-${f.key}`} className="block text-sm font-medium text-slate-700">
              {f.label}
            </label>
            <input
              id={`settings-${f.key}`}
              name={f.key}
              type={f.type}
              autoComplete={f.autoComplete}
              value={form[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="input-token mt-1 w-full px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="submit"
          className="btn btn-pri"
        >
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-accent" />
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
