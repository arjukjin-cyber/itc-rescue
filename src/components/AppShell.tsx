"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  History,
  Send,
  SquareKanban,
  Settings2,
  CreditCard,
  LogOut,
  Menu,
  X,
  Plus,
  Lock,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { clearLocalUser, getLocalUser, getSettings, getTrialUsage, setLocalUser, setTrialFromServer } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { CHASE_COUNT_EVENT, RECON_EVENT, TRIAL_EVENT } from "@/lib/ui-events";
import { getGstr3bDue } from "@/lib/filing";
import { inr } from "@/lib/format";
import { ITC_VIEWS, parseView, viewCounts, viewDef, viewHref, type ItcView } from "@/lib/views";
import { Dropdown, MenuItem, MenuLabel, MenuSep } from "./Dropdown";
import type { UserSession } from "@/lib/types";

/*
 * v1 sidebar (CTO structure): company + GSTIN switcher + New recon · Overview · Reconcile ·
 * ITC views (counts from the latest recon) · Vendors · Filing (GSTR-3B) · Company · user + trial meter.
 * Every row is a real destination — no "Soon" rows, no exports / quick actions here.
 */

const PAGE_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/reconcile": "Reconcile · Runs",
  "/chase": "Chase queue",
  "/status": "Status board",
  "/settings": "Settings",
};

const PLAN_LABEL: Record<string, string> = { trial: "Trial", starter: "Starter", growth: "Growth" };

const MATCH_RULE = "Invoices match on GSTIN + invoice number + invoice date (±1 day), then tax is compared.";

