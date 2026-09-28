"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  History,
  Send,
  SquareKanban,
  Settings2,
  LogOut,
  Menu,
  X,
  Plus,
  Check,
  ChevronsUpDown,
  Users,
  FileText,
  CalendarDays,
  Building2,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { clearLocalUser, getLocalUser, getSettings, getTrialUsage, setLocalUser, setTrialFromServer } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { CHASE_COUNT_EVENT, RECON_EVENT, TRIAL_EVENT } from "@/lib/ui-events";
import { daysText, getGstr3bDue, type Gstr3bDue } from "@/lib/filing";
import { inr } from "@/lib/format";
import { ITC_VIEWS, viewCounts, viewHref, type ItcView } from "@/lib/views";
import { getSampleRun, isReconScreen } from "@/lib/sample-run";
import { Dropdown, MenuItem, MenuLabel, MenuSep } from "./Dropdown";
import type { MatchResult, UserSession } from "@/lib/types";

/*
 * Sidebar (CTO structure; section names, order and routes per nav-ia-v1.md; plain v1.1 styling,
 * Design's v3 visuals pending sign-off): company + GSTIN switcher + New recon · Overview ·
 * Reconcile · ITC (counts from the latest recon) · Vendors · Filing (GSTR-3B) · Company ·
 * trial meter + user menu. Every rendered row is a real screen: no "Soon" rows, no exports or
 * quick actions here.
 */

const PLAN_LABEL: Record<string, string> = { trial: "Trial", starter: "Starter", growth: "Growth" };

const MATCH_RULE = "Invoices match on GSTIN + invoice number + invoice date (±1 day), then tax is compared.";

interface ReconSnap {
  counts: Record<ItcView, number>;
  due: Gstr3bDue;
}

