"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { clearAllLocal, syncProfileFromServer } from "@/lib/storage";
import type { UserSession } from "@/lib/types";


const NAV_FALLBACK_MS = 6000;

function goToDashboard(router: ReturnType<typeof useRouter>) {
  router.replace("/dashboard");
  window.setTimeout(() => {
    if (window.location.pathname !== "/dashboard") window.location.assign("/dashboard");
  }, NAV_FALLBACK_MS);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Text typed before hydration lives only in the DOM; copy it into state so it isn't wiped.
    const f = formRef.current;
    if (f) {
      const em = f.elements.namedItem("email");
      const pw = f.elements.namedItem("password");
      if (em instanceof HTMLInputElement && em.value) setEmail(em.value);
      if (pw instanceof HTMLInputElement && pw.value) setPassword(pw.value);
    }
    setMounted(true);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Login failed");
        inFlight.current = false;
        setLoading(false);
        return;
      }
      const user = data.user as UserSession;
      // Always start clean: nothing from a previous session on this browser carries over.
      clearAllLocal();
      syncProfileFromServer(user);
      goToDashboard(router);
      return; // success: keep inFlight held
    } catch {
      setError("Something went wrong");
    }
    // Released only on error paths; on success the guard stays held until navigation.
    inFlight.current = false;
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-md">
          <Logo />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with your work email and password. Accounts are stored securely.
          </p>
          <form ref={formRef} method="post" onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-token mt-1 w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-token mt-1 w-full px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!mounted || loading}
              className="btn btn-pri btn-lg w-full disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            New here?{" "}
            <Link href="/signup"
              prefetch={false} className="font-semibold text-accent hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