interface ReconSnap {
  counts: Record<ItcView, number>;
  atRisk: number;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gstin, setGstin] = useState("");
  const [plan, setPlan] = useState("trial");
  const [reconUsed, setReconUsed] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  /** null = no recon yet (or not loaded): ITC counts + ₹ blocked are hidden. */
  const [recon, setRecon] = useState<ReconSnap | null>(null);
  const [reconTick, setReconTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getLocalUser();
      if (!local) {
        router.replace("/login");
        return;
      }
      const s = getSettings();
      setEmail(local.email);
      setCompany(s.companyName || local.companyName || local.name || "");
      setGstin(s.gstin || local.gstin || "");
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
            if (user.gstin) setGstin(user.gstin);
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

  // Chase queue pending count: load on navigation, then follow in-page updates.
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

  // ITC view counts + ₹ blocked from the latest recon (existing GET /api/recon).
  useEffect(() => {
    let cancelled = false;
    void fetchReconState().then((st) => {
      if (cancelled || st.authError) return;
      setRecon(
        st.summary && st.results.length
          ? {
              counts: viewCounts(st.results),
              atRisk: st.results.filter((r) => r.category === "itc_at_risk").reduce((s, r) => s + (r.booksTax || 0), 0),
            }
          : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, reconTick]);

  useEffect(() => {
    const onCount = (e: Event) => setPending((e as CustomEvent<number>).detail);
    const onTrial = () => setReconUsed(getTrialUsage().reconCount);
    const onRecon = () => setReconTick((t) => t + 1);
    window.addEventListener(CHASE_COUNT_EVENT, onCount);
    window.addEventListener(TRIAL_EVENT, onTrial);
    window.addEventListener(RECON_EVENT, onRecon);
    return () => {
      window.removeEventListener(CHASE_COUNT_EVENT, onCount);
      window.removeEventListener(TRIAL_EVENT, onTrial);
      window.removeEventListener(RECON_EVENT, onRecon);
    };
  }, []);

  // Mobile drawer: close on navigation / Escape, lock page scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalUser();
    router.push("/");
  }

  const trialLocked = plan === "trial" && reconUsed >= 1;
  const planLabel = PLAN_LABEL[plan] ?? plan;

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col">
      <Workspace company={company} gstin={gstin} planLabel={planLabel} trialLocked={trialLocked} onNavigate={onNavigate} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Suspense fallback={<SideNav view={null} pathname={pathname} recon={recon} pending={pending} planLabel={planLabel} onNavigate={onNavigate} />}>
          <SideNavWithView pathname={pathname} recon={recon} pending={pending} planLabel={planLabel} onNavigate={onNavigate} />
        </Suspense>
      </div>
      <SideFooter plan={plan} reconUsed={reconUsed} email={email} onLogout={logout} />
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <aside
        className="hidden w-56 shrink-0 lg:block"
        style={{ backgroundColor: "var(--color-subtle)", borderRight: "1px solid var(--color-line)" }}
        aria-label="Sidebar"
      >
        <div className="sticky top-0 h-screen">{sidebar()}</div>
      </aside>

      {/* Mobile / tablet: the same sidebar as an off-canvas drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ backgroundColor: "rgb(9 9 11 / 0.24)" }}
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-64 max-w-[85vw]"
            style={{ backgroundColor: "var(--color-subtle)", borderRight: "1px solid var(--color-line)" }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-quiet btn-icon absolute right-2 top-3 z-10"
              aria-label="Close menu"
            >
              <X aria-hidden />
            </button>
            {sidebar(() => setOpen(false))}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-[52px] shrink-0 items-center gap-2.5 px-4 sm:px-6"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-quiet btn-icon lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu aria-hidden />
          </button>
          <div className="min-w-0 truncate" style={{ color: "var(--color-text-3)" }}>
            <span className="hidden sm:inline">{company || "ITC Rescue"}</span>
            <span className="mx-1.5 hidden sm:inline">/</span>
            <Suspense fallback={<Crumb pathname={pathname} view={null} />}>
              <CrumbWithView pathname={pathname} />
            </Suspense>
          </div>
          <div className="flex-1" />
          {/* Desktop has "New recon" in the sidebar; keep it reachable when the drawer is closed. */}
          <div className="lg:hidden">
            <NewRecon trialLocked={trialLocked} compact />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function NewRecon({ trialLocked, compact = false, onNavigate }: { trialLocked: boolean; compact?: boolean; onNavigate?: () => void }) {
  if (trialLocked) {
    return (
      <Link
        href="/settings#billing"
        onClick={onNavigate}
        className={`btn btn-sm ${compact ? "" : "w-full"}`}
        title="Free trial used. Upgrade to run another reconciliation."
      >
        <Lock aria-hidden /> New recon · Upgrade
      </Link>
    );
  }
  return (
    <Link href="/reconcile?new=1" onClick={onNavigate} className={`btn btn-pri btn-sm ${compact ? "" : "w-full"}`}>
      <Plus aria-hidden /> New recon
    </Link>
  );
}

function Workspace({
  company,
  gstin,
  planLabel,
  trialLocked,
  onNavigate,
}: {
  company: string;
  gstin: string;
  planLabel: string;
  trialLocked: boolean;
  onNavigate?: () => void;
}) {
  const name = company || "ITC Rescue";
  return (
    <div className="px-3 pb-3 pt-3.5" style={{ borderBottom: "1px solid var(--color-line)" }}>
      <div className="flex items-start gap-2.5 pr-8 lg:pr-0">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] text-[11px] font-bold tracking-[0.02em] text-white"
          style={{ backgroundColor: "var(--color-ink)" }}
          aria-label="ITC Rescue dashboard"
        >
          IR
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-ink)" }} title={name}>
            {name}
          </div>
          {/* GSTIN switcher: one GSTIN today; the control is real and lists it. */}
          <Dropdown
            label="Switch GSTIN"
            className="min-w-0"
            menuClassName="w-[236px]"
            trigger={({ open, toggle, id }) => (
              <button
                type="button"
                className="gstin-btn"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={toggle}
                title="Switch GSTIN"
              >
                <span className="truncate">{gstin || "GSTIN not set"}</span>
                <ChevronsUpDown aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>GSTIN · {planLabel}</MenuLabel>
                {gstin ? (
                  <MenuItem checked onSelect={close} meta={<Check size={14} aria-hidden />}>
                    <span className="block truncate font-mono text-[12px]" style={{ color: "var(--color-ink)" }}>
                      {gstin}
                    </span>
                    <span className="block truncate text-[11.5px] font-normal" style={{ color: "var(--color-text-3)" }}>
                      {name}
                    </span>
                  </MenuItem>
                ) : (
                  <MenuItem href="/settings" onSelect={() => { close(); onNavigate?.(); }}>
                    Add your GSTIN in Settings
                  </MenuItem>
                )}
                {gstin && (
                  <>
                    <MenuSep />
                    <MenuItem href="/settings" onSelect={() => { close(); onNavigate?.(); }}>
                      Edit company details
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Dropdown>
        </div>
      </div>
      <div className="mt-3">
        <NewRecon trialLocked={trialLocked} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function SideNavWithView(p: Omit<Parameters<typeof SideNav>[0], "view">) {
  const view = parseView(useSearchParams().get("view"));
  return <SideNav {...p} view={view} />;
}

function SideNav({
  view,
  pathname,
  recon,
  pending,
  planLabel,
  onNavigate,
}: {
  view: ItcView | null;
  pathname: string;
  recon: ReconSnap | null;
  pending: number | null;
  planLabel: string;
  onNavigate?: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const onRecon = pathname === "/reconcile";
  const due = getGstr3bDue(recon?.atRisk ?? 0);
  const dueDays =
    due.daysLeft < 0 ? `${Math.abs(due.daysLeft)} days overdue` : `${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`;

  return (
    <nav aria-label="Main">
      <Section title="Overview">
        <Item href="/dashboard" active={pathname === "/dashboard"} icon={<LayoutGrid aria-hidden />} onNavigate={onNavigate}>
          Dashboard
        </Item>
      </Section>

      <Section title="Reconcile">
        <Item href="/reconcile" active={onRecon && !view} icon={<History aria-hidden />} onNavigate={onNavigate}>
          Runs
        </Item>
      </Section>

      <Section title="ITC">
        {ITC_VIEWS.map((d) => (
          <Item
            key={d.key}
            href={viewHref(d.key)}
            active={onRecon && view === d.key}
            icon={
              <span className="side-ico" aria-hidden>
                <span className={`dot ${d.dot}`} />
              </span>
            }
            count={recon ? recon.counts[d.key] : undefined}
            onNavigate={onNavigate}
          >
            {d.label}
          </Item>
        ))}
      </Section>

      <Section title="Vendors">
        <Item
          href="/chase"
          active={pathname === "/chase"}
          icon={<Send aria-hidden />}
          count={pending !== null && pending > 0 ? pending : undefined}
          onNavigate={onNavigate}
        >
          Chase queue
        </Item>
        <Item href="/status" active={pathname === "/status"} icon={<SquareKanban aria-hidden />} onNavigate={onNavigate}>
          Status board
        </Item>
      </Section>

      <Section title="Filing">
        <Link href="/dashboard#filing" onClick={onNavigate} className="side-filing" aria-label={`GSTR-3B due ${due.dueLabel}, ${dueDays}${recon ? `, ${inr(due.blocked)} blocked` : ""}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium" style={{ color: "var(--color-ink)" }}>
              GSTR-3B
            </span>
            <span style={{ color: "var(--color-text-3)" }}>due {due.dueLabel}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-semibold" style={{ color: due.daysLeft < 0 ? "var(--color-risk)" : "var(--color-ink)" }}>
              {dueDays}
            </span>
            {recon ? (
              <span style={{ color: due.blocked > 0 ? "var(--color-risk)" : "var(--color-text-3)" }}>
                {inr(due.blocked)} blocked
              </span>
            ) : (
              <span style={{ color: "var(--color-text-3)" }}>No recon yet</span>
            )}
          </div>
        </Link>
      </Section>

      <Section title="Company">
        <Item href="/settings" active={pathname === "/settings"} icon={<Settings2 aria-hidden />} onNavigate={onNavigate}>
          Settings
        </Item>
        <Item href="/settings#billing" active={false} icon={<CreditCard aria-hidden />} count={planLabel} onNavigate={onNavigate}>
          Billing
        </Item>
        <button
          type="button"
          className="side-item w-full"
          aria-expanded={helpOpen}
          aria-controls="side-help"
          onClick={() => setHelpOpen((o) => !o)}
        >
          <span className="side-q" aria-hidden>
            ?
          </span>
          Help
        </button>
        {helpOpen && (
          <div id="side-help" className="mx-2 mb-1 mt-0.5 text-[12px] leading-[1.45]" style={{ color: "var(--color-text-3)" }}>
            <p>{MATCH_RULE}</p>
            <Link href="/#how" className="link-accent mt-1 inline-block" onClick={onNavigate}>
              How ITC Rescue works
            </Link>
          </div>
        )}
      </Section>
    </nav>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="side-sec">{title}</div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

function Item({
  href,
  active,
  icon,
  count,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  count?: number | string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className="side-item" onClick={onNavigate}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="side-ct">{count}</span>}
    </Link>
  );
}

function SideFooter({
  plan,
  reconUsed,
  email,
  onLogout,
}: {
  plan: string;
  reconUsed: number;
  email: string;
  onLogout: () => void;
}) {
  const used = Math.min(reconUsed, 1);
  return (
    <div className="px-3 pb-2.5 pt-3 text-[12px]" style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-text-2)" }}>
      {plan === "trial" ? (
        <div className="px-1">
          <div className="flex items-center justify-between">
            <span>{used} of 1 free recon used</span>
            <Link href="/settings#billing" className="link-accent">
              Upgrade
            </Link>
          </div>
          <div
            className="my-1.5 h-1 overflow-hidden rounded-sm"
            style={{ backgroundColor: "var(--color-line)" }}
            role="progressbar"
            aria-label="Free recons used"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={used}
          >
            <div className="h-full" style={{ width: `${used * 100}%`, backgroundColor: "var(--color-ink)" }} />
          </div>
        </div>
      ) : (
        <div className="mb-1.5 px-1">{PLAN_LABEL[plan] ?? plan} plan</div>
      )}
      <Dropdown
        label="Account"
        align="stretch"
        placement="up"
        trigger={({ open, toggle, id }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            className="side-item w-full"
          >
            <span
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold uppercase"
              style={{ backgroundColor: "var(--color-line)", color: "var(--color-text-2)" }}
              aria-hidden
            >
              {(email || "?").charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-[12px] font-normal" style={{ color: "var(--color-text-3)" }}>
              {email}
            </span>
            <ChevronsUpDown aria-hidden />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuLabel>
              <span className="block truncate">{email}</span>
            </MenuLabel>
            <MenuSep />
            <MenuItem
              onSelect={() => {
                close();
                onLogout();
              }}
            >
              <span className="inline-flex items-center gap-2">
                <LogOut aria-hidden /> Sign out
              </span>
            </MenuItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}

function CrumbWithView({ pathname }: { pathname: string }) {
  const view = parseView(useSearchParams().get("view"));
  return <Crumb pathname={pathname} view={view} />;
}

function Crumb({ pathname, view }: { pathname: string; view: ItcView | null }) {
  const label = pathname === "/reconcile" && view ? `ITC · ${viewDef(view).label}` : PAGE_LABEL[pathname] ?? "";
  return (
    <span className="font-medium" style={{ color: "var(--color-ink)" }}>
      {label}
    </span>
  );
}
