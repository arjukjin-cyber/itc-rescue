"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getLocalUser, getSettings, getTrialUsage, saveSettings } from "@/lib/storage";
import { fetchReconState } from "@/lib/api-data";
import { TRIAL_EVENT } from "@/lib/ui-events";
import type { CompanySettings } from "@/lib/types";

/**
 * Settings inside the v3 shell. Company fields are unchanged (local save, as before).
 * Free trial card (F-8): counts come from the server: recon_count via /api/auth/me and the
 * processed-invoice count = rows in the latest saved recon (GET /api/recon). No "/50" limit
 * copy (UX-28), no plan cards or Upgrade (T-08). Meter = 4px ink on line (v1 sidebar pattern).
 */
export default function SettingsPage() {
  const [form, setForm] = useState<CompanySettings>({
    companyName: "",
    gstin: "",
    email: "",
    plan: "trial",
    phone: "",
  });
  const [saved, setSaved] = useState(false);
  const [plan, setPlan] = useState<string>("trial");
  const [reconUsed, setReconUsed] = useState<number | null>(null);
  /** null = still loading; 0 = no saved recon yet. */
  const [invoices, setInvoices] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const s = getSettings();
    setForm(s);
    setPlan(getLocalUser()?.plan || s.plan || "trial");
    (async () => {
      const [me, recon] = await Promise.all([
        fetch("/api/auth/me", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchReconState(),
      ]);
      if (cancelled) return;
      const user = me?.user as { plan?: string; reconCount?: number } | null | undefined;
      if (user?.plan) setPlan(user.plan);
      setReconUsed(
        me?.persistence === "postgres" && typeof user?.reconCount === "number"
          ? user.reconCount
          : getTrialUsage().reconCount
      );
      setInvoices(recon.authError ? 0 : recon.results.length);
    })();
    const onTrial = (e: Event) => {
      const n = (e as CustomEvent<number | undefined>).detail;
      if (typeof n === "number") setReconUsed(n);
    };
    window.addEventListener(TRIAL_EVENT, onTrial);
    return () => {
      cancelled = true;
      window.removeEventListener(TRIAL_EVENT, onTrial);
    };
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

  const used = Math.min(reconUsed ?? 0, 1);
  const invoiceLine =
    invoices === null || reconUsed === null
      ? "Loading usage…"
      : [
          `${invoices} invoice${invoices === 1 ? "" : "s"} processed`,
          used >= 1 ? "free run used" : "free run available",
        ].join(" · ");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Settings</h1>
        <div className="helper-line">
          <span>Company profile and free trial</span>
        </div>
      </div>

      <form onSubmit={onSave} className="card space-y-3 p-4" aria-labelledby="settings-company">
        <h2 id="settings-company" className="text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
          Company
        </h2>
        {[
          { key: "companyName" as const, label: "Company name", type: "text", autoComplete: "organization" },
          { key: "gstin" as const, label: "GSTIN", type: "text", autoComplete: "off" },
          { key: "email" as const, label: "Email", type: "email", autoComplete: "email" },
          { key: "phone" as const, label: "Phone (optional)", type: "tel", autoComplete: "tel" },
        ].map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`settings-${f.key}`}
              className="block text-[12px] font-medium"
              style={{ color: "var(--color-text-2)" }}
            >
              {f.label}
            </label>
            <input
              id={`settings-${f.key}`}
              name={f.key}
              type={f.type}
              autoComplete={f.autoComplete}
              value={form[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              className={`input-token mt-1.5 w-full px-3 text-[13px]${f.key === "gstin" ? " mono-sm" : ""}`}
            />
          </div>
        ))}
        <div className="pt-1">
          <button type="submit" className="btn btn-pri">
            {saved ? (
              <>
                <Check aria-hidden /> Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </form>

      {plan === "trial" && (
        <section className="card p-4" aria-labelledby="settings-trial">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="settings-trial" className="text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
              Free trial
            </h2>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-3)" }}>
              {reconUsed === null ? "…" : `${used} of 1 recon used`}
            </span>
          </div>
          <div
            className="v3-bar"
            style={{ marginTop: 10 }}
            role="progressbar"
            aria-label="Free recons used"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={used}
          >
            <i style={{ width: `${used * 100}%` }} />
          </div>
          <p className="text-meta mt-2" data-testid="settings-invoice-count">
            {invoiceLine}
          </p>
          {used >= 1 && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-2)" }}>
              Free trial used. We&apos;ll email you when more runs open.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
