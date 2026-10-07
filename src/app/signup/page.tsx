"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/Logo";
import { clearAllLocal, resetTrialUsage, syncProfileFromServer } from "@/lib/storage";
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim().toLowerCase(),
          isSignup: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }
      const user = data.user as UserSession;
      clearAllLocal();
      syncProfileFromServer({
        ...user,
        companyName: user.companyName || form.companyName || user.name,
        gstin: user.gstin || form.gstin,
      });
      resetTrialUsage();
      router.push("/dashboard");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const fields: {
    key: keyof FormState;
    label: string;
    type: string;
    required: boolean;
    autoComplete: string;
    minLength?: number;
  }[] = [
    { key: "name", label: "Your name", type: "text", required: true, autoComplete: "name" },
    { key: "email", label: "Work email", type: "email", required: true, autoComplete: "email" },
    {
      key: "password",
      label: "Password (min 6 characters)",
      type: "password",
      required: true,
      autoComplete: "new-password",
      minLength: 6,
    },
    { key: "companyName", label: "Company name", type: "text", required: false, autoComplete: "organization" },
    { key: "gstin", label: "Company GSTIN (optional)", type: "text", required: false, autoComplete: "off" },
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
          {/* UX-09: no waitlist on the pre-trial path — the waitlist only appears after the free run is used. */}
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--color-ink)" }}>
            Create your account
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-3)" }}>
            1 free reconciliation · No card · No GST portal login
          </p>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`signup-${field.key}`} className="block text-sm font-medium text-slate-700">
                  {field.label}
                </label>
                <input
                  id={`signup-${field.key}`}
                  name={field.key}
                  type={field.type}
                  required={field.required}
                  autoComplete={field.autoComplete}
                  minLength={field.minLength}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className="input-token mt-1 w-full px-3 py-2.5 text-sm"
                />
              </div>
            ))}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-pri btn-lg w-full disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
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
