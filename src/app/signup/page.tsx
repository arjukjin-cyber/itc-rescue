"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/Logo";
import { setLocalUser, saveSettings } from "@/lib/storage";
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
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }
      const user = data.user as UserSession;
      setLocalUser(user);
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
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Start your free trial</h1>
          <p className="mt-1 text-sm text-slate-600">
            1 free reconciliation or 50 invoices. No card required.
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-teal-700 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
