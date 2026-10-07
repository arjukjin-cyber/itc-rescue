"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getSettings, getTrialUsage, saveSettings, syncProfileFromServer } from "@/lib/storage";
import { fetchReconState } from "@/lib/api-data";
import { TRIAL_EVENT } from "@/lib/ui-events";
import type { CompanySettings, UserSession } from "@/lib/types";

/**
 * Settings inside the v3 shell.
 * Company card (#34): details come from GET /api/auth/me (synced with syncProfileFromServer),
 * never from another session's local copy. Only the company name is editable; it saves through
 * PATCH /api/settings { name }. Primary GSTIN and account email are read-only. Demo mode (no
 * Postgres) keeps the local save.
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
  });
  /** false until /me answers: fields show blank, never a previous account's values. */
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [persistence, setPersistence] = useState<"postgres" | "demo">("postgres");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reconUsed, setReconUsed] = useState<number | null>(null);
  /** null = still loading; 0 = no saved recon yet. */
  const [invoices, setInvoices] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [me, recon] = await Promise.all([
        fetch("/api/auth/me", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchReconState(),
      ]);
      if (cancelled) return;
      const user = me?.user as (UserSession & { reconCount?: number }) | null | undefined;
      // Company details come from the server, never from another session's local copy.
      if (user && me?.persistence === "postgres") {
        syncProfileFromServer(user);
        setPersistence("postgres");
        setForm({
          companyName: user.companyName || user.name || "",
          gstin: user.gstin || "",
          email: user.email,
          plan: user.plan || "trial",
        });
        setReconUsed(typeof user.reconCount === "number" ? user.reconCount : getTrialUsage().reconCount);
      } else {
        // Demo mode (no Postgres): local, email-guarded settings (#34).
        setPersistence("demo");
        setForm(getSettings());
        setReconUsed(getTrialUsage().reconCount);
      }
      setProfileLoaded(true);
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

  const plan = profileLoaded ? form.plan : null;
  const used = Math.min(reconUsed ?? 0, 1);
  const invoiceLine =
    invoices === null || reconUsed === null
      ? "Loading usage…"
      : [
          `${invoices} invoice${invoices === 1 ? "" : "s"} processed`,
          used >= 1 ? "free run used" : "free run available",
        ].join(" · ");

  const label = (htmlFor: string, text: string) => (
    <label htmlFor={htmlFor} className="block text-[12px] font-medium" style={{ color: "var(--color-text-2)" }}>
      {text}
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Settings</h1>
        <div className="helper-line">
          <span>Company profile and free trial</span>
        </div>
      </div>

      <form
        onSubmit={onSave}
        className="card space-y-3 p-4"
        aria-labelledby="settings-company"
        aria-busy={!profileLoaded || undefined}
      >
        <h2 id="settings-company" className="text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
          Company
        </h2>
        <div>
          {label("settings-companyName", "Company name")}
          <input
            id="settings-companyName"
            name="companyName"
            type="text"
            autoComplete="organization"
            value={form.companyName || ""}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            minLength={2}
            maxLength={120}
            required
            disabled={!profileLoaded}
            className="input-token mt-1.5 w-full px-3 text-[13px]"
          />
        </div>
        {[
          { key: "gstin" as const, label: "Primary GSTIN", mono: true },
          { key: "email" as const, label: "Account email", mono: false },
        ].map((f) => (
          <div key={f.key}>
            {label(`settings-${f.key}`, f.label)}
            <input
              id={`settings-${f.key}`}
              name={f.key}
              type="text"
              value={profileLoaded ? form[f.key] || "Not set" : ""}
              readOnly
              disabled
              className={`input-token mt-1.5 w-full cursor-not-allowed px-3 text-[13px]${f.mono ? " mono-sm" : ""}`}
              style={{ backgroundColor: "var(--color-subtle)", color: "var(--color-text-3)" }}
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--color-risk)" }}>
            {error}
          </p>
        )}
        <div className="pt-1">
          <button type="submit" className="btn btn-pri" disabled={saving || !profileLoaded}>
            {saved ? (
              <>
                <Check aria-hidden /> Saved
              </>
            ) : saving ? (
              "Saving…"
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
