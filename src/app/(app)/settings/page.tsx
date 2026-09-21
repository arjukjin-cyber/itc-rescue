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
  const [razorpayNote, setRazorpayNote] = useState("");

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

  function upgrade(plan: "starter" | "growth") {
    // Razorpay placeholder
    setRazorpayNote(
      `Razorpay checkout placeholder: would charge ₹${plan === "starter" ? "999" : "2,499"}/mo for ${plan}. Activating ${plan} plan in demo mode.`
    );
    const next = { ...form, plan };
    setForm(next);
    saveSettings(next);
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
          { key: "companyName" as const, label: "Company name", type: "text" },
          { key: "gstin" as const, label: "GSTIN", type: "text" },
          { key: "email" as const, label: "Billing email", type: "email" },
          { key: "phone" as const, label: "Phone (optional)", type: "tel" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-slate-700">{f.label}</label>
            <input
              type={f.type}
              value={form[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>
        ))}
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div
            className="p-4 text-left shadow-sm"
            style={{
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--color-accent)",
              backgroundColor:
                form.plan === "starter" ? "var(--color-accent-soft)" : "var(--color-bg)",
            }}
          >
            <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
              Starter · ₹999/mo
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Unlimited recon · 500 invoices/mo
            </div>
            <button
              type="button"
              onClick={() => upgrade("starter")}
              disabled={form.plan === "starter"}
              className="btn-accent mt-3 w-full py-2 text-xs font-semibold disabled:opacity-60"
            >
              {form.plan === "starter" ? "Current plan" : "Upgrade to Starter"}
            </button>
          </div>
          <div
            className="p-4 text-left shadow-sm"
            style={{
              borderRadius: "var(--radius-lg)",
              border:
                form.plan === "growth"
                  ? "2px solid var(--color-accent)"
                  : "1.5px solid var(--color-border-strong)",
              backgroundColor:
                form.plan === "growth" ? "var(--color-accent-soft)" : "var(--color-bg)",
            }}
          >
            <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
              Growth · ₹2,499/mo
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Unlimited invoices · priority support
            </div>
            <button
              type="button"
              onClick={() => upgrade("growth")}
              disabled={form.plan === "growth"}
              className="btn-secondary mt-3 w-full py-2 text-xs disabled:opacity-60"
            >
              {form.plan === "growth" ? "Current plan" : "Upgrade to Growth"}
            </button>
          </div>
        </div>

        {razorpayNote && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
            {razorpayNote}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Production: wire Razorpay Subscriptions here. Demo activates plan locally without payment.
        </p>
      </div>
    </div>
  );
}
