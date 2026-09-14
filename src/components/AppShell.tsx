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

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition ${
      active ? "" : "hover:bg-[var(--color-bg-subtle)]"
    }`;

  const navLinkStyle = (active: boolean) =>
    active
      ? {
          backgroundColor: "var(--color-accent-soft)",
          color: "var(--color-accent)",
        }
      : { color: "var(--color-text-secondary)" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg-muted)" }}>
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside
          className="hidden w-64 shrink-0 lg:flex lg:flex-col"
          style={{
            backgroundColor: "var(--color-bg)",
            borderRight: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex h-14 items-center px-5"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <Logo />
          </div>
          <nav className="flex-1 space-y-0.5 p-3">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(active)}
                  style={navLinkStyle(active)}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            {plan === "trial" && (
              <div
                className="mb-3 p-3 text-meta"
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid color-mix(in srgb, var(--color-status-warn-fg) 28%, transparent)",
                  backgroundColor: "var(--color-status-warn-bg)",
                  color: "var(--color-status-warn-fg)",
                }}
              >
                <div className="mb-1 flex items-center gap-1 font-semibold">
                  <ShieldAlert size={14} /> Trial
                </div>
                {trialHint || "1 free recon · 50 invoices"}
                <Link
                  href="/settings"
                  className="mt-2 block font-semibold underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  Upgrade plan →
                </Link>
              </div>
            )}
            <div className="truncate text-meta">{email}</div>
            <button
              onClick={logout}
              className="mt-2 flex items-center gap-2 text-sm hover:opacity-80"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <LogOut size={16} /> Log out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex h-14 items-center justify-between px-4 lg:hidden"
            style={{
              backgroundColor: "var(--color-bg)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <Logo />
            <button
              onClick={() => setOpen(!open)}
              className="rounded-[var(--radius-md)] p-2"
              style={{ color: "var(--color-text)" }}
              aria-label="Menu"
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </header>
          {open && (
            <nav
              className="space-y-0.5 p-3 lg:hidden"
              style={{
                backgroundColor: "var(--color-bg)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {NAV.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={navLinkClass(active)}
                    style={navLinkStyle(active)}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={logout}
                className="mt-1 flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium"
                style={{
                  color: "var(--color-status-risk-fg)",
                  backgroundColor: "transparent",
                }}
              >
                <LogOut size={18} /> Log out
              </button>
            </nav>
          )}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