function snapOf(results: MatchResult[]): ReconSnap {
  return {
    counts: viewCounts(results),
    due: getGstr3bDue(results),
  };
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
    // On /reconcile + /itc/*, an unsaved sample run (memory only, #29) is what's on screen.
    const sample = isReconScreen(pathname) ? getSampleRun() : null;
    if (sample) {
      setRecon(snapOf(sample.results));
      return;
    }
    void fetchReconState().then((st) => {
      if (cancelled || st.authError) return;
      setRecon(st.summary && st.results.length ? snapOf(st.results) : null);
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

  const planLabel = PLAN_LABEL[plan] ?? plan;

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col">
      <Workspace company={company} gstin={gstin} planLabel={planLabel} onNavigate={onNavigate} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <SideNav pathname={pathname} recon={recon} pending={pending} onNavigate={onNavigate} />
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
            <Crumb pathname={pathname} />
          </div>
          <div className="flex-1" />
          {/* Desktop has "New recon" in the sidebar; keep it reachable when the drawer is closed. */}
          <div className="lg:hidden">
            <NewRecon compact />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

/**
 * Always opens the upload step: after the free run, "Run again" is locked there
 * (tooltip "Free trial used"), but sample runs stay available (#29, never saved).
 */
function NewRecon({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
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
  onNavigate,
}: {
  company: string;
  gstin: string;
  planLabel: string;
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
                {/* No "Create workspace" (one workspace in v1). No "Add GSTIN" / "Manage GSTINs":
                    there's no GSTINs screen or API yet, so those rows are left out. */}
                <MenuLabel>Workspace</MenuLabel>
                <div className="truncate px-2 pb-1 text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>
                  {name}
                </div>
                <MenuSep />
                <MenuLabel>GSTIN</MenuLabel>
                {gstin ? (
                  <MenuItem checked onSelect={close} meta={<Check size={14} aria-hidden />}>
                    <span className="block truncate font-mono text-[12px]" style={{ color: "var(--color-ink)" }}>
                      {gstin}
                    </span>
                  </MenuItem>
                ) : (
                  <div className="px-2 pb-1.5 text-[12px]" style={{ color: "var(--color-text-3)" }}>
                    No GSTIN on this account
                  </div>
                )}
              </>
            )}
          </Dropdown>
        </div>
      </div>
      <div className="mt-3">
        <NewRecon onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/* ── Nav config: sections, order and routes follow nav-ia-v1.md ─────────────
 * `enabled: false` rows are in the IA but have no screen/API yet, so they never render
 * (no dead links, no "Soon" rows). Billing is flagged off until pricing visibility is decided.
 */
const NAV_FLAGS = { billing: false } as const;

type CountKey = ItcView | "pending";
interface NavLinkDef {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  /** ITC rows show a status dot instead of an icon */
  dot?: string;
  count?: CountKey;
  enabled: boolean;
}
type NavEntry = NavLinkDef | { id: "filing-block" } | { id: "help" };
interface NavSectionDef {
  title: string;
  items: NavEntry[];
}

const NAV: NavSectionDef[] = [
  { title: "Overview", items: [{ id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutGrid, enabled: true }] },
  {
    title: "Reconcile",
    items: [
      { id: "runs", label: "Runs", href: "/reconcile", icon: History, enabled: true },
      // No run-history screen or API yet (GET /api/recon returns the latest run only).
      { id: "history", label: "History", href: "/reconcile/history", icon: History, enabled: false },
    ],
  },
  {
    title: "ITC",
    items: ITC_VIEWS.map((d) => ({ id: d.key, label: d.label, href: viewHref(d.key), dot: d.dot, count: d.key, enabled: true })),
  },
  {
    title: "Vendors",
    items: [
      { id: "directory", label: "Directory", href: "/vendors", icon: Users, enabled: false },
      { id: "chase", label: "Chase queue", href: "/chase", icon: Send, count: "pending", enabled: true },
      // CTO sidebar brief (not in the IA draft): the existing status board.
      { id: "status", label: "Status board", href: "/status", icon: SquareKanban, enabled: true },
      { id: "templates", label: "Templates", href: "/vendors/templates", icon: FileText, enabled: false },
    ],
  },
  {
    title: "Filing",
    items: [
      { id: "filing-block" },
      { id: "calendar", label: "GSTR-3B calendar", href: "/filing/calendar", icon: CalendarDays, enabled: false },
      { id: "reports", label: "Reports", href: "/filing/reports", icon: FileText, enabled: false },
    ],
  },
  {
    title: "Company",
    items: [
      { id: "gstins", label: "GSTINs", href: "/company/gstins", icon: Building2, enabled: false },
      { id: "team", label: "Team", href: "/company/team", icon: Users, enabled: false },
      { id: "billing", label: "Billing", href: "/company/billing", icon: CreditCard, enabled: NAV_FLAGS.billing },
      { id: "settings", label: "Settings", href: "/settings", icon: Settings2, enabled: true },
      { id: "help" },
    ],
  },
];

function isLink(e: NavEntry): e is NavLinkDef {
  return "href" in e;
}

function SideNav({
  pathname,
  recon,
  pending,
  onNavigate,
}: {
  pathname: string;
  recon: ReconSnap | null;
  pending: number | null;
  onNavigate?: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const due = recon?.due ?? ({ kind: "none" } as Gstr3bDue);
  const filingLabel =
    due.kind === "open"
      ? `GSTR-3B for ${due.period}: ${daysText(due.daysLeft)}, due ${due.dueLabel}, ${inr(due.blocked)} blocked`
      : due.kind === "past"
        ? `GSTR-3B for ${due.period}: was due ${due.dueLabel}`
        : "GSTR-3B: no recon yet";

  const countFor = (k?: CountKey) => {
    if (!k) return undefined;
    if (k === "pending") return pending !== null && pending > 0 ? pending : undefined;
    return recon ? recon.counts[k] : undefined;
  };

  const renderEntry = (e: NavEntry) => {
    if (isLink(e)) {
      if (!e.enabled) return null;
      const Icon = e.icon;
      return (
        <Item
          key={e.id}
          href={e.href}
          active={pathname === e.href}
          icon={
            e.dot ? (
              <span className="side-ico" aria-hidden>
                <span className={`dot ${e.dot}`} />
              </span>
            ) : Icon ? (
              <Icon aria-hidden />
            ) : null
          }
          count={countFor(e.count)}
          onNavigate={onNavigate}
        >
          {e.label}
        </Item>
      );
    }
    if (e.id === "filing-block") {
      return (
        <Link key={e.id} href="/dashboard#filing" onClick={onNavigate} className="side-filing" aria-label={filingLabel}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium" style={{ color: "var(--color-ink)" }}>
              GSTR-3B
            </span>
            {due.kind !== "none" && <span style={{ color: "var(--color-text-3)" }}>{due.period}</span>}
          </div>
          {due.kind === "open" && (
            <>
              <div className="mt-1 font-semibold" style={{ color: "var(--color-ink)" }}>
                {daysText(due.daysLeft)} · due {due.dueLabel}
              </div>
              <div className="mt-0.5" style={{ color: due.blocked > 0 ? "var(--color-risk)" : "var(--color-text-3)" }}>
                {inr(due.blocked)} blocked
              </div>
            </>
          )}
          {due.kind === "past" && (
            <div className="mt-1" style={{ color: "var(--color-text-2)" }}>
              Was due {due.dueLabel}
            </div>
          )}
          {due.kind === "none" && (
            <div className="mt-1" style={{ color: "var(--color-text-3)" }}>
              No recon yet
            </div>
          )}
        </Link>
      );
    }
    return (
      <div key={e.id}>
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
      </div>
    );
  };

  return (
    <nav aria-label="Main">
      {NAV.map((sec) => {
        const items = sec.items.map(renderEntry).filter(Boolean);
        return items.length ? (
          <Section key={sec.title} title={sec.title}>
            {items}
          </Section>
        ) : null;
      })}
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
          <div>{used} of 1 free recon used</div>
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

function Crumb({ pathname }: { pathname: string }) {
  const item = NAV.flatMap((sec) => sec.items.filter(isLink).map((i) => ({ sec: sec.title, i }))).find(
    (x) => x.i.enabled && x.i.href === pathname
  );
  const label = item ? `${item.sec} · ${item.i.label}` : "";
  return (
    <span className="font-medium" style={{ color: "var(--color-ink)" }}>
      {label}
    </span>
  );
}
