"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/Logo";
import { setLocalUser, saveSettings, resetTrialUsage, clearReconData } from "@/lib/storage";
import type { UserSession } from "@/lib/types";

type FormState = {
  name: string;
  email: string;
  password: string;
  companyName: string;
  gstin: string;
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    companyName: "",
    gstin: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, isSignup: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }
      const user = data.user as UserSession;
      setLocalUser(user);
      resetTrialUsage();
      clearReconData();
      saveSettings({
        companyName: form.companyName || user.name,
        gstin: form.gstin,
        email: form.email,
        plan: "trial",
      });
      router.push("/dashboard");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const fields: { key: keyof FormState; label: string; type: string; required: boolean }[] = [
    { key: "name", label: "Your name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "password", label: "Password (anything for demo)", type: "password", required: true },
    { key: "companyName", label: "Company name", type: "text", required: false },
    { key: "gstin", label: "Company GSTIN (optional)", type: "text", required: false },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-md">
          <Logo />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-md p-8 shadow-sm"
          style={{
            borderRadius: "var(--radius-lg)",
            border: "1.5px solid var(--color-border-strong)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div
            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-accent-ring)",
              backgroundColor: "var(--color-accent-soft)",
              color: "var(--color-accent)",
            }}
          >
            Waitlist · free trial
          </div>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
            Join the waitlist &amp; start free
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Work email gets you early access. Includes 1 free reconciliation (or 50 invoices) — no card.
            Full chase &amp; unlimited recon unlock on a paid plan.
          </p>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-slate-700">{field.label}</label>
                <input
                  type={field.type}
                  required={field.required}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className="input-token mt-1 w-full px-3 py-2.5 text-sm"
                />
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-accent w-full py-3 text-sm font-semibold disabled:opacity-60"
            >
              {loading ? "Joining…" : "Join waitlist & start trial"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
