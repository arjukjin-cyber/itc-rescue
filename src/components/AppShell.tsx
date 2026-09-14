"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  GitCompareArrows,
  MessageSquare,
  Kanban,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldAlert,
} from "lucide-react";
import { Logo } from "./Logo";
import { clearLocalUser, getLocalUser, getSettings, getTrialUsage } from "@/lib/storage";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reconcile", label: "Reconcile", icon: GitCompareArrows },
  { href: "/chase", label: "Vendor chase", icon: MessageSquare },
  { href: "/status", label: "Status board", icon: Kanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("trial");
  const [trialHint, setTrialHint] = useState("");

  useEffect(() => {
    const u = getLocalUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setEmail(u.email);
    const s = getSettings();
    setPlan(s.plan);
    const t = getTrialUsage();
    if (s.plan === "trial") {
      setTrialHint(`${t.reconCount}/1 recon used · free trial`);
    }
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalUser();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center border-b border-slate-100 px-5">
            <Logo />
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-teal-50 text-teal-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-100 p-4">
            {plan === "trial" && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-1 font-semibold">
                  <ShieldAlert size={14} /> Trial
                </div>
                {trialHint || "1 free recon · 50 invoices"}
                <Link href="/settings" className="mt-2 block font-semibold text-teal-700 underline">
                  Upgrade plan →
                </Link>
              </div>
            )}
            <div className="truncate text-xs text-slate-500">{email}</div>
            <button
              onClick={logout}
              className="mt-2 flex items-center gap-2 text-sm text-slate-600 hover:text-red-600"
            >
              <LogOut size={16} /> Log out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
            <Logo />
            <button onClick={() => setOpen(!open)} className="rounded-lg p-2" aria-label="Menu">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </header>
          {open && (
            <div className="border-b border-slate-200 bg-white p-3 lg:hidden">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
              <button onClick={logout} className="mt-2 block px-3 py-2 text-sm text-red-600">
                Log out
              </button>
            </div>
          )}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
