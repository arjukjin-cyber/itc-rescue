"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getSettings, getTrialUsage, saveSettings, syncProfileFromServer } from "@/lib/storage";
import { TRIAL_EVENT } from "@/lib/ui-events";
import type { CompanySettings, UserSession } from "@/lib/types";

/**
 * Settings inside the v3 shell.
 * Company card (#34): details come from GET /api/auth/me (synced with syncProfileFromServer),
 * never from another session's local copy. Only the company name is editable; it saves through
 * PATCH /api/settings { name }. Primary GSTIN and account email are read-only. Demo mode (no
 * Postgres) keeps the local save.
 * Free trial card (F-8): counts come from the server: recon_count and invoice_count via
 * /api/auth/me (#35). Demo mode (no Postgres) uses the local trial counter. No "/50" limit
 * copy (UX-28), no plan cards or Upgrade (T-08). Meter = 4px ink on line (v1 sidebar pattern).
 */
export default function SettingsPage() {
  const [form, setForm] = useState<CompanySettings>({
    companyName: "",
    gstin: "",
    email: "",
    plan: "trial",
  });
  /**
   * /me state: "loading" = skeleton for the company fields, plan and trial lines (never 0/1 or
   * another account's values); "error" = /me failed in Postgres mode (no local fallback).
   */
  const [profile, setProfile] = useState<"loading" | "ready" | "error">("loading");
  const [reloadTick, setReloadTick] = useState(0);
  const profileLoaded = profile === "ready";
  const [persistence, setPersistence] = useState<"postgres" | "demo">("postgres");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reconUsed, setReconUsed] = useState<number | null>(null);
  /** invoice_count from /me (#35); null = still loading. */
  const [invoices, setInvoices] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile("loading");
    (async () => {
      const me = await fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled) return;
      if (!me?.user) {
        // /me failed: show an error with retry, not local data. (A 401 is handled by AppShell.)
        setProfile("error");
        return;
      }
      const user = me?.user as (UserSession & { reconCount?: number; invoiceCount?: number }) | null | undefined;
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
        setReconUsed(typeof user.reconCount === "number" ? user.reconCount : 0);
        setInvoices(typeof user.invoiceCount === "number" ? user.invoiceCount : 0);
      } else {
        // Demo mode (no Postgres, /me persistence "demo"): local, email-guarded settings (#34)
        // and the local trial counter, which is the only store in demo mode.
        setPersistence("demo");
        setForm(getSettings());
        const t = getTrialUsage();
        setReconUsed(t.reconCount);
        setInvoices(t.invoiceCount);
      }
      setProfile("ready");
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
  }, [reloadTick]);

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
      ? null
      : [
          `${invoices} invoice${invoices === 1 ? "" : "s"} processed`,
          used >= 1 ? "free run used" : "free run available",
        ].join(" · ");

  /** Input-shaped placeholder while /me loads (no value, so nothing stale can show). */
  const fieldSkel = (id: string, w: number) => (
    <div
      id={id}
      className="input-token mt-1.5 flex w-full items-center px-3"
      style={{ backgroundColor: "var(--color-subtle)" }}
      aria-hidden
      data-testid={`${id}-skeleton`}
    >
      <Skel w={w} />
    </div>
  );

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
          {!profileLoaded ? (
            fieldSkel("settings-companyName", 160)
          ) : (
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
            className="input-token mt-1.5 w-full px-3 text-[13px]"
          />
          )}
        </div>
        {[
          { key: "gstin" as const, label: "Primary GSTIN", mono: true },
          { key: "email" as const, label: "Account email", mono: false },
        ].map((f) => (
          <div key={f.key}>
            {label(`settings-${f.key}`, f.label)}
            {!profileLoaded ? (
              fieldSkel(`settings-${f.key}`, f.key === "gstin" ? 140 : 180)
            ) : (
            <input
              id={`settings-${f.key}`}
              name={f.key}
              type="text"
              value={form[f.key] || "Not set"}
              readOnly
              disabled
              className={`input-token mt-1.5 w-full cursor-not-allowed px-3 text-[13px]${f.mono ? " mono-sm" : ""}`}
              style={{ backgroundColor: "var(--color-subtle)", color: "var(--color-text-3)" }}
            />
            )}
          </div>
        ))}
        {profile === "error" && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--color-text-2)" }} data-testid="settings-profile-error">
            Couldn&apos;t load your company profile.{" "}
            <button
              type="button"
              className="font-medium"
              style={{ color: "var(--color-accent)" }}
              onClick={() => setReloadTick((t) => t + 1)}
            >
              Try again
            </button>
          </p>
        )}
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

      {profile !== "ready" && profile !== "error" && (
        <section className="card p-4" aria-busy="true" aria-label="Loading free trial" data-testid="settings-trial-skeleton">
          <div className="flex items-center justify-between gap-2">
            <Skel w={72} h={12} />
            <Skel w={96} h={9} />
          </div>
          <span className="skel" style={{ marginTop: 12, height: 4, width: "100%" }} aria-hidden />
          <div className="mt-2.5">
            <Skel w={200} h={9} />
          </div>
        </section>
      )}

      {plan === "trial" && (
        <section className="card p-4" aria-labelledby="settings-trial">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="settings-trial" className="text-[14px] font-semibold" style={{ color: "var(--color-ink)" }}>
              Free trial
            </h2>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-3)" }}>
              {reconUsed === null ? <Skel w={96} h={9} /> : `${used} of 1 recon used`}
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
            {invoiceLine ?? <Skel w={200} h={9} />}
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

/** v1.1 skeleton bar (.skel: neutral grey, 4px radius, subtle pulse off under reduced motion). */
function Skel({ w, h = 10 }: { w: number | string; h?: number }) {
  return <span className="skel align-middle" style={{ width: w, height: h, display: "inline-block" }} aria-hidden />;
}
