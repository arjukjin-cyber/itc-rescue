"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid,
  GitCompareArrows,
  Send,
  SquareKanban,
  Settings2,
  LogOut,
  Menu,
  X,
  Upload,
  Play,
  Lock,
} from "lucide-react";
import { clearLocalUser, getLocalUser, getSettings, getTrialUsage, setLocalUser, setTrialFromServer } from "@/lib/storage";
import { fetchChaseItems } from "@/lib/api-data";
import { CHASE_COUNT_EVENT, TRIAL_EVENT } from "@/lib/ui-events";
import type { UserSession } from "@/lib/types";

/* Vendors (#2) and History (#3) are intentionally not listed until they ship — no dead links. */
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/reconcile", label: "Reconcile", icon: GitCompareArrows },
  { href: "/chase", label: "Vendor chase", icon: Send, count: true },
  { href: "/status", label: "Status", icon: SquareKanban },
];
const WORKSPACE_NAV = [{ href: "/settings", label: "Settings", icon: Settings2 }];

const PAGE_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/reconcile": "Reconcile",
  "/chase": "Vendor chase",
  "/status": "Status",
  "/settings": "Settings",
};

const PLAN_LABEL: Record<string, string> = { trial: "Trial", starter: "Starter", growth: "Growth" };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [plan, setPlan] = useState("trial");
  const [reconUsed, setReconUsed] = useState(0);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getLocalUser();
      if (!local) {
        router.replace("/login");
        return;
      }
      setEmail(local.email);
      setCompany(getSettings().companyName || local.companyName || local.name || "");
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401) {
          clearLocalUser();
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const user = data.user as UserSession | null;
          if (user) {
            setLocalUser(user);
            setEmail(user.email);
            setPlan(user.plan);
            if (user.companyName) setCompany(user.companyName);
            if (data.persistence === "postgres") setTrialFromServer(user.reconCount ?? 0);
            setReconUsed(data.persistence === "postgres" ? user.reconCount ?? 0 : getTrialUsage().reconCount);
            return;
          }
        }
      } catch {
        // Fall through; API calls surface auth errors
      }
      if (cancelled) return;
      setPlan(getSettings().plan);
      setReconUsed(getTrialUsage().reconCount);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Sidebar "Vendor chase" count: load on navigation, then follow in-page updates.
  useEffect(() => {
    let cancelled = false;
    void fetchChaseItems().then(({ items, authError }) => {
      if (cancelled || authError) return;
      setPending(items.filter((c) => c.status === "pending").length);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const onCount = (e: Event) => setPending((e as CustomEvent<number>).detail);
    const onTrial = () => setReconUsed(getTrialUsage().reconCount);
    window.addEventListener(CHASE_COUNT_EVENT, onCount);
    window.addEventListener(TRIAL_EVENT, onTrial);
    return () => {
      window.removeEventListener(CHASE_COUNT_EVENT, onCount);
      window.removeEventListener(TRIAL_EVENT, onTrial);
    };
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalUser();
    router.push("/");
  }

  const trialLocked = plan === "trial" && reconUsed >= 1;
  const onReconcile = pathname === "/reconcile";

  const navItem = (item: (typeof NAV)[number] | (typeof WORKSPACE_NAV)[number]) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    const showCount = "count" in item && item.count && pending !== null && pending > 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="flex items-center gap-[9px] rounded-[5px] px-2 py-1.5 text-[13px] font-medium transition-colors"
        style={
          active
            ? { backgroundColor: "var(--color-surface)", color: "var(--color-ink)", boxShadow: "0 0 0 1px var(--color-line)" }
            : { color: "var(--color-text-2)" }
        }
      >
        <Icon size={15} strokeWidth={1.75} style={{ color: active ? "var(--color-ink)" : "var(--color-text-3)" }} aria-hidden />
        {item.label}
        {showCount && (
          <span className="ml-auto text-[11px] font-medium" style={{ color: "var(--color-text-3)" }}>
            {pending}
          </span>
        )}
      </Link>
    );
  };

  const nav = (
    <>
      <nav className="flex flex-col gap-px px-2 py-2.5" aria-label="Main">
        {NAV.map(navItem)}
        <div className="px-2 pb-1 pt-3 text-[11px] font-medium" style={{ color: "var(--color-text-3)" }}>
          Workspace
        </div>
        {WORKSPACE_NAV.map(navItem)}
      </nav>
    </>
  );

  const footer = (
    <div className="px-3.5 py-3 text-[12px]" style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-text-2)" }}>
      {plan === "trial" ? (
        <>
          <div className="flex items-center justify-between">
            <span>{Math.min(reconUsed, 1)} of 1 free recon used</span>
            <Link href="/settings" className="link-accent">
              Upgrade
            </Link>
          </div>
          <div className="my-1.5 h-1 overflow-hidden rounded-sm" style={{ backgroundColor: "var(--color-line)" }} aria-hidden>
            <div className="h-full" style={{ width: `${Math.min(reconUsed, 1) * 100}%`, backgroundColor: "var(--color-ink)" }} />
          </div>
        </>
      ) : (
        <div className="mb-1">{PLAN_LABEL[plan] ?? plan} plan</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate" style={{ color: "var(--color-text-3)" }}>
          {email}
        </span>
        <button type="button" onClick={logout} className="btn btn-sm btn-quiet btn-icon shrink-0" title="Log out" aria-label="Log out">
          <LogOut aria-hidden />
        </button>
      </div>
    </div>
  );

  const workspace = (
    <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-3.5" style={{ borderBottom: "1px solid var(--color-line)" }}>
      <Link
        href="/dashboard"
        className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] text-[11px] font-bold tracking-[0.02em] text-white"
        style={{ backgroundColor: "var(--color-ink)" }}
        aria-label="ITC Rescue dashboard"
      >
        IR
      </Link>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-ink)" }}>
          {company || "ITC Rescue"}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--color-text-3)" }}>
          ITC Rescue · {PLAN_LABEL[plan] ?? "Trial"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <aside
        className="hidden w-56 shrink-0 flex-col lg:flex"
        style={{ backgroundColor: "var(--color-subtle)", borderRight: "1px solid var(--color-line)" }}
      >
        <div className="sticky top-0 flex h-screen flex-col">
          {workspace}
          {nav}
          <div className="mt-auto">{footer}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-[52px] shrink-0 items-center gap-2.5 px-4 sm:px-6"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="btn btn-quiet btn-icon lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
          <div className="min-w-0 truncate" style={{ color: "var(--color-text-3)" }}>
            <span className="hidden sm:inline">{company || "ITC Rescue"}</span>
            <span className="mx-1.5 hidden sm:inline">/</span>
            <span className="font-medium" style={{ color: "var(--color-ink)" }}>
              {PAGE_LABEL[pathname] ?? ""}
            </span>
          </div>
          <div className="flex-1" />
          {/* Return-period select from the frame is omitted: no period API yet. */}
          {!onReconcile &&
            (trialLocked ? (
              <Link href="/settings" className="btn" title="Free trial used. Upgrade to run another reconciliation.">
                <Lock aria-hidden /> Run again · Upgrade
              </Link>
            ) : (
              <>
                <Link href="/reconcile" className="btn hidden sm:inline-flex">
                  <Upload aria-hidden /> Upload files
                </Link>
                <Link href="/reconcile" className="btn btn-pri">
                  <Play aria-hidden /> Run recon
                </Link>
              </>
            ))}
        </header>

        {open && (
          <div className="lg:hidden" style={{ backgroundColor: "var(--color-subtle)", borderBottom: "1px solid var(--color-line)" }}>
            {workspace}
            {nav}
            {footer}
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
